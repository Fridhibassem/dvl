/**
 * C18 — H1 regression: the CURRENT, correctly sequenced adapter cannot affect another run,
 * another attempt, or a terminal run, and reused actorId/actionId values stay isolated.
 *
 * Unlike stale-pipe fencing (C06), every frame here comes from the live, handshaken adapter
 * with a valid adapterSequence/actorSequence (mock adapter.ping injection, see
 * harness.injectFrames). Runs are created with the `idle` scenario so that all lifecycle
 * frames are exactly the injected ones.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Kernel, KernelOptions } from "../kernel/kernel.js";
import { frame, injectFrames, makeKernel, violations } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});

const idle = { role: "builder", goal: "h1", acceptanceCriteria: [], scope: [], scenario: "idle" };
async function bootKernel(tag: string, extra: Partial<KernelOptions> = {}) {
  const k = makeKernel(tag, extra);
  kernels.push(k);
  k.start();
  await k.describe();
  return k;
}
const mark = (k: Kernel) => k.store.all().at(-1)?.kernelSequence ?? 0;
/** Adapter event frames stored after `since`: [type, accepted?]. */
const outcome = (k: Kernel, since: number) =>
  k.store
    .all()
    .filter((e) => e.kernelSequence > since && e.origin === "adapter" && e.adapterSequence !== undefined)
    .map((e) => [e.type, e.trust === "untrusted_observation"] as const);
const admissionReasons = (k: Kernel, since: number) =>
  k.store
    .all()
    .filter((e) => e.kernelSequence > since && e.type === "kernel.protocol_violation" && (e.payload as { kind: string }).kind === "run_binding_violation")
    .map((e) => (e.payload as { reason: string }).reason);
const evidenceOf = (k: Kernel, runId: string) => k.store.readEvidenceFromDisk().filter((e) => e.runId === runId);
const activeActions = (k: Kernel, runId: string) => k.noWriterReasons(runId).find((r) => r.startsWith("active actions")) ?? null;
const writersBlocking = (k: Kernel, runId: string) => k.noWriterReasons(runId).filter((r) => !r.startsWith("filesystem not quiescent"));
/** run.started → test action → root finished → run.finished, for (runId, attempt). */
const fullScript = (runId: string, attempt: number, actionId: string) => [
  frame("run.started", runId, attempt, "root"),
  frame("action.started", runId, attempt, "root", { actionId, kind: "test" }),
  frame("action.finished", runId, attempt, "root", { actionId, kind: "test", exitCode: 0, summary: "ok" }),
  frame("actor.finished", runId, attempt, "root"),
  frame("run.finished", runId, attempt, "root"),
];

describe("C18 H1 run/attempt isolation from the current adapter", () => {
  it("1. same actionId in two concurrent runs: one run cannot clear, finish, or create Evidence for the other's action", async () => {
    const k = await bootKernel("c18-actionid");
    const r1 = await k.startRun(idle);
    const r2 = await k.startRun(idle);
    await injectFrames(k, [frame("run.started", r1.runId, 1, "root"), frame("run.started", r2.runId, 1, "root"), frame("action.started", r1.runId, 1, "root", { actionId: "act_same", kind: "test" })]);

    // R2 finishes an actionId that only R1 started.
    let m = mark(k);
    await injectFrames(k, [frame("action.finished", r2.runId, 1, "root", { actionId: "act_same", kind: "test", exitCode: 0, summary: "R2 finishing R1's action" })]);
    expect(outcome(k, m)).toEqual([["action.finished", false]]);
    expect(admissionReasons(k, m)).toEqual(["illegal_transition"]);
    expect(activeActions(k, r1.runId)).toBe("active actions: act_same"); // R1 untouched
    expect(evidenceOf(k, r1.runId)).toEqual([]);
    expect(evidenceOf(k, r2.runId)).toEqual([]);

    // R2's own act_same is independent of R1's.
    m = mark(k);
    await injectFrames(k, [frame("action.started", r2.runId, 1, "root", { actionId: "act_same", kind: "test" }), frame("action.finished", r2.runId, 1, "root", { actionId: "act_same", kind: "test", exitCode: 0, summary: "R2 own" })]);
    expect(outcome(k, m)).toEqual([["action.started", true], ["action.finished", true]]);
    expect(evidenceOf(k, r2.runId).map((e) => e.payloadSummary)).toEqual(["R2 own"]);
    expect(activeActions(k, r1.runId)).toBe("active actions: act_same");
    expect(activeActions(k, r2.runId)).toBeNull();

    // R1 finishes its own action normally.
    await injectFrames(k, [frame("action.finished", r1.runId, 1, "root", { actionId: "act_same", kind: "test", exitCode: 0, summary: "R1 own" })]);
    expect(evidenceOf(k, r1.runId).map((e) => e.payloadSummary)).toEqual(["R1 own"]);
    expect(evidenceOf(k, r2.runId)).toHaveLength(1);
    expect(activeActions(k, r1.runId)).toBeNull();
  });

  it("2. same actorId in two concurrent runs: actor lifecycle and no-writer state stay per run", async () => {
    const k = await bootKernel("c18-actorid-runs");
    const r1 = await k.startRun(idle);
    const r2 = await k.startRun(idle);
    await injectFrames(k, [
      frame("run.started", r1.runId, 1, "root"),
      frame("actor.fork", r1.runId, 1, "root", { childActorIds: ["w"] }),
      frame("actor.started", r1.runId, 1, "w", { parentActorId: "root" }),
      frame("actor.finished", r1.runId, 1, "w"),
      frame("actor.finished", r1.runId, 1, "root"),
    ]);
    expect(k.actorsOf(r1.runId).get("w")?.state).toBe("finished");
    expect(writersBlocking(k, r1.runId)).toEqual([]);

    // R2 reuses "root" and "w"; w stays running with an active action.
    const m = mark(k);
    await injectFrames(k, [
      frame("run.started", r2.runId, 1, "root"),
      frame("actor.fork", r2.runId, 1, "root", { childActorIds: ["w"] }),
      frame("actor.started", r2.runId, 1, "w", { parentActorId: "root" }),
      frame("action.started", r2.runId, 1, "w", { actionId: "act_w", kind: "test" }),
    ]);
    expect(outcome(k, m).every(([, ok]) => ok)).toBe(true);
    expect(violations(k)).toEqual([]);
    expect(k.actorsOf(r2.runId).get("w")?.state).toBe("running");
    // R1 is unaffected: its actors stay finished and nothing blocks its no-writer condition.
    expect(k.actorsOf(r1.runId).get("w")?.state).toBe("finished");
    expect(k.actorsOf(r1.runId).get("root")?.state).toBe("finished");
    expect(writersBlocking(k, r1.runId)).toEqual([]);
    expect(writersBlocking(k, r2.runId).some((r) => r.startsWith("active actions: act_w"))).toBe(true);
  });

  it("3. same actorId after adapter replacement: the previous run's actor state is unchanged", async () => {
    const k = await bootKernel("c18-actorid-instances");
    const r2 = await k.startRun(idle);
    await injectFrames(k, [
      frame("run.started", r2.runId, 1, "root"),
      frame("actor.fork", r2.runId, 1, "root", { childActorIds: ["w"] }),
      frame("actor.started", r2.runId, 1, "w", { parentActorId: "root" }),
      frame("action.started", r2.runId, 1, "w", { actionId: "act_w", kind: "test" }),
    ]);
    await k.shutdown(); // instance A exits with R2's w running
    expect(k.runStatus(r2.runId)).toBe("failed");
    expect(k.actorsOf(r2.runId).get("w")?.state).toBe("aborted");

    k.restartAdapter();
    await k.describe();
    const r3 = await k.startRun(idle);
    const m = mark(k);
    await injectFrames(k, [
      frame("run.started", r3.runId, 1, "root"),
      frame("actor.fork", r3.runId, 1, "root", { childActorIds: ["w"] }),
      frame("actor.started", r3.runId, 1, "w", { parentActorId: "root" }),
      frame("actor.finished", r3.runId, 1, "w"),
      frame("actor.finished", r3.runId, 1, "root"),
      frame("run.finished", r3.runId, 1, "root"),
    ]);
    expect(outcome(k, m).every(([, ok]) => ok)).toBe(true);
    expect(admissionReasons(k, m)).toEqual([]);
    expect(k.runStatus(r3.runId)).toBe("finished");
    expect(k.actorsOf(r3.runId).get("w")?.state).toBe("finished");
    // R2 (previous instance) is exactly as its termination left it.
    expect(k.runStatus(r2.runId)).toBe("failed");
    expect(k.actorsOf(r2.runId).get("w")?.state).toBe("aborted");
    expect(k.actorsOf(r2.runId).get("root")?.state).toBe("aborted");
  });

  it("4. current valid adapter targets a HALTED old run: stays halted, no Evidence, no state change", async () => {
    const LIMIT = 2_000;
    const k = await bootKernel("c18-halted", { limits: { maxDurationMs: LIMIT } });
    const r = await k.startRun(idle);
    await injectFrames(k, [frame("run.started", r.runId, 1, "root")]);
    expect(await k.waitForRunEnd(r.runId, LIMIT + 5_000)).toBe("halted");
    await k.waitClosed(5_000);
    const rootBefore = k.actorsOf(r.runId).get("root")?.state;

    k.restartAdapter();
    await k.describe();
    const m = mark(k);
    await injectFrames(k, fullScript(r.runId, 1, "act_h"));
    expect(outcome(k, m)).toEqual([
      ["run.started", false],
      ["action.started", false],
      ["action.finished", false],
      ["actor.finished", false],
      ["run.finished", false],
    ]);
    expect(admissionReasons(k, m)).toEqual(Array(5).fill("run_owned_by_other_instance"));
    expect(k.runStatus(r.runId)).toBe("halted");
    expect(evidenceOf(k, r.runId)).toEqual([]);
    expect(k.actorsOf(r.runId).get("root")?.state).toBe(rootBefore);
    expect(k.store.ofType("kernel.run_finished")).toEqual([]);
  });

  it("5. same current adapter targets its own FAILED run: stays failed, no Evidence", async () => {
    const k = await bootKernel("c18-own-failed");
    const r = await k.startRun(idle);
    await injectFrames(k, [frame("run.started", r.runId, 1, "root"), frame("run.failed", r.runId, 1, "root")]);
    expect(k.runStatus(r.runId)).toBe("failed");

    const m = mark(k);
    await injectFrames(k, fullScript(r.runId, 1, "act_f"));
    expect(outcome(k, m).every(([, ok]) => !ok)).toBe(true);
    expect(outcome(k, m)).toHaveLength(5);
    expect(admissionReasons(k, m)).toEqual(Array(5).fill("run_terminal"));
    expect(k.runStatus(r.runId)).toBe("failed");
    expect(evidenceOf(k, r.runId)).toEqual([]);
    expect(activeActions(k, r.runId)).toBeNull();
    expect(k.store.ofType("kernel.run_finished")).toEqual([]);
  });

  it("6. wrong attempt against an old run cannot modify execution state", async () => {
    // (a) Old run of the SAME current instance, terminal, addressed with another attempt.
    const k = await bootKernel("c18-wrong-attempt");
    const r = await k.startRun(idle);
    await injectFrames(k, [frame("run.started", r.runId, 1, "root"), frame("run.failed", r.runId, 1, "root")]);
    let m = mark(k);
    await injectFrames(k, fullScript(r.runId, 2, "act_a2"));
    expect(outcome(k, m).every(([, ok]) => !ok)).toBe(true);
    expect(admissionReasons(k, m)).toEqual(Array(5).fill("attempt_mismatch"));
    expect(k.runStatus(r.runId)).toBe("failed");
    expect(evidenceOf(k, r.runId)).toEqual([]);

    // (b) Old run of a PREVIOUS instance, addressed by the new current instance with another attempt.
    await k.shutdown();
    k.restartAdapter();
    await k.describe();
    const rootBefore = k.actorsOf(r.runId).get("root")?.state; // as the previous instance's termination left it
    m = mark(k);
    await injectFrames(k, fullScript(r.runId, 2, "act_b2"));
    expect(outcome(k, m).every(([, ok]) => !ok)).toBe(true);
    expect(admissionReasons(k, m)).toEqual(Array(5).fill("run_owned_by_other_instance"));
    expect(k.runStatus(r.runId)).toBe("failed");
    expect(evidenceOf(k, r.runId)).toEqual([]);
    expect(rootBefore).toBe("aborted");
    expect(k.actorsOf(r.runId).get("root")?.state).toBe(rootBefore); // never advanced by the attempt-2 frames
  });

  it("7. action.finished without a matching action.started: no Evidence, no state change", async () => {
    const k = await bootKernel("c18-unmatched-finish");
    const r = await k.startRun(idle);
    await injectFrames(k, [frame("run.started", r.runId, 1, "root")]);
    const m = mark(k);
    await injectFrames(k, [frame("action.finished", r.runId, 1, "root", { actionId: "act_x", kind: "test", exitCode: 0, summary: "never started" })]);
    expect(outcome(k, m)).toEqual([["action.finished", false]]);
    expect(admissionReasons(k, m)).toEqual(["illegal_transition"]);
    expect(evidenceOf(k, r.runId)).toEqual([]);
    expect(k.store.ofType("kernel.evidence_recorded")).toEqual([]);
    expect(k.runStatus(r.runId)).toBe("running");
    expect(activeActions(k, r.runId)).toBeNull();
    // The same actionId then follows the legal path and works.
    await injectFrames(k, [frame("action.started", r.runId, 1, "root", { actionId: "act_x", kind: "test" }), frame("action.finished", r.runId, 1, "root", { actionId: "act_x", kind: "test", exitCode: 0, summary: "legal" })]);
    expect(evidenceOf(k, r.runId).map((e) => e.payloadSummary)).toEqual(["legal"]);
  });

  it("8. normal valid current run completes with all H1 guards active", async () => {
    const k = await bootKernel("c18-normal");
    const r = await k.startRun(idle);
    const m = mark(k);
    await injectFrames(k, [
      frame("run.started", r.runId, 1, "root"),
      frame("actor.fork", r.runId, 1, "root", { childActorIds: ["w"] }),
      frame("actor.started", r.runId, 1, "w", { parentActorId: "root" }),
      frame("action.requested", r.runId, 1, "w", { actionId: "act_ok", kind: "test" }),
      frame("action.started", r.runId, 1, "w", { actionId: "act_ok", kind: "test" }),
      frame("action.updated", r.runId, 1, "w", { actionId: "act_ok", progress: 0.5 }),
      frame("action.finished", r.runId, 1, "w", { actionId: "act_ok", kind: "test", exitCode: 0, summary: "3 passed" }),
      frame("actor.finished", r.runId, 1, "w"),
      frame("actor.finished", r.runId, 1, "root"),
      frame("run.finished", r.runId, 1, "root"),
    ]);
    expect(outcome(k, m)).toHaveLength(10);
    expect(outcome(k, m).every(([, ok]) => ok)).toBe(true);
    expect(violations(k)).toEqual([]);
    expect(k.runStatus(r.runId)).toBe("finished");
    expect(evidenceOf(k, r.runId).map((e) => [e.relatedActionId, e.validationStatus])).toEqual([["act_ok", "PERSISTED"]]);
    expect(writersBlocking(k, r.runId)).toEqual([]);
  });
});
