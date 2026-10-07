/**
 * C26 — H3 transport input bounding.
 *
 * Every byte from the adapter's stdout/stderr is bounded BEFORE it can reach JSON.parse,
 * event ingestion, evidence or any Kernel state:
 *   - a DVL1 frame line is at most MAX_FRAME_BYTES (prefix included, counted in bytes while
 *     reading — no provider-supplied size is trusted); longer frames are never parsed;
 *   - an oversized, malformed (not a JSON object with a string `type`) or partial (no
 *     terminating newline at EOF) DVL1 frame is REJECTED and the transport FAILS CLOSED: the
 *     queue is sealed (nothing later is processed) and the Kernel halts the instance;
 *   - non-frame noise lines longer than the cap are discarded (bounded head kept), and each
 *     diagnostic stream (stderr, stdout noise, overflow) is capped at
 *     MAX_DIAGNOSTIC_STREAM_BYTES per instance — excess is counted and dropped;
 *   - rejection reasons/previews are bounded (MAX_DIAGNOSTIC_DETAIL_BYTES) and escaped.
 */
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedText, encodeFrame, LineSplitter } from "../kernel/frame.js";
import type { Kernel } from "../kernel/kernel.js";
import { NdjsonTransport, type TransportIssue } from "../kernel/ndjson-transport.js";
import * as types from "../kernel/types.js";
import { frame, makeKernel, runScenario, waitForEvent } from "./harness.js";

const MAX_FRAME_BYTES = (types as Record<string, unknown>).MAX_FRAME_BYTES as number;
const MAX_DIAG = (types as Record<string, unknown>).MAX_DIAGNOSTIC_STREAM_BYTES as number;
const MAX_DETAIL = (types as Record<string, unknown>).MAX_DIAGNOSTIC_DETAIL_BYTES as number;
const RESERVE = (types as Record<string, unknown>).DIAGNOSTIC_CAP_MARKER_RESERVE as number;
/** Payload bytes in a capped diagnostic file (file size minus the one-time cap marker). */
const payloadOf = (file: string) => {
  const b = fs.readFileSync(file);
  const i = b.lastIndexOf("\n[DVL: diagnostic cap of");
  return i === -1 ? b.length : i;
};

let kernels: Kernel[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(kernels.map((x) => x.shutdown().catch(() => undefined)));
  kernels = [];
});
const track = (k: Kernel) => (kernels.push(k), k);
const flush = () => new Promise((r) => setImmediate(r));

/** A transport on a fake child: the test writes the pipes directly. */
function fakeTransport(extra: { maxIncomingBytes?: number; maxQueuedFrames?: number; block?: boolean } = {}) {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough() }) as unknown as ChildProcess;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dvl-c26-"));
  const frames: Record<string, unknown>[] = [];
  const issues: TransportIssue[] = [];
  const t = new NdjsonTransport(child, {
    spoolDir: dir,
    diagnosticsName: "diagnostics",
    adapterInstanceId: "ainst_00000000000000000000",
    maxQueuedFrames: extra.maxQueuedFrames ?? 1024,
    maxQueuedBytes: 16 * 1024 * 1024,
    maxIncomingBytes: extra.maxIncomingBytes ?? 1024 * 1024 * 1024,
    onFrame: async (f) => {
      frames.push(f);
      if (extra.block) await new Promise(() => {});
    },
    onIssue: (i) => issues.push(i),
  });
  const out = (s: string | Buffer) => child.stdout!.emit("data", Buffer.isBuffer(s) ? s : Buffer.from(s));
  const err = (s: string | Buffer) => child.stderr!.emit("data", Buffer.isBuffer(s) ? s : Buffer.from(s));
  const end = () => child.stdout!.emit("end");
  const rejected = () => issues.filter((i) => (i as { kind: string }).kind === "input_rejected") as unknown as { reason: string; bytes: number; limit?: number; detail: string }[];
  return { t, out, err, end, frames, issues, rejected };
}
const hb = (n: number, extra: Record<string, unknown> = {}) => ({ type: "heartbeat", adapterSequence: n, actorId: "a", actorSequence: n, runId: "r", attempt: 1, ...extra });
/** A valid DVL1 frame line (newline included) of exactly `bytes` bytes, prefix + JSON + "\n" excluded from nothing. */
function frameOfSize(lineBytes: number): string {
  const base = encodeFrame(hb(1, { payload: { pad: "" } }));
  const pad = lineBytes - Buffer.byteLength(base);
  return encodeFrame(hb(1, { payload: { pad: "x".repeat(pad) } }));
}

describe("C26 H3 transport input bounding — limits", () => {
  it("0. explicit limits exist: frame cap, diagnostic stream cap, diagnostic detail cap", () => {
    expect(MAX_FRAME_BYTES).toBe(1024 * 1024);
    expect(MAX_DIAG).toBe(8 * 1024 * 1024);
    expect(MAX_DETAIL).toBe(256);
    expect(types.MAX_INLINE_PAYLOAD_BYTES).toBeLessThan(MAX_FRAME_BYTES);
  });
});

describe("C26 H3 transport input bounding — transport (fake child)", () => {
  it("1. an oversized DVL1 frame is rejected BEFORE JSON.parse and the transport fails closed", async () => {
    const x = fakeTransport();
    const parse = vi.spyOn(JSON, "parse");
    const big = frameOfSize(MAX_FRAME_BYTES + 2); // line (without "\n") is MAX_FRAME_BYTES + 1 bytes: one over
    expect(Buffer.byteLength(big) - 1).toBe(MAX_FRAME_BYTES + 1);
    // Delivered in small chunks: the cap is enforced while reading, never by a claimed length.
    for (let i = 0; i < big.length; i += 65536) x.out(big.slice(i, i + 65536));
    await flush();
    const body = big.slice("DVL1:".length, -1); // the exact JSON text of the oversized frame
    expect(parse.mock.calls.filter(([s]) => typeof s === "string" && (s === body || s.length >= body.length))).toEqual([]);
    expect(x.frames).toEqual([]);
    expect(x.rejected()).toEqual([expect.objectContaining({ reason: "frame_too_large", limit: MAX_FRAME_BYTES })]);
    expect(x.rejected()[0]!.bytes).toBeGreaterThan(MAX_FRAME_BYTES);
    // Fail closed: a perfectly valid frame afterwards is not processed.
    x.out(encodeFrame(hb(2)));
    await flush();
    expect(x.frames).toEqual([]);
    expect(x.t.isSealed).toBe(true);
  });

  it("2. a valid frame exactly AT the limit (and below) is accepted", async () => {
    for (const size of [MAX_FRAME_BYTES, MAX_FRAME_BYTES - 1, 64]) {
      const x = fakeTransport();
      const line = size === 64 ? encodeFrame(hb(1)) : frameOfSize(size + 1); // +1: the "\n"
      if (size !== 64) expect(Buffer.byteLength(line) - 1).toBe(size);
      x.out(line);
      await flush();
      expect(x.frames, `size ${size}`).toHaveLength(1);
      expect(x.rejected()).toEqual([]);
    }
  });

  it("3. a malformed DVL1 frame is rejected (no state), fails closed; later valid frames are not processed", async () => {
    for (const bad of ["DVL1:{this is not json", "DVL1:[1,2,3]", 'DVL1:{"no":"type"}', "DVL1:null", 'DVL1:{"type":""}']) {
      const x = fakeTransport();
      x.out(encodeFrame(hb(1))); // valid before: processed (ordered before the violation)
      x.out(bad + "\n");
      x.out(encodeFrame(hb(2)));
      await flush();
      expect(x.frames.map((f) => f.adapterSequence), bad).toEqual([1]);
      expect(x.rejected(), bad).toEqual([expect.objectContaining({ reason: "malformed_frame" })]);
      expect(x.t.isSealed).toBe(true);
    }
  });

  it("4. a partial / truncated frame at EOF (no terminating newline) is never parsed into a frame", async () => {
    const x = fakeTransport();
    x.out(encodeFrame(hb(1)));
    x.out(encodeFrame(hb(2)).slice(0, -1)); // complete JSON, but no "\n"
    x.end();
    await flush();
    expect(x.frames.map((f) => f.adapterSequence)).toEqual([1]);
    expect(x.rejected()).toEqual([expect.objectContaining({ reason: "partial_frame" })]);
    // A truncated frame mid-JSON at EOF: same.
    const y = fakeTransport();
    y.out(encodeFrame(hb(1)).slice(0, 20));
    y.end();
    await flush();
    expect(y.frames).toEqual([]);
    expect(y.rejected()).toEqual([expect.objectContaining({ reason: "partial_frame" })]);
    // A partial NON-frame line at EOF is just noise.
    const z = fakeTransport();
    z.out("trailing noise without newline");
    z.end();
    await flush();
    expect(z.rejected()).toEqual([]);
  });

  it("5. rejected input produces bounded, escaped diagnostics only", async () => {
    const x = fakeTransport();
    const evil = "DVL1:{" + "\u001b[31m\u0000".repeat(10) + "Z".repeat(500_000);
    x.out(evil + "\n");
    await flush();
    const r = x.rejected()[0]!;
    expect(r.reason).toBe("malformed_frame");
    expect(Buffer.byteLength(r.detail)).toBeLessThanOrEqual(MAX_DETAIL);
    expect(r.detail).not.toMatch(/[\u0000-\u001f]/); // control bytes escaped, never raw
    // The noise spool gets one bounded rejection line, not the 500 KB body.
    expect(fs.statSync(x.t.noiseSpoolPath).size).toBeLessThanOrEqual(2 * MAX_DETAIL + 200);
    for (const i of x.issues) expect(Buffer.byteLength(JSON.stringify(i))).toBeLessThanOrEqual(4 * MAX_DETAIL + 512);
  });

  it("6. huge stderr noise is bounded on disk; excess is counted and dropped; draining continues", async () => {
    const x = fakeTransport();
    const chunk = Buffer.alloc(1024 * 1024, 0x65);
    for (let i = 0; i < 20; i++) x.err(chunk); // 20 MiB
    await flush();
    const size = fs.statSync(x.t.stderrSpoolPath).size;
    expect(size).toBeLessThanOrEqual(MAX_DIAG); // exact cap, marker included
    expect(payloadOf(x.t.stderrSpoolPath)).toBe(MAX_DIAG - RESERVE);
    expect(x.t.stats.stderrBytes).toBe(20 * 1024 * 1024); // every byte was still read (drained)
    expect(x.t.stats.diagnosticBytesDropped).toBe(20 * 1024 * 1024 - (MAX_DIAG - RESERVE)); // exact accounting
  });

  it("7. huge stdout noise is bounded on disk; an over-long NON-frame line is discarded, not fatal", async () => {
    const x = fakeTransport();
    const line = "noise ".repeat(20) + "\n";
    const chunk = line.repeat(Math.floor((1024 * 1024) / line.length));
    for (let i = 0; i < 20; i++) x.out(chunk); // ~20 MiB of short noise lines
    await flush();
    const size = fs.statSync(x.t.noiseSpoolPath).size;
    expect(size).toBeLessThanOrEqual(MAX_DIAG);
    expect(x.t.stats.diagnosticBytesDropped).toBeGreaterThan(10 * 1024 * 1024);
    // A single 3 MiB noise line (no DVL1 prefix): discarded with a bounded head; not a protocol failure.
    const y = fakeTransport();
    y.out("n".repeat(3 * 1024 * 1024) + "\n");
    y.out(encodeFrame(hb(1)));
    await flush();
    expect(y.rejected()).toEqual([]);
    expect(y.frames).toHaveLength(1);
    expect(fs.statSync(y.t.noiseSpoolPath).size).toBeLessThanOrEqual(2 * MAX_DETAIL + 200);
  });

  it("8. many small frames cannot grow memory: the queue is bounded and seals (fail closed)", async () => {
    const x = fakeTransport({ maxQueuedFrames: 64, block: true });
    const many = Array.from({ length: 5000 }, (_, i) => encodeFrame(hb(i + 1))).join("");
    x.out(many);
    await flush();
    expect(x.t.stats.queueDepth).toBeLessThanOrEqual(64);
    expect(x.t.stats.queueHighWater).toBeLessThanOrEqual(64);
    expect(x.t.isSealed).toBe(true);
    expect(x.issues.some((i) => (i as { kind: string }).kind === "queue_overflow")).toBe(true);
    expect(x.frames).toHaveLength(1); // only the first reached the (blocked) handler
  });
});

describe("C26 H3 transport input bounding — Kernel (real adapter)", () => {
  /** An idle run with a started action: the state we compare against after rejected input. */
  async function liveRun(tag: string) {
    const k = track(makeKernel(tag));
    k.start();
    await k.describe();
    const id = await k.startRun({ role: "builder", goal: "x", acceptanceCriteria: [], scope: ["src/**"], scenario: "idle" });
    const req = (p: unknown) => (k as unknown as { request: (t: string, p: unknown) => Promise<unknown> }).request("adapter.ping", p);
    await req({ emit: [frame("run.started", id.runId, 1, "actor_root"), frame("action.started", id.runId, 1, "actor_root", { actionId: "act_1", kind: "test" })] });
    await k.settle();
    const snap = () => ({
      accepted: k.store.all().filter((e) => e.origin === "adapter" && e.trust === "untrusted_observation").map((e) => e.eventId),
      evidence: k.store.allEvidence().map((e) => e.evidenceId),
      registrations: k.store.ofType("kernel.artifact_registered").length,
      actors: JSON.stringify(k.actorsOf(id.runId)),
    });
    return { k, id, req, before: snap(), snap };
  }
  const halted = (k: Kernel) => waitForEvent(k, (e) => e.type === "kernel.safety_halt", 10_000);
  const maxLogLine = (k: Kernel) => Math.max(...fs.readFileSync(k.store.eventsPath, "utf8").split("\n").map((l) => Buffer.byteLength(l)));

  for (const [label, payload] of [
    ["oversized frame (2 MiB)", (runId: string) => ({ padded: { frame: frame("action.finished", runId, 1, "actor_root", { actionId: "act_1", kind: "test", exitCode: 0 }), padBytes: 2 * 1024 * 1024 } })],
    ["malformed frame", () => ({ raw: ['DVL1:{"type":"action.finished","payload":{"actionId":"act_1"' + "Q".repeat(10_000)] })],
  ] as const) {
    it(`9. ${label}: no Kernel state change from the input; the instance is halted (fail closed); diagnostics bounded`, async () => {
      const { k, id, req, before, snap } = await liveRun(`c26-${label.split(" ")[0]}`);
      void req(payload(id.runId)).catch(() => undefined); // the pong is never processed: sealed
      const h = await halted(k);
      expect((h.payload as { kind: string; reason?: string }).kind).toBe("transport_input_rejected");
      await k.settle();
      expect(snap()).toEqual(before); // nothing from the rejected input was applied
      expect(k.store.allEvidence()).toEqual([]);
      expect(k.runStatus(id.runId)).toBe("halted");
      expect(maxLogLine(k)).toBeLessThan(8 * 1024); // no attacker body in the durable log
    });
  }

  it("10. partial frame at EOF from the real adapter: never applied (no Evidence for the action)", async () => {
    const { k, id, req, before, snap } = await liveRun("c26-partial");
    void req({ unterminated: frame("action.finished", id.runId, 1, "actor_root", { actionId: "act_1", kind: "test", exitCode: 0 }) }).catch(() => undefined);
    await k.waitClosed(10_000);
    await k.settle();
    expect(snap().evidence).toEqual(before.evidence);
    expect(k.store.allEvidence()).toEqual([]);
    expect(k.store.ofType("kernel.transport_issue").concat(k.store.ofType("kernel.safety_halt")).some((e) => JSON.stringify(e.payload).includes("partial_frame"))).toBe(true);
  });

  it("11. valid traffic still works: a 100 KiB inline payload (below the frame cap) and H1/H2 scenarios finish", async () => {
    const k = track(makeKernel("c26-inline"));
    expect((await runScenario(k, "oversized-inline")).status).toBe("finished");
    expect(k.store.ofType("kernel.safety_halt")).toEqual([]);
    for (const scenario of ["happy", "oversized-spooled", "noisy"]) {
      const kk = track(makeKernel(`c26-${scenario}`));
      expect((await runScenario(kk, scenario)).status, scenario).toBe("finished");
      expect(kk.store.ofType("kernel.safety_halt"), scenario).toEqual([]);
    }
  });
});

describe("C26 H3 transport input bounding — review fixes", () => {
  it("12. an OPEN oversized DVL1 line is rejected the moment it crosses the cap — no newline/EOF needed; reported once", async () => {
    const x = fakeTransport();
    x.out("DVL1:");
    const chunk = "x".repeat(65536);
    let sent = 5;
    while (sent + chunk.length <= MAX_FRAME_BYTES) {
      x.out(chunk);
      sent += chunk.length;
    }
    expect(x.t.isSealed).toBe(false); // at most the cap so far: not rejected
    expect(x.rejected()).toEqual([]);
    x.out(chunk); // crosses the cap; stream stays open
    expect(x.t.isSealed).toBe(true);
    expect(x.t.stats.inputRejected).toBe(1);
    expect(x.rejected()).toEqual([expect.objectContaining({ reason: "frame_too_large", limit: MAX_FRAME_BYTES })]);
    for (let i = 0; i < 40; i++) x.out(chunk); // drained and discarded, never parsed
    x.out("\n" + encodeFrame(hb(2)));
    x.end();
    await flush();
    expect(x.rejected()).toHaveLength(1); // newline / EOF add no second rejection
    expect(x.frames).toEqual([]);
  });

  it("13. Kernel: a completion queued behind a gated frame never becomes Evidence once an open oversized line crosses the cap", async () => {
    let release!: () => void;
    let held = true;
    const gate = new Promise<void>((r) => (release = r));
    const k = track(makeKernel("c26-open-gated", { frameGate: async (t) => void (held && t === "heartbeat" && (await gate)) }));
    k.start();
    await k.describe();
    const id = await k.startRun({ role: "builder", goal: "x", acceptanceCriteria: [], scope: ["src/**"], scenario: "idle" });
    const req = (p: unknown) => (k as unknown as { request: (t: string, p: unknown) => Promise<unknown> }).request("adapter.ping", p);
    await req({ emit: [frame("run.started", id.runId, 1, "actor_root"), frame("action.started", id.runId, 1, "actor_root", { actionId: "act_1", kind: "test" })] });
    await k.settle();
    // heartbeat (gated) + a valid completion queued behind it, then an OPEN 1.06 MiB DVL1 line.
    void req({
      emit: [frame("heartbeat", id.runId, 1, "actor_root"), frame("action.finished", id.runId, 1, "actor_root", { actionId: "act_1", kind: "test", exitCode: 0 })],
      openLine: { bytes: 17 * 65536 },
    }).catch(() => undefined);
    await waitForEvent(k, (e) => e.type === "kernel.safety_halt", 10_000); // fired while the line is still open
    held = false;
    release();
    await k.settle();
    await k.waitClosed(10_000);
    expect(k.store.ofType("kernel.safety_halt")).toHaveLength(1);
    expect((k.store.ofType("kernel.safety_halt")[0]!.payload as { kind: string; reason: string }).kind).toBe("transport_input_rejected");
    expect(k.store.allEvidence()).toEqual([]); // the queued completion was fenced, not applied
    expect(k.runStatus(id.runId)).toBe("halted");
  });

  it("14. Kernel: an oversized open line from a STALE instance is recorded, never halts the current instance", async () => {
    const k = track(makeKernel("c26-open-stale"));
    k.start();
    await k.describe();
    const oldChild = (k as unknown as { child: ChildProcess }).child;
    const oldAid = k.currentAdapterInstanceId!;
    k.restartAdapter({ force: true });
    await k.describe();
    const current = k.currentAdapterInstanceId!;
    expect(current).not.toBe(oldAid);
    oldChild.stdout!.emit("data", Buffer.from("DVL1:" + "y".repeat(MAX_FRAME_BYTES))); // crosses the cap, open
    await k.settle();
    const stale = k.store.ofType("kernel.transport_issue").map((e) => e.payload as { kind: string; stale?: boolean; adapterInstanceId?: string });
    expect(stale).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "input_rejected", stale: true, adapterInstanceId: oldAid })]));
    expect(k.store.ofType("kernel.safety_halt").filter((e) => (e.payload as { adapterInstanceId?: string }).adapterInstanceId === current)).toEqual([]);
    expect(k.currentAdapterInstanceId).toBe(current);
    await k.describe(); // the current instance still answers
  });

  it("15. after the seal, refused DVL1 lines are stored as bounded escaped records — never raw, never parsed", async () => {
    const x = fakeTransport();
    x.out("DVL1:{bad\n"); // seals
    const parse = vi.spyOn(JSON, "parse");
    const evil = "DVL1:{" + '\u001b\u0000"'.repeat(100_000);
    x.out(evil + "\n");
    x.out(encodeFrame(hb(9)));
    await flush();
    expect(parse.mock.calls.filter(([s]) => typeof s === "string" && s.length > 1000)).toEqual([]);
    const recs = fs.readFileSync(x.t.overflowSpoolPath, "utf8").split("\n").filter(Boolean);
    expect(recs).toHaveLength(2);
    expect(x.t.stats.framesRejected).toBe(2);
    expect(recs[0]).toMatch(new RegExp(`^\\[REFUSED input_rejected bytes=${Buffer.byteLength(evil)}\\] `));
    for (const r of recs) {
      expect(Buffer.byteLength(r)).toBeLessThanOrEqual(MAX_DETAIL + 64);
      expect(r).not.toMatch(/[\u0000-\u001f]/); // no raw control bytes
    }
    expect(x.frames).toEqual([]);
  });

  it("16. every diagnostic stream stops at EXACTLY the cap (marker included): crossing by one byte, many small writes, queue overflow", async () => {
    // stderr: cap + 1 byte.
    const a = fakeTransport();
    a.err(Buffer.alloc(MAX_DIAG + 1, 0x61));
    await flush();
    expect(fs.statSync(a.t.stderrSpoolPath).size).toBeLessThanOrEqual(MAX_DIAG);
    expect(a.t.stats.diagnosticBytesDropped).toBe(MAX_DIAG + 1 - payloadOf(a.t.stderrSpoolPath));
    // stdout noise: many small writes.
    const b = fakeTransport();
    const line = "small noise line\n";
    let total = 0;
    for (let i = 0; i < 9; i++) {
      const c = line.repeat(Math.floor((1024 * 1024) / line.length));
      b.out(c);
      total += Buffer.byteLength(c);
    }
    await flush();
    expect(fs.statSync(b.t.noiseSpoolPath).size).toBeLessThanOrEqual(MAX_DIAG);
    expect(b.t.stats.diagnosticBytesDropped).toBe(total - payloadOf(b.t.noiseSpoolPath));
    for (const f of [a.t.stderrSpoolPath, b.t.noiseSpoolPath]) expect(fs.readFileSync(f, "utf8").endsWith("further bytes dropped]\n"), f).toBe(true); // marker last, once
    // queue overflow: seal, then far more refused frames than fit.
    const c = fakeTransport();
    c.out("DVL1:{bad\n");
    const refused = encodeFrame(hb(1, { payload: { pad: "p".repeat(400) } }));
    const batch = refused.repeat(2000);
    for (let i = 0; i < 30; i++) c.out(batch);
    await flush();
    expect(fs.statSync(c.t.overflowSpoolPath).size).toBeLessThanOrEqual(MAX_DIAG);
    expect(c.t.stats.framesRejected).toBe(60_000);
    expect(c.t.stats.diagnosticBytesDropped).toBeGreaterThan(0);
  });

  it("17. the overflow preview owns at most its 256 bytes; no full-size concatenation of an over-cap line", () => {
    const heads: string[] = [];
    const s = new LineSplitter(() => undefined, () => undefined, MAX_FRAME_BYTES, undefined, (i) => heads.push(i.head));
    const concat = vi.spyOn(Buffer, "concat");
    const big = Buffer.alloc(32 * 1024 * 1024, 0x78);
    big.write("DVL1:", 0);
    s.push(big);
    const head = (s as unknown as { overflowHead: Buffer }).overflowHead;
    expect(head.length).toBeLessThanOrEqual(256);
    expect(head.buffer.byteLength).toBeLessThanOrEqual(256); // independently owned, not a view
    expect(concat.mock.calls.filter(([list]) => (list as Buffer[]).reduce((n, b) => n + b.length, 0) > 1024)).toEqual([]);
    expect(heads).toHaveLength(1);
    expect(heads[0]!.startsWith("DVL1:")).toBe(true);
  });

  it("18. the FIRST refused batch uses the same budgeted collection: exact cap, whole escaped records, exact accounting; later batches too", async () => {
    const x = fakeTransport();
    x.out("DVL1:{bad\n"); // seal (overflow file not created yet)
    const hostile = encodeFrame(hb(1, { pad: '\u0000\u001b"\\'.repeat(100) }));
    const rec = `[REFUSED input_rejected bytes=${Buffer.byteLength(hostile) - 1}] ${boundedText(hostile.slice(0, -1))}\n`;
    const r = Buffer.byteLength(rec);
    let peak = 0;
    const t = x.t as unknown as { reject: (l: string) => void; pendingOverflowBytes: number };
    const orig = t.reject.bind(t);
    t.reject = (l: string) => {
      orig(l);
      peak = Math.max(peak, t.pendingOverflowBytes);
    };
    const N = 40_000; // ~N*r ≈ 12 MB of records in ONE chunk, before the overflow file exists
    x.out(hostile.repeat(N));
    await flush();
    const file = x.t.overflowSpoolPath;
    const size = fs.statSync(file).size;
    expect(size).toBeLessThanOrEqual(MAX_DIAG);
    expect(peak).toBeLessThanOrEqual(MAX_DIAG - RESERVE); // collection itself is budgeted
    const txt = fs.readFileSync(file, "utf8");
    expect(txt.endsWith("further bytes dropped]\n")).toBe(true);
    expect(txt.split("[DVL: diagnostic cap").length).toBe(2); // marker once, last
    expect(txt).not.toMatch(/[\u0000-\u0009\u000b-\u001f]/); // no raw control bytes (newline separators only)
    const records = txt.slice(0, payloadOf(file)).split("\n").filter(Boolean);
    for (const l of records) expect(l + "\n").toBe(rec); // every record whole, identical, bounded representation
    const k = records.length;
    expect(k * r).toBe(payloadOf(file));
    expect(k).toBe(Math.floor((MAX_DIAG - RESERVE) / r));
    expect(x.t.stats.framesRejected).toBe(N);
    expect(x.t.stats.diagnosticBytesDropped).toBe((N - k) * r); // exact accounting
    // A later batch obeys the same rules: nothing more written, every byte counted.
    x.out(hostile.repeat(1000));
    await flush();
    expect(fs.statSync(file).size).toBe(size);
    expect(x.t.stats.diagnosticBytesDropped).toBe((N + 1000 - k) * r);
    expect(x.frames).toEqual([]);
  });

  it("19. escaped previews never split an escape: ≤ cap, always decodable, a prefix of the input, no raw control characters", () => {
    const alphabet = ['"', "\\", "\u0000", "\u001b", "\n", "\r", "\t", "a", "é", "漢", "😀", "\ud800", "/", "\u007f"];
    for (let seed = 0; seed < alphabet.length; seed++) {
      for (let len = 1; len <= 400; len += 7) {
        const input = Array.from({ length: len }, (_, i) => alphabet[(i * 7 + seed) % alphabet.length]).join("");
        const out = boundedText(input);
        expect(Buffer.byteLength(out)).toBeLessThanOrEqual(MAX_DETAIL);
        expect(out).not.toMatch(/[\u0000-\u001f]/);
        expect(/(^|[^\\])(\\\\)*\\(u[0-9a-fA-F]{0,3})?$/.test(out)).toBe(false); // no trailing partial escape
        const decoded = JSON.parse(`"${out}"`) as string;
        expect(input.startsWith(decoded)).toBe(true);
      }
    }
  });

  it("20. hostile refused-frame previews truncated near the limit still decode; the C08 reader recovers adapterSequence order", async () => {
    const x = fakeTransport();
    x.out("DVL1:{bad\n");
    const nasty = '"\\\u0000\u001b\né漢😀';
    // Shift the alignment ("a" × i%12) before long runs of 6-byte escapes so the 256-byte cut
    // lands at every offset inside an escape across the 50 frames; the rest is mixed hostile text.
    const lines = Array.from({ length: 50 }, (_, i) =>
      encodeFrame({ type: "heartbeat", adapterSequence: 100 + i, pad: "a".repeat(i % 12) + (i % 2 ? "\u0000".repeat(80) : '\\"'.repeat(60)) + nasty.repeat(5) }),
    );
    x.out(lines.join(""));
    await flush();
    const recs = fs.readFileSync(x.t.overflowSpoolPath, "utf8").split("\n").filter(Boolean);
    expect(recs).toHaveLength(50);
    const seqs = recs.map((l) => {
      expect(l).not.toMatch(/[\u0000-\u001f]/);
      const m = /^\[REFUSED \S+ bytes=(\d+)\] (.*)$/.exec(l)!;
      expect(Buffer.byteLength(m[2]!)).toBeLessThanOrEqual(MAX_DETAIL);
      const text = JSON.parse(`"${m[2]}"`) as string; // never throws: no split escape
      expect(text.startsWith("DVL1:")).toBe(true);
      return Number(/"adapterSequence":(\d+)/.exec(text)![1]);
    });
    expect(seqs).toEqual(lines.map((_, i) => 100 + i)); // order preserved
    expect(fs.statSync(x.t.overflowSpoolPath).size).toBeLessThanOrEqual(MAX_DIAG);
  });
});

describe("C26 H3 transport input bounding — terminal diagnostic cap", () => {
  const B = MAX_DIAG - RESERVE; // payload allowance per stream
  const MARK = "\n[DVL: diagnostic cap of";
  /** The marker is present exactly once and is the final bytes; file ≤ cap. */
  function expectMarkerLast(file: string) {
    const txt = fs.readFileSync(file, "utf8");
    expect(fs.statSync(file).size).toBeLessThanOrEqual(MAX_DIAG);
    expect(txt.split(MARK).length, file).toBe(2);
    expect(txt.endsWith("further bytes dropped]\n"), file).toBe(true);
    return txt;
  }
  /** Noise lines totalling exactly `bytes` (each < MAX_LINE_BYTES, never DVL1). */
  function noiseOf(bytes: number): string {
    const parts: string[] = [];
    for (let left = bytes; left > 0; ) {
      const n = Math.min(left, 100_000);
      parts.push("n".repeat(n - 1) + "\n");
      left -= n;
    }
    return parts.join("");
  }
  const recOf = (line: string) => `[REFUSED input_rejected bytes=${Buffer.byteLength(line)}] ${boundedText(line)}\n`;
  /** A DVL1 frame line (with "\n") whose bounded refused record is exactly `size` bytes. */
  function refusedOfSize(size: number): string {
    for (let pad = 0; pad < 400; pad++) {
      const line = encodeFrame({ type: "heartbeat", p: "q".repeat(pad) });
      if (Buffer.byteLength(recOf(line.slice(0, -1))) === size) return line;
    }
    throw new Error(`no refused record of ${size} bytes`);
  }
  const BIG = encodeFrame(hb(1, { payload: { pad: "p".repeat(400) } })); // preview fully used
  const rBig = Buffer.byteLength(recOf(BIG.slice(0, -1)));
  const SMALL = encodeFrame({ type: "heartbeat" });
  const rSmall = Buffer.byteLength(recOf(SMALL.slice(0, -1)));
  const markerLen = Buffer.byteLength(`\n[DVL: diagnostic cap of ${MAX_DIAG} bytes reached for diagnostics.queue-overflow.log; further bytes dropped]\n`);
  /** Room left so that the big record does not fit, but the small one still fits AFTER the marker. */
  const ROOM = 250;
  /** Whole refused records totalling exactly B - room (room left in the arithmetic budget). */
  function refusedFill(room: number): string {
    const k = Math.floor((B - room) / rBig) - 1;
    const rem = B - room - k * rBig; // in [rBig, 2·rBig): split into two tailored records
    return BIG.repeat(k) + refusedOfSize(Math.floor(rem / 2)) + refusedOfSize(Math.ceil(rem / 2));
  }

  it("21. stdout noise: after the marker a later smaller line (that fits the arithmetic budget) is dropped and counted; marker stays last", async () => {
    // a) trigger and later line in separate chunks
    const x = fakeTransport();
    x.out(noiseOf(B - 1000)); // 1000 bytes of payload allowance left
    await flush();
    expect(fs.statSync(x.t.noiseSpoolPath).size).toBe(B - 1000);
    x.out("t".repeat(1999) + "\n"); // does not fit: dropped, marker written
    await flush();
    const capped = expectMarkerLast(x.t.noiseSpoolPath);
    expect(payloadOf(x.t.noiseSpoolPath)).toBe(B - 1000);
    const dropped = x.t.stats.diagnosticBytesDropped;
    expect(dropped).toBe(2000);
    x.out("s".repeat(99) + "\n"); // 100 bytes: fits the 1000 left, but the stream is capped
    await flush();
    expect(fs.readFileSync(x.t.noiseSpoolPath, "utf8")).toBe(capped);
    expect(x.t.stats.diagnosticBytesDropped).toBe(dropped + 100);
    // An over-long noise line's [OVERFLOW] record and an input rejection's [REJECTED] record are
    // payload too: dropped and counted, while the rejection still seals and reports.
    const before = x.t.stats.diagnosticBytesDropped;
    x.out("o".repeat(MAX_FRAME_BYTES + 10) + "\n");
    x.out("DVL1:{bad\n");
    await flush();
    expect(fs.readFileSync(x.t.noiseSpoolPath, "utf8")).toBe(capped);
    expect(x.t.stats.diagnosticBytesDropped).toBeGreaterThan(before);
    expect(x.rejected()).toEqual([expect.objectContaining({ reason: "malformed_frame" })]);
    expect(x.t.isSealed).toBe(true);
    x.out(encodeFrame(hb(2)));
    x.end();
    await flush();
    expect(x.frames).toEqual([]);
    expect(fs.readFileSync(x.t.noiseSpoolPath, "utf8")).toBe(capped); // close/flush adds nothing
    // Other streams are independent: stderr is not capped by the noise cap.
    x.err("stderr still written\n");
    expect(fs.readFileSync(x.t.stderrSpoolPath, "utf8")).toBe("stderr still written\n");

    // b) trigger and later smaller line in the SAME chunk: the earlier collected lines are kept,
    //    nothing after the first drop is collected.
    const y = fakeTransport();
    y.out(noiseOf(B - 1000));
    await flush();
    y.out("keep".repeat(10) + "\n" + "t".repeat(1999) + "\n" + "s".repeat(99) + "\n");
    await flush();
    const txt = expectMarkerLast(y.t.noiseSpoolPath);
    expect(txt.slice(0, payloadOf(y.t.noiseSpoolPath))).toBe(noiseOf(B - 1000) + "keep".repeat(10) + "\n");
    expect(y.t.stats.diagnosticBytesDropped).toBe(2100);
  });

  it("22. refused DVL1 records, LATER batch: after the marker a later smaller refused record is dropped and counted; marker stays last", async () => {
    const x = fakeTransport();
    x.out("DVL1:{bad\n"); // seal
    const fill = refusedFill(ROOM);
    // The small record fits the arithmetic budget even after the marker is counted: only the
    // terminal cap state keeps it out.
    expect(rSmall + markerLen).toBeLessThan(ROOM);
    expect(rBig).toBeGreaterThan(ROOM);
    x.out(fill);
    await flush();
    const file = x.t.overflowSpoolPath;
    expect(fs.statSync(file).size).toBe(B - ROOM);
    expect(x.t.stats.diagnosticBytesDropped).toBe(0);
    x.out(BIG); // later batch: does not fit → dropped, marker
    await flush();
    const capped = expectMarkerLast(file);
    expect(payloadOf(file)).toBe(B - ROOM);
    expect(fs.statSync(file).size).toBe(B - ROOM + markerLen); // the precondition's marker length is the real one
    expect(x.t.stats.diagnosticBytesDropped).toBe(rBig);
    x.out(SMALL); // fits the arithmetic budget — must still be dropped
    await flush();
    expect(fs.readFileSync(file, "utf8")).toBe(capped);
    expect(x.t.stats.diagnosticBytesDropped).toBe(rBig + rSmall);
    x.out(SMALL.repeat(5));
    x.end();
    await flush();
    expect(fs.readFileSync(file, "utf8")).toBe(capped);
    expect(x.t.stats.diagnosticBytesDropped).toBe(rBig + 6 * rSmall);
    expect(x.frames).toEqual([]);
    expect(x.rejected()).toHaveLength(1);
  });

  it("23. refused DVL1 records, FIRST batch: trigger and a smaller record in the batch that creates the file; and trigger first, smaller record later", async () => {
    // a) everything in the first batch (overflow file does not exist yet)
    const x = fakeTransport();
    x.out("DVL1:{bad\n");
    const fill = refusedFill(ROOM);
    expect(rSmall + markerLen).toBeLessThan(ROOM);
    x.out(fill + BIG + SMALL);
    await flush();
    const file = x.t.overflowSpoolPath;
    const txt = expectMarkerLast(file);
    expect(payloadOf(file)).toBe(B - ROOM);
    const expectedPayload = fill
      .split("\n")
      .filter(Boolean)
      .map((l) => recOf(l))
      .join("");
    expect(txt.slice(0, payloadOf(file))).toBe(expectedPayload); // collected whole records kept, in order
    expect(x.t.stats.diagnosticBytesDropped).toBe(rBig + rSmall);
    // b) trigger in the first batch, smaller record in a later batch
    const y = fakeTransport();
    y.out("DVL1:{bad\n");
    y.out(fill + BIG);
    await flush();
    const capped = expectMarkerLast(y.t.overflowSpoolPath);
    y.out(SMALL);
    await flush();
    expect(fs.readFileSync(y.t.overflowSpoolPath, "utf8")).toBe(capped);
    expect(y.t.stats.diagnosticBytesDropped).toBe(rBig + rSmall);
  });

  it("24. stderr: after the marker nothing is appended; every later byte is counted as dropped", async () => {
    const x = fakeTransport();
    x.err(Buffer.alloc(B - 1000, 0x61));
    expect(fs.statSync(x.t.stderrSpoolPath).size).toBe(B - 1000);
    x.err(Buffer.alloc(2000, 0x62)); // 1000 written up to the allowance, 1000 dropped, marker
    const capped = expectMarkerLast(x.t.stderrSpoolPath);
    expect(payloadOf(x.t.stderrSpoolPath)).toBe(B);
    expect(x.t.stats.diagnosticBytesDropped).toBe(1000);
    for (const n of [1, 10, 100, 5000]) x.err(Buffer.alloc(n, 0x63));
    expect(fs.readFileSync(x.t.stderrSpoolPath, "utf8")).toBe(capped);
    expect(x.t.stats.diagnosticBytesDropped).toBe(1000 + 5111);
  });

  it("25. the terminal state also holds without arithmetic exhaustion: a capped stream with room left never writes payload or a second marker", async () => {
    // Force the capped state on a stream with plenty of arithmetic room (white-box): every
    // writer path must consult the terminal state, not only the byte counter.
    const x = fakeTransport();
    x.out("DVL1:{bad\n"); // seal; one [REJECTED] noise line written
    await flush();
    const t = x.t as unknown as { markCapped: (f: string) => void };
    for (const f of [x.t.noiseSpoolPath, x.t.stderrSpoolPath]) t.markCapped(path.basename(f));
    const noise = expectMarkerLast(x.t.noiseSpoolPath);
    const stderr = expectMarkerLast(x.t.stderrSpoolPath);
    const before = x.t.stats.diagnosticBytesDropped;
    x.out("noise\n");
    x.err("err\n");
    x.end();
    await flush();
    expect(fs.readFileSync(x.t.noiseSpoolPath, "utf8")).toBe(noise);
    expect(fs.readFileSync(x.t.stderrSpoolPath, "utf8")).toBe(stderr);
    expect(x.t.stats.diagnosticBytesDropped).toBe(before + 6 + 4);
  });
});
