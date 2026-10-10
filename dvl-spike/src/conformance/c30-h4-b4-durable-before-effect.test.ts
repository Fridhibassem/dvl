import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Kernel, type KernelOptions } from "../kernel/kernel.js";
import type { CommitHeads } from "../kernel/event-store.js";
import { recoveryProcessOps, type RecoveryExecution } from "../kernel/recovery-process.js";
import { ExternalLedgerExecutor, type PreparedSpikeAction, type SpikeActionBoundary } from "../kernel/spike-action-protocol.js";
import { anchorsFor, kernelOn, keyFor, tempRoot, waitForEvent } from "./harness.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const command = [process.execPath, "--import", loader, path.join(here, "h4-b4-adapter.ts")];
const task = { role: "builder", goal: "external ledger", acceptanceCriteria: [], scope: ["**"] };
const kernels: Kernel[] = [];
const groups: number[] = [];
const track = (k: Kernel) => (kernels.push(k), k);
afterEach(async () => {
  await Promise.all(kernels.splice(0).map((k) => k.shutdown()));
  for (const group of groups.splice(0)) { try { process.kill(-group, "SIGKILL"); } catch {} }
});
const fixture = () => ({ root: tempRoot("c30-project"), ledger: path.join(tempRoot("c30-external-service"), "ledger.jsonl") });
const entries = (ledger: string) => fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8").split("\n").filter(Boolean) : [];
const mediated = (f: ReturnType<typeof fixture>, extra: Partial<KernelOptions> = {}) => track(kernelOn(f.root, {
  adapterCommand: command, fsync: true, spikeEffectExecutor: new ExternalLedgerExecutor(f.ledger), ...extra,
}));
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("B4 fixture did not reach the expected boundary");
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function crashAt(boundary: SpikeActionBoundary | "unmediated") {
  const f = fixture();
  const host = spawn(process.execPath, ["--import", loader, path.join(here, "h4-b4-kernel-host.ts")], { stdio: ["pipe", "pipe", "pipe"] });
  const exited = new Promise<void>((resolve) => host.once("exit", () => resolve()));
  let stderr = "";
  host.stderr.on("data", (d) => { stderr += d; });
  let heads: CommitHeads | undefined;
  let ready: { run: { runId: string; attempt: number }; action?: PreparedSpikeAction; execution: RecoveryExecution } | undefined;
  const lines = readline.createInterface({ input: host.stdout });
  lines.on("line", (line) => {
    const msg = JSON.parse(line);
    if (msg.commit) heads = msg.commit;
    if (msg.ready) { ready = msg; groups.push(msg.execution.pid); }
  });
  host.stdin.write(JSON.stringify({ ...f, keyHex: keyFor(f.root).toString("hex"), command, boundary,
    unmediated: boundary === "unmediated", adapterEnv: boundary === "unmediated" ? { DVL_B4_UNMEDIATED_LEDGER: f.ledger } : {},
  }) + "\n");
  try { await until(() => !!ready || host.exitCode !== null); }
  finally { host.kill("SIGKILL"); await exited; lines.close(); }
  if (!ready || !heads) throw new Error(`B4 host failed: ${stderr}`);
  expect(f.ledger.startsWith(f.root + path.sep)).toBe(false);
  return { ...f, heads, ...ready };
}

describe.skipIf(process.platform === "win32")("C30 B4 durable-before-effect", () => {
  it("1. physical crash before PREPARED: no authority and no external effect existed", async () => {
    const f = await crashAt("before_prepared");
    expect(entries(f.ledger)).toHaveLength(0);
    const r = mediated(f, { expectedHeads: f.heads });
    expect(r.store.ofType("kernel.action_prepared")).toHaveLength(0);
    expect(r.store.ofType("kernel.action_execution_authorized")).toHaveLength(0);
    r.start(); await r.describe();
    const retry = await r.retryRun(f.run.runId, task);
    expect(retry.attempt).toBe(2);
    expect(await r.waitForRunEnd(f.run.runId)).toBe("finished");
    expect(entries(f.ledger)).toHaveLength(1);
  });

  it.each(["prepared", "authorized", "started"] as const)("2. physical crash at %s before effect: replay is UNKNOWN until trusted NOT_DONE inspection", async (boundary) => {
    const f = await crashAt(boundary);
    expect(entries(f.ledger)).toHaveLength(0);
    const r = mediated(f, { expectedHeads: f.heads });
    const prepared = r.store.ofType("kernel.action_prepared")[0]!;
    expect(prepared).toMatchObject({ origin: "kernel", trust: "kernel_truth", runId: f.run.runId, attempt: 1 });
    expect(prepared.payload).toMatchObject({ actionId: "act_ledger", runId: f.run.runId, attempt: 1,
      adapterInstanceId: f.execution.adapterInstanceId, executionOwner: "kernel", kind: "ledger_append", target: "external-ledger", stateMutating: true, external: true });
    for (const key of ["assignmentId", "authorityId", "semanticSignature"]) expect(typeof (prepared.payload as Record<string, unknown>)[key]).toBe("string");
    r.start(); await r.describe();
    await expect(r.retryRun(f.run.runId, task)).rejects.toThrow("unresolved action outcome");
    expect(r.store.ofType("kernel.attempt_created")).toHaveLength(0);
    expect(await r.inspectSpikeActionOutcome(f.run.runId, "act_ledger")).toBe("CONFIRMED_NOT_DONE");
    const retry = await r.retryRun(f.run.runId, task);
    expect(retry.attempt).toBe(2);
    expect(await r.waitForRunEnd(f.run.runId)).toBe("finished");
    expect(entries(f.ledger)).toHaveLength(1);
  });

  it("3. physical crash after external effect but before outcome: UNKNOWN; inspection resolves DONE without repeating the effect", async () => {
    const f = await crashAt("effect_returned");
    expect(entries(f.ledger)).toHaveLength(1);
    const r = mediated(f, { expectedHeads: f.heads });
    // This stronger protocol makes effect-before-durable-STARTED unreachable.
    expect(r.store.ofType("kernel.action_execution_started")).toHaveLength(1);
    expect(r.store.ofType("kernel.action_outcome_confirmed")).toHaveLength(0);
    r.start(); await r.describe();
    await expect(r.retryRun(f.run.runId, task)).rejects.toThrow("unresolved action outcome");
    expect(await r.inspectSpikeActionOutcome(f.run.runId, "act_ledger")).toBe("CONFIRMED_DONE");
    await r.retryRun(f.run.runId, task);
    expect(await r.waitForRunEnd(f.run.runId)).toBe("finished");
    expect(entries(f.ledger)).toHaveLength(1);
    expect(r.store.ofType("kernel.action_execution_authorized")).toHaveLength(1);
    expect(r.store.ofType("kernel.action_outcome_confirmed").at(-1)!.payload).toMatchObject({ executed: false, reusedAuthorityId: f.action!.authorityId });
  });

  it("4. physical crash after durable outcome: confirmed replay reuses the semantic effect on attempt 2", async () => {
    const f = await crashAt("outcome_committed");
    const r = mediated(f, { expectedHeads: f.heads });
    expect(r.store.ofType("kernel.action_outcome_confirmed")).toHaveLength(1);
    r.start(); await r.describe();
    await r.retryRun(f.run.runId, task);
    expect(await r.waitForRunEnd(f.run.runId)).toBe("finished");
    expect(entries(f.ledger)).toHaveLength(1);
    expect(r.store.ofType("kernel.action_outcome_reconciled")).toHaveLength(0);
    expect(r.store.ofType("kernel.action_execution_authorized")).toHaveLength(1);
  });

  it("5. surviving old executor: even NOT_DONE cannot bypass B3 kill failure", async () => {
    const f = await crashAt("prepared");
    expect(recoveryProcessOps.canMutate(f.execution.pid!)).toBe(true);
    const r = mediated(f, { expectedHeads: f.heads, recoveryProcessOps: { ...recoveryProcessOps,
      killGroup() { throw Object.assign(new Error("kill denied"), { code: "EPERM" }); } } });
    r.start(); await r.describe();
    await expect(r.inspectSpikeActionOutcome(f.run.runId, "act_ledger")).rejects.toThrow("HOLD_RECOVERY_PROCESS_STILL_ALIVE");
    r.reconcileActionOutcome(f.run.runId, "act_ledger", "CONFIRMED_NOT_DONE");
    await expect(r.retryRun(f.run.runId, task)).rejects.toThrow("retryAllowed=false");
    expect(r.store.ofType("kernel.attempt_created")).toHaveLength(0);
    expect(entries(f.ledger)).toHaveLength(0);
  });

  it.each(["kernel.action_prepared", "kernel.action_execution_authorized", "kernel.action_execution_started"])("fsync failure at %s never calls the effect executor", async (record) => {
    const f = fixture();
    const k = mediated(f, { ioFaults: { log: (kind, phase, row) => kind === "events" && phase === "fsync" && row.type === record ? "fail" : undefined } });
    k.start(); await k.describe(); await k.startRun(task);
    await until(() => !!k.store.sealed);
    expect(entries(f.ledger)).toHaveLength(0);
    expect(k.store.ofType("kernel.action_outcome_confirmed")).toHaveLength(0);
  });

  it("outcome fsync failure preserves UNKNOWN through explicit tail recovery; the external effect is not repeated", async () => {
    const f = fixture();
    const k = mediated(f, { ioFaults: { log: (kind, phase, row) => kind === "events" && phase === "fsync" && row.type === "kernel.action_outcome_confirmed" ? "fail" : undefined } });
    k.start(); await k.describe(); const id = await k.startRun(task);
    await until(() => !!k.store.sealed);
    expect(entries(f.ledger)).toHaveLength(1);
    await k.shutdown();
    const r = mediated(f, { expectedHeads: anchorsFor(f.root) });
    r.recoverDurableTail(); r.start(); await r.describe();
    await expect(r.retryRun(id.runId, task)).rejects.toThrow("unresolved action outcome");
    expect(await r.inspectSpikeActionOutcome(id.runId, "act_ledger")).toBe("CONFIRMED_DONE");
    await r.retryRun(id.runId, task); await r.waitForRunEnd(id.runId);
    expect(entries(f.ledger)).toHaveLength(1);
  });

  it("failed host commit publication at PREPARED grants no effect authority", async () => {
    const f = fixture();
    const k = mediated(f, { onCommit: (heads) => {
      const row = fs.readFileSync(path.join(f.root, ".dvl", "events", "events.jsonl"), "utf8").trim().split("\n").at(-1)!;
      if (JSON.parse(row).type === "kernel.action_prepared") throw new Error("host could not publish the prepared boundary");
      void heads;
    } });
    k.start(); await k.describe(); await k.startRun(task);
    await until(() => !!k.store.sealed);
    expect(entries(f.ledger)).toHaveLength(0);
    expect(k.store.ofType("kernel.action_execution_authorized")).toHaveLength(0);
  });

  it("uninspectable external state remains UNKNOWN and blocks retry", async () => {
    const f = await crashAt("effect_returned");
    fs.appendFileSync(f.ledger, "partial external outcome");
    const r = mediated(f, { expectedHeads: f.heads });
    r.start(); await r.describe();
    expect(await r.inspectSpikeActionOutcome(f.run.runId, "act_ledger")).toBe("UNKNOWN");
    await expect(r.retryRun(f.run.runId, task)).rejects.toThrow("unresolved action outcome");
    expect(r.store.ofType("kernel.action_outcome_reconciled")).toHaveLength(0);
  });

  it("shutdown retains root ownership while a Kernel-owned executor can still apply an effect", async () => {
    const f = fixture();
    const executor = new ExternalLedgerExecutor(f.ledger);
    let release!: () => void;
    let entered = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const k = mediated(f, { spikeEffectExecutor: {
      validate: (intent) => executor.validate(intent), inspect: (action) => executor.inspect(action),
      operationIdentity: (intent, runId) => executor.operationIdentity(intent, runId),
      execute: async (action) => { entered = true; await gate; return executor.execute(action); },
    } });
    try {
      k.start(); await k.describe(); const id = await k.startRun(task);
      await until(() => entered);
      await expect(k.shutdown(50)).rejects.toThrow("in-flight Kernel effect executor");
      expect(k.ownsRoot).toBe(true);
      expect(() => k.reconcileActionOutcome(id.runId, "act_ledger", "CONFIRMED_NOT_DONE")).toThrow("executor is still active");
      const r = mediated(f, { expectedHeads: anchorsFor(f.root) });
      expect(() => r.start()).toThrow("owned by another live Kernel");
      release(); await until(() => entries(f.ledger).length === 1);
      await k.settle(); await k.shutdown();
      expect(k.ownsRoot).toBe(false);
    } finally { release(); }
  });

  it.each(["same-id", "new-id"])("duplicate request (%s) cannot cause a second execution", async (duplicate) => {
    const f = fixture();
    const k = mediated(f, { adapterEnv: { DVL_B4_DUPLICATE: duplicate } });
    k.start(); await k.describe(); const id = await k.startRun(task);
    expect(await k.waitForRunEnd(id.runId)).toBe("finished");
    expect(entries(f.ledger)).toHaveLength(1);
    expect(k.store.ofType("kernel.action_execution_authorized")).toHaveLength(1);
  });

  it("a provider FINISHED claim cannot close a prepared action after the trusted executor's outcome was lost", async () => {
    const f = fixture();
    const k = mediated(f, { adapterEnv: { DVL_B4_FORGE_FINISH: "1" }, spikeActionBoundary: async (point) => {
      if (point === "effect_returned") throw new Error("lost trusted executor outcome");
    } });
    k.start(); await k.describe(); const id = await k.startRun(task);
    await waitForEvent(k, (e) => e.type === "action.finished" && e.origin === "adapter");
    expect(entries(f.ledger)).toHaveLength(1);
    await k.shutdown();
    const r = mediated(f, { expectedHeads: anchorsFor(f.root) });
    r.start(); await r.describe();
    await expect(r.retryRun(id.runId, task)).rejects.toThrow("unresolved action outcome");
    expect(r.store.ofType("kernel.action_outcome_confirmed")).toHaveLength(0);
  });

  it("a host operation identity with conflicting semantics cannot reuse an outcome or authorize a new effect", async () => {
    const f = fixture();
    class SingletonLedger extends ExternalLedgerExecutor { operationIdentity() { return "one-host-owned-operation"; } }
    const k = mediated(f, { spikeEffectExecutor: new SingletonLedger(f.ledger),
      adapterEnv: { DVL_B4_DUPLICATE: "new-id", DVL_B4_CHANGE_DUPLICATE: "1" } });
    k.start(); await k.describe(); const id = await k.startRun(task);
    await waitForEvent(k, (e) => e.type === "kernel.transport_issue" && JSON.stringify(e.payload).includes("different action semantics"));
    expect(entries(f.ledger)).toHaveLength(1);
    expect(k.store.ofType("kernel.action_execution_authorized")).toHaveLength(1);
    expect(k.store.ofType("kernel.action_outcome_confirmed")).toHaveLength(1);
    await k.shutdown();
    const r = mediated(f, { expectedHeads: anchorsFor(f.root), spikeEffectExecutor: new SingletonLedger(f.ledger) });
    r.start(); await r.describe();
    expect(await r.inspectSpikeActionOutcome(id.runId, "act_duplicate")).toBe("UNKNOWN");
    await expect(r.retryRun(id.runId, task)).rejects.toThrow("unresolved action outcome");
  });

  it("provider-native execution mode is refused before dispatch, so there is no second execution lane", async () => {
    const f = fixture();
    const k = mediated(f, { adapterEnv: { DVL_B4_NATIVE_MODE: "1" } });
    k.start(); await k.describe();
    await expect(k.startRun(task)).rejects.toThrow("provider-native execution denied");
    expect(entries(f.ledger)).toHaveLength(0);
    expect(k.store.ofType("kernel.action_execution_authorized")).toHaveLength(0);
  });

  it("an intent selecting provider-native ownership receives no Kernel grant or effect", async () => {
    const f = fixture();
    const k = mediated(f, { adapterEnv: { DVL_B4_REQUEST_NATIVE: "1" } });
    k.start(); await k.describe(); await k.startRun(task);
    await waitForEvent(k, (e) => e.type === "kernel.transport_issue" && JSON.stringify(e.payload).includes("provider-native execution denied"));
    expect(entries(f.ledger)).toHaveLength(0);
    expect(k.store.ofType("kernel.action_prepared")).toHaveLength(0);
  });

  it("a prepared run cannot fall back to an unmediated adapter after restart", async () => {
    const f = await crashAt("outcome_committed");
    const r = track(kernelOn(f.root, { expectedHeads: f.heads }));
    r.start(); await r.describe();
    await expect(r.retryRun(f.run.runId, task)).rejects.toThrow("provider-native fallback denied");
    expect(entries(f.ledger)).toHaveLength(1);
    expect(r.store.ofType("kernel.attempt_created")).toHaveLength(0);
  });

  it("negative control: an unrestricted lying provider can still mutate outside DVL before PREPARED — H4 remains open", async () => {
    const f = await crashAt("unmediated");
    expect(entries(f.ledger)).toEqual(["unmediated-effect"]);
    const r = mediated(f, { expectedHeads: f.heads, adapterEnv: { DVL_B4_UNMEDIATED_LEDGER: f.ledger } });
    expect(r.store.ofType("kernel.action_prepared")).toHaveLength(0);
    expect(r.store.ofType("action.requested")).toHaveLength(0);
    r.start(); await r.describe();
    expect((await r.retryRun(f.run.runId, task)).attempt).toBe(2);
    await until(() => entries(f.ledger).length >= 2);
    expect(entries(f.ledger).slice(0, 2)).toEqual(["unmediated-effect", "unmediated-effect"]);
    // This is counterevidence, not a passing assertion of the universal invariant.
  });
});

it("B4 refuses effects when durable fsync/host authority is absent", () => {
  const f = fixture();
  expect(() => kernelOn(f.root, { spikeEffectExecutor: new ExternalLedgerExecutor(f.ledger) })).toThrow("B4 effects require fsync");
});
