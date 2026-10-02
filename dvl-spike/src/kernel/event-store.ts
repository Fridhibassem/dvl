/**
 * Kernel Event Store + Evidence Ledger + Artifact Spool.
 *
 * Durability model (Spike):
 *   - Append-only JSONL, one record per line, written with fs.appendFileSync.
 *   - kernelSequence is the Kernel's total order; adapterSequence is only the
 *     adapter's claim and is kept as data.
 *   - The write completes before the event is acknowledged in memory, so a reader
 *     never sees an in-memory event that is not on disk ("persist before act").
 *   - fsync is OPTIONAL (opts.fsync). Spike default = off; production needs on.
 *
 * Layout under <root>/.dvl/:
 *   events/events.jsonl      — every accepted/flagged event, total order
 *   evidence/evidence.jsonl  — EvidenceRecords (latest status wins on replay)
 *   spool/<owner>/           — KERNEL-OWNED spool (H2). <owner> is a Kernel-assigned
 *                              adapterInstanceId, or "kernel". Holds that instance's
 *                              stderr/noise diagnostics, payloads the Kernel spooled,
 *                              and adapter artifacts the Kernel verified and imported.
 *   adapter-spool/<adapterInstanceId>/ — UNTRUSTED per-instance area: the only place an
 *                              adapter is told to write. Never read as truth; the Kernel
 *                              only imports exact, verified bytes out of it.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { KERNEL_SPOOL_OWNER, MAX_IMPORT_ARTIFACT_BYTES, type ArtifactRef, type EvidenceRecord, type StoredEvent } from "./types.js";

/** H2 — spool owner dir names: Kernel-assigned instance ids or the Kernel itself. */
const OWNER_RE = /^(ainst_[0-9a-f]{20}|kernel)$/;
/** H2 — the only filenames accepted from an adapter: no separators, no leading dot, no "..". */
const SAFE_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MIME_RE = /^[A-Za-z0-9][\w.+-]{0,63}\/[A-Za-z0-9][\w.+-]{0,63}$/;

export type ArtifactCheck = { ok: true; ref: ArtifactRef } | { ok: false; reason: string };

export function sha256(data: Buffer | string): string {
  return "sha256:" + crypto.createHash("sha256").update(data).digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export interface EventStoreOptions {
  root: string; // project root; .dvl lives under it
  fsync?: boolean;
}

export class EventStore {
  readonly dvlDir: string;
  readonly eventsPath: string;
  readonly evidencePath: string;
  /** Kernel-owned spool root; per-owner subdirectories only. */
  readonly spoolDir: string;
  /** Untrusted adapter write areas root; per-instance subdirectories only. */
  readonly adapterSpoolDir: string;
  private seq = 0;
  private readonly events: StoredEvent[] = [];
  private readonly evidence = new Map<string, EvidenceRecord>();

  constructor(private readonly opts: EventStoreOptions) {
    this.dvlDir = path.join(opts.root, ".dvl");
    this.spoolDir = path.join(this.dvlDir, "spool");
    this.adapterSpoolDir = path.join(this.dvlDir, "adapter-spool");
    this.eventsPath = path.join(this.dvlDir, "events", "events.jsonl");
    this.evidencePath = path.join(this.dvlDir, "evidence", "evidence.jsonl");
    for (const d of [this.spoolDir, this.adapterSpoolDir, path.dirname(this.eventsPath), path.dirname(this.evidencePath)]) {
      fs.mkdirSync(d, { recursive: true });
    }
    this.replay();
  }

  // ───────────── events ─────────────

  append(e: Omit<StoredEvent, "eventId" | "kernelSequence" | "receivedAt">): StoredEvent {
    const stored: StoredEvent = {
      eventId: newId("evt"),
      kernelSequence: this.seq + 1,
      receivedAt: new Date().toISOString(),
      ...e,
    };
    this.durableAppend(this.eventsPath, stored);
    this.seq = stored.kernelSequence;
    this.events.push(stored);
    return stored;
  }

  all(): readonly StoredEvent[] {
    return this.events;
  }

  ofType(type: string): StoredEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /** Re-read JSONL from disk — proves persistence independent of memory. */
  readFromDisk(): StoredEvent[] {
    return readJsonl<StoredEvent>(this.eventsPath);
  }

  // ───────────── evidence ─────────────

  putEvidence(rec: EvidenceRecord): EvidenceRecord {
    this.durableAppend(this.evidencePath, rec);
    this.evidence.set(rec.evidenceId, rec);
    return rec;
  }

  allEvidence(): EvidenceRecord[] {
    return [...this.evidence.values()];
  }

  readEvidenceFromDisk(): EvidenceRecord[] {
    const latest = new Map<string, EvidenceRecord>();
    for (const r of readJsonl<EvidenceRecord>(this.evidencePath)) latest.set(r.evidenceId, r);
    return [...latest.values()];
  }

  // ───────────── artifact spool §47 / H2 isolation ─────────────

  /** Kernel-owned spool directory of one owner (adapterInstanceId or "kernel"). */
  kernelSpoolDirOf(owner: string): string {
    if (!OWNER_RE.test(owner)) throw new Error(`invalid spool owner: ${owner}`);
    return path.join(this.spoolDir, owner);
  }

  /** Untrusted adapter write area of one adapter instance. */
  adapterSpoolDirOf(adapterInstanceId: string): string {
    if (!OWNER_RE.test(adapterInstanceId) || adapterInstanceId === KERNEL_SPOOL_OWNER) throw new Error(`invalid adapterInstanceId: ${adapterInstanceId}`);
    return path.join(this.adapterSpoolDir, adapterInstanceId);
  }

  /**
   * Create both spool areas for a NEW adapter instance. Non-recursive mkdir fails if
   * either already exists, so two instances can never share or inherit a directory.
   */
  createInstanceSpools(adapterInstanceId: string): { kernelDir: string; adapterDir: string } {
    const kernelDir = this.kernelSpoolDirOf(adapterInstanceId);
    const adapterDir = this.adapterSpoolDirOf(adapterInstanceId);
    fs.mkdirSync(kernelDir);
    fs.mkdirSync(adapterDir);
    return { kernelDir, adapterDir };
  }

  /** Kernel writes bytes into its own spool for `owner`. Never called with adapter-chosen paths. */
  spoolArtifact(content: Buffer | string, opts: { owner: string; mimeType: string; summary: string; sourceArtifactRef?: string }): ArtifactRef {
    const artifactId = newId("art");
    const ext = opts.mimeType === "application/json" ? "json" : "log";
    const dir = this.kernelSpoolDirOf(opts.owner);
    fs.mkdirSync(dir, { recursive: true });
    const rel = path.posix.join(".dvl", "spool", opts.owner, `${artifactId}.${ext}`);
    const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    const abs = path.join(this.opts.root, rel);
    // write-then-rename: readers never observe a half-written artifact. "wx": never
    // follow or reuse a pre-existing temp file.
    const tmp = abs + ".tmp";
    fs.writeFileSync(tmp, buf, { flag: "wx" });
    fs.renameSync(tmp, abs);
    const ref: ArtifactRef = { artifactRef: artifactId, path: rel, hash: sha256(buf), summary: opts.summary.slice(0, 280), byteSize: buf.length, mimeType: opts.mimeType };
    if (opts.owner !== KERNEL_SPOOL_OWNER) ref.adapterInstanceId = opts.owner;
    if (opts.sourceArtifactRef !== undefined) ref.sourceArtifactRef = opts.sourceArtifactRef;
    return ref;
  }

  /**
   * H2 — verify an artifactRef CLAIMED by adapter instance `adapterInstanceId` and, only
   * if every check passes, import the exact verified bytes into that instance's
   * Kernel-owned spool. The returned ref is Kernel-issued; the claim is never reused.
   *
   * The claim must name a plain file directly inside the claimant's OWN untrusted area:
   *   .dvl/adapter-spool/<adapterInstanceId>/<safe filename>
   * Anything else — traversal, absolute paths, another instance's area, the Kernel
   * spool, nested dirs, unsafe names, symlinks (file or area dir), non-regular files,
   * size or hash mismatch, a different claimed adapterInstanceId — is rejected.
   * Bytes are read ONCE through an O_NOFOLLOW fd; the hash is computed over exactly the
   * bytes that are then written, so a concurrent rewrite cannot slip in unverified data.
   */
  importAdapterArtifact(claim: unknown, adapterInstanceId: string): ArtifactCheck {
    const c = claim as Partial<ArtifactRef> | null;
    if (!c || typeof c !== "object") return { ok: false, reason: "malformed artifactRef" };
    if (typeof c.path !== "string" || typeof c.hash !== "string" || typeof c.byteSize !== "number" || !Number.isInteger(c.byteSize) || c.byteSize < 0) {
      return { ok: false, reason: "malformed artifactRef" };
    }
    if (c.adapterInstanceId !== undefined && c.adapterInstanceId !== adapterInstanceId) {
      return { ok: false, reason: `artifactRef claims adapterInstanceId ${String(c.adapterInstanceId)}, frame came from ${adapterInstanceId}` };
    }
    if (c.byteSize > MAX_IMPORT_ARTIFACT_BYTES) return { ok: false, reason: `artifact too large: ${c.byteSize} > ${MAX_IMPORT_ARTIFACT_BYTES}` };

    const areaRel = path.posix.join(".dvl", "adapter-spool", adapterInstanceId);
    if (c.path.includes("\0") || c.path.includes("\\")) return { ok: false, reason: `unsafe artifact path: ${JSON.stringify(c.path)}` };
    const dir = path.posix.dirname(c.path);
    const name = path.posix.basename(c.path);
    if (dir !== areaRel) return { ok: false, reason: `artifact path outside own adapter instance area (${areaRel}): ${c.path}` };
    if (!SAFE_FILENAME_RE.test(name) || name.includes("..")) return { ok: false, reason: `unsafe artifact filename: ${JSON.stringify(name)}` };

    const area = this.adapterSpoolDirOf(adapterInstanceId);
    let areaSt: fs.Stats;
    try {
      areaSt = fs.lstatSync(area);
    } catch {
      return { ok: false, reason: "adapter instance area missing" };
    }
    if (areaSt.isSymbolicLink() || !areaSt.isDirectory()) return { ok: false, reason: "adapter instance area is not a real directory" };
    if (fs.realpathSync(area) !== path.join(fs.realpathSync(this.adapterSpoolDir), adapterInstanceId)) {
      return { ok: false, reason: "adapter instance area resolves outside adapter-spool" };
    }

    const abs = path.join(area, name);
    let fd: number;
    try {
      fd = fs.openSync(abs, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { ok: false, reason: "artifact missing" };
      if (code === "ELOOP") return { ok: false, reason: "artifact is a symlink" };
      return { ok: false, reason: `artifact unreadable: ${code}` };
    }
    let buf: Buffer;
    try {
      const st = fs.fstatSync(fd);
      if (!st.isFile()) return { ok: false, reason: "artifact is not a regular file" };
      if (st.size !== c.byteSize) return { ok: false, reason: `byteSize mismatch: claimed ${c.byteSize}, actual ${st.size}` };
      buf = Buffer.alloc(st.size);
      let off = 0;
      while (off < buf.length) {
        const n = fs.readSync(fd, buf, off, buf.length - off, off);
        if (n === 0) break;
        off += n;
      }
      if (off !== c.byteSize) return { ok: false, reason: `byteSize mismatch: claimed ${c.byteSize}, read ${off}` };
    } finally {
      fs.closeSync(fd);
    }
    const actual = sha256(buf);
    if (actual !== c.hash) return { ok: false, reason: `hash mismatch: claimed ${c.hash}, actual ${actual}` };

    const mimeType = typeof c.mimeType === "string" && MIME_RE.test(c.mimeType) ? c.mimeType : "application/octet-stream";
    const summary = typeof c.summary === "string" ? c.summary : "";
    const source = typeof c.artifactRef === "string" ? c.artifactRef.slice(0, 128) : undefined;
    return { ok: true, ref: this.spoolArtifact(buf, { owner: adapterInstanceId, mimeType, summary, sourceArtifactRef: source }) };
  }

  /**
   * H2 — re-verify a Kernel-issued ref against its bytes in the Kernel spool. A missing or
   * altered file is never valid runtime material.
   */
  verifyKernelArtifact(ref: ArtifactRef): { ok: true } | { ok: false; reason: string } {
    if (typeof ref?.path !== "string" || typeof ref.hash !== "string") return { ok: false, reason: "malformed artifactRef" };
    const parts = ref.path.split("/");
    if (parts.length !== 4 || parts[0] !== ".dvl" || parts[1] !== "spool" || !OWNER_RE.test(parts[2]!) || !SAFE_FILENAME_RE.test(parts[3]!)) {
      return { ok: false, reason: `not a Kernel spool path: ${ref.path}` };
    }
    if (ref.adapterInstanceId !== undefined && ref.adapterInstanceId !== parts[2]) return { ok: false, reason: "adapterInstanceId does not match spool owner" };
    const abs = path.join(this.opts.root, ...parts);
    let fd: number;
    try {
      fd = fs.openSync(abs, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    } catch (e) {
      return { ok: false, reason: (e as NodeJS.ErrnoException).code === "ENOENT" ? "artifact missing" : "artifact unreadable or symlink" };
    }
    let buf: Buffer;
    try {
      if (!fs.fstatSync(fd).isFile()) return { ok: false, reason: "artifact is not a regular file" };
      buf = fs.readFileSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (buf.length !== ref.byteSize) return { ok: false, reason: `byteSize mismatch: claimed ${ref.byteSize}, actual ${buf.length}` };
    const actual = sha256(buf);
    if (actual !== ref.hash) return { ok: false, reason: `hash mismatch: claimed ${ref.hash}, actual ${actual}` };
    return { ok: true };
  }

  /**
   * H2 retention — remove UNTRUSTED adapter areas of instances that are not live.
   * Never touches the Kernel spool (imported artifacts and diagnostics are retained),
   * never a live instance's area, never entries that are not Kernel instance ids.
   * Symlinks are unlinked, never followed.
   */
  pruneAdapterSpools(liveAdapterInstanceIds: ReadonlySet<string>): string[] {
    const removed: string[] = [];
    for (const ent of fs.readdirSync(this.adapterSpoolDir, { withFileTypes: true })) {
      if (!OWNER_RE.test(ent.name) || ent.name === KERNEL_SPOOL_OWNER || liveAdapterInstanceIds.has(ent.name)) continue;
      const abs = path.join(this.adapterSpoolDir, ent.name);
      if (ent.isSymbolicLink()) fs.unlinkSync(abs);
      else fs.rmSync(abs, { recursive: true, force: true });
      removed.push(ent.name);
    }
    return removed;
  }

  // ───────────── internals ─────────────

  private durableAppend(file: string, obj: unknown): void {
    const line = JSON.stringify(obj) + "\n";
    if (this.opts.fsync) {
      const fd = fs.openSync(file, "a");
      try {
        fs.writeSync(fd, line);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } else {
      fs.appendFileSync(file, line);
    }
  }

  private replay(): void {
    for (const e of readJsonl<StoredEvent>(this.eventsPath)) {
      this.events.push(e);
      this.seq = Math.max(this.seq, e.kernelSequence);
    }
    for (const r of this.readEvidenceFromDisk()) this.evidence.set(r.evidenceId, r);
  }
}

function readJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  const out: T[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // torn last line after crash: skip, never fabricate
    }
  }
  return out;
}
