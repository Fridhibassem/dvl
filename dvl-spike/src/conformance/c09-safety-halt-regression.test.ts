/**
 * C09 — H3 regression: the once-per-instance + fencing `haltForSafety` behaviour for the
 * pre-H3 safety triggers (§49 L-0 surrogate limits): maxDurationMs and maxIncomingBytes.
 *
 * Determinism: processing of `heartbeat` frames is held by a gate until every frame of
 * the scenario has been received, so the post-halt ("zombie") frames are known to be
 * sitting in the instance's queue when the halt happens.
 *   - duration: the timer fires while everything after heartbeat #1 is held.
 *   - bytes:    the gate is released and the byte limit is crossed mid-burst.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Kernel, KernelOptions } from "../kernel/kernel.js";
import type { StoredEvent } from "../kernel/types.js";
import { makeKernel, startRunLenient, violations, waitForEvent } from "./harness.js";

let kernels: Kernel[] = [];
let releases: (() => void)[] = [];
afterEach(async () => {
  releases.splice(0).forEach((r) => r());
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});

/** Holds processing of each listed frame type until that type's release() is called. */
function gatedKernel(tag: string, extra: Partial<KernelOptions>, types: string[] = ["heartbeat"]) {
  const gates = new Map<string, { held: boolean; promise: Promise<void>; open: () => void }>();
  for (const t of types) {
    let open!: () => void;
    const promise = new Promise<void>((r) => (open = r));
    gates.set(t, { held: true, promise, open });
  }
  const releaseType = (t: string) => {
    const g = gates.get(t)!;
    g.held = false;
    g.open();
  };
  for (const t of types) releases.push(() => releaseType(t));
  const k = makeKernel(tag, {
    frameGate: async (type) => {
      const g = gates.get(type);
      if (g?.held) await g.promise;
    },
    ...extra,
  });
  kernels.push(k);
  return { k, release: () => releaseType(types[0]!), releaseType };
}

async function until(cond: () => boolean, what: string, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Wait until the adapter has written everything it is going to write before a halt. */
async function untilQuiet(k: Kernel) {
  let last = -1;
  let since = Date.now();
  await until(() => {
    const n = k.transportStats!.framesReceived;
    if (n !== last) [last, since] = [n, Date.now()];
    return n > 2 && Date.now() - since > 200;
  }, "adapter output to settle");
}

/**
 * Node arms setTimeout from the event loop's cached clock, so a timer armed after
 * synchronous work in the same tick (spawnAdapter spawns + mkdirs first) can fire a few
 * ms "early" by Date.now(). Observed in CI: 1499ms for a 1500ms limit. Allow that slack.
 */
const TIMER_SLACK_MS = 50;

const halts = (k: Kernel) => k.store.ofType("kernel.safety_halt");
const recordsOf = (k: Kernel, aid: string) => k.store.all().filter((e) => e.origin === "adapter" && e.adapterInstanceId === aid);
const acceptedOf = (k: Kernel, aid: string) => recordsOf(k, aid).filter((e) => e.trust === "untrusted_observation" && e.adapterSequence !== undefined);
const truthy = (e: StoredEvent) => /finished|passed|validated|integration|verification|evidence/i.test(e.type);

/** No completion / evidence / validation in the store — from the adapter or the Kernel. */
function expectNoFalseTruth(k: Kernel, aid: string, runId: string) {
  expect(k.runStatus(runId)).toBe("halted");
  expect(k.store.ofType("kernel.run_finished")).toHaveLength(0);
  expect(k.store.ofType("kernel.evidence_recorded")).toHaveLength(0);
  expect(k.store.ofType("kernel.artifact_imported")).toHaveLength(0);
  expect(k.store.ofType("kernel.snapshot_taken")).toHaveLength(0);
  expect(k.store.readEvidenceFromDisk()).toHaveLength(0);
  expect(recordsOf(k, aid).filter((e) => truthy(e) && e.trust === "untrusted_observation")).toEqual([]);
}

/** A fresh instance on the same Kernel works normally and is not treated as halted. */
async function expectFreshInstanceHealthy(k: Kernel, oldAid: string) {
  const newAid = k.currentAdapterInstanceId!;
  expect(newAid).not.toBe(oldAid);
  await k.describe();
  const id = await k.startRun({ role: "builder", goal: "fresh", acceptanceCriteria: ["mock"], scope: ["src/**"], scenario: "happy" });
  expect(await k.waitForRunEnd(id.runId)).toBe("finished");
  await k.settle();
  expect(halts(k)).toHaveLength(1); // still only the old instance's halt
  const seqs = acceptedOf(k, newAid).map((e) => e.adapterSequence);
  expect(seqs).toEqual(seqs.map((_, i) => i + 1)); // B's own stream from 1, no gaps
  expect(violations(k).filter((v) => v.adapterInstanceId === newAid)).toEqual([]);
  expect(k.store.ofType("kernel.evidence_recorded").length).toBeGreaterThan(0); // B's evidence is normal
  return newAid;
}

describe("C09 safety-halt regression for pre-H3 triggers (H3)", () => {
  it("maxDurationMs: one halt, instance fenced, zombie frames never become truth, fresh instance healthy", async () => {
    const LIMIT = 1_500;
    const { k, release } = gatedKernel("c09-duration", { limits: { maxDurationMs: LIMIT } });
    k.start();
    const spawnedAt = Date.now();
    await k.describe();
    const aidA = k.currentAdapterInstanceId!;
    const run = startRunLenient(k, "burst-100"); // a safety halt may race the run.start ack
    await untilQuiet(k);
    const queued = k.transportStats!.queueDepth;
    expect(queued).toBeGreaterThan(100); // heartbeats, action.*, actor/run.finished all waiting

    const halt = await waitForEvent(k, (e) => e.type === "kernel.safety_halt", LIMIT + 5_000);
    expect(Date.now() - spawnedAt).toBeGreaterThanOrEqual(LIMIT - TIMER_SLACK_MS);
    const p = halt.payload as Record<string, unknown>;
    expect(p).toMatchObject({
      errorClass: "halted_by_safety_limit",
      kind: "max_duration",
      maxDurationMs: LIMIT,
      adapterInstanceId: aidA,
      runIds: [run.runId],
    });
    expect(String(p.reason)).toBe(`maxDurationMs ${LIMIT} exceeded`);
    expect(p.elapsedMs as number).toBeGreaterThanOrEqual(LIMIT - TIMER_SLACK_MS);
    expect(p.elapsedMs as number).toBeLessThan(LIMIT + 5_000); // fired at the limit, not much later
    expect(halt.runId).toBe(run.runId);
    expect(k.runStatus(run.runId)).toBe("halted");

    // Let the zombies through while A is STILL the current instance: only the halt's
    // fencing (terminated instance) can stop them from being applied.
    release();
    await k.waitClosed(10_000);

    const zombies = recordsOf(k, aidA).filter((e) => e.kernelSequence > halt.kernelSequence);
    expect(zombies.length).toBe(queued + 1); // every queued frame + the one in flight
    expect(zombies.every((e) => e.trust === "protocol_violation")).toBe(true);
    const stale = violations(k, "stale_adapter_instance");
    expect(stale).toHaveLength(zombies.length);
    expect(stale.every((v) => v.adapterInstanceId === aidA && v.currentAdapterInstanceId === aidA && v.terminated === true)).toBe(true);
    expect(zombies.some((e) => e.type === "run.finished")).toBe(true);
    expect(zombies.some((e) => e.type === "action.finished")).toBe(true);
    // Only accepted A frames are the ones processed before the gate (seq 1..2).
    expect(acceptedOf(k, aidA).map((e) => e.adapterSequence)).toEqual([1, 2]);
    expectNoFalseTruth(k, aidA, run.runId);
    expect(halts(k)).toHaveLength(1); // trailing output did not re-halt

    // Queue / process state of A closed cleanly.
    const exited = k.store.ofType("kernel.adapter_exited").find((e) => (e.payload as { adapterInstanceId: string }).adapterInstanceId === aidA)!;
    expect(exited.payload).toMatchObject({ signal: "SIGKILL" });
    expect(k.transportStats!.queueDepth).toBe(0);

    // Retire A normally and start B: its own duration budget, not halted, normal completion.
    k.restartAdapter();
    const aidB = await expectFreshInstanceHealthy(k, aidA);
    expect(recordsOf(k, aidB).length).toBeGreaterThan(0);
    expect(recordsOf(k, aidA).every((e) => e.kernelSequence < recordsOf(k, aidB)[0]!.kernelSequence)).toBe(true);
  });

  it("maxDurationMs: halted instance retired while zombies are still queued; they are fenced against the fresh instance", async () => {
    const LIMIT = 1_500;
    const { k, release } = gatedKernel("c09-duration-force", { limits: { maxDurationMs: LIMIT } });
    k.start();
    await k.describe();
    const aidA = k.currentAdapterInstanceId!;
    const run = startRunLenient(k, "burst-100"); // a safety halt may race the run.start ack
    await untilQuiet(k);
    const queued = k.transportStats!.queueDepth;
    const halt = await waitForEvent(k, (e) => e.type === "kernel.safety_halt", LIMIT + 5_000);

    k.restartAdapter({ force: true }); // retire A with its zombies still queued
    const aidB = k.currentAdapterInstanceId!;
    release();
    await waitForEvent(k, (e) => e.type === "kernel.adapter_exited" && (e.payload as { adapterInstanceId: string }).adapterInstanceId === aidA);

    const zombies = recordsOf(k, aidA).filter((e) => e.kernelSequence > halt.kernelSequence);
    expect(zombies.length).toBe(queued + 1);
    expect(zombies.every((e) => e.trust === "protocol_violation")).toBe(true);
    const stale = violations(k, "stale_adapter_instance");
    expect(stale).toHaveLength(zombies.length);
    expect(stale.every((v) => v.adapterInstanceId === aidA && v.currentAdapterInstanceId === aidB && v.terminated === true)).toBe(true);
    expectNoFalseTruth(k, aidA, run.runId);
    expect(halts(k)).toHaveLength(1);
    expect(k.store.ofType("kernel.adapter_exited").find((e) => (e.payload as { adapterInstanceId: string }).adapterInstanceId === aidA)!.payload).toMatchObject({ stale: true });
    await expectFreshInstanceHealthy(k, aidA);
  });

  it("maxIncomingBytes: one halt with limit metadata, trailing frames fenced, fresh instance healthy", async () => {
    const LIMIT = 8_000;
    // Bytes are charged at the drain boundary (blocker C), so the burst trips the limit
    // while processing is held. Processing of intent_hint (seq 2) is held, so the halted
    // instance stays open — independent of how stdout is chunked — past a short duration
    // limit: that second trigger on the same instance must NOT produce a second halt.
    const DURATION = 2_500;
    const { k, release } = gatedKernel("c09-bytes", { limits: { maxIncomingBytes: LIMIT, maxDurationMs: DURATION } }, ["provider.intent_hint"]);
    k.start();
    const spawnedAt = Date.now();
    await k.describe();
    const aidA = k.currentAdapterInstanceId!;
    const run = startRunLenient(k, "burst-100"); // the byte halt may race the run.start ack

    const halt = await waitForEvent(k, (e) => e.type === "kernel.safety_halt");
    expect(k.store.ofType("provider.intent_hint")).toHaveLength(0); // processing was still held
    const p = halt.payload as Record<string, unknown>;
    expect(p).toMatchObject({
      errorClass: "halted_by_safety_limit",
      kind: "max_incoming_bytes",
      maxIncomingBytes: LIMIT,
      adapterInstanceId: aidA,
      runIds: [run.runId],
      stream: "stdout",
      lastAcceptedAdapterSequence: 1,
    });
    expect(String(p.reason)).toBe(`maxIncomingBytes ${LIMIT} exceeded`);
    expect(p.incomingBytes as number).toBeGreaterThan(LIMIT);
    expect((p.incomingBytes as number) - (p.triggeringChunkBytes as number)).toBeLessThanOrEqual(LIMIT);
    expect((p.stdoutBytes as number) + (p.stderrBytes as number)).toBe(p.incomingBytes);

    // Halted but still open (a frame is in flight): let its duration limit expire.
    await until(() => Date.now() - spawnedAt > DURATION + 300, "duration limit to pass", DURATION + 5_000);
    expect(await k.waitClosed(1)).toBe(false);
    expect(halts(k)).toHaveLength(1);
    release();
    await k.waitClosed(10_000);
    expect(halts(k)).toHaveLength(1);

    // Accepted prefix is exactly seq 1; everything in flight or queued at the breach is
    // fenced by the halt (H1 terminated-instance guard); everything after it was never queued.
    expect(acceptedOf(k, aidA).map((e) => e.adapterSequence)).toEqual([1]);
    const after = recordsOf(k, aidA).filter((e) => e.kernelSequence > halt.kernelSequence);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((e) => e.trust === "protocol_violation")).toBe(true);
    const stale = violations(k, "stale_adapter_instance");
    expect(stale).toHaveLength(after.length);
    expect(stale.every((v) => v.adapterInstanceId === aidA && v.terminated === true)).toBe(true);
    const s = k.transportStats!;
    expect(recordsOf(k, aidA).length + s.framesRejected).toBe(s.framesReceived); // nothing vanished
    expectNoFalseTruth(k, aidA, run.runId);
    expect(s.queueDepth).toBe(0);

    // Retire normally (A is closed) and start B: B must not inherit A's byte budget.
    k.restartAdapter();
    await expectFreshInstanceHealthy(k, aidA);
  });

  it("maxDurationMs is re-armed for the replacement instance (runtime, not just source)", async () => {
    const LIMIT = 1_000;
    const k = makeKernel("c09-rearm", { limits: { maxDurationMs: LIMIT } });
    kernels.push(k);
    k.start();
    await k.describe();
    const aidA = k.currentAdapterInstanceId!;
    const rA = startRunLenient(k, "slow"); // the duration halt may race the run.start ack under load
    expect(await k.waitForRunEnd(rA.runId, LIMIT + 5_000)).toBe("halted");
    await k.waitClosed(5_000);

    k.restartAdapter();
    const tB = Date.now();
    await k.describe();
    const aidB = k.currentAdapterInstanceId!;
    const rB = startRunLenient(k, "slow");
    expect(await k.waitForRunEnd(rB.runId, LIMIT + 5_000)).toBe("halted");
    expect(Date.now() - tB).toBeGreaterThanOrEqual(LIMIT - TIMER_SLACK_MS);
    const hs = halts(k).map((e) => e.payload as Record<string, unknown>);
    expect(hs.map((h) => [h.kind, h.adapterInstanceId, h.runIds])).toEqual([
      ["max_duration", aidA, [rA.runId]],
      ["max_duration", aidB, [rB.runId]],
    ]);
  });
});
