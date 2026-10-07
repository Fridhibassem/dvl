/**
 * §47 — NDJSON over stdio transport.
 *
 * Two decoupled loops (the core distributed-systems property of this file):
 *
 *   1. DRAIN loop  — 'data' listeners on child stdout/stderr. Never paused, never awaits
 *                    the Kernel. Its only jobs: split lines, classify, enqueue frames,
 *                    write noise/stderr synchronously to the diagnostic spool.
 *   2. PROCESS loop — pulls frames from the in-memory queue and awaits the Kernel's
 *                    (possibly slow) handler one frame at a time, preserving order.
 *
 * A slow Kernel therefore never back-pressures the provider's pipe → no pipe-buffer
 * deadlock (the classic child_process failure where the child blocks on write(1)
 * while the parent blocks waiting for the child).
 *
 * H3 — the frame queue between the two loops is BOUNDED (maxQueuedFrames and
 * maxQueuedBytes) and belongs to exactly one Kernel-assigned adapterInstanceId. The
 * provider is never trusted to slow down: if a frame would exceed either bound, the
 * queue is sealed. That frame and every later frame are written to the instance's
 * overflow diagnostic spool (disk, not memory), counted, never enqueued, never
 * processed, and the Kernel is told once (queue_overflow) so it can halt the instance.
 * Already-queued frames keep strict FIFO order. Draining never stops.
 *
 * H3 (transport input bounding) — nothing the adapter writes reaches JSON.parse or the Kernel
 * unbounded:
 *   - every stdout line is buffered up to MAX_FRAME_BYTES while reading (bytes counted, no
 *     size claim trusted); a longer DVL1 line is discarded unparsed (bounded head kept);
 *   - an oversized, malformed or partial (unterminated at EOF) DVL1 frame is REJECTED: the
 *     queue is sealed at once (fail closed — nothing later is processed or even parsed) and
 *     the Kernel is told once (input_rejected) so it halts the instance;
 *   - noise lines are never parsed; an over-long noise line is discarded with a bounded head;
 *   - each diagnostic stream is capped at MAX_DIAGNOSTIC_STREAM_BYTES per instance; excess is
 *     counted (diagnosticBytesDropped) and dropped; draining continues so the child never
 *     blocks on a full pipe;
 *   - attacker-derived text in diagnostics is escaped and ≤ MAX_DIAGNOSTIC_DETAIL_BYTES.
 */
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { boundedText, encodeFrame, isFrameLine, LineSplitter, parseLine } from "./frame.js";
import { DIAGNOSTIC_CAP_MARKER_RESERVE, MAX_DIAGNOSTIC_STREAM_BYTES, MAX_FRAME_BYTES, type CommandFrame } from "./types.js";

export interface TransportStats {
  stdoutBytes: number;
  stderrBytes: number;
  framesReceived: number;
  noiseLines: number;
  malformedLines: number;
  overflowLines: number;
  queueHighWater: number;
  /** H3 — current queue occupancy (frames / raw bytes). */
  queueDepth: number;
  queuedBytes: number;
  queuedBytesHighWater: number;
  /** H3 — frames that arrived after the queue was sealed; spooled, never processed. */
  framesRejected: number;
  /**
   * H2 — rejected frames NOT written to the overflow spool because its path was already
   * occupied (e.g. a planted symlink/hard link). Still counted and never processed.
   */
  overflowSpoolRefused: number;
  /**
   * H2 — diagnostics operations (create/append) the sink refused. After the first refusal
   * diagnostics for this instance are disabled (fail closed); later ones are counted here too.
   */
  diagnosticWritesRefused: number;
  /** H2 — diagnostics bytes (stderr, noise, overflow lines) not written because of a refusal. */
  diagnosticBytesRefused: number;
  /** H3 — DVL1 frames rejected as oversized / malformed / partial (never parsed into state). */
  inputRejected: number;
  /** H3 — diagnostic bytes not written because a stream reached MAX_DIAGNOSTIC_STREAM_BYTES. */
  diagnosticBytesDropped: number;
  /** Blocker C — raw bytes charged to maxIncomingBytes: every stdout + stderr byte, once, at read. */
  incomingBytes: number;
}

export type TransportIssue =
  | { kind: "noise"; line: string }
  | { kind: "malformed"; reason: string; preview: string }
  | { kind: "overflow"; bytes: number; head: string }
  | {
      kind: "queue_overflow";
      adapterInstanceId: string;
      maxQueuedFrames: number;
      maxQueuedBytes: number;
      depthAtViolation: number;
      bytesAtViolation: number;
      rejectedFrameBytes: number;
      /** Untrusted: what the rejected frame claims. Diagnostic only. */
      rejectedAdapterSequence: number | null;
      lastQueuedAdapterSequence: number | null;
      overflowSpoolPath: string;
    }
  | {
      kind: "byte_limit";
      adapterInstanceId: string;
      stream: "stdout" | "stderr";
      maxIncomingBytes: number;
      incomingBytes: number;
      stdoutBytes: number;
      stderrBytes: number;
      triggeringChunkBytes: number;
    }
  /**
   * H3 — a DVL1 frame was rejected before reaching the Kernel: oversized (frame_too_large),
   * not a JSON object with a string `type` (malformed_frame), or unterminated at EOF
   * (partial_frame). The queue is sealed (fail closed). `detail` is escaped and bounded.
   */
  | { kind: "input_rejected"; adapterInstanceId: string; reason: "frame_too_large" | "malformed_frame" | "partial_frame"; bytes: number; limit?: number; detail: string }
  /** H2 — the diagnostics sink refused an operation; diagnostics are disabled for this instance. */
  | { kind: "diagnostics_refused"; adapterInstanceId: string; file: string; code: string | null; reason: string };

/** H2 — a diagnostics writer that refuses (throws) instead of writing to an unsafe target. */
export interface DiagnosticSink {
  /** Create the file exclusively (empty). Throws if the path is unsafe or already exists. */
  create(fileName: string): void;
  /** Append to the existing file, revalidated for this write. Throws on refusal. */
  append(fileName: string, data: Buffer): void;
}

export interface TransportOptions {
  spoolDir: string; // .dvl/spool/<adapterInstanceId>
  diagnosticsName: string; // file stem for stderr/noise spool
  /**
   * H2 — where diagnostics go. No descriptor is held between writes: every append re-opens
   * and re-validates the target. The Kernel supplies a sink confined to the instance's Kernel
   * spool (EventStore.createDiagnostic/appendDiagnostic). Default: a path-based sink in
   * spoolDir (exclusive no-follow create; no-follow, single-link append) for unit tests.
   */
  diagnosticSink?: DiagnosticSink;
  /** H3 — the instance this transport (and its queue) belongs to. */
  adapterInstanceId: string;
  maxQueuedFrames: number;
  maxQueuedBytes: number;
  /** Blocker C — §49 maxIncomingBytes for this instance, charged at the drain boundary. */
  maxIncomingBytes: number;
  onFrame: (frame: Record<string, unknown>, rawBytes: number, adapterInstanceId: string) => Promise<void> | void;
  onIssue?: (issue: TransportIssue) => void;
  onClose?: (info: { code: number | null; signal: NodeJS.Signals | null }) => void;
}

export class NdjsonTransport {
  readonly stats: TransportStats = {
    stdoutBytes: 0,
    stderrBytes: 0,
    framesReceived: 0,
    noiseLines: 0,
    malformedLines: 0,
    overflowLines: 0,
    queueHighWater: 0,
    queueDepth: 0,
    queuedBytes: 0,
    queuedBytesHighWater: 0,
    framesRejected: 0,
    overflowSpoolRefused: 0,
    diagnosticWritesRefused: 0,
    diagnosticBytesRefused: 0,
    inputRejected: 0,
    diagnosticBytesDropped: 0,
    incomingBytes: 0,
  };
  readonly stderrSpoolPath: string;
  readonly noiseSpoolPath: string;
  /** H3 — frames refused after the queue was sealed land here (created on first use). */
  readonly overflowSpoolPath: string;

  private readonly queue: { frame: Record<string, unknown>; rawBytes: number; adapterInstanceId: string }[] = [];
  private sealed = false;
  private byteLimitBreached = false;
  private readonly sink: DiagnosticSink;
  /** H2 — set at the first sink refusal: no further diagnostics are written (fail closed). */
  private diagnosticsDisabled: string | null = null;
  private overflowCreated = false;
  /** Noise / overflow lines of the chunk being drained, flushed once per chunk. */
  private pendingNoise: string[] = [];
  private pendingOverflow: string[] = [];
  private pendingOverflowFrames = 0;
  /** H3 — bytes written per diagnostic file, and whether its cap marker was written. */
  private readonly diagWritten = new Map<string, number>();
  private readonly diagCapped = new Set<string>();
  /** H3 — streams that dropped bytes while collecting; their marker follows the next flush. */
  private readonly capDue = new Set<string>();
  private inputRejectedReported = false;
  /** H3 — why the queue was sealed (first cause), used in refused-line diagnostics. */
  private sealReason: "queue_overflow" | "byte_limit" | "input_rejected" | null = null;
  /** H3 — bytes waiting in pendingNoise / pendingOverflow (bounded by the remaining budget). */
  private pendingNoiseBytes = 0;
  private pendingOverflowBytes = 0;
  private processing = false;
  private idleWaiters: (() => void)[] = [];
  private closed = false;
  private stdoutEnded = false;
  private stderrEnded = false;
  private exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null;

  constructor(
    private readonly child: ChildProcess,
    private readonly opts: TransportOptions,
  ) {
    fs.mkdirSync(opts.spoolDir, { recursive: true });
    this.stderrSpoolPath = path.join(opts.spoolDir, `${opts.diagnosticsName}.stderr.log`);
    this.noiseSpoolPath = path.join(opts.spoolDir, `${opts.diagnosticsName}.stdout-noise.log`);
    this.overflowSpoolPath = path.join(opts.spoolDir, `${opts.diagnosticsName}.queue-overflow.log`);
    if (!(opts.maxQueuedFrames > 0) || !(opts.maxQueuedBytes > 0)) throw new Error("queue limits must be positive");
    // Synchronous writes: each completes before the next chunk is handled, so diagnostic
    // spool memory is bounded (one chunk) and ordering is exact. Disk is the backpressure sink.
    // H2: stderr/noise files are created exclusively up front (a refusal here fails the
    // spawn); no descriptor is kept — every later append is revalidated by the sink.
    this.sink = opts.diagnosticSink ?? pathSink(opts.spoolDir);
    this.sink.create(path.basename(this.stderrSpoolPath));
    this.sink.create(path.basename(this.noiseSpoolPath));

    const splitter = new LineSplitter(
      (line) => this.classify(line),
      (info) => {
        this.stats.overflowLines++;
        // An oversized DVL1 frame was already rejected when it crossed the cap (below).
        if (isFrameLine(info.head)) return;
        this.writeNoise(`[OVERFLOW ${info.bytes} bytes] ${boundedText(info.head)}\n`);
        this.opts.onIssue?.({ kind: "overflow", bytes: info.bytes, head: boundedText(info.head) });
      },
      MAX_FRAME_BYTES,
      (line) => {
        // H3: the stream ended inside a line. A DVL1 line without its newline is not a
        // complete frame and is never parsed; anything else is noise.
        const l = line.endsWith("\r") ? line.slice(0, -1) : line;
        if (isFrameLine(l)) this.rejectInput("partial_frame", Buffer.byteLength(l), l);
        else this.classify(line);
      },
      (info) => {
        // H3: the moment an open DVL1 line crosses MAX_FRAME_BYTES — no newline or EOF needed
        // — it is rejected: queue sealed, Kernel told (halt). The rest of the line is drained
        // and discarded unparsed; its end produces no second rejection.
        if (isFrameLine(info.head)) this.rejectInput("frame_too_large", info.bytes, info.head);
      },
    );

    // ── DRAIN loop: stdout ── (charged BEFORE splitting/parsing/queueing)
    child.stdout!.on("data", (chunk: Buffer) => {
      this.stats.stdoutBytes += chunk.length;
      this.charge(chunk.length, "stdout");
      splitter.push(chunk);
      this.flushDiagnostics();
    });
    child.stdout!.on("end", () => {
      splitter.end();
      this.flushDiagnostics();
      this.stdoutEnded = true;
      this.maybeClose();
    });

    // ── DRAIN loop: stderr → diagnostic spool (never parsed) ──
    child.stderr!.on("data", (chunk: Buffer) => {
      this.stats.stderrBytes += chunk.length;
      this.charge(chunk.length, "stderr");
      this.writeDiagnostic(path.basename(this.stderrSpoolPath), chunk); // still drained after a breach: diagnostics only
    });
    child.stderr!.on("end", () => {
      this.stderrEnded = true;
      this.maybeClose();
    });

    child.on("exit", (code, signal) => {
      this.exitInfo = { code, signal };
      this.maybeClose();
    });
    // EPIPE on stdin when the child dies must not crash the Kernel.
    child.stdin!.on("error", () => {});
  }

  /** Kernel → Adapter. Honors stdin backpressure. */
  /**
   * Kernel → Adapter. Honors stdin backpressure, but never unboundedly: if the adapter stops
   * reading, the wait for 'drain' ends at `timeoutMs` (rejects) or when stdin closes/errors
   * (the child died). Nothing in the Kernel can be parked forever on an adapter's pipe.
   */
  async send(cmd: CommandFrame, timeoutMs?: number): Promise<void> {
    const stdin = this.child.stdin;
    if (this.closed || !stdin || stdin.destroyed) {
      throw new Error(`transport closed; cannot send ${cmd.type}`);
    }
    if (stdin.write(encodeFrame(cmd))) return;
    await new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => {
        stdin.off("drain", onDrain);
        stdin.off("close", onClose);
        stdin.off("error", onError);
        if (timer) clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };
      const onDrain = () => done();
      const onClose = () => done(new Error(`adapter stdin closed before ${cmd.type} was flushed`));
      const onError = (e: Error) => done(new Error(`adapter stdin error while sending ${cmd.type}: ${e.message}`));
      const timer = timeoutMs !== undefined ? setTimeout(() => done(new Error(`send of ${cmd.type} timed out after ${timeoutMs}ms (adapter not reading stdin)`)), timeoutMs) : null;
      stdin.on("drain", onDrain);
      stdin.on("close", onClose);
      stdin.on("error", onError);
    });
  }

  /** Resolves when every enqueued frame has been processed by the Kernel. */
  whenIdle(): Promise<void> {
    if (!this.processing && this.queue.length === 0) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  get isClosed(): boolean {
    return this.closed;
  }

  private classify(line: string): void {
    if (line.length === 0) return;
    // H3: once sealed (fail closed), DVL1 lines are not even parsed — straight to overflow.
    if (this.sealed && isFrameLine(line)) {
      this.stats.framesReceived++;
      this.reject(line);
      return;
    }
    const parsed = parseLine(line);
    switch (parsed.kind) {
      case "frame": {
        this.stats.framesReceived++;
        if (this.sealed) {
          this.reject(line);
          return;
        }
        const depth = this.queue.length;
        const bytes = this.stats.queuedBytes;
        if (depth + 1 > this.opts.maxQueuedFrames || bytes + parsed.rawBytes > this.opts.maxQueuedBytes) {
          // Seal: never drop silently, never overwrite or reorder what is queued.
          this.sealed = true;
          this.sealReason ??= "queue_overflow";
          this.reject(line);
          const tail = this.queue.at(-1)?.frame.adapterSequence;
          const claimed = parsed.value.adapterSequence;
          this.opts.onIssue?.({
            kind: "queue_overflow",
            adapterInstanceId: this.opts.adapterInstanceId,
            maxQueuedFrames: this.opts.maxQueuedFrames,
            maxQueuedBytes: this.opts.maxQueuedBytes,
            depthAtViolation: depth,
            bytesAtViolation: bytes,
            rejectedFrameBytes: parsed.rawBytes,
            rejectedAdapterSequence: typeof claimed === "number" ? claimed : null,
            lastQueuedAdapterSequence: typeof tail === "number" ? tail : null,
            overflowSpoolPath: this.overflowSpoolPath,
          });
          return;
        }
        this.queue.push({ frame: parsed.value, rawBytes: parsed.rawBytes, adapterInstanceId: this.opts.adapterInstanceId });
        this.stats.queueDepth = this.queue.length;
        this.stats.queuedBytes += parsed.rawBytes;
        this.stats.queueHighWater = Math.max(this.stats.queueHighWater, this.queue.length);
        this.stats.queuedBytesHighWater = Math.max(this.stats.queuedBytesHighWater, this.stats.queuedBytes);
        void this.pump();
        return;
      }
      case "noise":
        this.stats.noiseLines++;
        this.writeNoise(parsed.line + "\n");
        this.opts.onIssue?.({ kind: "noise", line: boundedText(parsed.line) });
        return;
      case "malformed":
        // H3: a DVL1 line that is not a valid frame carries no state — and the stream can no
        // longer be trusted to be in sync with the adapter: reject and fail closed.
        this.stats.malformedLines++;
        if (parsed.reason === "frame_too_large") this.rejectInput("frame_too_large", Buffer.byteLength(line), line.slice(0, 1024));
        else this.rejectInput("malformed_frame", Buffer.byteLength(line), line.slice(0, 1024), parsed.reason);
        return;
    }
  }

  // ── PROCESS loop: strictly sequential, independent of drain ──
  private async pump(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!; // strict FIFO
        this.stats.queueDepth = this.queue.length;
        this.stats.queuedBytes -= item.rawBytes;
        try {
          await this.opts.onFrame(item.frame, item.rawBytes, item.adapterInstanceId);
        } catch (e) {
          this.opts.onIssue?.({ kind: "malformed", reason: `kernel handler error: ${boundedText((e as Error).message)}`, preview: "" });
        }
      }
    } finally {
      this.processing = false;
      const waiters = this.idleWaiters.splice(0);
      waiters.forEach((w) => w());
      this.maybeClose();
    }
  }

  private writeNoise(s: string): void {
    // H3: once the noise stream's budget is used up (written + pending), stop collecting:
    // count and drop instead of building a chunk-sized buffer only to discard it.
    const n = Buffer.byteLength(s);
    // Whole lines only: a line is collected only if it fits the remaining budget in full.
    // The cap is terminal: after the first drop nothing more is collected for this stream,
    // even a later line small enough to fit the arithmetic budget.
    const file = path.basename(this.noiseSpoolPath);
    if (this.capReached(file) || this.budgetLeft(file) - this.pendingNoiseBytes < n) {
      this.stats.diagnosticBytesDropped += n;
      this.capDue.add(file); // marker written after the pending payload
      return;
    }
    this.pendingNoise.push(s);
    this.pendingNoiseBytes += n;
  }

  /**
   * H3 — terminal cap state: true once the stream dropped payload (marker due) or its marker was
   * written. From then on every later payload byte is dropped and counted; the marker stays last.
   */
  private capReached(file: string): boolean {
    return this.capDue.has(file) || this.diagCapped.has(file);
  }

  /** H3 — payload bytes a diagnostic file may still receive (its budget excludes the marker reserve). */
  private budgetLeft(file: string): number {
    return Math.max(0, MAX_DIAGNOSTIC_STREAM_BYTES - DIAGNOSTIC_CAP_MARKER_RESERVE - (this.diagWritten.get(file) ?? 0));
  }

  /** H3 — the one-time cap marker (always fits in DIAGNOSTIC_CAP_MARKER_RESERVE). */
  private capMarker(file: string): Buffer {
    const m = Buffer.from(`\n[DVL: diagnostic cap of ${MAX_DIAGNOSTIC_STREAM_BYTES} bytes reached for ${file}; further bytes dropped]\n`);
    return m.subarray(0, DIAGNOSTIC_CAP_MARKER_RESERVE);
  }

  /** H3 — write the cap marker once, inside the reserved part of the stream's exact budget. */
  private markCapped(file: string): void {
    if (this.diagCapped.has(file)) return;
    this.diagCapped.add(file);
    this.sinkWrite(file, this.capMarker(file));
  }

  /**
   * H3 — reject one DVL1 frame before it reaches the Kernel: bounded, escaped diagnostic line;
   * seal the queue (fail closed); report once. `sample` is at most a small slice of the input.
   */
  private rejectInput(reason: "frame_too_large" | "malformed_frame" | "partial_frame", bytes: number, sample: string, why?: string): void {
    this.stats.inputRejected++;
    this.sealed = true;
    this.sealReason ??= "input_rejected";
    const detail = boundedText(why ? `${why}: ${sample}` : sample);
    this.writeNoise(`[REJECTED ${reason} bytes=${bytes}] ${detail}\n`);
    if (this.inputRejectedReported) return;
    this.inputRejectedReported = true;
    this.opts.onIssue?.({ kind: "input_rejected", adapterInstanceId: this.opts.adapterInstanceId, reason, bytes, ...(reason === "frame_too_large" ? { limit: MAX_FRAME_BYTES } : {}), detail });
  }

  /**
   * H2 — write one diagnostics buffer through the sink; false (counted) if refused/disabled.
   * H3 — exact per-stream cap: payload may use MAX_DIAGNOSTIC_STREAM_BYTES minus the marker
   * reserve; the one-time marker uses the reserve. The file never exceeds the cap. Bytes beyond
   * the payload budget are counted in diagnosticBytesDropped and not written.
   */
  private writeDiagnostic(file: string, input: Buffer): boolean {
    // Terminal: after the marker nothing is appended, whatever arithmetic room remains.
    if (this.diagCapped.has(file)) {
      this.stats.diagnosticBytesDropped += input.length;
      return true;
    }
    const room = this.budgetLeft(file);
    if (input.length <= room) return this.sinkWrite(file, input);
    this.stats.diagnosticBytesDropped += input.length - room;
    const ok = room > 0 ? this.sinkWrite(file, input.subarray(0, room)) : true;
    this.markCapped(file);
    return ok;
  }

  private sinkWrite(file: string, data: Buffer): boolean {
    this.diagWritten.set(file, (this.diagWritten.get(file) ?? 0) + data.length);
    if (this.diagnosticsDisabled === null) {
      try {
        this.sink.append(file, data);
        return true;
      } catch (e) {
        this.disableDiagnostics(file, e);
        // Detected only AFTER the bytes were written (final-window race): they are not
        // "refused" — they landed. Diagnostics are disabled from here on (fail closed).
        if ((e as { code?: unknown }).code === "after_write") return true;
      }
    }
    this.stats.diagnosticWritesRefused++;
    this.stats.diagnosticBytesRefused += data.length;
    return false;
  }

  private disableDiagnostics(file: string, e: unknown): void {
    this.diagnosticsDisabled = (e as Error).message;
    const code = (e as { code?: unknown }).code;
    this.opts.onIssue?.({ kind: "diagnostics_refused", adapterInstanceId: this.opts.adapterInstanceId, file, code: typeof code === "string" ? code : null, reason: (e as Error).message });
  }

  /** Flush the noise / overflow lines collected while draining one stdout chunk. */
  private flushDiagnostics(): void {
    if (this.pendingNoise.length > 0) {
      const data = Buffer.from(this.pendingNoise.join(""));
      this.pendingNoise = [];
      this.pendingNoiseBytes = 0;
      this.writeDiagnostic(path.basename(this.noiseSpoolPath), data);
    }
    const noiseFile = path.basename(this.noiseSpoolPath);
    if (this.capDue.delete(noiseFile)) this.markCapped(noiseFile);
    if (this.pendingOverflow.length > 0) {
      const data = Buffer.from(this.pendingOverflow.join(""));
      const frames = this.pendingOverflowFrames;
      this.pendingOverflow = [];
      this.pendingOverflowBytes = 0;
      this.pendingOverflowFrames = 0;
      const file = path.basename(this.overflowSpoolPath);
      let ok = this.diagnosticsDisabled === null;
      if (ok && !this.overflowCreated) {
        // Lazily created (absent unless something overflowed) — and exclusively: an entry
        // already at this path was not made by the Kernel, so frame bytes never go through it.
        try {
          this.sink.create(file);
          this.overflowCreated = true;
        } catch (e) {
          this.disableDiagnostics(file, e);
          ok = false;
        }
      }
      if (ok) ok = this.writeDiagnostic(file, data);
      else {
        this.stats.diagnosticWritesRefused++;
        this.stats.diagnosticBytesRefused += data.length;
      }
      if (!ok) this.stats.overflowSpoolRefused += frames; // counted, never processed
    }
    const ovf = path.basename(this.overflowSpoolPath);
    if (this.overflowCreated && this.capDue.delete(ovf)) this.markCapped(ovf);
  }

  /**
   * Blocker C — charge raw bytes the moment they are read. The first chunk that pushes the
   * total past maxIncomingBytes seals the queue (that chunk's frames and everything after
   * are never enqueued) and reports the breach exactly once. Draining continues so the
   * child cannot deadlock on a full pipe before it is killed; later bytes are diagnostics.
   */
  private charge(n: number, stream: "stdout" | "stderr"): void {
    this.stats.incomingBytes += n;
    if (this.byteLimitBreached || this.stats.incomingBytes <= this.opts.maxIncomingBytes) return;
    this.byteLimitBreached = true;
    this.sealed = true;
    this.sealReason ??= "byte_limit";
    this.opts.onIssue?.({
      kind: "byte_limit",
      adapterInstanceId: this.opts.adapterInstanceId,
      stream,
      maxIncomingBytes: this.opts.maxIncomingBytes,
      incomingBytes: this.stats.incomingBytes,
      stdoutBytes: this.stats.stdoutBytes,
      stderrBytes: this.stats.stderrBytes,
      triggeringChunkBytes: n,
    });
  }

  /** H3 — a frame refused by the sealed queue: kept on disk as diagnostics, never processed. */
  private reject(line: string): void {
    this.stats.framesRejected++;
    // H3: a refused line is recorded in the same bounded form as every rejection — original
    // byte count plus an escaped preview of at most MAX_DIAGNOSTIC_DETAIL_BYTES — never raw.
    const rec = `[REFUSED ${this.sealReason ?? "sealed"} bytes=${Buffer.byteLength(line)}] ${boundedText(line)}\n`;
    const n = Buffer.byteLength(rec);
    // Same budgeted collection for EVERY refused record — including the first batch, before the
    // overflow file exists (budgetLeft counts nothing written yet). Whole records only: a record
    // is collected only if it fits the remaining payload budget in full, so the file never holds
    // a cut record, pending memory never exceeds the budget, and every dropped byte is counted.
    // Terminal cap: once a record was dropped (or the marker written), every later record is
    // dropped too, even one small enough to fit the remaining arithmetic budget.
    const file = path.basename(this.overflowSpoolPath);
    if (this.capReached(file) || this.budgetLeft(file) - this.pendingOverflowBytes < n) {
      this.stats.diagnosticBytesDropped += n; // stream full: counted, not collected
      this.capDue.add(file);
      return;
    }
    this.pendingOverflow.push(rec);
    this.pendingOverflowBytes += n;
    this.pendingOverflowFrames++;
  }

  /** H3 — true once the queue refused a frame; nothing further is ever enqueued. */
  get isSealed(): boolean {
    return this.sealed;
  }

  private maybeClose(): void {
    if (this.closed || !this.stdoutEnded || !this.stderrEnded || !this.exitInfo || this.processing || this.queue.length > 0) return;
    this.closed = true;
    this.flushDiagnostics();
    this.opts.onClose?.(this.exitInfo);
  }
}

/**
 * H2 — default (unit-test) sink: path-based, no root confinement. Create is exclusive and
 * no-follow; append opens no-follow, requires a single-link regular file, writes, closes.
 */
function pathSink(dir: string): DiagnosticSink {
  const { O_WRONLY, O_APPEND, O_CREAT, O_EXCL, O_NOFOLLOW } = fs.constants;
  return {
    create(fileName) {
      fs.closeSync(fs.openSync(path.join(dir, fileName), O_WRONLY | O_APPEND | O_CREAT | O_EXCL | O_NOFOLLOW, 0o644));
    },
    append(fileName, data) {
      const fd = fs.openSync(path.join(dir, fileName), O_WRONLY | O_APPEND | O_NOFOLLOW);
      try {
        const st = fs.fstatSync(fd);
        if (!st.isFile() || st.nlink !== 1) throw Object.assign(new Error(`${fileName} is not a single-link regular file`), { code: st.isFile() ? "hard_link" : "not_regular" });
        fs.writeSync(fd, data);
      } finally {
        fs.closeSync(fd);
      }
    },
  };
}
