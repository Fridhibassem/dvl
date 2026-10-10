/**
 * C29 — H4 / B3: recovery fences the previous attempt's executor before retry.
 *
 * Invariant: after a crash, CONFIRMED_NOT_DONE and retry are refused until the Kernel has
 * proven that the old attempt's executor can no longer act. The proof: its process group
 * (durable pid + start token from kernel.adapter_spawned) is killed and verified empty, the
 * attempt workspace is quiescent, and kernel.recovery_fenced is durable. If any step cannot be
 * proven, the run holds in HOLD_RECOVERY_PROCESS_STILL_ALIVE with retryAllowed=false.
 *
 * The executors are real processes. The Kernel that crashes runs in its own process
 * (h4-kernel-host) and is SIGKILLed.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { CommitHeads } from "../kernel/event-store.js";
import type { Kernel } from "../kernel/kernel.js";
import { fenceProcessGroup, type ProcessOps } from "../kernel/process-fence.js";
import type { RunIdentity } from "../kernel/types.js";
import { keyFor, kernelOn, makeKernel, runScenario, tempRoot } from "./harness.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const task = (scenario: string) => ({ role: "builder", goal: scenario, acceptanceCriteria: ["mock"], scope: ["tests/**"], scenario });

let kernels: Kernel[] = [];
let hosts: ChildProcess[] = [];
const cleanupPids = new Set<number>();
const track = (k: Kernel) => (kernels.push(k), k);
afterEach(async () => {
  for (const h of hosts) h.kill("SIGKILL");
  hosts = [];
  for (const pid of cleanupPids) {
    for (const target of [-pid, pid]) {
      try {
        process.kill(target, "SIGKILL");
      } catch {
        /* gone */
      }
    }
  }
  cleanupPids.clear();
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});

/** Alive and not a zombie (portable: ps works on Linux and macOS). */
function alive(pid: number): boolean {
  const r = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim().length > 0 && !r.stdout.trim().startsWith("Z");
}

async function until(pred: () => boolean, ms = 5_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
}

/** A Kernel in its own process, mid-run, then SIGKILLed. `beforeKill` may e.g. keep the adapter alive. */
async function crashKernel(root: string, scenario: string, beforeKill?: (adapterPid: number) => void) {
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
  const host = spawn(process.execPath, ["--import", tsx, path.join(here, "h4-kernel-host.ts")], { stdio: ["pipe", "pipe", "pipe"] });
  hosts.push(host);
  let stderr = "";
  host.stderr.on("data", (d) => (stderr += d));
  host.stdin.write(JSON.stringify({ root, keyHex: keyFor(root).toString("hex"), scenario }) + "\n");
  const st = { heads: undefined as CommitHeads | undefined, run: undefined as RunIdentity | undefined, adapterPid: 0 };
  const lines = readline.createInterface({ input: host.stdout });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`host never became ready; stderr:\n${stderr}`)), 20_000);
    lines.on("line", (line) => {
      const m = JSON.parse(line) as { commit?: CommitHeads; run?: RunIdentity; adapterPid?: number; ready?: boolean };
      if (m.commit) st.heads = m.commit;
      if (m.run) {
        st.run = m.run;
        st.adapterPid = m.adapterPid!;
        cleanupPids.add(m.adapterPid!);
      }
      if (m.ready) {
        clearTimeout(t);
        resolve();
      }
    });
  });
  beforeKill?.(st.adapterPid);
  const exited = new Promise((r) => host.once("exit", r));
  host.kill("SIGKILL");
  await exited;
  return { runId: st.run!.runId, heads: st.heads!, adapterPid: st.adapterPid };
}

const ws = (root: string, runId: string, attempt = 1) => path.join(root, ".dvl", "tx", runId, `attempt-${attempt}`);
const fenced = (k: Kernel, runId: string) => k.store.ofType("kernel.recovery_fenced").filter((e) => e.runId === runId);
const holds = (k: Kernel, runId: string) => k.store.ofType("kernel.recovery_hold").filter((e) => e.runId === runId);
const attempts = (k: Kernel, runId: string) => k.store.ofType("kernel.attempt_created").filter((e) => e.runId === runId).length;
const sizeOf = (f: string) => fs.statSync(f).size;

describe("C29 H4/B3 recovery fences the old executor before retry", () => {
  it("1. detached adapter survival: a surviving adapter is killed and verified dead before NOT_DONE and retry", async () => {
    const root = tempRoot("c29-survivor");
    // The executor outlives the Kernel (modelled by stopping it so it cannot react to EOF).
    const { runId, heads, adapterPid } = await crashKernel(root, "h4-action-started-hold", (pid) => process.kill(pid, "SIGSTOP"));
    expect(alive(adapterPid)).toBe(true);

    const k = track(kernelOn(root, { expectedHeads: heads }));
    await expect(k.fenceRecoveredAttempt(runId)).rejects.toThrow(/ownership/); // a reader may not signal anything
    k.start();
    await k.describe();
    expect(k.recoveryStatus(runId)).toMatchObject({ state: "PENDING", retryAllowed: false });
    expect(() => k.reconcileActionOutcome(runId, "act_h4_probe", "CONFIRMED_NOT_DONE")).toThrow(/HOLD_RECOVERY_PROCESS_STILL_ALIVE/);
    expect(alive(adapterPid)).toBe(true); // refusing changed nothing

    expect(await k.fenceRecoveredAttempt(runId)).toMatchObject({ state: "FENCED", retryAllowed: true });
    expect(alive(adapterPid)).toBe(false);
    expect(fenced(k, runId)).toHaveLength(1);
    expect(fenced(k, runId)[0]!.payload).toMatchObject({ attempt: 1, processGroupId: adapterPid, outcome: "killed", revokedActions: ["act_h4_probe"] });
    expect((fenced(k, runId)[0]!.payload as { killed: number[] }).killed).toContain(adapterPid);

    k.reconcileActionOutcome(runId, "act_h4_probe", "CONFIRMED_NOT_DONE");
    expect((await k.retryRun(runId, task("h4-target-probe-finish"))).attempt).toBe(2);
    expect(await k.waitForRunEnd(runId)).toBe("finished");
  });

  it("2. late write: a writer left in the adapter's group keeps mutating after the Kernel dies; fencing kills it, the workspace goes quiet", async () => {
    const root = tempRoot("c29-late-write");
    const { runId, heads, adapterPid } = await crashKernel(root, "h4-action-started-writer");
    expect(await until(() => !alive(adapterPid))).toBe(true); // the adapter itself exited on EOF...
    const log = path.join(ws(root, runId), "late-write.log");
    const writer = Number(fs.readFileSync(log + ".pid", "utf8"));
    cleanupPids.add(writer);
    expect(alive(writer)).toBe(true); // ...but its child survives in the group
    const s1 = sizeOf(log);
    await new Promise((r) => setTimeout(r, 200));
    expect(sizeOf(log)).toBeGreaterThan(s1); // and writes after the Kernel died

    const k = track(kernelOn(root, { expectedHeads: heads }));
    k.start();
    await k.describe();
    expect(() => k.reconcileActionOutcome(runId, "act_h4_probe", "CONFIRMED_NOT_DONE")).toThrow(/HOLD_RECOVERY_PROCESS_STILL_ALIVE/);
    const st = await k.fenceRecoveredAttempt(runId);
    expect(st).toMatchObject({ state: "FENCED", retryAllowed: true });
    expect(fenced(k, runId)[0]!.payload).toMatchObject({ outcome: "killed" });
    expect((fenced(k, runId)[0]!.payload as { killed: number[] }).killed).toContain(writer);
    expect(alive(writer)).toBe(false);
    const s2 = sizeOf(log);
    await new Promise((r) => setTimeout(r, 200));
    expect(sizeOf(log)).toBe(s2); // no write after the fence

    k.reconcileActionOutcome(runId, "act_h4_probe", "CONFIRMED_NOT_DONE");
    expect((await k.retryRun(runId, task("h4-target-probe-finish"))).attempt).toBe(2);
    const archived = k.store.ofType("kernel.workspace_archived").find((e) => e.runId === runId)!.payload as { files: string[] };
    expect(archived.files).toContain("late-write.log");
  });

  it("3. kill failure: the group cannot be killed → HOLD_RECOVERY_PROCESS_STILL_ALIVE, retryAllowed=false, nothing advances; durable across restart", async () => {
    const root = tempRoot("c29-kill-fail");
    const { runId, heads, adapterPid } = await crashKernel(root, "h4-action-started-hold", (pid) => process.kill(pid, "SIGSTOP"));
    const eperm: Partial<ProcessOps> = {
      killGroup: () => {
        throw Object.assign(new Error("operation not permitted"), { code: "EPERM" });
      },
    };
    const k = track(kernelOn(root, { expectedHeads: heads, processOps: eperm }));
    k.start();
    await k.describe();

    const st = await k.fenceRecoveredAttempt(runId);
    expect(st).toMatchObject({ state: "HOLD_RECOVERY_PROCESS_STILL_ALIVE", retryAllowed: false });
    expect(st.reason).toMatch(/still alive after SIGKILL \(kill failed: EPERM\)/);
    expect(alive(adapterPid)).toBe(true);
    expect(holds(k, runId)).toHaveLength(1);
    expect(holds(k, runId)[0]!.payload).toMatchObject({ state: "HOLD_RECOVERY_PROCESS_STILL_ALIVE", retryAllowed: false });
    expect((holds(k, runId)[0]!.payload as { survivors: number[] }).survivors).toContain(adapterPid);

    // "done" needs no fence, but retry still does.
    k.reconcileActionOutcome(runId, "act_h4_probe", "CONFIRMED_DONE");
    const before = attempts(k, runId);
    await expect(k.retryRun(runId, task("h4-target-probe-finish"))).rejects.toThrow(/HOLD_RECOVERY_PROCESS_STILL_ALIVE.*retryAllowed=false/);
    expect(attempts(k, runId)).toBe(before);
    expect(k.store.ofType("kernel.workspace_archived").filter((e) => e.runId === runId)).toHaveLength(0);
    expect(holds(k, runId)).toHaveLength(1); // the same hold is not re-recorded
    await k.shutdown();

    // A fresh Kernel replays the hold; with working kill it fences and retry proceeds.
    const k2 = track(kernelOn(root, { expectedHeads: undefined }));
    expect(k2.recoveryStatus(runId)).toMatchObject({ state: "HOLD_RECOVERY_PROCESS_STILL_ALIVE", retryAllowed: false });
    k2.start();
    await k2.describe();
    expect(await k2.fenceRecoveredAttempt(runId)).toMatchObject({ state: "FENCED" });
    expect(alive(adapterPid)).toBe(false);
    expect((await k2.retryRun(runId, task("h4-target-probe-finish"))).attempt).toBe(2);
  });

  it("4. a live process whose identity cannot be verified is never signalled: HOLD", async () => {
    const root = tempRoot("c29-identity");
    const { runId, heads, adapterPid } = await crashKernel(root, "h4-action-started-hold", (pid) => process.kill(pid, "SIGSTOP"));
    let kills = 0;
    const k = track(kernelOn(root, { expectedHeads: heads, processOps: { startToken: () => null, killGroup: () => void kills++ } }));
    k.start();
    await k.describe();
    const st = await k.fenceRecoveredAttempt(runId);
    expect(st).toMatchObject({ state: "HOLD_RECOVERY_PROCESS_STILL_ALIVE", retryAllowed: false });
    expect(st.reason).toMatch(/cannot verify the identity/);
    expect(kills).toBe(0);
    expect(alive(adapterPid)).toBe(true);
  });

  it("5. escapee: a writer that left the group with setsid() is caught by workspace quiescence → HOLD until it is gone", async () => {
    const root = tempRoot("c29-escapee");
    const { runId, heads, adapterPid } = await crashKernel(root, "h4-action-started-escapee");
    expect(await until(() => !alive(adapterPid))).toBe(true);
    const writer = Number(fs.readFileSync(path.join(ws(root, runId), "late-write.log.pid"), "utf8"));
    cleanupPids.add(writer);
    expect(alive(writer)).toBe(true);

    const k = track(kernelOn(root, { expectedHeads: heads }));
    k.start();
    await k.describe();
    const st = await k.fenceRecoveredAttempt(runId);
    expect(st).toMatchObject({ state: "HOLD_RECOVERY_PROCESS_STILL_ALIVE", retryAllowed: false });
    expect(st.reason).toMatch(/workspace still changing/);
    expect(() => k.reconcileActionOutcome(runId, "act_h4_probe", "CONFIRMED_NOT_DONE")).toThrow(/HOLD_RECOVERY_PROCESS_STILL_ALIVE/);

    process.kill(writer, "SIGKILL"); // out-of-band removal of the escapee
    expect(await until(() => !alive(writer))).toBe(true);
    expect(await k.fenceRecoveredAttempt(runId)).toMatchObject({ state: "FENCED", retryAllowed: true });
  });

  it("6. non-Windows: adapter death after action.started (no Kernel crash) is fenced, then NOT_DONE and retry", async () => {
    const k = track(makeKernel("c29-posix"));
    const a = await runScenario(k, "crash"); // action.started act_c, then the adapter dies
    expect(a.status).toBe("failed");
    await k.waitClosed(5_000);
    k.restartAdapter();
    await k.describe();
    expect(k.recoveryStatus(a.id.runId)).toMatchObject({ state: "PENDING", retryAllowed: false });
    expect(await k.fenceRecoveredAttempt(a.id.runId)).toMatchObject({ state: "FENCED", retryAllowed: true });
    expect(fenced(k, a.id.runId)[0]!.payload).toMatchObject({ outcome: "group_empty" });
    k.reconcileActionOutcome(a.id.runId, "act_c", "CONFIRMED_NOT_DONE");
    expect((await k.retryRun(a.id.runId, task("happy"))).attempt).toBe(2);
  });

  it("7. Windows: process-group fencing is unsupported → HOLD, nothing is signalled, retry and NOT_DONE refused", async () => {
    let kills = 0;
    const k = track(makeKernel("c29-win32", { processOps: { platform: "win32", killGroup: () => void kills++ } }));
    const a = await runScenario(k, "crash");
    await k.waitClosed(5_000);
    k.restartAdapter();
    await k.describe();
    const st = await k.fenceRecoveredAttempt(a.id.runId);
    expect(st).toMatchObject({ state: "HOLD_RECOVERY_PROCESS_STILL_ALIVE", retryAllowed: false });
    expect(st.reason).toMatch(/not supported on win32/);
    expect(kills).toBe(0);
    expect(() => k.reconcileActionOutcome(a.id.runId, "act_c", "CONFIRMED_NOT_DONE")).toThrow(/HOLD_RECOVERY_PROCESS_STILL_ALIVE/);
    k.reconcileActionOutcome(a.id.runId, "act_c", "CONFIRMED_DONE");
    await expect(k.retryRun(a.id.runId, task("happy"))).rejects.toThrow(/HOLD_RECOVERY_PROCESS_STILL_ALIVE.*retryAllowed=false.*win32/);
  });

  it("8. fence decision table (fake process table)", async () => {
    const ops = (o: Partial<ProcessOps> & { members: number[][] }): ProcessOps & { kills: number } => {
      let call = 0;
      const self = {
        platform: "linux" as NodeJS.Platform,
        kills: 0,
        groupMembers: () => o.members[Math.min(call++, o.members.length - 1)]!,
        startToken: () => "T",
        killGroup: () => void self.kills++,
        ...o,
      };
      return self;
    };
    const sp = { pid: 4242, startToken: "T" };
    let o = ops({ members: [[]] });
    expect(await fenceProcessGroup(sp, o, 50)).toMatchObject({ fenced: true, outcome: "group_empty" });
    expect(o.kills).toBe(0);
    o = ops({ members: [[4242, 4243], []] });
    expect(await fenceProcessGroup(sp, o, 50)).toMatchObject({ fenced: true, outcome: "killed", killed: [4242, 4243] });
    expect(o.kills).toBe(1);
    o = ops({ members: [[4242]], startToken: () => "OTHER" });
    expect(await fenceProcessGroup(sp, o, 50)).toMatchObject({ fenced: true, outcome: "pid_reused" });
    expect(o.kills).toBe(0); // a reused pid is never signalled
    o = ops({ members: [[5000], []] }); // leader gone, group still populated → ours
    expect(await fenceProcessGroup(sp, o, 50)).toMatchObject({ fenced: true, outcome: "killed" });
    o = ops({ members: [[5000]] }); // kill had no effect
    expect(await fenceProcessGroup(sp, o, 50)).toMatchObject({ fenced: false, survivors: [5000] });
    expect(await fenceProcessGroup(sp, ops({ members: [[4242]] , groupMembers: () => null }), 50)).toMatchObject({ fenced: false, reason: expect.stringMatching(/cannot enumerate/) });
    expect(await fenceProcessGroup({ pid: 4242, startToken: null }, ops({ members: [[4242]] }), 50)).toMatchObject({ fenced: false, reason: expect.stringMatching(/cannot verify/) });
    expect(await fenceProcessGroup({ pid: 1, startToken: "T" }, ops({ members: [[1]] }), 50)).toMatchObject({ fenced: false, reason: expect.stringMatching(/refusing/) });
    expect(await fenceProcessGroup(sp, ops({ members: [[]], platform: "win32" }), 50)).toMatchObject({ fenced: false, reason: expect.stringMatching(/win32/) });
  });
});
