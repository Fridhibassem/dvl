import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Kernel } from "../kernel/kernel.js";
import { recoveryProcessOps, stopRecoveredExecution, type RecoveryExecution, type RecoveryProcessOps } from "../kernel/recovery-process.js";
import type { CommitHeads } from "../kernel/event-store.js";
import type { RunIdentity } from "../kernel/types.js";
import { anchorsFor, kernelOn, keyFor, tempRoot, waitForEvent } from "./harness.js";

const task = { role: "builder", goal: "retry", acceptanceCriteria: [], scope: ["**"], scenario: "happy" };
const kernels: Kernel[] = [];
const groups: number[] = [];
afterEach(async () => {
  await Promise.all(kernels.splice(0).map((k) => k.shutdown()));
  for (const group of groups.splice(0)) { try { process.kill(-group, "SIGKILL"); } catch {} }
});
const track = (k: Kernel) => (kernels.push(k), k);
async function until(predicate: () => boolean, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("fixture did not reach expected boundary");
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function crashWithSurvivor(scenario = "survives") {
  const root = tempRoot("c29-survivor");
  const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
  const host = spawn(process.execPath, ["--import", loader, path.join(path.dirname(fileURLToPath(import.meta.url)), "h4-survivor-kernel-host.ts")], { stdio: ["pipe", "pipe", "pipe"] });
  const exited = new Promise<void>((resolve) => host.once("exit", () => resolve()));
  let stderr = "";
  host.stderr.on("data", (d) => { stderr += d; });
  let heads: CommitHeads | undefined;
  let ready: { run: RunIdentity; adapterPid: RecoveryExecution } | undefined;
  const lines = readline.createInterface({ input: host.stdout });
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    if (message.commit) heads = message.commit;
    if (message.ready) { ready = message; groups.push(message.adapterPid.pid); }
  });
  host.stdin.write(JSON.stringify({ root, keyHex: keyFor(root).toString("hex"), scenario }) + "\n");
  try { await until(() => !!ready || host.exitCode !== null); }
  finally { host.kill("SIGKILL"); await exited; lines.close(); }
  if (!ready || !heads) throw new Error(`survivor host failed: ${stderr}`);
  const ws = path.join(root, ".dvl", "tx", ready.run.runId, "attempt-1");
  await until(() => fs.existsSync(path.join(ws, "late.txt")));
  const first = fs.statSync(path.join(ws, "late.txt")).size;
  await until(() => fs.statSync(path.join(ws, "late.txt")).size > first);
  return { root, ws, run: ready.run, execution: ready.adapterPid, heads };
}

describe.skipIf(process.platform === "win32")("C29 B3 surviving recovery executor", () => {
  it("kills the detached survivor and its late-writing descendant before a reconciled retry", async () => {
    const f = await crashWithSurvivor();
    expect(recoveryProcessOps.canMutate(f.execution.pid!)).toBe(true);
    const r = track(kernelOn(f.root, { expectedHeads: f.heads, quiescenceMs: 100 }));
    expect(r.recoveryStatus).toMatchObject({ status: "RECOVERY_PENDING", retryAllowed: false });
    r.start();
    r.reconcileActionOutcome(f.run.runId, "act_survivor", "CONFIRMED_NOT_DONE");
    expect(r.recoveryStatus.retryAllowed).toBe(false);
    await r.describe();
    const retry = await r.retryRun(f.run.runId, task);
    expect(retry.attempt).toBe(2);
    expect(recoveryProcessOps.canMutate(f.execution.pid!)).toBe(false);
    const size = fs.statSync(path.join(f.ws, "late.txt")).size;
    await new Promise((r) => setTimeout(r, 150));
    expect(fs.statSync(path.join(f.ws, "late.txt")).size).toBe(size);
    const events = r.store.all();
    const fence = events.findIndex((e) => e.type === "kernel.recovery_process_fenced");
    expect(events.findIndex((e) => e.type === "kernel.adapter_authority_revoked")).toBeLessThan(fence);
    expect(fence).toBeLessThan(events.findIndex((e) => e.type === "kernel.attempt_created"));
    expect(await r.waitForRunEnd(f.run.runId)).toBe("finished");
  });

  it("kill failure preserves HOLD even after reconciliation; the old writer continues, with no retry mutation", async () => {
    const f = await crashWithSurvivor();
    const ops: RecoveryProcessOps = { ...recoveryProcessOps, killGroup() { throw Object.assign(new Error("kill denied"), { code: "EPERM" }); } };
    const r = track(kernelOn(f.root, { expectedHeads: f.heads, recoveryProcessOps: ops }));
    r.start();
    await r.describe();
    r.reconcileActionOutcome(f.run.runId, "act_survivor", "CONFIRMED_NOT_DONE");
    await expect(r.waitForRecovery()).rejects.toThrow("HOLD_RECOVERY_PROCESS_STILL_ALIVE");
    const before = r.store.all().length;
    await expect(r.retryRun(f.run.runId, task)).rejects.toThrow("retryAllowed=false");
    await expect(r.startRun(task)).rejects.toThrow("retryAllowed=false");
    expect(r.store.all()).toHaveLength(before);
    expect(r.store.ofType("kernel.attempt_created")).toHaveLength(0);
    expect(r.store.ofType("kernel.workspace_archived")).toHaveLength(0);
    expect(r.recoveryStatus).toMatchObject({ status: "HOLD_RECOVERY_PROCESS_STILL_ALIVE", retryAllowed: false });
    const size = fs.statSync(path.join(f.ws, "late.txt")).size;
    await until(() => fs.statSync(path.join(f.ws, "late.txt")).size > size);
    // HOLD is recomputed on restart; durable reconciliation never bypasses the process check.
    await r.shutdown();
    const r2 = track(kernelOn(f.root, { expectedHeads: anchorsFor(f.root), recoveryProcessOps: ops }));
    r2.start();
    await r2.describe();
    await expect(r2.retryRun(f.run.runId, task)).rejects.toThrow("HOLD_RECOVERY_PROCESS_STILL_ALIVE");
  });

  it("a dead leader with surviving writer is held when its group incarnation cannot be proven", async () => {
    const f = await crashWithSurvivor("leader-exits");
    await until(() => recoveryProcessOps.birth(f.execution.pid!) === null);
    expect(recoveryProcessOps.canMutate(f.execution.pid!)).toBe(true);
    const r = track(kernelOn(f.root, { expectedHeads: f.heads }));
    r.start();
    r.reconcileActionOutcome(f.run.runId, "act_survivor", "CONFIRMED_NOT_DONE");
    await r.describe();
    await expect(r.retryRun(f.run.runId, task)).rejects.toThrow("HOLD_RECOVERY_PROCESS_STILL_ALIVE");
    expect(r.store.ofType("kernel.attempt_created")).toHaveLength(0);
  });

  it("a late same-size write restarts the quiescence window before recovery is released", async () => {
    const root = tempRoot("c29-quiescence");
    const k = track(kernelOn(root));
    k.start();
    await k.describe();
    const id = await k.startRun({ ...task, scenario: "h4-action-started-hold" });
    await waitForEvent(k, (e) => e.type === "action.started");
    const file = path.join(k.txWorkspaceOf(id.runId), "late.txt");
    fs.writeFileSync(file, "AAAA");
    const time = fs.statSync(file).mtime;
    await k.shutdown();
    let scheduled = false;
    const ops: RecoveryProcessOps = { ...recoveryProcessOps, canMutate(group) {
      const alive = recoveryProcessOps.canMutate(group);
      if (!alive && !scheduled) {
        scheduled = true;
        setTimeout(() => { fs.writeFileSync(file, "BBBB"); fs.utimesSync(file, time, time); }, 20);
      }
      return alive;
    } };
    const r = track(kernelOn(root, { expectedHeads: anchorsFor(root), recoveryProcessOps: ops, quiescenceMs: 100 }));
    r.start();
    const proof = r.waitForRecovery();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(fs.readFileSync(file, "utf8")).toBe("BBBB");
    expect(r.recoveryStatus.retryAllowed).toBe(false);
    expect(r.store.ofType("kernel.recovery_process_fenced")).toHaveLength(0);
    await proof;
    r.reconcileActionOutcome(id.runId, "act_h4_probe", "CONFIRMED_NOT_DONE");
    await r.describe();
    expect((await r.retryRun(id.runId, task)).attempt).toBe(2);
  });
});

describe("C29 platform/OS failure boundaries", () => {
  const execution = { adapterInstanceId: "old", pid: 12345, processGroupId: 12345, processBirth: "incarnation" };
  it.each(["linux", "darwin"] as const)("%s waits for group exit after kill returns", async (platform) => {
    let checks = 0;
    let killed = false;
    const ops: RecoveryProcessOps = { platform, birth: () => "incarnation", killGroup() { killed = true; },
      canMutate() { return !killed || ++checks < 3; } };
    await stopRecoveredExecution(execution, ops, 1000);
    expect(checks).toBe(3); // exercises exit polling; syscall success alone did not pass
  });
  it("a successful signal with a still-live group times out instead of permitting replay", async () => {
    const ops: RecoveryProcessOps = { platform: "linux", birth: () => "incarnation", killGroup() {}, canMutate: () => true };
    await expect(stopRecoveredExecution(execution, ops, 20)).rejects.toThrow("did not terminate");
  });
  it("Windows does not treat taskkill/leader exit as a proven process-tree fence", async () => {
    const ops: RecoveryProcessOps = { platform: "win32", birth() { throw new Error("must not inspect Unix pid"); },
      killGroup() { throw new Error("must not send Unix signal"); }, canMutate() { throw new Error("must not infer Windows tree exit"); } };
    await expect(stopRecoveredExecution(execution, ops, 20)).rejects.toThrow("unsupported on win32");
  });
  it.skipIf(process.platform === "win32")("unsupported recovery enters Kernel HOLD despite durable CONFIRMED_NOT_DONE", async () => {
    const root = tempRoot("c29-win-policy");
    const k = track(kernelOn(root));
    k.start();
    await k.describe();
    const id = await k.startRun({ ...task, scenario: "h4-action-started-hold" });
    await waitForEvent(k, (e) => e.type === "action.started");
    await k.shutdown();
    const ops: RecoveryProcessOps = { platform: "win32", birth: () => null, killGroup() { throw new Error("must not signal"); }, canMutate: () => false };
    const r = track(kernelOn(root, { expectedHeads: anchorsFor(root), recoveryProcessOps: ops }));
    r.start();
    await r.describe();
    r.reconcileActionOutcome(id.runId, "act_h4_probe", "CONFIRMED_NOT_DONE");
    await expect(r.retryRun(id.runId, task)).rejects.toThrow("HOLD_RECOVERY_PROCESS_STILL_ALIVE");
    expect(r.recoveryStatus.retryAllowed).toBe(false);
    expect(r.store.ofType("kernel.attempt_created")).toHaveLength(0);
  });
  it("PID reuse and a legacy live group with no incarnation are held without signalling", async () => {
    const ops: RecoveryProcessOps = { platform: "linux", birth: () => "reused", canMutate: () => true,
      killGroup() { throw new Error("must not signal an unrelated incarnation"); } };
    await expect(stopRecoveredExecution(execution, ops, 20)).rejects.toThrow("cannot be matched");
    await expect(stopRecoveredExecution({ ...execution, processBirth: null }, ops, 20)).rejects.toThrow("cannot be matched");
  });
  it("an inaccessible process table preserves uncertainty", async () => {
    const ops: RecoveryProcessOps = { platform: "linux", birth: () => "incarnation", killGroup() {},
      canMutate() { throw new Error("process inspection denied"); } };
    await expect(stopRecoveredExecution(execution, ops, 20)).rejects.toThrow("inspection denied");
  });
});
