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
 */
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { encodeFrame, LineSplitter, parseLine } from "./frame.js";
import type { CommandFrame } from "./types.js";

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
    };

export interface TransportOptions {
  spoolDir: string; // .dvl/spool/<adapterInstanceId>
  diagnosticsName: string; // file stem for stderr/noise spool
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
    incomingBytes: 0,
  };
  readonly stderrSpoolPath: string;
  readonly noiseSpoolPath: string;
  /** H3 — frames refused after the queue was sealed land here (created on first use). */
  readonly overflowSpoolPath: string;

  private readonly queue: { frame: Record<string, unknown>; rawBytes: number; adapterInstanceId: string }[] = [];
  private sealed = false;
  private byteLimitBreached = false;
  private overflowFd: number | null = null;
  private processing = false;
  private idleWaiters: (() => void)[] = [];
  private stderrFd: number;
  private noiseFd: number;
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
    // Synchronous fds: writes complete before the next chunk is handled, so diagnostic
    // spool memory is bounded and ordering is exact. Disk is the backpressure sink.
    this.stderrFd = fs.openSync(this.stderrSpoolPath, "a");
    this.noiseFd = fs.openSync(this.noiseSpoolPath, "a");

    const splitter = new LineSplitter(
      (line) => this.classify(line),
      (info) => {
        this.stats.overflowLines++;
        this.writeNoise(`[OVERFLOW ${info.bytes} bytes] ${info.head}\n`);
        this.opts.onIssue?.({ kind: "overflow", ...info });
      },
    );

    // ── DRAIN loop: stdout ── (charged BEFORE splitting/parsing/queueing)
    child.stdout!.on("data", (chunk: Buffer) => {
      this.stats.stdoutBytes += chunk.length;
      this.charge(chunk.length, "stdout");
      splitter.push(chunk);
    });
    child.stdout!.on("end", () => {
      splitter.end();
      this.stdoutEnded = true;
      this.maybeClose();
    });

    // ── DRAIN loop: stderr → diagnostic spool (never parsed) ──
    child.stderr!.on("data", (chunk: Buffer) => {
      this.stats.stderrBytes += chunk.length;
      this.charge(chunk.length, "stderr");
      fs.writeSync(this.stderrFd, chunk); // still drained after a breach: cleanup/diagnostics only
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
  async send(cmd: CommandFrame): Promise<void> {
    if (this.closed || !this.child.stdin || this.child.stdin.destroyed) {
      throw new Error(`transport closed; cannot send ${cmd.type}`);
    }
    const ok = this.child.stdin.write(encodeFrame(cmd));
    if (!ok) await new Promise<void>((r) => this.child.stdin!.once("drain", () => r()));
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
        this.opts.onIssue?.({ kind: "noise", line: parsed.line.slice(0, 200) });
        return;
      case "malformed":
        this.stats.malformedLines++;
        this.writeNoise(`[MALFORMED ${parsed.reason}] ${parsed.preview}\n`);
        this.opts.onIssue?.(parsed);
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
          this.opts.onIssue?.({ kind: "malformed", reason: `kernel handler error: ${(e as Error).message}`, preview: "" });
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
    fs.writeSync(this.noiseFd, s);
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
    if (this.overflowFd === null) this.overflowFd = fs.openSync(this.overflowSpoolPath, "a");
    fs.writeSync(this.overflowFd, line + "\n");
  }

  /** H3 — true once the queue refused a frame; nothing further is ever enqueued. */
  get isSealed(): boolean {
    return this.sealed;
  }

  private maybeClose(): void {
    if (this.closed || !this.stdoutEnded || !this.stderrEnded || !this.exitInfo || this.processing || this.queue.length > 0) return;
    this.closed = true;
    try {
      fs.closeSync(this.stderrFd);
      fs.closeSync(this.noiseFd);
      if (this.overflowFd !== null) fs.closeSync(this.overflowFd);
    } catch {
      /* already closed */
    }
    this.opts.onClose?.(this.exitInfo);
  }
}
