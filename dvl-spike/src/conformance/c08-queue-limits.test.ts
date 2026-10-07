/**
 * C08 — H3 protocol queue limits (HARDENING.md).
 *
 * Each adapter instance gets a fresh Kernel-owned FIFO queue of parsed DVL1 frames,
 * bounded by maxQueuedFrames and maxQueuedBytes. Draining stdout/stderr never waits on
 * processing. If a frame would exceed a bound the queue is sealed: that frame and all
 * later ones go to the instance's overflow diagnostic spool (never processed), and the
 * Kernel records one safety halt, halts the run, kills and fences the instance. Frames
 * still queued are then recorded as fenced violations — never truth, never dropped.
 *
 * Determinism: gates hold only `heartbeat` frames. With capacity Q, seq 1..2 are
 * processed, seq 3 is in flight at the gate, seq 4..Q+3 fill the queue, and seq Q+4
 * is the first rejected frame.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Kernel, type KernelOptions } from "../kernel/kernel.js";
import { MAX_QUEUED_BYTES, MAX_QUEUED_FRAMES, type StoredEvent } from "../kernel/types.js";
import { makeKernel, runScenario, violations, waitForEvent } from "./harness.js";

let kernels: Kernel[] = [];
let releases: (() => void)[] = [];
afterEach(async () => {
  releases.splice(0).forEach((r) => r());
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});

const Q = 16;

/** Kernel whose processing of `heartbeat` frames is held until release(). */
function gatedKernel(tag: string, extra: Partial<KernelOptions> = {}) {
  let held = true;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const releaseAll = () => {
    held = false;
    release();
  };
  releases.push(releaseAll);
  const k = makeKernel(tag, {
    frameGate: async (type) => {
      if (held && type === "heartbeat") await gate;
    },
    ...extra,
  });
  kernels.push(k);
  return { k, release: releaseAll };
}

async function startScenario(k: Kernel, scenario: string) {
  if (!k.currentAdapterInstanceId || k.capabilities === null) {
    if (!k.currentAdapterInstanceId) k.start();
    await k.describe();
  }
  return k.startRun({ role: "builder", goal: scenario, acceptanceCriteria: ["mock"], scope: ["src/**"], scenario });
}

async function until(cond: () => boolean, what: string, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const halts = (k: Kernel) => k.store.ofType("kernel.safety_halt").map((e) => e.payload as Record<string, unknown>);
const adapterRecords = (k: Kernel, aid: string) => k.store.all().filter((e) => e.origin === "adapter" && e.adapterInstanceId === aid);
const accepted = (k: Kernel, aid: string) => adapterRecords(k, aid).filter((e) => e.trust === "untrusted_observation" && e.adapterSequence !== undefined);
/**
 * H3: the overflow spool holds one bounded record per refused frame —
 * `[REFUSED <why> bytes=<n>] <JSON-escaped preview ≤ 256 bytes>` — never the raw line. These
 * frames start with their type and adapterSequence, so the (possibly truncated) preview still
 * identifies each refused frame and preserves the FIFO / accounting checks.
 */
const overflowLines = (file: string) =>
  fs.existsSync(file)
    ? fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const m = /^\[REFUSED \S+ bytes=(\d+)\] (.*)$/.exec(l);
          if (!m) throw new Error(`unexpected overflow record: ${l.slice(0, 80)}`);
          const text = JSON.parse(`"${m[2]}"`) as string; // may be truncated to the preview bound
          expect(text.startsWith("DVL1:")).toBe(true);
          const seq = /"adapterSequence":(\d+)/.exec(text);
          return { bytes: Number(m[1]), adapterSequence: seq ? Number(seq[1]) : null } as Record<string, unknown>;
        })
    : [];

/** Drive an overflow: capacity Q, burst-100, wait for the halt, release, wait for close. */
async function overflowRun(tag: string, extra: Partial<KernelOptions> = {}) {
  const { k, release } = gatedKernel(tag, { queueLimits: { maxQueuedFrames: Q }, ...extra });
  const id = await startScenario(k, "burst-100");
  const aid = k.currentAdapterInstanceId!;
  await waitForEvent(k, (e) => e.type === "kernel.safety_halt");
  const statsAtHalt = { ...k.transportStats! };
  release();
  await k.waitClosed(10_000);
  return { k, id, aid, statsAtHalt };
}

describe("C08 protocol queue limits (H3)", () => {
  it("1. normal traffic below capacity is processed strictly FIFO with no violations", async () => {
    const k = makeKernel("c08-fifo", { processingDelayMs: 2 }); // slow Kernel ⇒ a real backlog
    kernels.push(k);
    expect(k.queueLimits).toEqual({ maxQueuedFrames: MAX_QUEUED_FRAMES, maxQueuedBytes: MAX_QUEUED_BYTES });
    const { status } = await runScenario(k, "burst-100");
    expect(status).toBe("finished");
    const aid = k.currentAdapterInstanceId!;
    const seqs = accepted(k, aid).map((e) => e.adapterSequence!);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
    const beats = k.store.ofType("heartbeat").map((e) => (e.payload as { i: number }).i);
    expect(beats).toEqual([...Array(100).keys()]);
    expect(k.transportStats!.queueHighWater).toBeGreaterThan(1); // frames really waited in the queue
    expect(violations(k)).toHaveLength(0);
    expect(halts(k)).toHaveLength(0);
  });

  it("2. a burst that fills the queue but stays within capacity succeeds", async () => {
    const { k, release } = gatedKernel("c08-burst-ok", { queueLimits: { maxQueuedFrames: 24 } });
    const id = await startScenario(k, "burst-20");
    // heartbeats 2..20 + actor.finished + run.finished queued behind heartbeat #1 = 21 frames.
    await until(() => k.transportStats!.queueDepth === 21, "queue to hold the whole burst");
    const s = k.transportStats!;
    expect(s.queueDepth).toBeLessThanOrEqual(24);
    expect(s.queuedBytes).toBeGreaterThan(0);
    expect(s.framesRejected).toBe(0);
    expect(halts(k)).toHaveLength(0);
    release();
    expect(await k.waitForRunEnd(id.runId)).toBe("finished");
    expect(violations(k)).toHaveLength(0);
    expect(k.transportStats!.queueHighWater).toBe(21);
  });

  it("3. overflow triggers one deterministic safety halt (frame bound and byte bound)", async () => {
    const runs = [await overflowRun("c08-det-a"), await overflowRun("c08-det-b")];
    const meta = runs.map((r) => {
      const h = halts(r.k);
      expect(h).toHaveLength(1);
      const { adapterInstanceId: _a, runIds: _r, at: _t, overflowSpoolPath: _p, bytesAtViolation: _b, rejectedFrameBytes: _f, reason: _x, ...stable } = h[0]!;
      return stable;
    });
    expect(meta[0]).toEqual({
      errorClass: "halted_by_safety_limit",
      kind: "queue_overflow",
      maxQueuedFrames: Q,
      maxQueuedBytes: MAX_QUEUED_BYTES,
      depthAtViolation: Q,
      rejectedAdapterSequence: Q + 4,
      lastQueuedAdapterSequence: Q + 3,
      lastAcceptedAdapterSequence: 2,
    });
    expect(meta[1]).toEqual(meta[0]); // same input ⇒ same decision
    for (const r of runs) expect(r.k.runStatus(r.id.runId)).toBe("halted");

    // Byte bound alone also halts, at the first frame that would exceed it.
    const { k } = await overflowRun("c08-bytes", { queueLimits: { maxQueuedFrames: 10_000, maxQueuedBytes: 2_000 } });
    const h = halts(k);
    expect(h).toHaveLength(1);
    expect(h[0]!.bytesAtViolation as number).toBeLessThanOrEqual(2_000);
    expect((h[0]!.bytesAtViolation as number) + (h[0]!.rejectedFrameBytes as number)).toBeGreaterThan(2_000);
    expect(k.transportStats!.queuedBytesHighWater).toBeLessThanOrEqual(2_000);
  });

  it("4. overflow never silently drops and continues: every received frame is accounted for", async () => {
    const { k, aid } = await overflowRun("c08-nodrop");
    const s = k.transportStats!;
    const spooled = overflowLines(path.join(k.store.spoolDir, aid, "diagnostics.queue-overflow.log"));
    // Every frame the transport received is either a stored record (accepted, response,
    // or fenced violation) or a line in the overflow spool. Nothing vanished.
    expect(s.framesRejected).toBeGreaterThan(0);
    expect(spooled).toHaveLength(s.framesRejected);
    expect(adapterRecords(k, aid).length + s.framesRejected).toBe(s.framesReceived);
    // Once sealed, nothing more was processed as current truth.
    expect(accepted(k, aid).every((e) => e.adapterSequence! <= 2)).toBe(true);
    expect(k.runStatus(k.store.ofType("kernel.run_created")[0]!.runId!)).toBe("halted");
  });

  it("5. events accepted before the overflow remain preserved and valid", async () => {
    const { k, aid } = await overflowRun("c08-preserve");
    const disk = k.store.readFromDisk().filter((e) => e.origin === "adapter" && e.adapterInstanceId === aid && e.trust === "untrusted_observation" && e.adapterSequence);
    expect(disk.map((e) => [e.adapterSequence, e.type])).toEqual([
      [1, "run.started"],
      [2, "provider.intent_hint"],
    ]);
  });

  it("6. frames after the overflow are never processed as current truth", async () => {
    const { k, aid } = await overflowRun("c08-after");
    const s = k.transportStats!;
    // Queued-but-unprocessed frames were fenced: stored as violations, never applied.
    const fenced = adapterRecords(k, aid).filter((e) => e.type === "heartbeat");
    expect(fenced.length).toBe(Q + 1); // in-flight #3 + Q queued
    expect(fenced.every((e) => e.trust === "protocol_violation")).toBe(true);
    expect(violations(k, "stale_adapter_instance").every((v) => v.terminated === true)).toBe(true);
    // Rejected frames never reached the store; the spool keeps them in arrival order.
    const spooled = overflowLines(path.join(k.store.spoolDir, aid, "diagnostics.queue-overflow.log"));
    const seqs = spooled.map((f) => f.adapterSequence as number);
    expect(seqs[0]).toBe(Q + 4);
    expect(seqs).toEqual(seqs.map((_, i) => Q + 4 + i));
    expect(adapterRecords(k, aid).some((e) => (e.adapterSequence ?? 0) >= Q + 4)).toBe(false);
    expect(s.framesReceived).toBe(adapterRecords(k, aid).length + spooled.length);
  });

  it("7. parallel adapters have isolated queue state", async () => {
    const over = gatedKernel("c08-par-over", { queueLimits: { maxQueuedFrames: Q } });
    const calm = makeKernel("c08-par-calm", { processingDelayMs: 1 });
    kernels.push(calm);
    const [idOver, calmRun] = await Promise.all([startScenario(over.k, "burst-100"), runScenario(calm, "burst-100")]);
    await waitForEvent(over.k, (e) => e.type === "kernel.safety_halt");
    over.release();
    expect(over.k.runStatus(idOver.runId)).toBe("halted");
    expect(calmRun.status).toBe("finished");
    expect(halts(calm)).toHaveLength(0);
    expect(calm.transportStats!.framesRejected).toBe(0);
    expect(calm.store.ofType("heartbeat")).toHaveLength(100);
    expect(calm.store.ofType("heartbeat").every((e) => e.adapterInstanceId === calm.currentAdapterInstanceId)).toBe(true);
    expect(calm.transportStats).not.toBe(over.k.transportStats);
  });

  it("8. a dead instance's queued frames stay fenced during and after overflow + restart", async () => {
    const { k, release } = gatedKernel("c08-stale", { queueLimits: { maxQueuedFrames: Q } });
    await startScenario(k, "burst-100");
    const aidA = k.currentAdapterInstanceId!;
    await waitForEvent(k, (e) => e.type === "kernel.safety_halt");
    k.restartAdapter({ force: true }); // A is terminated but its queue is still held at the gate
    const aidB = k.currentAdapterInstanceId!;
    release();
    await waitForEvent(k, (e) => e.type === "kernel.adapter_exited" && (e.payload as { adapterInstanceId: string }).adapterInstanceId === aidA);

    const lateA = adapterRecords(k, aidA).filter((e) => e.type === "heartbeat");
    expect(lateA).toHaveLength(Q + 1);
    expect(lateA.every((e) => e.trust === "protocol_violation")).toBe(true);
    const stale = violations(k, "stale_adapter_instance");
    expect(stale.every((v) => v.adapterInstanceId === aidA && v.currentAdapterInstanceId === aidB)).toBe(true);
    // B is unaffected and the halt is not repeated.
    const b = await startScenario(k, "happy");
    expect(await k.waitForRunEnd(b.runId)).toBe("finished");
    expect(halts(k)).toHaveLength(1);
    expect(accepted(k, aidB).every((e) => e.adapterInstanceId === aidB)).toBe(true);
  });

  it("9. stdout keeps draining while Kernel processing is blocked", async () => {
    const { k, release } = gatedKernel("c08-stdout");
    const id = await startScenario(k, "burst-pressure");
    // Heartbeat processing is frozen; the provider must still push >2MB of stdout.
    await until(() => k.transportStats!.stdoutBytes > 2 * 1024 * 1024, "stdout drain under blocked processing");
    expect(k.store.ofType("heartbeat")).toHaveLength(0);
    expect(k.transportStats!.queueDepth).toBeGreaterThan(150);
    release();
    expect(await k.waitForRunEnd(id.runId)).toBe("finished");
    expect(halts(k)).toHaveLength(0);
  });

  it("10. stderr keeps draining into the instance's spool while the queue is under pressure", async () => {
    const { k, release } = gatedKernel("c08-stderr", { queueLimits: { maxQueuedFrames: 210 } });
    const id = await startScenario(k, "burst-pressure");
    await until(() => k.transportStats!.stderrBytes >= 2 * 1024 * 1024, "stderr drain under queue pressure");
    const s = k.transportStats!;
    expect(s.queueDepth).toBeGreaterThan(150); // close to the 210 bound
    expect(s.queueDepth).toBeLessThanOrEqual(210);
    expect(k.store.ofType("heartbeat")).toHaveLength(0);
    release();
    expect(await k.waitForRunEnd(id.runId)).toBe("finished");
    await k.shutdown();
    expect(fs.statSync(k.stderrSpoolPath!).size).toBe(k.transportStats!.stderrBytes);
    expect(k.stderrSpoolPath!.startsWith(path.join(k.store.spoolDir, k.currentAdapterInstanceId!))).toBe(true);
  });

  it("11. a restarted adapter instance gets a fresh, empty, unsealed queue", async () => {
    const { k, aid: aidA, statsAtHalt } = await overflowRun("c08-fresh");
    expect(statsAtHalt.framesRejected).toBeGreaterThan(0);
    const statsA = k.transportStats!;
    k.restartAdapter();
    const aidB = k.currentAdapterInstanceId!;
    expect(aidB).not.toBe(aidA);
    const s = k.transportStats!;
    expect(s).not.toBe(statsA);
    expect(s).toMatchObject({ queueDepth: 0, queuedBytes: 0, queueHighWater: 0, framesRejected: 0, framesReceived: 0 });
    // Same tight limit, normal traffic: B is not affected by A's sealed queue.
    const id = await startScenario(k, "happy");
    expect(await k.waitForRunEnd(id.runId)).toBe("finished");
    expect(halts(k)).toHaveLength(1);
    expect(k.transportStats!.framesRejected).toBe(0);
    expect(fs.existsSync(path.join(k.store.spoolDir, aidB, "diagnostics.queue-overflow.log"))).toBe(false);
  });

  it("12. overflow cannot produce completion, evidence, validation or integration", async () => {
    const { k, id, aid } = await overflowRun("c08-notruth");
    expect(k.runStatus(id.runId)).toBe("halted");
    expect(k.store.ofType("kernel.run_finished")).toHaveLength(0);
    expect(k.store.ofType("kernel.run_halted")).toHaveLength(1);
    expect(k.store.readEvidenceFromDisk()).toHaveLength(0);
    expect(k.store.ofType("kernel.evidence_recorded")).toHaveLength(0);
    expect(k.store.ofType("kernel.snapshot_taken")).toHaveLength(0);
    const truthy = (e: StoredEvent) => /finished|passed|validated|integration|verification/i.test(e.type);
    expect(k.store.all().filter((e) => e.origin === "adapter" && e.adapterInstanceId === aid && truthy(e)).every((e) => e.trust !== "untrusted_observation")).toBe(true);
    expect(k.store.all().filter((e) => e.origin === "kernel" && truthy(e))).toEqual([]);
  });

  it("13. the safety halt record carries the queue violation metadata", async () => {
    const before = Date.now();
    const { k, id, aid } = await overflowRun("c08-meta");
    const ev = k.store.ofType("kernel.safety_halt")[0]!;
    const p = ev.payload as Record<string, unknown>;
    expect(ev.trust).toBe("kernel_truth");
    expect(ev.runId).toBe(id.runId);
    expect(p).toMatchObject({
      errorClass: "halted_by_safety_limit",
      kind: "queue_overflow",
      adapterInstanceId: aid,
      runIds: [id.runId],
      maxQueuedFrames: Q,
      maxQueuedBytes: MAX_QUEUED_BYTES,
      depthAtViolation: Q,
      lastAcceptedAdapterSequence: 2,
      rejectedAdapterSequence: Q + 4,
      overflowSpoolPath: path.join(".dvl", "spool", aid, "diagnostics.queue-overflow.log"),
    });
    expect(p.bytesAtViolation as number).toBeGreaterThan(0);
    expect(Date.parse(p.at as string)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(p.at as string)).toBeLessThanOrEqual(Date.now());
    expect(String(p.reason)).toMatch(/protocol queue limit exceeded/);
    // The instance was terminated by the halt (its in-flight action/actor state aborted).
    expect(k.store.ofType("kernel.actor_aborted").map((e) => (e.payload as { adapterInstanceId: string }).adapterInstanceId)).toContain(aid);
  });

  it("14. queue memory and state are released after the adapter instance terminates", async () => {
    const { k, statsAtHalt } = await overflowRun("c08-release");
    expect(statsAtHalt.queueDepth).toBe(Q);
    const s = k.transportStats!;
    expect(s.queueDepth).toBe(0);
    expect(s.queuedBytes).toBe(0);
    const t = (k as unknown as { transport: { queue: unknown[]; isClosed: boolean; isSealed: boolean } }).transport;
    expect(t.queue).toHaveLength(0);
    expect(t.isClosed).toBe(true);
    expect(t.isSealed).toBe(true); // nothing can be enqueued again for this instance
  });
});
