/**
 * C27 — H4: Kernel crash replay.
 *
 * Invariant: after the KERNEL dies mid-run (SIGKILL: no shutdown, no flush), a fresh Kernel
 * on the same root rebuilds run state from the authenticated JSONL log alone, and that state
 * never claims a completion the dead Kernel did not record:
 *   - an attempt without a terminal Kernel record is `interrupted` (terminal, never success);
 *   - an adapter run.finished that reached the log is a claim, not a completion;
 *   - the staged change stays in the attempt workspace; the project tree is byte-identical;
 *   - recovery records are written exactly once; retryRun() is allowed only when no action outcome is unresolved.
 *
 * Targets: a synthetic project (always) and a REAL project, khedma.tn, when a checkout is
 * available (DVL_H4_TARGET, default: a sibling `khedma.tn` checkout of this repository).
 * Only its tracked files are copied to a temp root (never `.env`, `.git` or node_modules), so
 * the checkout itself is never written. The only change ever staged is one new test file
 * (H4_PROBE). Nothing is installed, executed, or sent anywhere from the target.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { CommitHeads } from "../kernel/event-store.js";
import { sha256 } from "../kernel/event-store.js";
import type { Kernel } from "../kernel/kernel.js";
import type { RunIdentity } from "../kernel/types.js";
import { H4_PROBE } from "../mock-provider/scenarios.js";
import { anchorsFor, frame, injectFrames, keyFor, kernelOn, runScenario, tempRoot, violations } from "./harness.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROBE = "tests/dvl-h4-probe.test.ts";
const probeTask = (scenario: string) => ({ role: "builder", goal: "H4 probe", acceptanceCriteria: ["probe staged"], scope: ["tests/**"], scenario });

// ───────────── targets ─────────────

interface Target {
  name: string;
  /** Materialize the project's files under `root`; returns their relative paths. */
  materialize: (root: string) => string[];
  /** Verifies the source itself was not touched (real target only). */
  sourceState?: () => string;
}

const synthetic: Target = {
  name: "synthetic project",
  materialize: (root) => {
    const files: Record<string, string> = {
      "package.json": '{ "name": "h4-fixture", "private": true, "scripts": { "test": "vitest run" } }\n',
      "src/index.ts": "export const greet = (n: string) => `hello ${n}`;\n",
      "tests/index.test.ts": 'import { it } from "vitest";\nit("ok", () => {});\n',
    };
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    return Object.keys(files);
  },
};

const khedmaDir = process.env.DVL_H4_TARGET ?? path.resolve(here, "..", "..", "..", "..", "khedma.tn");
const git = (...args: string[]) => execFileSync("git", ["-C", khedmaDir, ...args]);
const khedma: Target = {
  name: "khedma.tn",
  // Tracked files only: ignored files (.env, node_modules, build output) are never read.
  materialize: (root) => {
    const files = git("ls-files", "-z").toString("utf8").split("\0").filter(Boolean);
    for (const rel of files) {
      const src = path.join(khedmaDir, rel);
      if (!fs.lstatSync(src).isFile()) continue;
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.copyFileSync(src, path.join(root, rel));
    }
    return files.filter((rel) => fs.lstatSync(path.join(root, rel), { throwIfNoEntry: false })?.isFile());
  },
  sourceState: () => git("rev-parse", "HEAD").toString() + git("status", "--porcelain", "--untracked-files=all").toString(),
};
const khedmaAvailable = fs.existsSync(path.join(khedmaDir, ".git"));
const targets = khedmaAvailable ? [synthetic, khedma] : [synthetic];
if (!khedmaAvailable) console.warn(`C27: real target khedma.tn not found at ${khedmaDir}; only the synthetic target runs`);

// ───────────── helpers ─────────────

/** Every file below root outside .dvl, with its hash. */
function projectTree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      const rel = path.relative(root, abs);
      if (rel === ".dvl") continue;
      if (ent.isDirectory()) walk(abs);
      else out.set(rel, sha256(fs.readFileSync(abs)));
    }
  };
  walk(root);
  return out;
}

function prepare(target: Target, tag: string) {
  const root = tempRoot(tag);
  const files = target.materialize(root);
  expect(files.length).toBeGreaterThan(0);
  expect(files).not.toContain(PROBE);
  return { root, tree: projectTree(root) };
}

/** Alive and not a zombie (a reparented child may never be reaped inside a container). */
function alive(pid: number): boolean {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2)[0] !== "Z";
  } catch {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

interface Crashed {
  run: RunIdentity;
  heads: CommitHeads;
  adapterPid: number;
}

/** Run the Kernel in its own process, wait for the committed probe write, then SIGKILL it. */
async function crashKernelMidRun(root: string, scenario: string): Promise<Crashed> {
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
  const host = spawn(process.execPath, ["--import", tsx, path.join(here, "h4-kernel-host.ts")], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  host.stderr.on("data", (d) => (stderr += d));
  const exited = new Promise<void>((r) => host.once("exit", () => r()));
  host.stdin.write(JSON.stringify({ root, keyHex: keyFor(root).toString("hex"), scenario }) + "\n");

  let heads: CommitHeads | undefined;
  let run: RunIdentity | undefined;
  let adapterPid = 0;
  const lines = readline.createInterface({ input: host.stdout });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`h4 host never became ready; stderr:\n${stderr}`)), 20_000);
    host.once("exit", (code) => reject(new Error(`h4 host exited early (${code}); stderr:\n${stderr}`)));
    lines.on("line", (line) => {
      const msg = JSON.parse(line) as { commit?: CommitHeads; run?: RunIdentity; adapterPid?: number; ready?: boolean };
      if (msg.commit) heads = msg.commit; // the host persists the latest commit boundary
      if (msg.run) ({ run, adapterPid } = msg as Required<typeof msg>);
      if (msg.ready) {
        clearTimeout(t);
        resolve();
      }
    });
  });
  host.kill("SIGKILL"); // the crash: the Kernel gets no chance to record anything else
  await exited;
  lines.close();

  // Its adapter loses stdin and exits: no writer survives the Kernel.
  const deadline = Date.now() + 5_000;
  while (alive(adapterPid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  if (alive(adapterPid)) {
    process.kill(-adapterPid, "SIGKILL");
    throw new Error(`adapter ${adapterPid} outlived the killed Kernel`);
  }
  return { run: run!, heads: heads!, adapterPid };
}

const interruptedRecords = (k: Kernel, runId: string) => k.store.ofType("kernel.run_interrupted").filter((e) => e.runId === runId);
const evidenceOf = (k: Kernel, runId: string) => k.store.allEvidence().filter((e) => e.runId === runId);

let kernels: Kernel[] = [];
const track = (k: Kernel) => (kernels.push(k), k);
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});

// ───────────── tests ─────────────

describe.each(targets)("C27 H4 Kernel crash replay — $name", (target) => {
  it("1. Kernel SIGKILLed mid-run: replay rebuilds the run as interrupted, never finished; the probe stays staged", async () => {
    const before = target.sourceState?.();
    const { root, tree } = prepare(target, "c27-crash");
    const { run, heads } = await crashKernelMidRun(root, "h4-target-probe");

    // A fresh Kernel, as the host recreates it: same key, last persisted commit boundary.
    const k = track(kernelOn(root, { expectedHeads: heads }));
    expect(k.store.integrity.events).toMatchObject({ ok: true, rejected: [], truncated: false });
    expect(k.store.recovery).toBeNull();

    // Reconstructed from the log alone, not from the dead process's memory.
    expect(k.runStatus(run.runId)).toBe("interrupted");
    await expect(k.waitForRunEnd(run.runId, 100)).resolves.toBe("interrupted");
    const history = k.store.all().filter((e) => e.runId === run.runId);
    expect(history.some((e) => e.type === "run.started")).toBe(true);
    expect(history.some((e) => e.type === "action.finished")).toBe(true);
    expect(history.some((e) => e.type === "run.finished" || e.type === "kernel.run_finished")).toBe(false);
    expect(evidenceOf(k, run.runId).some((e) => e.evidenceType === "FILE_SNAPSHOT")).toBe(false);
    // Read-only until it owns the root: replaying wrote nothing.
    expect(interruptedRecords(k, run.runId)).toHaveLength(0);

    // The harmless change exists only in the attempt workspace, byte-exact; the project is untouched.
    const ws = k.txWorkspaceOf(run.runId);
    expect(path.relative(root, ws)).toBe(path.join(".dvl", "tx", run.runId, "attempt-1"));
    expect(fs.readFileSync(path.join(ws, PROBE), "utf8")).toBe(H4_PROBE);
    expect(projectTree(root)).toEqual(tree);
    if (before !== undefined) expect(target.sourceState!()).toBe(before);
  });

  it("2. after restart: interruption recorded once, the old binding is fenced, recovery only via retryRun", async () => {
    const before = target.sourceState?.();
    const { root, tree } = prepare(target, "c27-restart");
    const { run, heads } = await crashKernelMidRun(root, "h4-target-probe");

    const k = track(kernelOn(root, { expectedHeads: heads }));
    k.start();
    await k.describe();
    expect(interruptedRecords(k, run.runId)).toHaveLength(1);
    expect(interruptedRecords(k, run.runId)[0]!.payload).toMatchObject({ runId: run.runId, attempt: 1 });

    // The new adapter instance cannot act for the dead Kernel's attempt.
    await injectFrames(k, [frame("run.finished", run.runId, 1, "actor_root", { claim: "done" })]);
    expect(violations(k, "run_binding_violation").some((v) => v.reason === "run_owned_by_other_instance")).toBe(true);
    expect(k.runStatus(run.runId)).toBe("interrupted");

    // Continuation: attempt 2, fresh workspace; attempt 1's staged work is archived, not reused.
    const retry = await k.retryRun(run.runId, probeTask("h4-target-probe-finish"));
    expect(retry.attempt).toBe(2);
    expect(await k.waitForRunEnd(run.runId)).toBe("finished");
    await k.settle();
    const archived = k.store.ofType("kernel.workspace_archived").find((e) => e.runId === run.runId)!.payload as { attempt: number; previousStatus: string; files: string[] };
    expect(archived).toMatchObject({ attempt: 1, previousStatus: "interrupted", files: [PROBE] });
    await k.shutdown();

    // A further restart replays the finished retry; nothing is re-recorded.
    const k2 = track(kernelOn(root, { expectedHeads: anchorsFor(root) }));
    expect(k2.runStatus(run.runId)).toBe("finished");
    k2.start();
    expect(interruptedRecords(k2, run.runId)).toHaveLength(1);
    expect(projectTree(root)).toEqual(tree);
    if (before !== undefined) expect(target.sourceState!()).toBe(before);
  });

  it("3. crash after the adapter's run.finished was committed but before the Kernel's verdict: not a completion", async () => {
    const { root, tree } = prepare(target, "c27-window");
    const commits: CommitHeads[] = [];
    const k = track(kernelOn(root, { onCommit: (h) => commits.push(h) }));
    const { id, status } = await runScenario(k, "h4-target-probe-finish");
    expect(status).toBe("finished");
    await k.shutdown();

    // The durable state at the instant between the two writes: everything up to and including
    // the adapter's run.finished line, nothing after (as if the Kernel died right there).
    const all = k.store.all();
    const claim = all.findIndex((e) => e.origin === "adapter" && e.type === "run.finished" && e.runId === id.runId);
    expect(all.findIndex((e) => e.type === "kernel.run_finished" && e.runId === id.runId)).toBeGreaterThan(claim);
    const cut = commits.filter((h) => h.events.count === claim + 1).at(-1)!;
    for (const [file, n] of [[k.store.eventsPath, cut.events.count], [k.store.evidencePath, cut.evidence.count]] as const) {
      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      fs.writeFileSync(file, lines.slice(0, n).map((l) => l + "\n").join(""));
    }

    const r = track(kernelOn(root, { expectedHeads: cut }));
    expect(r.store.integrity.events).toMatchObject({ ok: true, truncated: false });
    expect(r.store.all().some((e) => e.origin === "adapter" && e.type === "run.finished" && e.runId === id.runId)).toBe(true);
    expect(r.store.all().some((e) => e.type === "kernel.run_finished")).toBe(false);
    expect(r.runStatus(id.runId)).toBe("interrupted");
    expect(projectTree(root)).toEqual(tree);
  });
  it("4. crash window after durable action.started: replay marks the effect unknown and retry is held", async () => {
    const { root, tree } = prepare(target, "c27-action-unknown");
    const commits: CommitHeads[] = [];
    const k = track(kernelOn(root, { onCommit: (h) => commits.push(h) }));

    // Produce a normal completed action first, then cut the durable history at the exact
    // boundary immediately after action.started — the durable state a Kernel crash at that
    // instant would leave behind.
    const { id, status } = await runScenario(k, "h4-target-probe-finish");
    expect(status).toBe("finished");
    await k.shutdown();

    const all = k.store.all();
    const started = all.findIndex(
      (e) =>
        e.origin === "adapter" &&
        e.type === "action.started" &&
        e.runId === id.runId &&
        (e.payload as { actionId?: string } | undefined)?.actionId === "act_h4_probe",
    );
    const finished = all.findIndex(
      (e) =>
        e.origin === "adapter" &&
        e.type === "action.finished" &&
        e.runId === id.runId &&
        (e.payload as { actionId?: string } | undefined)?.actionId === "act_h4_probe",
    );

    expect(started).toBeGreaterThanOrEqual(0);
    expect(finished).toBeGreaterThan(started);

    const cut = commits.filter((h) => h.events.count === started + 1).at(-1)!;
    expect(cut).toBeDefined();

    for (const [file, n] of [[k.store.eventsPath, cut.events.count], [k.store.evidencePath, cut.evidence.count]] as const) {
      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      fs.writeFileSync(file, lines.slice(0, n).map((l) => l + "\n").join(""));
    }

    const r = track(kernelOn(root, { expectedHeads: cut }));
    expect(r.store.integrity.events).toMatchObject({ ok: true, truncated: false });
    expect(r.runStatus(id.runId)).toBe("interrupted");

    const history = r.store.all().filter((e) => e.runId === id.runId);
    expect(history.some((e) => e.type === "action.started")).toBe(true);
    expect(history.some((e) => e.type === "action.finished")).toBe(false);

    r.start();
    await r.describe();

    const attemptsBefore = r.store.ofType("kernel.attempt_created").filter((e) => e.runId === id.runId).length;
    const archivesBefore = r.store.ofType("kernel.workspace_archived").filter((e) => e.runId === id.runId).length;

    await expect(r.retryRun(id.runId, probeTask("h4-target-probe-finish"))).rejects.toThrow(
      /unresolved action outcome.*act_h4_probe.*reconciliation required before retry/i,
    );

    // HOLD is fail-closed before any retry mutation.
    expect(r.store.ofType("kernel.attempt_created").filter((e) => e.runId === id.runId)).toHaveLength(attemptsBefore);
    expect(r.store.ofType("kernel.workspace_archived").filter((e) => e.runId === id.runId)).toHaveLength(archivesBefore);
    expect(r.runStatus(id.runId)).toBe("interrupted");
    expect(projectTree(root)).toEqual(tree);
  });

});
