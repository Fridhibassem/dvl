/**
 * C10 — Blocker A: run/attempt ownership and lifecycle fence.
 *
 * Invariant: a state-changing adapter event is admissible only when its
 * (adapterInstanceId, runId, attempt) equals the Kernel-authorized execution binding of a
 * non-terminal run AND the lifecycle transition is legal. A provider can never revive a
 * terminal attempt by emitting events; a replacement adapter continues a run only through
 * a Kernel-created attempt (`retryRun`).
 *
 * The mock is driven over real NDJSON/stdio. DVL_MOCK_EMIT_RUN_ID / DVL_MOCK_EMIT_ATTEMPT
 * make it emit under a runId/attempt other than the one the Kernel assigned.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Kernel } from "../kernel/kernel.js";
import type { StoredEvent } from "../kernel/types.js";
import { makeKernel, runScenario, violations, waitForEvent } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});

const task = (scenario: string) => ({ role: "builder", goal: scenario, acceptanceCriteria: ["mock"], scope: ["src/**"], scenario });
const bindingViolations = (k: Kernel, reason?: string) => violations(k, "run_binding_violation").filter((v) => !reason || v.reason === reason);
const adapterEventsFor = (k: Kernel, aid: string, runId: string) => k.store.all().filter((e) => e.origin === "adapter" && e.adapterInstanceId === aid && e.runId === runId && e.adapterSequence !== undefined);
/** Kernel state changes attributable to applying adapter events for this run. */
const appliedEffects = (k: Kernel, runId: string, after = 0) =>
  k.store
    .all()
    .filter((e: StoredEvent) => e.kernelSequence > after && e.origin === "kernel" && e.runId === runId)
    .filter((e) => /evidence_recorded|artifact_imported|artifact_rejected|run_finished|actor_undeclared|actor_fork_race|actor_finish_pending/.test(e.type));

/** Run `scenario` on a crashing instance A, then start fresh instance B with env overrides. */
async function terminalThenFresh(tag: string, emit: { runId?: (r: string) => string; attempt?: string }) {
  const env: Record<string, string> = {};
  const k = makeKernel(tag, { adapterEnv: env });
  kernels.push(k);
  const a = await runScenario(k, "crash");
  expect(a.status).toBe("failed");
  await k.waitClosed(5_000);
  const aidA = k.currentAdapterInstanceId!;
  if (emit.runId) env.DVL_MOCK_EMIT_RUN_ID = emit.runId(a.id.runId);
  if (emit.attempt) env.DVL_MOCK_EMIT_ATTEMPT = emit.attempt;
  k.restartAdapter();
  await k.describe();
  return { k, env, oldRun: a.id, aidA, aidB: k.currentAdapterInstanceId! };
}

describe("C10 run/attempt binding fence (blocker A)", () => {
  it("fresh adapter B naming A's terminal run: no revival, no evidence, no actor/action state", async () => {
    const { k, oldRun, aidB } = await terminalThenFresh("c10-revive", { runId: (r) => r });
    const mark = k.store.all().at(-1)!.kernelSequence;
    // Kernel asks B for a NEW run; B emits the full happy script under the OLD run id.
    const r2 = await k.startRun(task("happy"));
    await waitForEvent(
      k,
      (e) => e.origin === "adapter" && e.adapterInstanceId === aidB && e.runId === oldRun.runId && e.type === "run.finished",
    );
    await k.settle();

    expect(k.runStatus(oldRun.runId)).toBe("failed"); // never revived
    const forged = adapterEventsFor(k, aidB, oldRun.runId);
    expect(forged.length).toBeGreaterThanOrEqual(10); // run.started, actor.*, action.*, run.finished…
    expect(forged.every((e) => e.trust === "protocol_violation")).toBe(true);
    expect(forged.map((e) => e.type)).toEqual(expect.arrayContaining(["run.started", "action.started", "action.finished", "actor.finished", "run.finished"]));
    expect(bindingViolations(k, "run_owned_by_other_instance")).toHaveLength(forged.length);
    expect(appliedEffects(k, oldRun.runId, mark)).toEqual([]);
    expect(k.store.readEvidenceFromDisk()).toEqual([]);
    expect(k.noWriterReasons(oldRun.runId).some((r) => r.startsWith("active actions"))).toBe(false);
    expect(k.runStatus(r2.runId)).toBe("starting"); // B never spoke for the run it was given
  });

  it("correct fresh adapter, correct run, wrong attempt: rejected and run does not progress", async () => {
    const env: Record<string, string> = { DVL_MOCK_EMIT_ATTEMPT: "2" };
    const k = makeKernel("c10-attempt", { adapterEnv: env });
    kernels.push(k);
    k.start();
    await k.describe();
    const r = await k.startRun(task("happy")); // Kernel binds attempt 1
    await waitForEvent(
      k,
      (e) => e.origin === "adapter" && e.adapterInstanceId === k.currentAdapterInstanceId && e.runId === r.runId && e.type === "run.finished",
    );
    await k.settle();
    expect(k.runStatus(r.runId)).toBe("starting");
    const evs = adapterEventsFor(k, k.currentAdapterInstanceId!, r.runId);
    expect(evs.length).toBeGreaterThanOrEqual(10);
    expect(evs.every((e) => e.trust === "protocol_violation" && e.attempt === 2)).toBe(true);
    expect(bindingViolations(k, "attempt_mismatch")).toHaveLength(evs.length);
    expect(bindingViolations(k, "attempt_mismatch")[0]).toMatchObject({ runId: r.runId, attempt: 2, boundAttempt: 1 });
    expect(appliedEffects(k, r.runId)).toEqual([]);
    expect(k.store.readEvidenceFromDisk()).toEqual([]);
  });

  it("same instance after its own terminal run: run.started/actor/action/run.failed all rejected", async () => {
    const k = makeKernel("c10-terminal");
    kernels.push(k);
    k.start();
    await k.describe();
    const r = await k.startRun(task("post-terminal"));
    expect(await k.waitForRunEnd(r.runId)).toBe("finished");
    const finishedAt = k.store.ofType("kernel.run_finished")[0]!.kernelSequence;
    await waitForEvent(
      k,
      (e) => e.origin === "adapter" && e.kernelSequence > finishedAt && e.runId === r.runId && e.type === "run.failed",
    );
    await k.settle();

    expect(k.runStatus(r.runId)).toBe("finished"); // not revived to running, not flipped to failed
    const after = k.store.all().filter((e) => e.origin === "adapter" && e.kernelSequence > finishedAt && e.adapterSequence !== undefined);
    expect(after.map((e) => e.type)).toEqual(["run.started", "actor.started", "action.requested", "action.started", "action.finished", "run.failed"]);
    expect(after.every((e) => e.trust === "protocol_violation")).toBe(true);
    expect(bindingViolations(k, "run_terminal")).toHaveLength(after.length);
    expect(k.store.readEvidenceFromDisk().filter((e) => e.relatedActionId === "act_ghost")).toEqual([]);
    expect(k.actorsOf(r.runId).get("actor_ghost")).toBeUndefined();
    expect(k.store.ofType("kernel.run_failed")).toHaveLength(0);
  });

  it("a second run.started on a live run is an illegal transition, not a lifecycle reset", async () => {
    const k = makeKernel("c10-double-start");
    kernels.push(k);
    const { status, id } = await runScenario(k, "double-start");
    expect(status).toBe("finished");
    const illegal = bindingViolations(k, "illegal_transition");
    expect(illegal).toHaveLength(1);
    expect(illegal[0]).toMatchObject({ type: "run.started", runId: id.runId, status: "running" });
    // The root actor binding was not replaced by the second run.started's actor.
    const rejected = k.store.all().filter((e) => e.type === "run.started" && e.trust === "protocol_violation");
    expect(rejected.map((e) => e.actorId)).toEqual(["actor_w"]);
  });

  it("legal continuation: Kernel-created attempt 2 rebinds the run to the fresh instance", async () => {
    const env: Record<string, string> = {};
    const k = makeKernel("c10-retry", { adapterEnv: env });
    kernels.push(k);
    const a = await runScenario(k, "worker-start-crash");
    await k.waitClosed(5_000);
    const aidA = k.currentAdapterInstanceId!;
    k.restartAdapter();
    await k.describe();
    const aidB = k.currentAdapterInstanceId!;

    const id2 = await k.retryRun(a.id.runId, task("happy"));
    expect(id2).toMatchObject({ runId: a.id.runId, attempt: 2, taskId: a.id.taskId });
    expect(id2.workspaceId).not.toBe(a.id.workspaceId); // blocker 3: every attempt owns a fresh workspace
    expect(await k.waitForRunEnd(a.id.runId)).toBe("finished");
    await k.settle();
    const created = k.store.ofType("kernel.attempt_created")[0]!.payload as Record<string, unknown>;
    expect(created).toMatchObject({ runId: a.id.runId, attempt: 2, previousAttempt: 1, previousStatus: "failed", adapterInstanceId: aidB, previousAdapterInstanceId: aidA });
    expect(bindingViolations(k)).toHaveLength(0);
    const ev = k.store.readEvidenceFromDisk().find((e) => e.runId === a.id.runId)!;
    expect(ev.attempt).toBe(2);
    // Attempt 1's terminal record is untouched history.
    const failed = k.store.ofType("kernel.run_failed").map((e) => e.attempt);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((at) => at === 1)).toBe(true); // nothing recorded against attempt 2
    // Retrying a non-terminal run is refused.
    await expect(k.retryRun(a.id.runId, task("happy"))).resolves.toBeDefined(); // finished ⇒ terminal ⇒ allowed
    await expect(k.retryRun("run_doesnotexist", task("happy"))).rejects.toThrow(/unknown run/);
  });

  it("after a Kernel-created attempt 2, the fresh instance still cannot write into attempt 1", async () => {
    const env: Record<string, string> = {};
    const k = makeKernel("c10-retry-old-attempt", { adapterEnv: env });
    kernels.push(k);
    const a = await runScenario(k, "worker-start-crash");
    await k.waitClosed(5_000);
    env.DVL_MOCK_EMIT_ATTEMPT = "1";
    k.restartAdapter();
    await k.describe();
    await k.retryRun(a.id.runId, task("happy"));
    await waitForEvent(
      k,
      (e) => e.origin === "adapter" && e.adapterInstanceId === k.currentAdapterInstanceId && e.runId === a.id.runId && e.type === "run.finished",
    );
    await k.settle();
    expect(k.runStatus(a.id.runId)).toBe("starting"); // attempt 2 bound, nothing legitimate arrived
    const evs = adapterEventsFor(k, k.currentAdapterInstanceId!, a.id.runId);
    expect(evs.every((e) => e.trust === "protocol_violation" && e.attempt === 1)).toBe(true);
    expect(bindingViolations(k, "attempt_mismatch")).toHaveLength(evs.length);
    expect(k.store.readEvidenceFromDisk()).toEqual([]);
  });

  it("retryRun refuses a run that is not terminal", async () => {
    const k = makeKernel("c10-retry-live");
    kernels.push(k);
    k.start();
    await k.describe();
    const r = await k.startRun(task("actor-lifecycle")); // stays running ~1s
    await expect(k.retryRun(r.runId, task("happy"))).rejects.toThrow(/not terminal/);
    expect(await k.waitForRunEnd(r.runId)).toBe("finished");
  });
});
