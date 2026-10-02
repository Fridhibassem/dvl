/**
 * §47 — DVL1 frame prefix codec + bounded line splitter.
 *
 * Wire format: one frame per line, `DVL1:<json>\n`.
 * Any stdout line without the prefix is diagnostic noise and is NEVER parsed as protocol.
 */
import { FRAME_PREFIX, MAX_LINE_BYTES } from "./types.js";

export function encodeFrame(obj: unknown): string {
  const json = JSON.stringify(obj);
  // JSON.stringify never emits raw newlines inside strings, so one frame == one line.
  return `${FRAME_PREFIX}${json}\n`;
}

export type ParsedLine =
  | { kind: "frame"; value: Record<string, unknown>; rawBytes: number }
  | { kind: "noise"; line: string }
  | { kind: "malformed"; reason: string; preview: string };

export function parseLine(line: string): ParsedLine {
  const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
  if (!trimmed.startsWith(FRAME_PREFIX)) return { kind: "noise", line: trimmed };
  const body = trimmed.slice(FRAME_PREFIX.length);
  try {
    const value: unknown = JSON.parse(body);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { kind: "malformed", reason: "frame body is not a JSON object", preview: body.slice(0, 200) };
    }
    const type = (value as Record<string, unknown>).type;
    if (typeof type !== "string" || type.length === 0) {
      return { kind: "malformed", reason: "frame missing string 'type'", preview: body.slice(0, 200) };
    }
    return { kind: "frame", value: value as Record<string, unknown>, rawBytes: Buffer.byteLength(trimmed) };
  } catch (e) {
    return { kind: "malformed", reason: `invalid JSON: ${(e as Error).message}`, preview: body.slice(0, 200) };
  }
}

/**
 * Byte-level line splitter with a hard per-line cap.
 *
 * Why bytes, not strings: a chunk boundary may split a multi-byte UTF-8 char; we
 * only decode complete lines. Why a cap: a hostile/buggy provider must not be able
 * to make the Kernel buffer an unbounded line. Oversized lines are discarded
 * (prefix preview retained) and reported via onOverflow.
 */
export class LineSplitter {
  private parts: Buffer[] = [];
  private size = 0;
  private overflowing = false;
  private overflowBytes = 0;
  private overflowHead: Buffer | null = null;

  constructor(
    private readonly onLine: (line: string) => void,
    private readonly onOverflow: (info: { bytes: number; head: string }) => void,
    private readonly maxLineBytes = MAX_LINE_BYTES,
  ) {}

  push(chunk: Buffer): void {
    let start = 0;
    for (;;) {
      const nl = chunk.indexOf(0x0a, start);
      if (nl === -1) {
        this.append(chunk.subarray(start));
        return;
      }
      this.append(chunk.subarray(start, nl));
      this.flushLine();
      start = nl + 1;
    }
  }

  /** Emit any trailing partial line (stream ended without newline). */
  end(): void {
    if (this.size > 0 || this.overflowing) this.flushLine();
  }

  private append(buf: Buffer): void {
    if (buf.length === 0) return;
    if (this.overflowing) {
      this.overflowBytes += buf.length;
      return;
    }
    if (this.size + buf.length > this.maxLineBytes) {
      this.overflowing = true;
      this.overflowHead = Buffer.concat([...this.parts, buf]).subarray(0, 256);
      this.overflowBytes = this.size + buf.length;
      this.parts = [];
      this.size = 0;
      return;
    }
    this.parts.push(Buffer.from(buf)); // copy: caller may reuse chunk memory
    this.size += buf.length;
  }

  private flushLine(): void {
    if (this.overflowing) {
      this.onOverflow({ bytes: this.overflowBytes, head: (this.overflowHead ?? Buffer.alloc(0)).toString("utf8") });
      this.overflowing = false;
      this.overflowBytes = 0;
      this.overflowHead = null;
      return;
    }
    const line = Buffer.concat(this.parts, this.size).toString("utf8");
    this.parts = [];
    this.size = 0;
    this.onLine(line);
  }
}
