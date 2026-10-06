/**
 * C12 — Blocker C: maxIncomingBytes is charged at the drain boundary.
 *
 * Every raw byte read from the adapter's stdout AND stderr is charged to that adapter
 * instance's budget the moment it is received — before line splitting, parsing, queueing,
 * test gates or processing delays — and never again in ingest(). On breach: exactly one
 * safety halt, the instance is killed and fenced, its queue is sealed, and nothing that
 * arrives afterwards becomes protocol truth. A fresh instance gets a fresh budget.
 */
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { encodeFrame } from "../kernel/frame.js";
import { NdjsonTransport, type TransportIssue } from "../kernel/ndjson-transport.js";
import type { Kernel, KernelOptions } from "../kernel/kernel.js";
import { makeKernel, runScenario, startRunLenient, waitForEvent } from "./harness.js";

let kernels: Kernel[] = [];
let releases: (() => void)[] = [];
afterEach(async () => {
  releases.splice(0).forEach((r) => r());
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});
const LIMIT = 8 * 1024;
const task = (scenario: string) => ({ role: "builder", goal: scenario, acceptanceCriteria: ["mock"], scope: ["src/**"], scenario });
const halts = (k: Kernel) => k.store.ofType("kernel.safety_halt").map((e) => e.payload as Record<string, unknown>);

function kernel(tag: string, extra: Partial<KernelOptions> = {}) {
  const k = makeKernel(tag, { limits: { maxIncomingBytes: LIMIT }, ...extra });
  kernels.push(k);
  return k;
}

/** The byte limit may halt the instance before run.start is acked (see startRunLenient). */
async function startOn(k: Kernel, scenario: string) {
  k.start();
  await k.describe();
  return startRunLenient(k, scenario);
}

function expectNoFalseTruth(k: Kernel, runId: string) {
  expect(k.runStatus(runId)).toBe("halted");
  expect(k.store.ofType("kernel.run_finished")).toHaveLength(0);
  expect(k.store.ofType("kernel.evidence_recorded")).toHaveLength(0);
  expect(k.store.ofType("kernel.snapshot_taken")).toHaveLength(0);
  expect(k.store.readEvidenceFromDisk()).toHaveLength(0);
}

function expectBreachMetadata(p: Record<string, unknown>, aid: string, stream: "stdout" | "stderr") {
  expect(p).toMatchObject({ errorClass: "halted_by_safety_limit", kind: "max_incoming_bytes", maxIncomingBytes: LIMIT, adapterInstanceId: aid, stream });
  expect(String(p.reason)).toBe(`maxIncomingBytes ${LIMIT} exceeded`);
  expect(p.incomingBytes as number).toBeGreaterThan(LIMIT);
  expect((p.incomingBytes as number) - (p.triggeringChunkBytes as number)).toBeLessThanOrEqual(LIMIT); // the chunk that crossed it
  expect((p.stdoutBytes as number) + (p.stderrBytes as number)).toBe(p.incomingBytes);
}

describe("C12 maxIncomingBytes at the drain boundary (blocker C)", () => {
  it("non-DVL1 stdout noise trips the limit; one halt; fresh instance gets a fresh budget", async () => {
    const k = kernel("c12-stdout");
    const run = await startOn(k, "stdout-noise-flood");
    const aid = k.currentAdapterInstanceId!;
    expect(await k.waitForRunEnd(run.runId)).toBe("halted");
    await k.waitClosed(10_000);
    const h = halts(k);
    expect(h).toHaveLength(1); // trailing noise kept draining but never re-halted
    expectBreachMetadata(h[0]!, aid, "stdout");
    expectNoFalseTruth(k, run.runId);
    const s = k.transportStats!;
    expect(s.incomingBytes).toBe(s.stdoutBytes + s.stderrBytes); // everything read is charged, once
    expect(s.incomingBytes).toBeGreaterThanOrEqual(h[0]!.incomingBytes as number);

    k.restartAdapter();
    expect(k.transportStats!.incomingBytes).toBe(0);
    await k.describe();
    const r2 = await k.startRun(task("happy"));
    expect(await k.waitForRunEnd(r2.runId)).toBe("finished");
    expect(halts(k)).toHaveLength(1);
  });

  it("stderr volume trips the limit even though it is never parsed", async () => {
    const k = kernel("c12-stderr");
    const run = await startOn(k, "stderr-flood");
    const aid = k.currentAdapterInstanceId!;
    expect(await k.waitForRunEnd(run.runId)).toBe("halted");
    await k.waitClosed(10_000);
    const h = halts(k);
    expect(h).toHaveLength(1);
    expectBreachMetadata(h[0]!, aid, "stderr");
    expectNoFalseTruth(k, run.runId);
    // Diagnostics still drained to the instance's spool (cleanup), byte-exact.
    expect(fs.statSync(k.stderrSpoolPath!).size).toBe(k.transportStats!.stderrBytes);
  });

  it("protocol frames trip the limit while Kernel processing is blocked; nothing after the breach is truth", async () => {
    let held = true;
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    releases.push(() => ((held = false), open()));
    const k = kernel("c12-blocked", {
      frameGate: async (type) => {
        if (held && type === "heartbeat") await gate;
      },
    });
    const run = await startOn(k, "burst-100");
    const aid = k.currentAdapterInstanceId!;
    // The halt must happen with processing still frozen.
    await waitForEvent(k, (e) => e.type === "kernel.safety_halt");
    expect(held).toBe(true);
    expect(k.store.ofType("heartbeat")).toHaveLength(0);
    const h = halts(k);
    expectBreachMetadata(h[0]!, aid, "stdout");
    expect(h[0]!.lastAcceptedAdapterSequence).toBe(2);

    held = false;
    open();
    await k.waitClosed(10_000);
    expect(halts(k)).toHaveLength(1);
    // Accepted truth is exactly seq 1..2; every later frame is fenced or never queued.
    const accepted = k.store.all().filter((e) => e.adapterInstanceId === aid && e.trust === "untrusted_observation" && e.adapterSequence !== undefined);
    expect(accepted.map((e) => e.adapterSequence)).toEqual([1, 2]);
    const s = k.transportStats!;
    const stored = k.store.all().filter((e) => e.origin === "adapter" && e.adapterInstanceId === aid).length;
    expect(stored + s.framesRejected).toBe(s.framesReceived); // every frame accounted for: stored or spooled, never vanished
    // Every A record after the halt is a fenced violation (never truth).
    const haltSeq = k.store.ofType("kernel.safety_halt")[0]!.kernelSequence;
    const afterHalt = k.store.all().filter((e) => e.origin === "adapter" && e.adapterInstanceId === aid && e.kernelSequence > haltSeq);
    expect(afterHalt.every((e) => e.trust === "protocol_violation")).toBe(true);
    expectNoFalseTruth(k, run.runId);
  });

  it("bytes are charged exactly once (no second charge in ingest)", async () => {
    // Measure a clean run's real byte volume, then allow 1.5x of it: double-charging would halt.
    const probe = makeKernel("c12-probe");
    kernels.push(probe);
    await runScenario(probe, "happy");
    await probe.shutdown();
    const total = probe.transportStats!.incomingBytes;
    expect(total).toBeGreaterThan(1000);
    const k = makeKernel("c12-once", { limits: { maxIncomingBytes: Math.ceil(total * 1.5) } });
    kernels.push(k);
    const { status } = await runScenario(k, "happy");
    expect(status).toBe("finished");
    expect(halts(k)).toHaveLength(0);
  });

  it("transport: after a breach the queue is sealed — later frames go to disk, never into memory; one issue", async () => {
    // Deterministic, process-free: a fake child whose pipes the test writes directly.
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough() }) as unknown as ChildProcess;
    const spoolDir = fs.mkdtempSync(path.join(os.tmpdir(), "dvl-c12-unit-"));
    const issues: TransportIssue[] = [];
    let processed = 0;
    const t = new NdjsonTransport(child, {
      spoolDir,
      diagnosticsName: "diagnostics",
      adapterInstanceId: "ainst_00000000000000000000",
      maxQueuedFrames: 1024,
      maxQueuedBytes: 16 * 1024 * 1024,
      maxIncomingBytes: 1_000,
      onFrame: async () => {
        processed++;
        await new Promise(() => {}); // processing blocked forever
      },
      onIssue: (i) => issues.push(i),
    });
    const flush = () => new Promise((r) => setImmediate(r));
    const frame = (n: number) => encodeFrame({ type: "heartbeat", adapterSequence: n, actorId: "a", actorSequence: n, runId: "r", attempt: 1 });

    child.stdout!.emit("data", Buffer.from(frame(1) + frame(2))); // ~200 bytes: under budget
    await flush();
    expect(t.stats.framesReceived).toBe(2);
    expect(processed).toBe(1); // #1 in flight, #2 queued
    expect(t.stats.queueDepth).toBe(1);

    child.stderr!.emit("data", Buffer.alloc(900, 0x61)); // crosses 1000 on stderr
    await flush();
    expect(issues.filter((i) => i.kind === "byte_limit")).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: "byte_limit", stream: "stderr", maxIncomingBytes: 1_000, triggeringChunkBytes: 900 });

    const after = Array.from({ length: 5 }, (_, i) => frame(3 + i)).join("");
    child.stdout!.emit("data", Buffer.from(after));
    child.stderr!.emit("data", Buffer.alloc(5_000, 0x62)); // keeps draining: diagnostics only
    await flush();
    expect(t.stats.framesReceived).toBe(7);
    expect(t.stats.framesRejected).toBe(5); // all post-breach frames refused…
    expect(t.stats.queueDepth).toBe(1); // …none entered the in-memory queue
    expect(t.isSealed).toBe(true);
    expect(fs.readFileSync(t.overflowSpoolPath, "utf8").trim().split("\n")).toHaveLength(5);
    expect(issues.filter((i) => i.kind === "byte_limit")).toHaveLength(1); // still exactly one
    expect(t.stats.incomingBytes).toBe(t.stats.stdoutBytes + t.stats.stderrBytes);
  });
});
