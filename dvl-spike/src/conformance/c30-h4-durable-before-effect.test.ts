/**
 * C30 — H4 / B4: no external effect without a durable DVL action record.
 *
 * Invariant: a state-mutating / external effect becomes executable only after
 * kernel.action_prepared (action identity, authority, intent) is durable. A crash at any
 * boundary therefore leaves either no possible effect, or a record that replay rebuilds as
 * UNKNOWN, so retry is never blind.
 *
 * The external system is a disposable append-only ledger outside the project root (see
 * mock-provider/external-ledger.ts). The Kernel under test runs in its own process and is
 * SIGKILLed at each boundary.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Kernel } from "../kernel/kernel.js";
import { effective, ledgerBroker, ledgerLines } from "../mock-provider/external-ledger.js";
import { crashKernelHost, kernelOn, makeKernel, runScenario, tempRoot, violations } from "./harness.js";

const task = (scenario: string) => ({ role: "builder", goal: scenario, acceptanceCriteria: ["mock"], scope: ["tests/**"], scenario });
let kernels: Kernel[] = [];
const pids = new Set<number>();
const track = (k: Kernel) => (kernels.push(k), k);
afterEach(async () => {
  for (const pid of pids) for (const t of [-pid, pid]) try { process.kill(t, "SIGKILL"); } catch { /* gone */ }
  pids.clear();
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});
const until = async (pred: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
};

/** A fresh project root + external ledger + capability key (the key lives in memory only). */
function world(tag: string) {
  const root = tempRoot(`c30-${tag}`);
  const ledger = tempRoot(`c30-${tag}-ledger`);
  const key = crypto.randomBytes(32);
  return {
    root,
    ledger,
    key,
    adapterEnv: { DVL_MOCK_LEDGER: ledger },
    hostEffects: (extra: Record<string, unknown> = {}) => ({ ledgerDir: ledger, capKeyHex: key.toString("hex"), ...extra }),
    broker: () => ledgerBroker(ledger, key),
    /** Payments that actually took effect at the external system. */
    paid: () => effective(ledger, key).length,
  };
}
const prepRecords = (k: Kernel, runId: string, type = "kernel.action_prepared") => k.store.ofType(type).filter((e) => e.runId === runId);
const decisions = (k: Kernel, runId: string) => prepRecords(k, runId, "kernel.action_prepare_refused").map((e) => (e.payload as { decision: string }).decision);

describe("C30 H4/B4 durable-before-effect", () => {
  it("0. residual (ungated path): an effect performed without the protocol leaves no action record; crash + retry performs it twice, unless the resource demands a capability", async () => {
    const root = tempRoot("c30-repro");
    const ledger = tempRoot("c30-ledger");
    const adapterEnv = { DVL_MOCK_LEDGER: ledger };
    const { runId, heads } = await crashKernelHost(
      root,
      { scenario: "b4-effect-at-dispatch", adapterEnv, ready: { kind: "ledger", ledgerDir: ledger, actionId: "act_pay" } },
      { registerPid: (p) => pids.add(p) },
    );
    const k = track(kernelOn(root, { expectedHeads: heads, adapterEnv }));
    k.start();
    await k.describe();
    expect(k.runStatus(runId)).toBe("interrupted");
    expect(k.store.ofType("kernel.action_outcome_unknown")).toHaveLength(0); // nothing to be unsure about, as far as replay knows
    expect((await k.retryRun(runId, task("b4-effect-at-dispatch"))).attempt).toBe(2); // not held
    expect(await until(() => ledgerLines(ledger).length === 2)).toBe(true);
    expect(effective(ledger)).toHaveLength(2); // a resource that accepts anything: one intended payment, made twice
    expect(effective(ledger, crypto.randomBytes(32))).toHaveLength(0); // a capability-gated resource: neither took effect
  });

  it("1. crash before PREPARED is durable: the executor could not perform the effect; retry performs it exactly once", async () => {
    const w = world("b1");
    const { runId, heads } = await crashKernelHost(
      w.root,
      { scenario: "b4-eager-then-prepare", adapterEnv: w.adapterEnv, effects: w.hostEffects(), gate: "action.prepare", ready: { kind: "gated", type: "action.prepare" } },
      { registerPid: (p) => pids.add(p) },
    );
    expect(ledgerLines(w.ledger)).toHaveLength(1); // it tried, without a capability...
    expect(w.paid()).toBe(0); // ...and nothing took effect
    const k = track(kernelOn(w.root, { expectedHeads: heads, adapterEnv: w.adapterEnv, effects: w.broker() }));
    expect(prepRecords(k, runId)).toHaveLength(0); // no capability was ever issued
    k.start();
    await k.describe();
    expect(k.store.ofType("kernel.action_outcome_unknown")).toHaveLength(0); // and so nothing is ambiguous
    expect((await k.retryRun(runId, task("b4-pay"))).attempt).toBe(2);
    expect(await k.waitForRunEnd(runId)).toBe("finished");
    expect(w.paid()).toBe(1);
  });

  it("2. crash after PREPARED, before the effect: replay rebuilds UNKNOWN; no retry until inspection proves NOT_DONE (after fencing)", async () => {
    const w = world("b2");
    const { runId, heads } = await crashKernelHost(
      w.root,
      { scenario: "b4-prepared-hold", adapterEnv: w.adapterEnv, effects: w.hostEffects(), ready: { kind: "event", type: "kernel.action_prepared", actionId: "act_pay" } },
      { registerPid: (p) => pids.add(p) },
    );
    expect(w.paid()).toBe(0);
    const k = track(kernelOn(w.root, { expectedHeads: heads, adapterEnv: w.adapterEnv, effects: w.broker() }));
    expect(prepRecords(k, runId)[0]!.payload).toMatchObject({
      actionId: "act_pay",
      attempt: 1,
      kind: "ledger.append",
      target: "acct_42",
      external: true,
      executor: "provider",
      effectId: `${runId}:1:act_pay`,
      signature: expect.stringMatching(/^sig:/),
      taskId: expect.any(String),
      workerId: expect.any(String),
      workspaceId: expect.any(String),
      adapterInstanceId: expect.any(String),
    });
    k.start();
    await k.describe();
    expect(k.store.ofType("kernel.action_outcome_unknown").map((e) => (e.payload as { actionId: string }).actionId)).toEqual(["act_pay"]);
    await expect(k.retryRun(runId, task("b4-pay"))).rejects.toThrow(/unresolved action outcome.*act_pay/);
    await expect(k.inspectActionOutcome(runId, "act_pay")).rejects.toThrow(/HOLD_RECOVERY_PROCESS_STILL_ALIVE.*fenced first/);
    expect(await k.fenceRecoveredAttempt(runId)).toMatchObject({ state: "FENCED" });
    expect(await k.inspectActionOutcome(runId, "act_pay")).toBe("NOT_DONE");
    expect(k.store.ofType("kernel.action_outcome_reconciled")[0]!.payload).toMatchObject({ actionId: "act_pay", resolution: "CONFIRMED_NOT_DONE", basis: "inspection" });
    expect((await k.retryRun(runId, task("b4-pay"))).attempt).toBe(2);
    expect(await k.waitForRunEnd(runId)).toBe("finished");
    expect(w.paid()).toBe(1);
  });

  it("3. crash after the effect, before any STARTED/FINISHED: replay rebuilds UNKNOWN; inspection proves DONE; retry does not repeat it", async () => {
    const w = world("b3");
    const { runId, heads } = await crashKernelHost(
      w.root,
      { scenario: "b4-effect-hold", adapterEnv: w.adapterEnv, effects: w.hostEffects(), ready: { kind: "ledger", ledgerDir: w.ledger, actionId: "act_pay" } },
      { registerPid: (p) => pids.add(p) },
    );
    expect(w.paid()).toBe(1);
    const k = track(kernelOn(w.root, { expectedHeads: heads, adapterEnv: w.adapterEnv, effects: w.broker() }));
    expect(k.store.all().some((e) => e.runId === runId && (e.type === "action.started" || e.type === "action.finished"))).toBe(false);
    k.start();
    await k.describe();
    expect(k.store.ofType("kernel.action_outcome_unknown")).toHaveLength(1);
    await expect(k.retryRun(runId, task("b4-pay"))).rejects.toThrow(/unresolved action outcome.*act_pay/);
    expect(await k.inspectActionOutcome(runId, "act_pay")).toBe("DONE"); // no fence needed to accept "done"
    expect((await k.retryRun(runId, task("b4-pay"))).attempt).toBe(2);
    expect(await k.waitForRunEnd(runId)).toBe("finished");
    expect(decisions(k, runId)).toEqual(["already_done"]);
    expect(w.paid()).toBe(1);
  });

  it("4. crash after the outcome is durable: normal confirmed recovery, retry does not repeat it", async () => {
    const w = world("b4");
    const { runId, heads } = await crashKernelHost(
      w.root,
      { scenario: "b4-finished-hold", adapterEnv: w.adapterEnv, effects: w.hostEffects(), ready: { kind: "event", type: "action.finished", actionId: "act_pay" } },
      { registerPid: (p) => pids.add(p) },
    );
    const k = track(kernelOn(w.root, { expectedHeads: heads, adapterEnv: w.adapterEnv, effects: w.broker() }));
    k.start();
    await k.describe();
    expect(k.store.ofType("kernel.action_outcome_unknown")).toHaveLength(0);
    expect((await k.retryRun(runId, task("b4-pay"))).attempt).toBe(2);
    expect(await k.waitForRunEnd(runId)).toBe("finished");
    expect(decisions(k, runId)).toEqual(["already_done"]);
    expect(w.paid()).toBe(1);
  });

  it("5a. old executor survives holding the capability: revocation voids its late use, and NOT_DONE still waits for the fence", async () => {
    const w = world("b5a");
    const go = path.join(w.ledger, "go");
    const { runId, heads } = await crashKernelHost(
      w.root,
      { scenario: "b4-survivor", adapterEnv: w.adapterEnv, effects: w.hostEffects(), ready: { kind: "file", path: go + ".pid" } },
      { registerPid: (p) => pids.add(p) },
    );
    const survivor = Number(fs.readFileSync(go + ".pid", "utf8"));
    pids.add(survivor);
    const k = track(kernelOn(w.root, { expectedHeads: heads, adapterEnv: w.adapterEnv, effects: w.broker() }));
    k.start();
    await k.describe();
    await expect(k.inspectActionOutcome(runId, "act_pay")).rejects.toThrow(/fenced first/); // revoked at the resource; not yet recordable
    fs.writeFileSync(go, ""); // the survivor now uses its (revoked) capability
    expect(await until(() => fs.existsSync(go + ".done"))).toBe(true);
    expect(ledgerLines(w.ledger).filter((l) => l.t === "entry")).toHaveLength(1); // it wrote...
    expect(w.paid()).toBe(0); // ...but after revocation: no effect
    expect(await k.fenceRecoveredAttempt(runId)).toMatchObject({ state: "FENCED" });
    expect(await k.inspectActionOutcome(runId, "act_pay")).toBe("NOT_DONE");
    expect((await k.retryRun(runId, task("b4-pay"))).attempt).toBe(2);
    expect(await k.waitForRunEnd(runId)).toBe("finished");
    expect(w.paid()).toBe(1);
  });

  it("5b. old executor survives: B3 fencing kills it before it can act, then recovery proceeds", async () => {
    const w = world("b5b");
    const go = path.join(w.ledger, "go");
    const { runId, heads } = await crashKernelHost(
      w.root,
      { scenario: "b4-survivor", adapterEnv: w.adapterEnv, effects: w.hostEffects(), ready: { kind: "file", path: go + ".pid" } },
      { registerPid: (p) => pids.add(p) },
    );
    const survivor = Number(fs.readFileSync(go + ".pid", "utf8"));
    pids.add(survivor);
    const k = track(kernelOn(w.root, { expectedHeads: heads, adapterEnv: w.adapterEnv, effects: w.broker() }));
    k.start();
    await k.describe();
    expect(await k.fenceRecoveredAttempt(runId)).toMatchObject({ state: "FENCED" });
    expect((k.store.ofType("kernel.recovery_fenced")[0]!.payload as { killed: number[] }).killed).toContain(survivor);
    fs.writeFileSync(go, "");
    await new Promise((r) => setTimeout(r, 300));
    expect(fs.existsSync(go + ".done")).toBe(false); // it never acted
    expect(await k.inspectActionOutcome(runId, "act_pay")).toBe("NOT_DONE");
    expect((await k.retryRun(runId, task("b4-pay"))).attempt).toBe(2);
    expect(await k.waitForRunEnd(runId)).toBe("finished");
    expect(w.paid()).toBe(1);
  });

  it("6. Kernel-owned execution: exactly one executor; native and duplicate provider attempts take no effect", async () => {
    const w = world("b6");
    const k = track(makeKernel("c30-b6", { adapterEnv: w.adapterEnv, effects: w.broker() }));
    const { id, status } = await runScenario(k, "b4-kernel-owned");
    expect(status).toBe("finished");
    expect(prepRecords(k, id.runId, "kernel.action_executed").map((e) => (e.payload as { actionId: string }).actionId)).toEqual(["act_pay"]);
    expect(decisions(k, id.runId)).toEqual(["duplicate_signature"]); // the provider-mode copy of the same effect
    expect(violations(k, "run_binding_violation").some((v) => v.from === "kernel_owned" && v.type === "action.finished")).toBe(true);
    expect(effective(w.ledger, w.key).map((l) => l.actionId)).toEqual([`${id.runId}:1:act_pay`]); // the Kernel's, once
    expect(ledgerLines(w.ledger).filter((l) => l.t === "entry")).toHaveLength(2); // + the void native attempt
  });

  it("7. Kernel dies during Kernel-owned execution, after the effect: UNKNOWN → inspected DONE → retry does not execute again", async () => {
    const w = world("b7");
    const { runId, heads } = await crashKernelHost(
      w.root,
      { scenario: "b4-kernel-pay", adapterEnv: w.adapterEnv, effects: w.hostEffects({ hangAfterEffect: true }), ready: { kind: "ledger", ledgerDir: w.ledger, actionId: "act_pay" } },
      { registerPid: (p) => pids.add(p) },
    );
    expect(w.paid()).toBe(1);
    const k = track(kernelOn(w.root, { expectedHeads: heads, adapterEnv: w.adapterEnv, effects: w.broker() }));
    expect(k.store.ofType("kernel.action_execution_started")).toHaveLength(1);
    expect(k.store.ofType("kernel.action_executed")).toHaveLength(0);
    k.start();
    await k.describe();
    expect(k.store.ofType("kernel.action_outcome_unknown")).toHaveLength(1);
    expect(await k.inspectActionOutcome(runId, "act_pay")).toBe("DONE");
    expect((await k.retryRun(runId, task("b4-kernel-pay"))).attempt).toBe(2);
    expect(await k.waitForRunEnd(runId)).toBe("finished");
    expect(decisions(k, runId)).toEqual(["already_done"]);
    expect(k.store.ofType("kernel.action_executed")).toHaveLength(0);
    expect(w.paid()).toBe(1);
  });

  it("8. no effect broker configured: no capability is ever issued (fail closed)", async () => {
    const w = world("b8");
    const k = track(makeKernel("c30-b8", { adapterEnv: w.adapterEnv }));
    const { id } = await runScenario(k, "b4-pay");
    expect(decisions(k, id.runId)).toEqual(["refused_no_broker"]);
    expect(prepRecords(k, id.runId)).toHaveLength(0);
    expect(ledgerLines(w.ledger)).toHaveLength(0);
  });
});
