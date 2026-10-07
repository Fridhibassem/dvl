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
import { encodeFrame } from "../kernel/frame.js";
import type { Kernel } from "../kernel/kernel.js";
import { NdjsonTransport, type TransportIssue } from "../kernel/ndjson-transport.js";
import * as types from "../kernel/types.js";
import { frame, makeKernel, runScenario, waitForEvent } from "./harness.js";

const MAX_FRAME_BYTES = (types as Record<string, unknown>).MAX_FRAME_BYTES as number;
const MAX_DIAG = (types as Record<string, unknown>).MAX_DIAGNOSTIC_STREAM_BYTES as number;
const MAX_DETAIL = (types as Record<string, unknown>).MAX_DIAGNOSTIC_DETAIL_BYTES as number;

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
    expect(parse.mock.calls.filter(([s]) => typeof s === "string" && s.length > MAX_FRAME_BYTES)).toEqual([]);
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
    expect(size).toBeGreaterThanOrEqual(MAX_DIAG);
    expect(size).toBeLessThanOrEqual(MAX_DIAG + 512); // + one truncation marker
    expect(x.t.stats.stderrBytes).toBe(20 * 1024 * 1024); // every byte was still read (drained)
    expect(x.t.stats.diagnosticBytesDropped).toBe(20 * 1024 * 1024 - MAX_DIAG);
  });

  it("7. huge stdout noise is bounded on disk; an over-long NON-frame line is discarded, not fatal", async () => {
    const x = fakeTransport();
    const line = "noise ".repeat(20) + "\n";
    const chunk = line.repeat(Math.floor((1024 * 1024) / line.length));
    for (let i = 0; i < 20; i++) x.out(chunk); // ~20 MiB of short noise lines
    await flush();
    const size = fs.statSync(x.t.noiseSpoolPath).size;
    expect(size).toBeLessThanOrEqual(MAX_DIAG + 512);
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
