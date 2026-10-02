/**
 * C16 — Blocker 4: a failed dispatch always reaches a terminal disposition.
 *
 * An attempt is created, then dispatched (run.start). If dispatch fails — transport closed,
 * send error, or no ack within the request timeout — the attempt becomes terminal
 * `failed_to_start` and kernel.attempt_dispatch_failed records why. It is never left
 * `starting`, history is never rolled back, the next retry creates attempt N+1, and a
 * late-arriving adapter cannot attach events or Evidence to the failed attempt.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Kernel } from "../kernel/kernel.js";
import { makeKernel, runScenario, violations } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});
const task = (scenario: string) => ({ role: "builder", goal: scenario, acceptanceCriteria: [], scope: ["src/**"], scenario });
const attemptsCreated = (k: Kernel) => k.store.ofType("kernel.attempt_created").map((e) => (e.payload as { attempt: number }).attempt);
const dispatchFailed = (k: Kernel) => k.store.ofType("kernel.attempt_dispatch_failed").map((e) => e.payload as Record<string, unknown>);

describe("C16 atomic retry dispatch (blocker 4)", () => {
  it("retry over a closed transport: attempt 2 is failed_to_start, recorded, and attempt 3 is legal", async () => {
    const k = makeKernel("c16-closed");
    kernels.push(k);
    const a = await runScenario(k, "crash");
    await k.waitClosed(5_000);
    // No restart: the transport is closed, but capabilities from the dead instance remain.
    await expect(k.retryRun(a.id.runId, task("happy"))).rejects.toThrow(/transport closed|not started|dispatch/);
    expect(k.runStatus(a.id.runId)).toBe("failed_to_start");
    expect(dispatchFailed(k)).toEqual([expect.objectContaining({ runId: a.id.runId, attempt: 2 })]);

    k.restartAdapter();
    await k.describe();
    const id3 = await k.retryRun(a.id.runId, task("happy"));
    expect(id3.attempt).toBe(3);
    expect(attemptsCreated(k)).toEqual([2, 3]); // monotonic, nothing reused or rolled back
    expect(await k.waitForRunEnd(a.id.runId)).toBe("finished");
    expect(k.store.readEvidenceFromDisk().every((e) => e.attempt === 3)).toBe(true);
  });

  it("run.start not acknowledged in time: failed_to_start; the late adapter's events and Evidence are rejected", async () => {
    const env: Record<string, string> = {};
    const k = makeKernel("c16-timeout", { adapterEnv: env, requestTimeoutMs: 400 });
    kernels.push(k);
    const a = await runScenario(k, "crash");
    await k.waitClosed(5_000);
    env.DVL_MOCK_ACK_DELAY_MS = "900";
    k.restartAdapter();
    await k.describe();
    await expect(k.retryRun(a.id.runId, task("happy"))).rejects.toThrow(/timed out/);
    expect(k.runStatus(a.id.runId)).toBe("failed_to_start");
    // The adapter did receive run.start: it acks late and emits the whole happy script.
    await new Promise((r) => setTimeout(r, 1_500));
    await k.settle();
    const late = k.store.all().filter((e) => e.origin === "adapter" && e.runId === a.id.runId && e.attempt === 2 && e.adapterSequence !== undefined);
    expect(late.length).toBeGreaterThanOrEqual(10);
    expect(late.every((e) => e.trust === "protocol_violation")).toBe(true);
    expect(violations(k, "run_binding_violation").filter((v) => v.attempt === 2).every((v) => v.reason === "run_terminal")).toBe(true);
    expect(k.store.readEvidenceFromDisk()).toEqual([]);
    expect(k.runStatus(a.id.runId)).toBe("failed_to_start"); // never flipped to running/finished
  });

  it("first-attempt dispatch failure is terminal too (startRun)", async () => {
    const k = makeKernel("c16-first", { adapterEnv: { DVL_MOCK_ACK_DELAY_MS: "900" }, requestTimeoutMs: 400 });
    kernels.push(k);
    k.start();
    await k.describe();
    const before = k.store.all().length;
    await expect(k.startRun(task("happy"))).rejects.toThrow(/timed out/);
    const runId = k.store.all().slice(before).find((e) => e.type === "kernel.run_created")!.runId!;
    expect(k.runStatus(runId)).toBe("failed_to_start");
    expect(dispatchFailed(k)).toEqual([expect.objectContaining({ runId, attempt: 1 })]);
    // The next retry is ADMITTED (attempt 1 is terminal), creating attempt 2; the adapter is
    // still too slow, so attempt 2 gets its own terminal disposition too.
    await expect(k.retryRun(runId, task("happy"))).rejects.toThrow(/timed out/);
    expect(attemptsCreated(k)).toEqual([2]);
    expect(dispatchFailed(k).map((d) => d.attempt)).toEqual([1, 2]);
    expect(k.runStatus(runId)).toBe("failed_to_start");
  });
});
