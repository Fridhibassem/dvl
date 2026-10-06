/**
 * C14 — Blocker 2: correct identity is necessary but not sufficient.
 *
 * Every adapter event for a bound run must also be a legal transition of the Kernel's
 * authoritative state machines (run, action, actor). Illegal transitions are recorded as
 * admission violations (kind run_binding_violation, reason illegal_transition, with the
 * machine and the from-state) and cause NO state mutation and NO Evidence.
 *
 *   run:    starting --run.started--> running --run.finished--> finished
 *           starting|running --run.failed--> failed;   every other event requires running
 *   action: (none) --requested--> requested --started--> started --updated*--> started
 *           (none) --started--> started;  started --finished--> finished (terminal)
 *   actor:  finished/aborted is terminal: a finished actor can neither act nor finish again
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Kernel } from "../kernel/kernel.js";
import { makeKernel, runScenario, violations } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});
async function run(tag: string, scenario: string) {
  const k = makeKernel(tag);
  kernels.push(k);
  k.start();
  await k.describe();
  const id = await k.startRun({ role: "builder", goal: scenario, acceptanceCriteria: [], scope: [], scenario });
  await new Promise((r) => setTimeout(r, 500));
  await k.settle();
  return { k, id };
}
const illegal = (k: Kernel, machine?: string) =>
  violations(k, "run_binding_violation").filter((v) => v.reason === "illegal_transition" && (!machine || v.machine === machine));
const evidenceFor = (k: Kernel, actionId: string) => k.store.readEvidenceFromDisk().filter((e) => e.relatedActionId === actionId);

describe("C14 authoritative lifecycle FSM (blocker 2)", () => {
  it("action.finished without action.started: rejected, no Evidence", async () => {
    const { k, id } = await run("c14-fbs", "finish-before-start");
    expect(k.runStatus(id.runId)).toBe("finished");
    expect(illegal(k, "action")).toEqual([expect.objectContaining({ type: "action.finished", actionId: "act_x", from: "none" })]);
    expect(evidenceFor(k, "act_x")).toEqual([]);
    expect(k.store.ofType("kernel.evidence_recorded")).toHaveLength(0);
  });

  it("duplicate action.finished: exactly one Evidence; the second is rejected", async () => {
    const { k } = await run("c14-dup", "duplicate-finish");
    expect(evidenceFor(k, "act_dup")).toHaveLength(1);
    expect(illegal(k, "action")).toEqual([expect.objectContaining({ type: "action.finished", actionId: "act_dup", from: "finished" })]);
  });

  it("action.updated before action.started is rejected; the later legal path still works", async () => {
    const { k } = await run("c14-ubs", "update-before-start");
    expect(illegal(k, "action")).toEqual([expect.objectContaining({ type: "action.updated", actionId: "act_u", from: "none" })]);
    expect(evidenceFor(k, "act_u")).toHaveLength(1);
  });

  it("run.finished (and actions) before run.started: rejected; run never becomes running or finished", async () => {
    const { k, id } = await run("c14-early", "early-finish");
    expect(k.runStatus(id.runId)).toBe("starting");
    const rej = illegal(k, "run");
    expect(rej.map((v) => v.type)).toEqual(["action.started", "action.finished", "run.finished"]);
    expect(rej.every((v) => v.from === "starting")).toBe(true);
    expect(k.store.ofType("kernel.run_finished")).toHaveLength(0);
    expect(k.store.readEvidenceFromDisk()).toEqual([]);
    expect(k.noWriterReasons(id.runId).some((r) => r.startsWith("active actions"))).toBe(false); // no state mutation
  });

  it("a finished actor cannot act or finish again", async () => {
    const { k, id } = await run("c14-actor", "actor-after-finish");
    expect(k.runStatus(id.runId)).toBe("finished");
    const rej = illegal(k, "actor");
    expect(rej.map((v) => v.type)).toEqual(["action.requested", "action.started", "action.finished", "actor.finished"]);
    expect(rej.every((v) => v.actorId === "actor_w" && v.from === "finished")).toBe(true);
    expect(evidenceFor(k, "act_zombie")).toEqual([]);
  });

  it("an actor cannot advance another actor's action", async () => {
    const { k } = await run("c14-steal", "steal-action");
    expect(illegal(k, "action")).toEqual([expect.objectContaining({ type: "action.finished", actionId: "act_s", actorId: "actor_w2", from: "owned_by:actor_w1" })]);
    const ev = evidenceFor(k, "act_s");
    expect(ev).toHaveLength(1);
    expect(ev[0]!.payloadSummary).toBe("real"); // only the owning actor's completion counts
  });

  it("legal normal path: no illegal transitions, evidence as before", async () => {
    const k = makeKernel("c14-legal");
    kernels.push(k);
    const { status } = await runScenario(k, "happy");
    expect(status).toBe("finished");
    expect(violations(k, "run_binding_violation")).toEqual([]);
    expect(k.store.readEvidenceFromDisk().map((e) => e.relatedActionId)).toEqual(["act_t1"]); // file_write actions carry no evidence type
  });

  it("every rejected transition is stored as a violation and mutates nothing (all scenarios)", async () => {
    for (const scenario of ["finish-before-start", "duplicate-finish", "update-before-start", "early-finish", "actor-after-finish", "steal-action"]) {
      const { k } = await run(`c14-all-${scenario}`, scenario);
      const rejectedSeqs = new Set(illegal(k).map((v) => v.adapterSequence));
      const stored = k.store.all().filter((e) => e.origin === "adapter" && rejectedSeqs.has(e.adapterSequence));
      expect(stored.length).toBe(rejectedSeqs.size);
      expect(stored.every((e) => e.trust === "protocol_violation")).toBe(true);
      const ev = k.store.ofType("kernel.evidence_recorded").map((e) => (e.payload as { evidenceId: string }).evidenceId);
      const sources = k.store.readEvidenceFromDisk().filter((e) => ev.includes(e.evidenceId)).map((e) => e.causality.sourceEventId);
      expect(stored.some((e) => sources.includes(e.eventId))).toBe(false);
    }
  });
});
