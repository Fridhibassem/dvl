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

/**
 * Blocker B — Kernel provenance of a spool artifact. Recorded in the event log
 * (kernel.artifact_registered) at the moment the Kernel writes the bytes, and rebuilt on
 * replay. A file under .dvl/spool without a matching registration is never trusted.
 */
export type ArtifactOrigin = "import" | "kernel_spooled_payload" | "snapshot" | "attempt_archive";
export interface ArtifactProvenance {
  origin: ArtifactOrigin;
  runId?: string;
  attempt?: number;
  /** H2 — imports only: the validated path in the adapter's own area the bytes were copied from. */
  sourcePath?: string;
  /** H2 — imports only: the adapter event that cited the artifact. */
  sourceEventId?: string;
}
export const ARTIFACT_REGISTERED = "kernel.artifact_registered";

/**
 * H2 — a Kernel-owned file or directory is not where the Kernel expects it (symlinked
 * component, non-regular file, swapped inode, pre-existing entry). The write is refused;
 * nothing is registered and nothing is written outside the Kernel-owned area.
 */
export class SpoolIntegrityError extends Error {
  constructor(message: string) {
    super(`spool integrity: ${message}`);
    this.name = "SpoolIntegrityError";
  }
}
const { O_RDONLY, O_WRONLY, O_CREAT, O_EXCL, O_APPEND, O_NOFOLLOW } = fs.constants;
const sameInode = (a: fs.Stats, b: fs.Stats) => a.dev === b.dev && a.ino === b.ino;

/**
 * Blocker 1 — durable authority. The adapter runs as the same OS user (no sandbox) and can
 * write both JSONL logs; JSON fields such as origin/trust prove nothing. Each log is an
 * HMAC-SHA256 chain keyed by a secret the HOST hands to the Kernel in memory (never env,
 * disk, or the adapter): mac_i = HMAC(key, mac_{i-1} + "\n" + canonical(record_i)).
 * Replay accepts a line only if its MAC verifies against the last ACCEPTED line, so forged
 * or inserted lines are rejected while the legitimate chain continues; a modified, deleted
 * or reordered line breaks the chain and everything after it is not trusted (fail-closed).
 * A clean shorter prefix (tail truncation/rollback) is only detectable against a
 * host-held head anchor (expectedHead).
 */
export interface ChainHead {
  count: number;
  mac: string;
}
export interface ChainReport {
  ok: boolean;
  accepted: number;
  rejected: { line: number; reason: "unparseable" | "missing_mac" | "mac_mismatch"; eventId?: string; type?: string }[];
  /** True when an expectedHead anchor was given and the log no longer reaches it. */
  truncated: boolean;
}
type LogKind = "events" | "evidence";

export function sha256(data: Buffer | string): string {
  return "sha256:" + crypto.createHash("sha256").update(data).digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export interface EventStoreOptions {
  root: string; // project root; .dvl lives under it
  fsync?: boolean;
  /** Blocker 1 — host-held secret authenticating durable records. Absent ⇒ ephemeral. */
  integrityKey?: Buffer;
  /** Blocker 1 — host-held anchor of the events log head, to detect truncation/rollback. */
  expectedHead?: ChainHead;
}

export class EventStore {
  readonly dvlDir: string;
  readonly eventsPath: string;
  readonly evidencePath: string;
  /** Kernel-owned spool root; per-owner subdirectories only. */
  readonly spoolDir: string;
  /** Untrusted adapter write areas root; per-instance subdirectories only. */
  readonly adapterSpoolDir: string;
  /**
   * H2 — canonical (realpath) project root, fixed at construction. Every Kernel-owned path
   * must still resolve to exactly <realRoot>/<its relative path> when used: a symlink planted
   * anywhere below the root (by an adapter running as the same OS user) is never followed.
   */
  private readonly realRoot: string;
  private seq = 0;
  private readonly events: StoredEvent[] = [];
  private readonly evidence = new Map<string, EvidenceRecord>();
  /** Blocker B — Kernel-issued artifacts by artifactId. The only source of spool trust. */
  private readonly registry = new Map<string, ArtifactRef & ArtifactProvenance>();
  private readonly key: Buffer;
  /** True when no host key was supplied: nothing written now can be trusted after restart. */
  readonly ephemeralKey: boolean;
  private readonly chain: Record<LogKind, ChainHead>;
  /** Blocker 1 — what replay authenticated vs rejected, per log. */
  readonly integrity: Record<LogKind, ChainReport>;

  constructor(private readonly opts: EventStoreOptions) {
    this.ephemeralKey = !opts.integrityKey;
    this.key = opts.integrityKey ? Buffer.from(opts.integrityKey) : crypto.randomBytes(32);
    if (this.key.length < 32) throw new Error("integrityKey must be at least 32 bytes");
    this.chain = { events: { count: 0, mac: this.genesis("events") }, evidence: { count: 0, mac: this.genesis("evidence") } };
    this.integrity = {
      events: { ok: true, accepted: 0, rejected: [], truncated: false },
      evidence: { ok: true, accepted: 0, rejected: [], truncated: false },
    };
    this.realRoot = fs.realpathSync(opts.root);
    this.dvlDir = path.join(opts.root, ".dvl");
    this.spoolDir = path.join(this.dvlDir, "spool");
    this.adapterSpoolDir = path.join(this.dvlDir, "adapter-spool");
    this.eventsPath = path.join(this.dvlDir, "events", "events.jsonl");
    this.evidencePath = path.join(this.dvlDir, "evidence", "evidence.jsonl");
    // H2: fail closed if any Kernel-owned directory was replaced by a symlink (or a file).
    for (const d of [this.spoolDir, this.adapterSpoolDir, path.dirname(this.eventsPath), path.dirname(this.evidencePath)]) {
      fs.mkdirSync(d, { recursive: true });
      this.ownedDir(d);
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
    this.durableAppend("events", stored);
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

  /** Re-read JSONL from disk — only records that authenticate (blocker 1). */
  readFromDisk(): StoredEvent[] {
    return this.readChain<StoredEvent>("events").records;
  }

  /** Blocker 1 — current head of the events chain; the host may persist it as an anchor. */
  head(): ChainHead {
    return { ...this.chain.events };
  }

  // ───────────── evidence ─────────────

  putEvidence(rec: EvidenceRecord): EvidenceRecord {
    this.durableAppend("evidence", rec);
    this.evidence.set(rec.evidenceId, rec);
    return rec;
  }

  allEvidence(): EvidenceRecord[] {
    return [...this.evidence.values()];
  }

  /** Authenticated EvidenceRecords from disk, latest status per id (blocker 1). */
  readEvidenceFromDisk(): EvidenceRecord[] {
    const latest = new Map<string, EvidenceRecord>();
    for (const r of this.readChain<EvidenceRecord>("evidence").records) latest.set(r.evidenceId, r);
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
    this.ownedDir(this.spoolDir);
    this.ownedDir(this.adapterSpoolDir);
    fs.mkdirSync(kernelDir);
    fs.mkdirSync(adapterDir);
    this.ownedDir(kernelDir);
    this.ownedDir(adapterDir);
    return { kernelDir, adapterDir };
  }

  /** Kernel writes bytes into its own spool for `owner`. Never called with adapter-chosen paths. */
  spoolArtifact(content: Buffer | string, opts: { owner: string; mimeType: string; summary: string; sourceArtifactRef?: string; provenance: ArtifactProvenance }): ArtifactRef {
    const artifactId = newId("art");
    const ext = opts.mimeType === "application/json" ? "json" : "log";
    const dir = this.kernelSpoolDirOf(opts.owner);
    this.ownedDir(this.spoolDir);
    try {
      fs.mkdirSync(dir); // non-recursive: parent already verified, never created through a symlink
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    const rel = path.posix.join(".dvl", "spool", opts.owner, `${artifactId}.${ext}`);
    const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    this.writeKernelFile(dir, `${artifactId}.${ext}`, buf);
    const ref: ArtifactRef = { artifactRef: artifactId, path: rel, hash: sha256(buf), summary: opts.summary.slice(0, 280), byteSize: buf.length, mimeType: opts.mimeType };
    if (opts.owner !== KERNEL_SPOOL_OWNER) ref.adapterInstanceId = opts.owner;
    if (opts.sourceArtifactRef !== undefined) ref.sourceArtifactRef = opts.sourceArtifactRef;
    // Provenance is recorded by the Kernel at write time — never inferred from location.
    const entry = { ...ref, ...opts.provenance };
    this.append({ origin: "kernel", trust: "kernel_truth", type: ARTIFACT_REGISTERED, runId: opts.provenance.runId, attempt: opts.provenance.attempt, payload: entry });
    this.registry.set(artifactId, entry);
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
  importAdapterArtifact(claim: unknown, adapterInstanceId: string, context: { runId?: string; attempt?: number; sourceEventId?: string } = {}): ArtifactCheck {
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
    // Allowed root = the CANONICAL project root fixed at construction: a symlinked
    // .dvl/adapter-spool (or any other component) makes the area resolve elsewhere.
    if (fs.realpathSync(area) !== this.canonical(area)) return { ok: false, reason: "adapter instance area resolves outside adapter-spool" };

    const abs = path.join(area, name);
    let fd: number;
    try {
      fd = fs.openSync(abs, O_RDONLY | O_NOFOLLOW);
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
      // A hard link aliases an inode that also lives elsewhere (e.g. a Kernel-owned file):
      // O_NOFOLLOW cannot see it, the link count can. Adapter output is a single-link file.
      if (st.nlink !== 1) return { ok: false, reason: `artifact is hard-linked (nlink=${st.nlink}); not exclusively in the adapter area` };
      // No openat in Node: re-check after the open that the area was not swapped and the
      // name still maps to the inode we hold, so the bytes came from inside the area.
      try {
        if (!sameInode(fs.lstatSync(area), areaSt) || !sameInode(fs.lstatSync(abs), st)) return { ok: false, reason: "adapter instance area changed during import" };
      } catch {
        return { ok: false, reason: "adapter instance area changed during import" };
      }
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
    // The Kernel materializes its OWN copy under a Kernel-chosen name; the adapter file is
    // never moved, linked or referenced. Provenance names exactly where it came from.
    const provenance: ArtifactProvenance = { origin: "import", ...context, sourcePath: path.posix.join(areaRel, name) };
    try {
      return { ok: true, ref: this.spoolArtifact(buf, { owner: adapterInstanceId, mimeType, summary, sourceArtifactRef: source, provenance }) };
    } catch (e) {
      if (e instanceof SpoolIntegrityError) return { ok: false, reason: e.message };
      throw e;
    }
  }

  /**
   * H2/blocker B — re-verify a ref against (1) the Kernel's own registration of that
   * artifact and (2) the bytes on disk. Location alone grants nothing: a file planted under
   * .dvl/spool, or a ref whose id/path/hash/size/owner differs from the registration, is
   * rejected even if its bytes hash correctly. A missing or altered file is never valid.
   */
  verifyKernelArtifact(ref: ArtifactRef): { ok: true } | { ok: false; reason: string } {
    if (typeof ref?.path !== "string" || typeof ref.hash !== "string") return { ok: false, reason: "malformed artifactRef" };
    const reg = typeof ref.artifactRef === "string" ? this.registry.get(ref.artifactRef) : undefined;
    if (!reg) return { ok: false, reason: `artifact ${String(ref.artifactRef)} is not registered by the Kernel` };
    // Every ArtifactRef field is bound — including mimeType, summary and sourceArtifactRef:
    // nothing on a Kernel ref is "display-only and unchecked".
    const fields: (keyof ArtifactRef)[] = ["artifactRef", "path", "hash", "byteSize", "mimeType", "summary", "adapterInstanceId", "sourceArtifactRef"];
    const diff = fields.filter((f) => reg[f] !== ref[f]);
    if (diff.length > 0) return { ok: false, reason: `artifactRef does not match the Kernel registration of ${ref.artifactRef} (${diff.join(", ")})` };
    const parts = ref.path.split("/");
    if (parts.length !== 4 || parts[0] !== ".dvl" || parts[1] !== "spool" || !OWNER_RE.test(parts[2]!) || !SAFE_FILENAME_RE.test(parts[3]!)) {
      return { ok: false, reason: `not a Kernel spool path: ${ref.path}` };
    }
    if (ref.adapterInstanceId !== undefined && ref.adapterInstanceId !== parts[2]) return { ok: false, reason: "adapterInstanceId does not match spool owner" };
    const abs = path.join(this.opts.root, ...parts);
    try {
      this.ownedDir(path.dirname(abs));
    } catch (e) {
      return { ok: false, reason: (e as Error).message };
    }
    let fd: number;
    try {
      fd = fs.openSync(abs, O_RDONLY | O_NOFOLLOW);
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

  /**
   * H2 — assert `abs` (a path derived from the canonical root) is a real directory that
   * resolves to exactly itself: no symlinked component anywhere below the root.
   */
  private ownedDir(abs: string): fs.Stats {
    let st: fs.Stats;
    let real: string;
    try {
      st = fs.lstatSync(abs);
      real = fs.realpathSync(abs);
    } catch (e) {
      throw new SpoolIntegrityError(`${this.rel(abs)} unavailable (${(e as NodeJS.ErrnoException).code})`);
    }
    if (st.isSymbolicLink() || !st.isDirectory() || real !== this.canonical(abs)) throw new SpoolIntegrityError(`${this.rel(abs)} is not a real Kernel-owned directory`);
    return st;
  }

  /** Root-relative form of a Kernel path (for messages). */
  private rel(abs: string): string {
    return path.relative(this.opts.root, abs);
  }

  /** Where a Kernel path (derived from opts.root) must canonically resolve. */
  private canonical(abs: string): string {
    return path.join(this.realRoot, this.rel(abs));
  }

  /**
   * H2 — create a NEW Kernel file `dir/name` with exactly `buf`. Exclusive + no-follow
   * create of a temp file, identity re-checks (no openat in Node), rename, final check.
   * Throws SpoolIntegrityError if anything was swapped; the caller then registers nothing.
   */
  private writeKernelFile(dir: string, name: string, buf: Buffer): void {
    const dirSt = this.ownedDir(dir);
    const tmp = path.join(dir, `${name}.tmp`);
    const abs = path.join(dir, name);
    let fd: number;
    try {
      fd = fs.openSync(tmp, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o644);
    } catch (e) {
      throw new SpoolIntegrityError(`cannot create ${this.rel(tmp)} exclusively (${(e as NodeJS.ErrnoException).code})`);
    }
    let written: fs.Stats;
    try {
      let off = 0;
      while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
      if (this.opts.fsync) fs.fsyncSync(fd);
      written = fs.fstatSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    const check = (p: string) => {
      if (!sameInode(this.ownedDir(dir), dirSt)) throw new SpoolIntegrityError(`${this.rel(dir)} was replaced during a Kernel write`);
      let now: fs.Stats;
      try {
        now = fs.lstatSync(p);
      } catch {
        throw new SpoolIntegrityError(`${this.rel(p)} vanished during a Kernel write`);
      }
      if (!sameInode(now, written) || now.nlink !== 1) throw new SpoolIntegrityError(`${this.rel(p)} was swapped or aliased during a Kernel write`);
    };
    check(tmp);
    fs.renameSync(tmp, abs); // write-then-rename: readers never observe a half-written artifact
    check(abs);
  }

  private genesis(kind: LogKind): string {
    return crypto.createHmac("sha256", this.key).update(`dvl-genesis:${kind}`).digest("hex");
  }

  private mac(prev: string, canonical: string): string {
    return crypto.createHmac("sha256", this.key).update(prev).update("\n").update(canonical).digest("hex");
  }

  private pathOf(kind: LogKind): string {
    return kind === "events" ? this.eventsPath : this.evidencePath;
  }

  private durableAppend(kind: LogKind, obj: object): void {
    const canonical = JSON.stringify(obj);
    const mac = this.mac(this.chain[kind].mac, canonical);
    // `mac` is the LAST key, so stripping it reproduces `canonical` byte-for-byte on replay.
    const line = canonical.slice(0, -1) + (canonical === "{}" ? "" : ",") + `"mac":"${mac}"}` + "\n";
    const file = this.pathOf(kind);
    // H2: never append through a symlink (or a symlinked directory) planted in place of a
    // Kernel log: the record would land in a file the Kernel does not own.
    this.ownedDir(path.dirname(file));
    let fd: number;
    try {
      fd = fs.openSync(file, O_WRONLY | O_APPEND | O_CREAT | O_NOFOLLOW, 0o644);
    } catch (e) {
      throw new SpoolIntegrityError(`cannot open ${this.rel(file)} (${(e as NodeJS.ErrnoException).code})`);
    }
    try {
      if (!fs.fstatSync(fd).isFile()) throw new SpoolIntegrityError(`${this.rel(file)} is not a regular file`);
      fs.writeSync(fd, line);
      if (this.opts.fsync) fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    this.chain[kind] = { count: this.chain[kind].count + 1, mac };
  }

  /** Walk one log, accepting only lines whose MAC continues the last accepted line. */
  private readChain<T>(kind: LogKind, anchor?: ChainHead): { records: T[]; report: ChainReport; head: ChainHead } {
    const report: ChainReport = { ok: true, accepted: 0, rejected: [], truncated: false };
    const records: T[] = [];
    let prev = this.genesis(kind);
    let anchorMet = !anchor || anchor.count === 0;
    const file = this.pathOf(kind);
    const raw = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n") : [];
    raw.forEach((line, idx) => {
      if (!line.trim()) return;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch {
        // A torn final line is a crash artifact; anywhere else it is a rejected record.
        const isTail = raw.slice(idx + 1).every((l) => !l.trim());
        if (!isTail) report.rejected.push({ line: idx + 1, reason: "unparseable" });
        return;
      }
      const { mac, ...rest } = obj;
      const reject = (reason: "missing_mac" | "mac_mismatch") =>
        report.rejected.push({ line: idx + 1, reason, eventId: typeof rest.eventId === "string" ? rest.eventId : undefined, type: typeof rest.type === "string" ? rest.type : undefined });
      if (typeof mac !== "string") return reject("missing_mac");
      const expected = this.mac(prev, JSON.stringify(rest));
      if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return reject("mac_mismatch");
      prev = mac;
      report.accepted++;
      records.push(rest as T);
      if (anchor && report.accepted === anchor.count && mac === anchor.mac) anchorMet = true;
    });
    if (!anchorMet) report.truncated = true;
    report.ok = report.rejected.length === 0 && !report.truncated;
    return { records, report, head: { count: report.accepted, mac: prev } };
  }

  private replay(): void {
    const ev = this.readChain<StoredEvent>("events", this.opts.expectedHead);
    this.integrity.events = ev.report;
    this.chain.events = ev.head; // new records continue the authenticated chain
    for (const e of ev.records) {
      this.events.push(e);
      this.seq = Math.max(this.seq, e.kernelSequence);
      // Only authenticated Kernel-origin registrations rebuild provenance.
      if (e.type === ARTIFACT_REGISTERED && e.origin === "kernel" && e.trust === "kernel_truth") {
        const entry = e.payload as ArtifactRef & ArtifactProvenance;
        this.registry.set(entry.artifactRef, entry);
      }
    }
    const evd = this.readChain<EvidenceRecord>("evidence");
    this.integrity.evidence = evd.report;
    this.chain.evidence = evd.head;
    for (const r of evd.records) this.evidence.set(r.evidenceId, r);
  }
}
