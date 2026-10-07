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
const INTEGRITY_DIR = [".dvl", "integrity"] as const;
const SEAL_MARKER = "sealed.json";
const LOG_KINDS = ["events", "evidence"] as const;

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
  /**
   * H2 commit model — authenticated records (or bytes) found BEYOND the commit boundary
   * (host anchor or persisted seal marker), or a torn final fragment. They are not committed:
   * never loaded into history, registry or evidence.
   */
  uncommitted?: { records: number; bytes: number };
}
export type LogKind = "events" | "evidence";
export type CommitHeads = Record<LogKind, ChainHead>;

/**
 * H2 commit model (Option A: "refused means not committed").
 *   - A record is COMMITTED only when its write, optional fsync and post-write integrity
 *     re-check all succeed; only then do the chain head, in-memory history and the published
 *     commit boundary (onCommit → host) advance.
 *   - Any error after a durable write BEGINS (write error, partial write, fsync error,
 *     post-write integrity detection) is an UNCERTAIN outcome: the record is NOT committed,
 *     the store SEALS before any later append, an incident is reported to the host
 *     (onIncident) and persisted best-effort as an authenticated seal marker.
 *   - Replay accepts records only up to the commit boundary: the host-held anchors
 *     (expectedHeads) when given, else the persisted seal marker. Anything beyond it is
 *     quarantined (never authoritative) and the store opens in RECOVERY_REQUIRED: appends are
 *     refused until the host calls recover(), which moves the uncommitted tail to
 *     .dvl/integrity/quarantine-*.jsonl and truncates the logs to the boundary.
 */
export interface DurableIncident {
  log: LogKind;
  code: string;
  reason: string;
  at: string;
  /** Commit boundary at the moment of the incident (what replay must not go beyond). */
  committed: Record<LogKind, ChainHead & { bytes: number }>;
  /** Whether the authenticated seal marker could be written. */
  markerPersisted: boolean;
}
export interface RecoveryState {
  /**
   * host_anchor / seal_marker: an uncommitted tail beyond a reachable boundary (recover()).
   * anchor_mismatch: the boundary (host anchor, or marker) cannot be reached — the log is
   * shorter or the MAC at the boundary differs. NO authority is installed from either log and
   * ordinary recovery is refused; only an explicit host decision (restore the logs, or reopen
   * with hostDecision "accept_disk_rollback") can proceed.
   */
  source: "host_anchor" | "seal_marker" | "torn_tail" | "anchor_mismatch";
  uncommitted: Record<LogKind, { records: number; bytes: number }>;
  incident?: DurableIncident;
  mismatch?: Partial<Record<LogKind, { expected: ChainHead; reachedRecords: number; boundary: "host_anchor" | "seal_marker" }>>;
}

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
   * H2 commit model — host-held commit boundary for BOTH logs (as last published via
   * onCommit). Replay never goes beyond it. `expectedHead` is the legacy events-only form.
   */
  expectedHeads?: Partial<CommitHeads>;
  /** H2 — called after every committed record with the new commit boundary (host persists it). */
  onCommit?: (heads: CommitHeads) => void;
  /** H2 — called once when the store seals after an uncertain durable write. */
  onIncident?: (incident: DurableIncident) => void;
  /** H2 — test-only I/O fault injection for durable log writes and recovery truncation. */
  ioFaults?: {
    log?: (kind: LogKind, phase: "write" | "fsync", record: Record<string, unknown>) => "fail" | "partial" | undefined;
    recover?: (kind: LogKind, phase: "truncate") => "fail" | undefined;
  };
  /**
   * H2 — explicit host decision for an anchor mismatch: adopt the authenticated on-disk chain
   * as the new truth (a rollback the host accepts). The store then publishes the adopted
   * heads via onCommit and reports `rollbackAccepted`. Never applied implicitly.
   */
  hostDecision?: "accept_disk_rollback";
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
  /** H2 — set at an uncertain durable write; all further durable appends are refused. */
  private sealedReason: string | null = null;
  /** H2 — the store opened with an uncommitted tail / persisted seal; recover() required. */
  private recoveryState: RecoveryState | null = null;
  /** H2 — set when the host explicitly accepted a disk rollback at open (hostDecision). */
  rollbackAccepted: { previous: Partial<CommitHeads>; adopted: CommitHeads } | null = null;
  /** H2 — live incident (this process). */
  private incidentRec: DurableIncident | null = null;
  /** H2 — byte length of each log up to (and including) its last committed record. */
  private readonly committedBytes: Record<LogKind, number> = { events: 0, evidence: 0 };
  private seq = 0;
  private readonly events: StoredEvent[] = [];
  private readonly evidence = new Map<string, EvidenceRecord>();
  /** Blocker B — Kernel-issued artifacts by artifactId. The only source of spool trust. */
  private readonly registry = new Map<string, ArtifactRef & ArtifactProvenance>();
  private readonly key: Buffer;
  /** True when no host key was supplied: nothing written now can be trusted after restart. */
  readonly ephemeralKey: boolean;
  private readonly chain: Record<LogKind, ChainHead>;
  /** Blocker 1 — what replay authenticated vs rejected, per log (+ H2 seal-marker status). */
  readonly integrity: Record<LogKind, ChainReport> & { marker: null | "valid" | "invalid" };

  constructor(private readonly opts: EventStoreOptions) {
    this.ephemeralKey = !opts.integrityKey;
    this.key = opts.integrityKey ? Buffer.from(opts.integrityKey) : crypto.randomBytes(32);
    if (this.key.length < 32) throw new Error("integrityKey must be at least 32 bytes");
    this.chain = { events: { count: 0, mac: this.genesis("events") }, evidence: { count: 0, mac: this.genesis("evidence") } };
    this.integrity = {
      events: { ok: true, accepted: 0, rejected: [], truncated: false },
      evidence: { ok: true, accepted: 0, rejected: [], truncated: false },
      marker: null,
    };
    this.fsc = new Confinement(opts.root, { mode: opts.confinement, probe: opts.fsProbe });
    this.dvlDir = path.join(opts.root, ".dvl");
    this.spoolDir = path.join(this.dvlDir, "spool");
    this.adapterSpoolDir = path.join(this.dvlDir, "adapter-spool");
    this.eventsPath = path.join(this.dvlDir, "events", "events.jsonl");
    this.evidencePath = path.join(this.dvlDir, "evidence", "evidence.jsonl");
    // H2: created component-by-component without following symlinks; fail closed if any
    // Kernel-owned directory or log was replaced by a symlink, a file, or a hard link.
    for (const rel of [[".dvl", "spool"], [".dvl", "adapter-spool"], EVENTS_DIR, EVIDENCE_DIR, INTEGRITY_DIR]) this.fsc.openDir(rel, true).close();
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
    // H2: only COMMITTED records — never a possibly-written record beyond the commit boundary.
    return this.readChain<StoredEvent>("events", this.chain.events).records;
  }

  /** H2 — non-null once the store has failed closed (uncertain durable write). */
  get sealed(): string | null {
    return this.sealedReason;
  }

  /** H2 — non-null when the store opened with an uncommitted tail or persisted seal. */
  get recovery(): RecoveryState | null {
    return this.recoveryState;
  }

  /** H2 — the incident that sealed this store (this process), if any. */
  get incident(): DurableIncident | null {
    return this.incidentRec;
  }

  /** H2 — current commit boundary of both logs (what the host should hold as anchors). */
  heads(): CommitHeads {
    return { events: { ...this.chain.events }, evidence: { ...this.chain.evidence } };
  }

  /**
   * H2 — explicit recovery decision: quarantine every byte beyond the commit boundary of both
   * logs into .dvl/integrity/quarantine-<log>-<ts>.jsonl, truncate the logs to the boundary,
   * remove the seal marker, and re-open for appends.
   *
   * Phases (any failure → SpoolIntegrityError "recovery_failed", seal/recovery state KEPT):
   *   1. validate BOTH logs (bound read: dir identity, name ↔ inode, one link) — size not below
   *      the boundary, committed prefix re-verified against the commit head — and capture the
   *      exact tail bytes (short reads handled);
   *   2. write each tail to a NEW quarantine file in the confined integrity dir and read it
   *      back (bytes must match);
   *   3. per log: bind again, re-check size and tail bytes unchanged, truncate, fsync, re-bind
   *      (still the same single-link inode at its canonical place) and check the new size;
   *   4. re-bind both logs once more, then remove the marker and clear seal/recovery.
   * Refused outright for an anchor mismatch (requires a host decision, not recovery).
   */
  recover(): { quarantined: Record<LogKind, { bytes: number; file: string | null }> } {
    if (!this.recoveryState && !this.sealedReason) return { quarantined: { events: { bytes: 0, file: null }, evidence: { bytes: 0, file: null } } };
    if (this.recoveryState?.source === "anchor_mismatch") {
      throw new SpoolIntegrityError("commit boundary cannot be reached (anchor mismatch): restore the logs or make an explicit host rollback decision", "anchor_mismatch");
    }
    const fail = (e: unknown): never => {
      if (e instanceof SpoolIntegrityError && e.code === "recovery_failed") throw e;
      throw new SpoolIntegrityError(`recovery refused, seal/recovery state kept: ${(e as Error).message}`, "recovery_failed");
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    // Phase 1: validate both logs and capture exact tails — no mutation yet.
    const tails = {} as Record<LogKind, Buffer>;
    try {
      for (const kind of LOG_KINDS) {
        const committed = this.committedBytes[kind];
        const check = this.readChain(kind, this.chain[kind]);
        // The boundary record must still be reachable with the committed MAC, inside the
        // committed range (inert rejected lines may sit between it and the committed offset).
        if (check.report.truncated || check.committedBytes > committed) {
          throw new SpoolIntegrityError(`${kind} committed prefix no longer matches the commit head`, "recovery_failed");
        }
        tails[kind] = this.readLogRange(kind, committed);
      }
    } catch (e) {
      fail(e);
    }
    // Phase 2: quarantine copies (confined, exclusive), verified by read-back.
    const quarantined = {} as Record<LogKind, { bytes: number; file: string | null }>;
    try {
      for (const kind of LOG_KINDS) {
        let file: string | null = null;
        if (tails[kind].length > 0) {
          file = `quarantine-${kind}-${stamp}.jsonl`;
          this.fsc.probe("recover:before-quarantine", path.join(this.dvlDir, "integrity", file));
          this.writeKernelFile(INTEGRITY_DIR, file, tails[kind]);
          const back = this.withDir(INTEGRITY_DIR, (d) => {
            const { fd } = openBound(d, file!, O_RDONLY);
            try {
              return fs.readFileSync(fd);
            } finally {
              fs.closeSync(fd);
            }
          });
          if (!back.equals(tails[kind])) throw new SpoolIntegrityError(`quarantine copy of ${kind} tail does not match`, "recovery_failed");
        }
        quarantined[kind] = { bytes: tails[kind].length, file };
      }
    } catch (e) {
      fail(e);
    }
    // Phase 3: truncate each log through a freshly bound descriptor, re-bound after.
    try {
      for (const kind of LOG_KINDS) {
        if (tails[kind].length === 0) continue;
        const committed = this.committedBytes[kind];
        this.withLogDir(kind, (d, name) => {
          const { fd } = openBound(d, name, fs.constants.O_RDWR);
          try {
            this.fsc.probe("recover:before-truncate", d.kernelPath(name));
            rebind(d, name, fd, "replaced");
            const size = fs.fstatSync(fd).size;
            if (size !== committed + tails[kind].length) throw new SpoolIntegrityError(`${kind} log changed since validation (${size} bytes)`, "recovery_failed");
            const now = Buffer.alloc(tails[kind].length);
            readFully(fd, now, committed);
            if (!now.equals(tails[kind])) throw new SpoolIntegrityError(`${kind} tail bytes changed since validation`, "recovery_failed");
            if (this.opts.ioFaults?.recover?.(kind, "truncate") === "fail") throw Object.assign(new Error("EIO: injected truncate error"), { code: "EIO" });
            fs.ftruncateSync(fd, committed);
            if (this.opts.fsync) fs.fsyncSync(fd);
            rebind(d, name, fd, "after_write");
            if (fs.fstatSync(fd).size !== committed) throw new SpoolIntegrityError(`${kind} log size after truncation is wrong`, "recovery_failed");
          } finally {
            fs.closeSync(fd);
          }
        });
      }
      // Phase 4: both logs must be safe (bound, exact committed size) before anything clears.
      this.fsc.probe("recover:before-clear", this.dvlDir);
      for (const kind of LOG_KINDS) {
        this.withLogDir(kind, (d, name) => {
          const { fd, st } = openBound(d, name, O_RDONLY);
          fs.closeSync(fd);
          if (st.size !== this.committedBytes[kind]) throw new SpoolIntegrityError(`${kind} log is not at its commit boundary after recovery`, "recovery_failed");
        });
      }
      this.withDir(INTEGRITY_DIR, (d) => {
        try {
          fs.unlinkSync(d.entry(SEAL_MARKER));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      });
    } catch (e) {
      fail(e);
    }
    this.sealedReason = null;
    this.recoveryState = null;
    this.incidentRec = null;
    return { quarantined };
  }

  /** H2 — exact bytes of a log from `from` to its end, through a bound descriptor. */
  private readLogRange(kind: LogKind, from: number): Buffer {
    return this.withLogDir(kind, (d, name) => {
      const { fd } = openBound(d, name, O_RDONLY);
      try {
        const size = fs.fstatSync(fd).size;
        if (size < from) throw new SpoolIntegrityError(`${kind} log is shorter than its commit boundary (${size} < ${from})`, "recovery_failed");
        const buf = Buffer.alloc(size - from);
        readFully(fd, buf, from);
        return buf;
      } finally {
        fs.closeSync(fd);
      }
    });
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
    for (const r of this.readChain<EvidenceRecord>("evidence", this.chain.evidence).records) latest.set(r.evidenceId, r);
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
    // H2: open/write/close per record. The log is opened relative to its verified directory
    // (never created here, never through a symlink) and bound (regular file, one link,
    // name ↔ inode, directory still canonical) at open AND immediately before the write — a
    // refusal there writes nothing and commits nothing. From the moment the write begins, any
    // failure (write/partial write/fsync error, post-write integrity detection) is an
    // UNCERTAIN outcome: the record may be on disk, so it is NOT committed and the store SEALS
    // before any later append — it never appends again from the old head (no chain fork).
    if (this.sealedReason) throw new SpoolIntegrityError(`store sealed after an uncertain durable write: ${this.sealedReason}`, "sealed");
    if (this.recoveryState) {
      const mismatch = this.recoveryState.source === "anchor_mismatch";
      throw new SpoolIntegrityError(
        mismatch ? "commit boundary cannot be reached (anchor mismatch); appends are refused until the host restores the logs or decides a rollback" : `store requires recovery (${this.recoveryState.source}); appends are refused until recover()`,
        mismatch ? "anchor_mismatch" : "recovery_required",
      );
    }
    const bytes = Buffer.from(line);
    let committedSize = 0;
    this.withLogDir(kind, (d, name) => {
      this.fsc.probe("log:before-open", d.kernelPath(name));
      const { fd } = openBound(d, name, O_WRONLY | O_APPEND);
      try {
        this.fsc.probe("log:after-open", d.kernelPath(name));
        rebind(d, name, fd, "replaced");
        this.fsc.probe("log:before-write", d.kernelPath(name));
        try {
          const fault = this.opts.ioFaults?.log?.(kind, "write", obj as Record<string, unknown>);
          if (fault === "partial") {
            writeAll(fd, bytes.subarray(0, Math.floor(bytes.length / 2)));
            throw Object.assign(new Error("EIO: injected partial write"), { code: "EIO" });
          }
          if (fault === "fail") throw Object.assign(new Error("EIO: injected write error"), { code: "EIO" });
          writeAll(fd, bytes);
          if (this.opts.fsync) {
            if (this.opts.ioFaults?.log?.(kind, "fsync", obj as Record<string, unknown>) === "fail") throw Object.assign(new Error("EIO: injected fsync error"), { code: "EIO" });
            fs.fsyncSync(fd);
          }
          this.fsc.probe("log:after-write", d.kernelPath(name));
          rebind(d, name, fd, "after_write");
          committedSize = fs.fstatSync(fd).size;
        } catch (e) {
          const code = e instanceof SpoolIntegrityError ? e.code : "uncommitted";
          this.seal(kind, code, (e as Error).message);
          throw e instanceof SpoolIntegrityError ? e : new SpoolIntegrityError(`uncertain durable write to ${kind} log (${(e as Error).message}); record not committed, store sealed`, "uncommitted");
        }
      } finally {
        fs.closeSync(fd);
      }
    });
    // H2: publishing the new boundary to the host is PART of the commit. Only after the host
    // accepted it do the internal head, committed size and (in the caller) live history
    // advance. If publication fails, the host may or may not have stored it: the record is not
    // committed in this process, and the store seals before any later append, so nothing can
    // ever be appended across an unpublished boundary. On restart the HOST's boundary decides
    // (old boundary → quarantined tail; new boundary → committed).
    const next: CommitHeads = { ...this.heads(), [kind]: { count: this.chain[kind].count + 1, mac } };
    try {
      this.opts.onCommit?.(next);
    } catch (e) {
      this.seal(kind, "publication_failed", `commit-boundary publication failed: ${(e as Error).message}`);
      throw new SpoolIntegrityError(`commit-boundary publication to the host failed (${(e as Error).message}); record not committed, store sealed`, "publication_failed");
    }
    this.committedBytes[kind] = committedSize;
    this.chain[kind] = next[kind];
  }

  /** H2 — fail closed after an uncertain durable write: seal, persist marker, tell the host. */
  private seal(kind: LogKind, code: string, reason: string): void {
    if (this.sealedReason) return;
    this.sealedReason = reason;
    const committed = {} as DurableIncident["committed"];
    for (const k of LOG_KINDS) committed[k] = { ...this.chain[k], bytes: this.committedBytes[k] };
    const incident: DurableIncident = { log: kind, code, reason, at: new Date().toISOString(), committed, markerPersisted: false };
    try {
      const body = { incident: { ...incident, markerPersisted: undefined } };
      const canonical = JSON.stringify(body);
      const mac = crypto.createHmac("sha256", this.key).update("dvl-seal-marker\n").update(canonical).digest("hex");
      this.writeKernelFile(INTEGRITY_DIR, SEAL_MARKER, Buffer.from(JSON.stringify({ ...body, mac })));
      incident.markerPersisted = true;
    } catch {
      /* best effort: the integrity area may be unusable too; the host still gets onIncident */
    }
    this.incidentRec = incident;
    this.opts.onIncident?.(incident);
  }

  /** H2 — the authenticated seal marker, if present and valid. */
  private readMarker(): DurableIncident | null {
    const raw = this.withDir(INTEGRITY_DIR, (d) => {
      let fd: number;
      try {
        fd = openBound(d, SEAL_MARKER, O_RDONLY).fd;
      } catch (e) {
        if (e instanceof SpoolIntegrityError && e.code === "missing") return null;
        throw e;
      }
      try {
        return fs.readFileSync(fd, "utf8");
      } finally {
        fs.closeSync(fd);
      }
    });
    if (raw === null) return null;
    try {
      const { mac, ...body } = JSON.parse(raw) as { mac: string; incident: DurableIncident };
      const expected = crypto.createHmac("sha256", this.key).update("dvl-seal-marker\n").update(JSON.stringify(body)).digest("hex");
      if (typeof mac !== "string" || mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) throw new Error("bad mac");
      this.integrity.marker = "valid";
      return { ...body.incident, markerPersisted: true };
    } catch {
      this.integrity.marker = "invalid"; // forged/corrupt marker: confers nothing, reported
      return null;
    }
  }

  /**
   * Walk one log, accepting only lines whose MAC continues the last accepted line, and never
   * beyond `boundary` (the commit boundary): records/bytes after it are counted as uncommitted.
   * Without a boundary the whole authenticated log is accepted, except a torn final fragment
   * (no trailing newline), which can never be a complete committed record.
   */
  private readChain<T>(kind: LogKind, boundary?: ChainHead): { records: T[]; report: ChainReport; head: ChainHead; committedBytes: number } {
    const report: ChainReport = { ok: true, accepted: 0, rejected: [], truncated: false, uncommitted: { records: 0, bytes: 0 } };
    const records: T[] = [];
    let prev = this.genesis(kind);
    // H2: read through a bound no-follow descriptor; an unsafe log path (symlink, hard link,
    // swapped/moved directory) fails closed with SpoolIntegrityError. A missing log is empty.
    const buf = this.withLogDir(kind, (d, name) => {
      let fd: number;
      try {
        fd = openBound(d, name, O_RDONLY).fd;
      } catch (e) {
        if (e instanceof SpoolIntegrityError && e.code === "missing") return Buffer.alloc(0);
        throw e;
      }
      try {
        return fs.readFileSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    });
    let committedEnd = 0;
    let off = 0;
    let lineNo = 0;
    let atBoundary = boundary !== undefined && boundary.count === 0;
    let boundaryMacOk = boundary === undefined || boundary.count === 0;
    while (off < buf.length) {
      const nl = buf.indexOf(10, off);
      const end = nl === -1 ? buf.length : nl + 1;
      const line = buf.toString("utf8", off, nl === -1 ? buf.length : nl);
      const start = off;
      off = end;
      lineNo++;
      if (!line.trim()) {
        if (!atBoundary) committedEnd = end;
        continue;
      }
      if (atBoundary) {
        report.uncommitted!.records++;
        continue;
      }
      if (nl === -1) {
        // Torn final fragment: a crash/uncertain-write artifact, never a committed record.
        report.uncommitted!.records++;
        committedEnd = start;
        break;
      }
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch {
        report.rejected.push({ line: lineNo, reason: "unparseable" });
        committedEnd = end;
        continue;
      }
      const { mac, ...rest } = obj;
      const reject = (reason: "missing_mac" | "mac_mismatch") => {
        report.rejected.push({ line: lineNo, reason, eventId: typeof rest.eventId === "string" ? rest.eventId : undefined, type: typeof rest.type === "string" ? rest.type : undefined });
        committedEnd = end;
      };
      if (typeof mac !== "string") {
        reject("missing_mac");
        continue;
      }
      const expected = this.mac(prev, JSON.stringify(rest));
      if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
        reject("mac_mismatch");
        continue;
      }
      prev = mac;
      report.accepted++;
      records.push(rest as T);
      committedEnd = end;
      if (boundary && report.accepted === boundary.count) {
        atBoundary = true;
        boundaryMacOk = mac === boundary.mac;
      }
    }
    report.uncommitted!.bytes = buf.length - committedEnd;
    if (boundary && (report.accepted < boundary.count || !boundaryMacOk)) report.truncated = true;
    if (report.uncommitted!.records === 0 && report.uncommitted!.bytes === 0) delete report.uncommitted;
    report.ok = report.rejected.length === 0 && !report.truncated && report.uncommitted === undefined;
    return { records, report, head: { count: report.accepted, mac: prev }, committedBytes: committedEnd };
  }

  private replay(): void {
    // Commit boundary: host anchors win; else the persisted (authenticated) seal marker.
    const marker = this.readMarker();
    const host: Partial<CommitHeads> = { ...this.opts.expectedHeads };
    if (this.opts.expectedHead && !host.events) host.events = this.opts.expectedHead;
    const boundaryOf = (k: LogKind): ChainHead | undefined => host[k] ?? (marker ? { count: marker.committed[k].count, mac: marker.committed[k].mac } : undefined);
    let ev = this.readChain<StoredEvent>("events", boundaryOf("events"));
    let evd = this.readChain<EvidenceRecord>("evidence", boundaryOf("evidence"));
    this.integrity.events = ev.report;
    this.integrity.evidence = evd.report;
    const anyHostBoundary = host.events !== undefined || host.evidence !== undefined;
    if (ev.report.truncated || evd.report.truncated) {
      const mismatch: NonNullable<RecoveryState["mismatch"]> = {};
      for (const [k, r] of [["events", ev], ["evidence", evd]] as const) {
        const b = boundaryOf(k);
        if (r.report.truncated && b) mismatch[k] = { expected: b, reachedRecords: r.report.accepted, boundary: host[k] ? "host_anchor" : "seal_marker" };
      }
      if (this.opts.hostDecision !== "accept_disk_rollback") {
        // Fail closed: the boundary that defines Project Truth cannot be reached. Install NO
        // authority from either log (history, evidence, artifact registry stay empty), keep
        // the chains at genesis so nothing can be appended over the host's checkpoint.
        this.recoveryState = { source: "anchor_mismatch", uncommitted: { events: { records: 0, bytes: 0 }, evidence: { records: 0, bytes: 0 } }, incident: marker ?? undefined, mismatch };
        return;
      }
      // Explicit host decision: adopt the authenticated on-disk chain (full, no boundary).
      ev = this.readChain<StoredEvent>("events");
      evd = this.readChain<EvidenceRecord>("evidence");
      this.integrity.events = ev.report;
      this.integrity.evidence = evd.report;
      this.rollbackAccepted = { previous: { events: boundaryOf("events"), evidence: boundaryOf("evidence") }, adopted: { events: ev.head, evidence: evd.head } };
    }
    this.chain.events = ev.head; // new records continue the committed chain
    this.chain.evidence = evd.head;
    this.committedBytes.events = ev.committedBytes;
    this.committedBytes.evidence = evd.committedBytes;
    for (const e of ev.records) {
      this.events.push(e);
      this.seq = Math.max(this.seq, e.kernelSequence);
      // Only authenticated, COMMITTED Kernel-origin registrations rebuild provenance.
      if (e.type === ARTIFACT_REGISTERED && e.origin === "kernel" && e.trust === "kernel_truth") {
        const entry = e.payload as ArtifactRef & ArtifactProvenance;
        this.registry.set(entry.artifactRef, entry);
      }
    }
    for (const r of evd.records) this.evidence.set(r.evidenceId, r);

    const unc = (r: ChainReport) => r.uncommitted ?? { records: 0, bytes: 0 };
    const hasTail = unc(ev.report).bytes > 0 || unc(evd.report).bytes > 0;
    const anyHost = anyHostBoundary && !this.rollbackAccepted;
    if (this.rollbackAccepted) {
      // The host decided: the adopted chain is the new boundary. Publish it explicitly and
      // drop the stale marker (its boundary was part of what the host overrode).
      this.withDir(INTEGRITY_DIR, (d) => {
        try {
          fs.unlinkSync(d.entry(SEAL_MARKER));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      });
      this.opts.onCommit?.(this.heads());
      if (hasTail) {
        this.recoveryState = { source: "torn_tail", uncommitted: { events: unc(ev.report), evidence: unc(evd.report) } };
        this.recover();
      }
    } else if (marker || (hasTail && anyHost)) {
      this.recoveryState = { source: anyHost ? "host_anchor" : "seal_marker", uncommitted: { events: unc(ev.report), evidence: unc(evd.report) }, incident: marker ?? undefined };
    } else if (hasTail) {
      // No boundary at all: only a torn final fragment can be identified as uncommitted. It
      // is quarantined right away (it can never be a complete record) so the next append
      // cannot be glued onto it and become unreplayable.
      this.recoveryState = { source: "torn_tail", uncommitted: { events: unc(ev.report), evidence: unc(evd.report) } };
      this.recover();
    }
  }
}

/** H2 — an adapter claim that fails a Kernel check during import (reported, never thrown out). */
class ImportRejection extends Error {}

/** Read exactly buf.length bytes at `pos` (short reads looped; premature EOF is an error). */
function readFully(fd: number, buf: Buffer, pos: number): void {
  let off = 0;
  while (off < buf.length) {
    const n = fs.readSync(fd, buf, off, buf.length - off, pos + off);
    if (n === 0) throw new SpoolIntegrityError(`short read: ${off} of ${buf.length} bytes`, "recovery_failed");
    off += n;
  }
}
