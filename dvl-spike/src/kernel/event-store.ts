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
import { Confinement, DirHandle, SpoolIntegrityError, openBound, rebind, writeAll, type FsProbe } from "./confined-fs.js";
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

export { SpoolIntegrityError } from "./confined-fs.js";
const { O_RDONLY, O_WRONLY, O_CREAT, O_EXCL, O_APPEND } = fs.constants;
const EVENTS_DIR = [".dvl", "events"] as const;
const EVIDENCE_DIR = [".dvl", "evidence"] as const;

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
  /**
   * H2 — "auto" (default) uses directory-relative confinement where available (Linux
   * /proc/self/fd), else path checks; "path" forces the path-check fallback (tests).
   */
  confinement?: "auto" | "path";
  /** H2 — test-only: called at filesystem check/use points to force races deterministically. */
  fsProbe?: FsProbe;
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
   * H2 — all Kernel filesystem access below the root goes through this: canonical root fixed
   * at construction, no symlinked component ever followed, inode-bound directory handles.
   */
  readonly fsc: Confinement;
  /** H2 — set when a post-write check failed; all further durable appends are refused. */
  private sealedReason: string | null = null;
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
    this.fsc = new Confinement(opts.root, { mode: opts.confinement, probe: opts.fsProbe });
    this.dvlDir = path.join(opts.root, ".dvl");
    this.spoolDir = path.join(this.dvlDir, "spool");
    this.adapterSpoolDir = path.join(this.dvlDir, "adapter-spool");
    this.eventsPath = path.join(this.dvlDir, "events", "events.jsonl");
    this.evidencePath = path.join(this.dvlDir, "evidence", "evidence.jsonl");
    // H2: created component-by-component without following symlinks; fail closed if any
    // Kernel-owned directory or log was replaced by a symlink, a file, or a hard link.
    for (const rel of [[".dvl", "spool"], [".dvl", "adapter-spool"], EVENTS_DIR, EVIDENCE_DIR]) this.fsc.openDir(rel, true).close();
    for (const kind of ["events", "evidence"] as const) this.withLogDir(kind, (d, name) => fs.closeSync(openBound(d, name, O_WRONLY | O_APPEND | O_CREAT).fd));
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

  /** H2 — non-null once the store has failed closed (post-write integrity detection). */
  get sealed(): string | null {
    return this.sealedReason;
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
    for (const area of ["spool", "adapter-spool"]) {
      this.withDir([".dvl", area], (d) => {
        fs.mkdirSync(d.entry(adapterInstanceId)); // non-recursive, inside the verified parent inode
        d.verify();
      });
    }
    return { kernelDir, adapterDir };
  }

  /**
   * H2 — create a NEW, empty diagnostics file in `owner`'s Kernel spool: owner directory and
   * every ancestor walked without following symlinks, exclusive create, bound (regular,
   * single link, name ↔ inode, directory still canonical). No descriptor is kept.
   */
  createDiagnostic(owner: string, fileName: string): void {
    this.kernelSpoolDirOf(owner); // validates the owner name
    this.withDir([".dvl", "spool", owner], (d) => {
      this.fsc.probe("diagnostic:before-open", d.kernelPath(fileName));
      fs.closeSync(openBound(d, fileName, O_WRONLY | O_APPEND | O_CREAT | O_EXCL).fd);
    });
  }

  /**
   * H2 — append diagnostics bytes: confined open of the EXISTING file, bound and re-bound
   * immediately before the write, written, closed. There is no long-lived descriptor, so a
   * moved/aliased directory or file is refused at the next write (code replaced/hard_link/
   * symlink/missing; nothing written). A mutation landing between the last check and the
   * write itself is detected right after it (code "after_write"); the caller must then stop
   * writing diagnostics for this owner.
   */
  appendDiagnostic(owner: string, fileName: string, data: Buffer): void {
    this.kernelSpoolDirOf(owner);
    this.withDir([".dvl", "spool", owner], (d) => {
      this.fsc.probe("diagnostic:before-open", d.kernelPath(fileName));
      const { fd } = openBound(d, fileName, O_WRONLY | O_APPEND);
      try {
        rebind(d, fileName, fd, "replaced");
        this.fsc.probe("diagnostic:before-write", d.kernelPath(fileName));
        writeAll(fd, data);
        rebind(d, fileName, fd, "after_write");
      } finally {
        fs.closeSync(fd);
      }
    });
  }

  /** Kernel writes bytes into its own spool for `owner`. Never called with adapter-chosen paths. */
  spoolArtifact(content: Buffer | string, opts: { owner: string; mimeType: string; summary: string; sourceArtifactRef?: string; provenance: ArtifactProvenance }): ArtifactRef {
    const artifactId = newId("art");
    const ext = opts.mimeType === "application/json" ? "json" : "log";
    this.kernelSpoolDirOf(opts.owner); // validates the owner name
    const rel = path.posix.join(".dvl", "spool", opts.owner, `${artifactId}.${ext}`);
    const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    this.writeKernelFile([".dvl", "spool", opts.owner], `${artifactId}.${ext}`, buf);
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
   * Bytes are read ONCE through an inode-bound O_NOFOLLOW fd (see readAdapterFile); the hash is computed over exactly the
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

    let buf: Buffer;
    try {
      buf = this.readAdapterFile(adapterInstanceId, name, c.byteSize);
    } catch (e) {
      // Every expected filesystem failure (missing/swapped/symlinked area, vanished file,
      // I/O error) is a rejected claim — never an exception that loses evidence processing.
      return { ok: false, reason: e instanceof ImportRejection ? e.message : e instanceof SpoolIntegrityError ? e.message : `artifact unreadable: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}` };
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
      // Kernel-side materialization refused (hijacked spool, swap, I/O): a rejection, not a crash.
      return { ok: false, reason: e instanceof SpoolIntegrityError ? e.message : `artifact import failed: ${(e as Error).message}` };
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
    let buf: Buffer;
    try {
      buf = this.withDir(parts.slice(0, 3), (d) => {
        const { fd } = openBound(d, parts[3]!, O_RDONLY);
        try {
          return fs.readFileSync(fd);
        } finally {
          fs.closeSync(fd);
        }
      });
    } catch (e) {
      if (e instanceof SpoolIntegrityError) return { ok: false, reason: e.code === "missing" ? "artifact missing" : e.message };
      throw e;
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

  /** H2 — run `fn` with an inode-bound handle on a Kernel-owned directory; always closed. */
  private withDir<T>(rel: readonly string[], createOrFn: boolean | ((d: DirHandle) => T), maybeFn?: (d: DirHandle) => T): T {
    const create = typeof createOrFn === "boolean" ? createOrFn : false;
    const fn = (typeof createOrFn === "function" ? createOrFn : maybeFn)!;
    const d = this.fsc.openDir(rel, create);
    try {
      return fn(d);
    } finally {
      d.close();
    }
  }

  private withLogDir<T>(kind: LogKind, fn: (d: DirHandle, name: string) => T): T {
    return this.withDir(kind === "events" ? EVENTS_DIR : EVIDENCE_DIR, (d) => fn(d, path.basename(this.pathOf(kind))));
  }

  /**
   * H2 — create a NEW Kernel file `name` in the Kernel-owned directory `rel` with exactly
   * `buf`: exclusive no-follow create of a temp file relative to the held directory, bound
   * and re-verified, written, renamed within the same directory, re-bound. Throws
   * SpoolIntegrityError if anything was swapped; the caller then registers nothing.
   */
  private writeKernelFile(rel: readonly string[], name: string, buf: Buffer): void {
    // A missing owner directory (e.g. "kernel" on first use) is created non-recursively
    // relative to its verified parent — never through a symlink.
    this.withDir(rel, true, (d) => {
      const tmp = `${name}.tmp`;
      this.fsc.probe("artifact:before-open", d.kernelPath(tmp));
      const { fd, st } = openBound(d, tmp, O_WRONLY | O_CREAT | O_EXCL);
      try {
        let off = 0;
        while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
        if (this.opts.fsync) fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      try {
        fs.renameSync(d.entry(tmp), d.entry(name)); // write-then-rename, inside the held directory
      } catch (e) {
        throw new SpoolIntegrityError(`cannot rename ${d.kernelPath(tmp)} (${(e as NodeJS.ErrnoException).code})`, "replaced");
      }
      const { fd: fd2, st: st2 } = openBound(d, name, O_RDONLY);
      fs.closeSync(fd2);
      if (st2.ino !== st.ino || st2.dev !== st.dev) throw new SpoolIntegrityError(`${d.kernelPath(name)} was swapped during a Kernel write`, "replaced");
    });
  }

  /**
   * H2 — read exactly `byteSize` bytes of `name` from the adapter's OWN area, through an
   * inode-bound, no-follow descriptor (regular file, single link, name ↔ inode, area still
   * canonical). Throws ImportRejection / SpoolIntegrityError; closes every descriptor.
   */
  private readAdapterFile(adapterInstanceId: string, name: string, byteSize: number): Buffer {
    let area: DirHandle;
    try {
      area = this.fsc.openDir([".dvl", "adapter-spool", adapterInstanceId]);
    } catch (e) {
      if (!(e instanceof SpoolIntegrityError)) throw e;
      if (e.code === "missing" && e.at === 2) throw new ImportRejection("adapter instance area missing");
      if (e.at === 2 && (e.code === "symlink" || e.code === "not_dir")) throw new ImportRejection("adapter instance area is not a real directory");
      throw new ImportRejection(`adapter instance area resolves outside adapter-spool (${e.message})`);
    }
    try {
      this.fsc.probe("import:after-area-check", area.abs);
      this.fsc.probe("import:before-open", area.kernelPath(name));
      let fd: number;
      try {
        fd = openBound(area, name, O_RDONLY).fd;
      } catch (e) {
        if (!(e instanceof SpoolIntegrityError)) throw e;
        if (e.code === "missing") throw new ImportRejection("artifact missing");
        if (e.code === "symlink") throw new ImportRejection("artifact is a symlink");
        if (e.code === "replaced") throw new ImportRejection(`adapter instance area changed during import (${e.message})`);
        if (e.code === "hard_link") throw new ImportRejection(`artifact is hard-linked; not exclusively in the adapter area (${e.message})`);
        if (e.code === "not_regular") throw new ImportRejection("artifact is not a regular file");
        throw new ImportRejection(e.message);
      }
      try {
        const st = fs.fstatSync(fd);
        if (st.size !== byteSize) throw new ImportRejection(`byteSize mismatch: claimed ${byteSize}, actual ${st.size}`);
        const buf = Buffer.alloc(st.size);
        let off = 0;
        while (off < buf.length) {
          const n = fs.readSync(fd, buf, off, buf.length - off, off);
          if (n === 0) break;
          off += n;
        }
        if (off !== byteSize) throw new ImportRejection(`byteSize mismatch: claimed ${byteSize}, read ${off}`);
        return buf;
      } finally {
        fs.closeSync(fd);
      }
    } finally {
      area.close();
    }
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
    // H2: open/write/close per record. The log is opened relative to its verified
    // directory (never created here, never through a symlink) and bound (regular file, one
    // link, name ↔ inode, directory still canonical) at open AND immediately before the
    // write — a refusal there writes nothing. After the write it is re-bound again: if the
    // inode was moved or aliased in the final window (which no userspace check can exclude
    // against a same-user process), the record may have landed in that inode, so the store
    // is SEALED (fail closed): the chain head and in-memory history do not advance, and every
    // later append is refused.
    if (this.sealedReason) throw new SpoolIntegrityError(`store sealed after an integrity failure: ${this.sealedReason}`, "sealed");
    this.withLogDir(kind, (d, name) => {
      this.fsc.probe("log:before-open", d.kernelPath(name));
      const { fd } = openBound(d, name, O_WRONLY | O_APPEND);
      try {
        this.fsc.probe("log:after-open", d.kernelPath(name));
        rebind(d, name, fd, "replaced");
        this.fsc.probe("log:before-write", d.kernelPath(name));
        writeAll(fd, Buffer.from(line));
        if (this.opts.fsync) fs.fsyncSync(fd);
        try {
          rebind(d, name, fd, "after_write");
        } catch (e) {
          this.sealedReason = (e as Error).message;
          throw e;
        }
      } finally {
        fs.closeSync(fd);
      }
    });
    this.chain[kind] = { count: this.chain[kind].count + 1, mac };
  }

  /** Walk one log, accepting only lines whose MAC continues the last accepted line. */
  private readChain<T>(kind: LogKind, anchor?: ChainHead): { records: T[]; report: ChainReport; head: ChainHead } {
    const report: ChainReport = { ok: true, accepted: 0, rejected: [], truncated: false };
    const records: T[] = [];
    let prev = this.genesis(kind);
    let anchorMet = !anchor || anchor.count === 0;
    // H2: read through a bound no-follow descriptor; an unsafe log path (symlink, hard link,
    // swapped/moved directory) fails closed with SpoolIntegrityError. A missing log is empty.
    const raw = this.withLogDir(kind, (d, name) => {
      let fd: number;
      try {
        fd = openBound(d, name, O_RDONLY).fd;
      } catch (e) {
        if (e instanceof SpoolIntegrityError && e.code === "missing") return [];
        throw e;
      }
      try {
        return fs.readFileSync(fd, "utf8").split("\n");
      } finally {
        fs.closeSync(fd);
      }
    });
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

/** H2 — an adapter claim that fails a Kernel check during import (reported, never thrown out). */
class ImportRejection extends Error {}
