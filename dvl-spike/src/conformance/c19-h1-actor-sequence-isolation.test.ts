/**
 * C19 — H1 regression: actor ordering (actorSequence) is isolated by authorized attempt.
 *
 * Per-actor ordering state is part of the execution binding: it belongs to one
 * (adapterInstanceId, runId, attempt, actorId) and is only advanced by frames that passed
 * run ownership + attempt admission. A rejected frame never moves the expectation used by
 * the authorized attempt, and a Kernel-created attempt N+1 starts its own actor streams at 1
 * even on the same adapter instance. All frames come from the current, handshaken adapter
 * with explicit actorSequence values (harness.injectFrames).
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Kernel } from "../kernel/kernel.js";
import { frame, injectFrames, makeKernel, violations } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});

const idle = { role: "builder", goal: "h1", acceptanceCriteria: [], scope: [], scenario: "idle" };
async function bootKernel(tag: string) {
  const k = makeKernel(tag);
  kernels.push(k);
  k.start();
  await k.describe();
  return k;
}
/** frame() with an explicit actorSequence. */
const seq = (n: number, type: string, runId: string, attempt: number, actorId: string, payload?: Record<string, unknown>) => ({ ...frame(type, runId, attempt, actorId, payload), actorSequence: n });
const mark = (k: Kernel) => k.store.all().at(-1)?.kernelSequence ?? 0;
const accepted = (k: Kernel, since: number) =>
  k.store
    .all()
    .filter((e) => e.kernelSequence > since && e.origin === "adapter" && e.adapterSequence !== undefined)
    .map((e) => [e.type, e.attempt, e.actorSequence, e.trust === "untrusted_observation"] as const);
const gaps = (k: Kernel) => violations(k, "actor_sequence_gap");

describe("C19 H1 actor ordering is isolated by attempt", () => {
  it("A. same-instance retry: attempt 2 restarts root actorSequence at 1 with no false actor_sequence_gap", async () => {
    const k = await bootKernel("c19-retry");
    const aid = k.currentAdapterInstanceId!;
    const r = await k.startRun(idle);
    // Attempt 1: root actorSequence 1, 2 → terminal.
    await injectFrames(k, [seq(1, "run.started", r.runId, 1, "root"), seq(2, "run.failed", r.runId, 1, "root")]);
    expect(k.runStatus(r.runId)).toBe("failed");

    // Kernel-created attempt 2 on the SAME adapter instance.
    const a2 = await k.retryRun(r.runId, idle);
    expect(a2.attempt).toBe(2);
    expect(k.currentAdapterInstanceId).toBe(aid);
    const m = mark(k);
    await injectFrames(k, [seq(1, "run.started", r.runId, 2, "root"), seq(2, "actor.finished", r.runId, 2, "root"), seq(3, "run.finished", r.runId, 2, "root")]);

    expect(accepted(k, m)).toEqual([
      ["run.started", 2, 1, true],
      ["actor.finished", 2, 2, true],
      ["run.finished", 2, 3, true],
    ]);
    expect(k.runStatus(r.runId)).toBe("finished");
    expect(gaps(k)).toEqual([]);
    expect(violations(k)).toEqual([]);
  });

  it("B. rejected wrong-attempt frames do not move the authorized attempt's actor ordering", async () => {
    const k = await bootKernel("c19-pollution");
    const r = await k.startRun(idle);
    // Attempt 1 accepted actorSequence 1.
    await injectFrames(k, [seq(1, "run.started", r.runId, 1, "root")]);

    // Attempt-2 frames for the same run/actor (not authorized: rejected as attempt_mismatch).
    const m = mark(k);
    await injectFrames(k, [
      seq(2, "action.started", r.runId, 2, "root", { actionId: "act_bad", kind: "test" }),
      seq(3, "action.finished", r.runId, 2, "root", { actionId: "act_bad", kind: "test", exitCode: 0, summary: "wrong attempt" }),
      seq(4, "run.finished", r.runId, 2, "root"),
    ]);
    expect(accepted(k, m).map(([, , , ok]) => ok)).toEqual([false, false, false]);
    expect(violations(k, "run_binding_violation").map((v) => v.reason)).toEqual(["attempt_mismatch", "attempt_mismatch", "attempt_mismatch"]);
    expect(k.runStatus(r.runId)).toBe("running"); // no lifecycle mutation
    expect(k.store.readEvidenceFromDisk()).toEqual([]); // no Evidence
    expect(k.noWriterReasons(r.runId).some((x) => x.startsWith("active actions"))).toBe(false);

    // Valid attempt-1 traffic continues at actorSequence 2, then 3.
    const m2 = mark(k);
    await injectFrames(k, [seq(2, "actor.finished", r.runId, 1, "root"), seq(3, "run.finished", r.runId, 1, "root")]);
    expect(accepted(k, m2)).toEqual([
      ["actor.finished", 1, 2, true],
      ["run.finished", 1, 3, true],
    ]);
    expect(gaps(k)).toEqual([]); // no gap caused by the rejected attempt-2 frames
    expect(k.runStatus(r.runId)).toBe("finished");
    expect(k.store.readEvidenceFromDisk()).toEqual([]);

    // The earlier rejected attempt-2 frames must not pre-load the expectation of the
    // attempt 2 the Kernel creates now: its root stream starts cleanly at 1.
    await k.retryRun(r.runId, idle);
    const m3 = mark(k);
    await injectFrames(k, [seq(1, "run.started", r.runId, 2, "root"), seq(2, "run.finished", r.runId, 2, "root")]);
    expect(accepted(k, m3)).toEqual([
      ["run.started", 2, 1, true],
      ["run.finished", 2, 2, true],
    ]);
    expect(gaps(k)).toEqual([]);
    expect(k.runStatus(r.runId)).toBe("finished");
  });

  it("C. a lifecycle-rejected frame of the authorized attempt still occupies its sequence slot (no false gap after it)", async () => {
    const k = await bootKernel("c19-slot");
    const r = await k.startRun(idle);
    const m = mark(k);
    await injectFrames(k, [
      seq(1, "run.started", r.runId, 1, "root"),
      seq(2, "action.finished", r.runId, 1, "root", { actionId: "act_x", kind: "test", exitCode: 0, summary: "never started" }), // illegal transition: rejected
      seq(3, "actor.finished", r.runId, 1, "root"),
      seq(4, "run.finished", r.runId, 1, "root"),
    ]);
    expect(accepted(k, m)).toEqual([
      ["run.started", 1, 1, true],
      ["action.finished", 1, 2, false],
      ["actor.finished", 1, 3, true],
      ["run.finished", 1, 4, true],
    ]);
    expect(violations(k, "run_binding_violation").map((v) => v.reason)).toEqual(["illegal_transition"]);
    expect(gaps(k)).toEqual([]);
    expect(k.runStatus(r.runId)).toBe("finished");
    expect(k.store.readEvidenceFromDisk()).toEqual([]);
  });
});
