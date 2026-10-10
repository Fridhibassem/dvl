import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Kernel } from "../kernel/kernel.js";
import { mockProviderReadPaths } from "../kernel/mock-launch.js";
import { confinedProviderLaunch } from "../kernel/provider-confinement.js";
import { ExternalLedgerExecutor } from "../kernel/spike-action-protocol.js";
import { anchorsFor, kernelOn, tempRoot, waitForEvent } from "./harness.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const task = { role: "builder", goal: "hostile provider", acceptanceCriteria: [], scope: ["**"] };
const kernels: Kernel[] = [], servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(kernels.splice(0).map((k) => k.shutdown()));
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => { s.closeAllConnections(); s.close(() => r()); })));
});
async function fixture(attack: string, propose = false) {
  const root = tempRoot("c31-project"), service = tempRoot("c31-external"), code = tempRoot("c31-code");
  const file = path.join(service, "effect.txt"), db = path.join(service, "ledger.db"), secret = path.join(service, "credential");
  const existing = path.join(service, "existing.txt"), secretAlias = path.join(code, "secret-alias");
  fs.writeFileSync(existing, "unchanged"); fs.writeFileSync(secret, "raw-effect-secret", { mode: 0o600 });
  fs.symlinkSync(secret, secretAlias);
  const adapter = path.join(code, "adapter.mjs"); fs.copyFileSync(path.join(here, "h4-confinement-adapter.mjs"), adapter);
  const setup = spawnSync("/usr/bin/sqlite3", [db, "CREATE TABLE ledger (entry TEXT); INSERT INTO ledger VALUES ('baseline');"], { encoding: "utf8" });
  if (setup.status !== 0) throw new Error(setup.stderr);
  const posts: string[] = [];
  const server = http.createServer((req, res) => { if (req.method === "POST") posts.push(req.url!); req.resume(); res.end("ok"); });
  servers.push(server); await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  // Control: service is reachable from the trusted host; denial is not an unavailable target.
  expect((await fetch(url + "/health")).status).toBe(200);
  const ledger = path.join(service, "broker.jsonl");
  const input = { attack, propose, file, existing, db, secret, secretAlias, url, hostPid: process.pid, workspaceFile: path.join(root, "escape.txt") };
  const k = kernelOn(root, { adapterCommand: [process.execPath, adapter], fsync: true,
    spikeEffectExecutor: new ExternalLedgerExecutor(ledger),
    adapterEnv: { DVL_RAW_EFFECT_TOKEN: "raw-effect-secret", NODE_OPTIONS: "--inspect=0" },
    providerConfinement: { codeReadPaths: [code], publicEnv: { DVL_PUBLIC_INPUTS: JSON.stringify(input) } },
  }); kernels.push(k);
  return { root, service, code, file, existing, db, secret, url, posts, ledger, input, k };
}
function unchanged(f: Awaited<ReturnType<typeof fixture>>) {
  expect(fs.existsSync(f.file)).toBe(false);
  expect(fs.existsSync(path.join(f.root, "escape.txt"))).toBe(false);
  expect(fs.readFileSync(f.existing, "utf8")).toBe("unchanged");
  expect(fs.existsSync(f.existing + ".moved")).toBe(false);
  expect(fs.readFileSync(f.secret, "utf8")).toBe("raw-effect-secret");
  expect(spawnSync("/usr/bin/sqlite3", [f.db, "SELECT entry FROM ledger"], { encoding: "utf8" }).stdout).toBe("baseline\n");
  expect(f.posts).toEqual([]);
}

describe.skipIf(process.platform !== "darwin")("C31 enforced provider confinement (actual Seatbelt)", () => {
  it.each(["filesystem", "network", "database", "api", "credentials", "shell", "subprocess", "relax"])("denies %s escape before PREPARED and changes no disposable external state", async (attack) => {
    const f = await fixture(attack);
    f.k.start(); await f.k.describe(); const id = await f.k.startRun(task);
    expect(await f.k.waitForRunEnd(id.runId)).toBe("failed");
    const progress = await waitForEvent(f.k, (e) => e.type === "progress");
    const result = (progress.payload as { result: Record<string, unknown> }).result;
    if (attack === "filesystem") for (const value of Object.values(result)) expect(value).toBe("EPERM");
    if (attack === "network" || attack === "api") expect(result.post).toBe("EPERM");
    if (attack === "database") expect(result.insert).not.toBe("ESCAPED");
    if (attack === "credentials") {
      expect(result).toMatchObject({ inherited: null, override: null, home: null, read: "EPERM", alias: "EPERM" });
      expect(result.processEnv).not.toContain("raw-effect-secret");
    }
    if (attack === "shell" || attack === "relax") { expect(result.status).not.toBe(0); expect(result.stderr).toMatch(/permitted|denied/i); }
    if (attack === "subprocess") {
      expect(result.status).toBe(0); expect(JSON.parse(String(result.stdout))).toEqual({ write: "EPERM", post: "EPERM" });
    }
    unchanged(f);
    expect(fs.existsSync(f.ledger)).toBe(false);
    expect(f.k.store.ofType("kernel.action_prepared")).toHaveLength(0);
    expect(f.k.store.ofType("kernel.action_execution_authorized")).toHaveLength(0);
    expect(f.k.store.ofType("kernel.adapter_spawned")[0]!.payload).toMatchObject({ providerConfinement: { mechanism: "macos-seatbelt", network: "denied", subprocesses: "inherited-sandbox" } });
  });

  it("denies a native effect proposal's direct POST while executing exactly one durable broker effect", async () => {
    const f = await fixture("network", true);
    f.k.start(); await f.k.describe(); const id = await f.k.startRun(task);
    expect(await f.k.waitForRunEnd(id.runId)).toBe("finished");
    unchanged(f);
    expect(fs.readFileSync(f.ledger, "utf8").trim().split("\n")).toHaveLength(1);
    const events = f.k.store.all();
    const prepare = events.findIndex((e) => e.type === "kernel.action_prepared");
    const grant = events.findIndex((e) => e.type === "kernel.action_execution_authorized");
    const outcome = events.findIndex((e) => e.type === "kernel.action_outcome_confirmed");
    expect(prepare).toBeGreaterThan(-1); expect(grant).toBeGreaterThan(prepare); expect(outcome).toBeGreaterThan(grant);
  });

  it("closure: former unconfined double-POST counterexample is blocked before launch with zero PREPARED and zero mutations", async () => {
    const f = await fixture("network");
    const root = tempRoot("c31-legacy-counterexample");
    const options = { adapterCommand: [process.execPath, path.join(f.code, "adapter.mjs")], fsync: true,
      adapterEnv: { DVL_PUBLIC_INPUTS: JSON.stringify({ ...f.input, legacy: true }) },
    };
    const old = kernelOn(root, options); kernels.push(old);
    let refusal: unknown;
    try { old.start(); } catch (e) { refusal = e; }
    // Retain the original effect sequence. Deliberately removing the launch guard must
    // actually duplicate the external POST, not merely fail an assertion on an error string.
    if (!refusal) {
      await old.describe(); const id = await old.startRun(task);
      await old.waitForRunEnd(id.runId); await old.shutdown();
      const recovered = kernelOn(root, { ...options, expectedHeads: anchorsFor(root) }); kernels.push(recovered);
      recovered.start(); await recovered.describe(); await recovered.retryRun(id.runId, task);
      await recovered.waitForRunEnd(id.runId);
      expect(recovered.store.ofType("kernel.action_prepared")).toHaveLength(0);
    }
    expect(f.posts).toEqual([]);
    expect(String(refusal)).toContain("HOLD_PROVIDER_CONFINEMENT_UNAVAILABLE");
    expect(old.recoveryStatus).toMatchObject({ status: "HOLD_PROVIDER_CONFINEMENT_UNAVAILABLE", retryAllowed: false });
    expect(old.store.ofType("kernel.adapter_spawned")).toHaveLength(0);
    expect(old.store.ofType("kernel.action_prepared")).toHaveLength(0);
    await expect(old.startRun(task)).rejects.toThrow("retryAllowed=false");
    unchanged(f);
  });

  it.each(["filesystem", "network", "database", "api", "credentials", "shell", "subprocess", "relax"])("default/native %s path is refused before provider code or descendants can run", async (attack) => {
    const f = await fixture(attack);
    const k = kernelOn(tempRoot("c31-native-block"), { adapterCommand: [process.execPath, path.join(f.code, "adapter.mjs")],
      adapterEnv: { DVL_PUBLIC_INPUTS: JSON.stringify({ ...f.input, legacy: true }), DVL_RAW_EFFECT_TOKEN: "raw-effect-secret" } }); kernels.push(k);
    expect(() => k.start()).toThrow("HOLD_PROVIDER_CONFINEMENT_UNAVAILABLE");
    expect(k.store.ofType("kernel.adapter_spawned")).toHaveLength(0);
    expect(k.store.ofType("kernel.action_prepared")).toHaveLength(0);
    expect(k.recoveryStatus.retryAllowed).toBe(false); unchanged(f);
  });

  it("read-only observation remains executable without an effect broker or mutation credentials", async () => {
    const f = await fixture("observation");
    const k = kernelOn(tempRoot("c31-observer"), { adapterCommand: [process.execPath, path.join(f.code, "adapter.mjs")],
      providerConfinement: { codeReadPaths: [f.code], publicEnv: { DVL_PUBLIC_INPUTS: JSON.stringify({ ...f.input, readOnly: true }) } } }); kernels.push(k);
    k.start(); await k.describe(); const id = await k.startRun(task);
    expect(await k.waitForRunEnd(id.runId)).toBe("finished");
    expect((await waitForEvent(k, (e) => e.type === "progress")).payload).toMatchObject({ result: { code: true, home: null } });
    expect(k.store.ofType("kernel.action_prepared")).toHaveLength(0); unchanged(f);
  });

  it.each([false, true])("the shipped mock's broker refuses external/credential/native and stale assignment escapes (terminal=%s)", async (terminal) => {
    const f = await fixture("filesystem");
    const k = kernelOn(tempRoot("c31-mock-broker"), { providerConfinement: { codeReadPaths: mockProviderReadPaths(),
      publicEnv: { DVL_PUBLIC_MOCK_PROBE: JSON.stringify({ file: f.file }) } } }); kernels.push(k);
    k.start(); await k.describe(); const id = await k.startRun({ ...task, scenario: terminal ? "h4-broker-terminal-probe" : "h4-broker-boundary-probe" });
    expect(await k.waitForRunEnd(id.runId)).toBe(terminal ? "failed" : "finished");
    const event = await waitForEvent(k, (e) => e.type === "progress");
    for (const value of Object.values((event.payload as { result: Record<string, string> }).result)) expect(value).not.toBe("ESCAPED");
    expect(fs.readdirSync(k.txWorkspaceOf(id.runId))).toEqual([]);
    expect(k.store.ofType("kernel.action_prepared")).toHaveLength(0); unchanged(f);
  });

  it("filesystem broker commits complete PREPARED identity and fsync before scoped writes, with one execution owner", async () => {
    const k = kernelOn(tempRoot("c31-mock-prepared")); kernels.push(k);
    k.start(); await k.describe(); const id = await k.startRun({ ...task, scenario: "happy" });
    expect(await k.waitForRunEnd(id.runId)).toBe("finished");
    expect(fs.readFileSync(path.join(k.txWorkspaceOf(id.runId), "src/users.ts"), "utf8")).toBe("export const users = [];\n");
    const events = k.store.all(), prepared = k.store.ofType("kernel.action_prepared");
    expect(prepared).toHaveLength(2); // scoped mkdir, scoped write; native provider has no writer
    for (const event of prepared) {
      const action = event.payload as Record<string, unknown>;
      for (const key of ["actionId", "runId", "assignmentId", "authorityId", "adapterInstanceId", "semanticSignature", "kind", "target"]) expect(typeof action[key]).toBe("string");
      expect(action).toMatchObject({ attempt: 1, stateMutating: true, external: false, executionOwner: "kernel" });
      const forAction = events.filter((e) => (e.payload as { actionId?: string })?.actionId === action.actionId);
      expect(forAction.map((e) => e.type)).toEqual(["kernel.action_prepared", "kernel.action_execution_authorized", "kernel.action_execution_started", "kernel.action_outcome_confirmed"]);
    }
  });

  it.each(["disabled", "failed"])("filesystem PREPARED fsync %s: no provider filesystem effect becomes executable", async (mode) => {
    const k = kernelOn(tempRoot("c31-mock-fsync"), { fsync: mode !== "disabled", ioFaults: mode === "failed" ? {
      log: (kind, phase, row) => kind === "events" && phase === "fsync" && row.type === "kernel.action_prepared" ? "fail" : undefined,
    } : undefined }); kernels.push(k);
    k.start(); await k.describe(); const id = await k.startRun({ ...task, scenario: "happy" });
    if (mode === "disabled") expect(await k.waitForRunEnd(id.runId)).toBe("failed");
    else { const deadline = Date.now() + 5000; while (!k.store.sealed) { if (Date.now() > deadline) throw new Error("fsync failure not reached"); await new Promise((r) => setTimeout(r, 10)); } }
    expect(fs.readdirSync(k.txWorkspaceOf(id.runId))).toEqual([]);
    expect(k.store.ofType("kernel.action_execution_authorized")).toHaveLength(0);
    expect(k.store.ofType("kernel.action_prepared")).toHaveLength(0);
    if (mode === "failed") expect(k.store.sealed).toBeTruthy();
  });

  it("a confined dvl_tools provider without a durable broker is held before dispatch", async () => {
    const f = await fixture("filesystem");
    const k = kernelOn(tempRoot("c31-no-broker"), {
      adapterCommand: [process.execPath, path.join(f.code, "adapter.mjs")],
      providerConfinement: { codeReadPaths: [f.code], publicEnv: { DVL_PUBLIC_INPUTS: JSON.stringify({ attack: "filesystem" }) } },
    }); kernels.push(k);
    k.start(); await expect(k.describe()).rejects.toThrow("durable effect broker");
    expect(k.recoveryStatus).toMatchObject({ status: "HOLD_PROVIDER_CONFINEMENT_UNAVAILABLE", retryAllowed: false });
    await expect(k.startRun(task)).rejects.toThrow("retryAllowed=false");
    expect(k.store.ofType("kernel.run_created")).toHaveLength(0); unchanged(f);
  });

  it("missing enforced confinement fails before provider spawn or run dispatch", async () => {
    const f = await fixture("filesystem");
    const k = kernelOn(tempRoot("c31-missing"), { fsync: true, spikeEffectExecutor: new ExternalLedgerExecutor(f.ledger) }); kernels.push(k);
    expect(() => k.start()).toThrow("HOLD_PROVIDER_CONFINEMENT_UNAVAILABLE");
    expect(k.recoveryStatus).toMatchObject({ status: "HOLD_PROVIDER_CONFINEMENT_UNAVAILABLE", retryAllowed: false });
    expect(k.store.ofType("kernel.adapter_spawned")).toHaveLength(0); unchanged(f);
  });
});

it.each(["linux", "win32"] as const)("no verified %s confinement backend: launch is refused, never silently unconfined", (platform) => {
  expect(() => confinedProviderLaunch([process.execPath, "-e", "throw 0"], tempRoot("c31-platform"), { codeReadPaths: [] }, platform)).toThrow("retryAllowed=false");
});

it("rejects credential-bearing environment overrides instead of trusting provider declarations", () => {
  if (process.platform !== "darwin") return;
  expect(() => confinedProviderLaunch([process.execPath], tempRoot("c31-env"), { codeReadPaths: [], publicEnv: { DVL_RAW_EFFECT_TOKEN: "secret" } })).toThrow("non-public environment");
});
