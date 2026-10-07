/**
 * DVL Kernel — Phase 1 Spike.
 *
 * Owns: process supervision, protocol validation, ordering, the Event Store,
 * actor lifecycle (no-writer rule), payload spooling, and EvidenceRecord creation.
 *
 * Does NOT own (out of Phase 1 scope): verification gates, integration gate,
 * authorization classification, sandboxing, real providers.
 *
 * Trust rule enforced everywhere here: every adapter frame is an untrusted
 * observation. Only code in this file creates kernel_truth events or evidence.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { FsProbe } from "./confined-fs.js";
import { EventStore, SpoolIntegrityError, newId, sha256, type ChainHead, type ChainReport, type EventStoreOptions } from "./event-store.js";
import { NdjsonTransport, type TransportIssue } from "./ndjson-transport.js";
import { RootLock, RootLockError } from "./root-lock.js";
import {
  CONTRACT_VERSION,
  FORBIDDEN_ADAPTER_EVENTS,
  KERNEL_SPOOL_OWNER,
  MAX_INLINE_PAYLOAD_BYTES,
  MAX_QUEUED_BYTES,
  MAX_QUEUED_FRAMES,
  PROVIDER_EVENT_TYPES,
  QUIESCENCE_MS,
  REQUIRED_CAPABILITY_FIELDS,
  RESPONSE_TYPES,
  type AdapterCapabilities,
  type ArtifactRef,
  type CommandFrame,
  type CommandType,
  type EvidenceRecord,
  type EvidenceStatus,
  type EvidenceType,
  type RunIdentity,
  type StoredEvent,
} from "./types.js";

// ───────────────────────── options ─────────────────────────

export interface SafetyLimits {
  /** §49 L-0 surrogate limits — enforced regardless of provider capability. */
  maxDurationMs: number;
  maxIncomingBytes: number;
}

export interface KernelOptions {
  root: string;
  adapterCommand: string[]; // argv; [0] is the executable
  adapterEnv?: Record<string, string>;
  requestTimeoutMs?: number;
  limits?: Partial<SafetyLimits>;
  fsync?: boolean;
  /** Test hook: artificial delay per processed frame. */
  processingDelayMs?: number;
  /**
   * Test hook: awaited before each frame is processed. Lets a test block the Kernel
   * indefinitely mid-frame to prove the drain loop keeps running (C37).
   */
  frameGate?: (frameType: string) => Promise<void>;
  quiescenceMs?: number;
  /**
   * Blocker 1 — secret the HOST holds for this project and hands to every Kernel it creates
   * for the root. Authenticates durable records (HMAC chain). Never put in env or on disk,
   * never passed to the adapter. Absent ⇒ an ephemeral key: nothing written by this Kernel
   * can be authenticated by a later one.
   */
  integrityKey?: Buffer;
  /** Blocker 1 — host-held head anchor of the events log (truncation/rollback detection). */
  expectedHead?: ChainHead;
  /** H3 — protocol queue bounds per adapter instance (defaults: MAX_QUEUED_FRAMES / MAX_QUEUED_BYTES). */
  queueLimits?: Partial<QueueLimits>;
  /** H2 commit model — host-held commit boundary for both logs (last value from onCommit). */
  expectedHeads?: EventStoreOptions["expectedHeads"];
  /** H2 — receives the new commit boundary after every committed record (host persists it). */
  onCommit?: EventStoreOptions["onCommit"];
  /** H2 — receives the incident when the store seals after an uncertain durable write. */
  onIncident?: EventStoreOptions["onIncident"];
  /** H2 — explicit host decision for an anchor mismatch (see EventStoreOptions.hostDecision). */
  hostDecision?: EventStoreOptions["hostDecision"];
  /** H2 — test-only durable-write fault injection. */
  ioFaults?: EventStoreOptions["ioFaults"];
  /** H2 — filesystem confinement mode for Kernel-owned paths ("path" forces the fallback). */
  confinement?: "auto" | "path";
  /** H2 — test-only probe at filesystem check/use points (deterministic race injection). */
  fsProbe?: FsProbe;
}

export interface QueueLimits {
  maxQueuedFrames: number;
  maxQueuedBytes: number;
}

export interface RunTask {
  role: string;
  goal: string;
  acceptanceCriteria: string[];
  scope: string[];
  scenario?: string; // Mock-only: selects deterministic scenario
}

/**
 * Run (attempt) lifecycle — blocker 2/4. Terminal states are irreversible for the attempt:
 *   starting --run.started--> running --run.finished--> finished
 *   starting|running --run.failed--> failed;   any --safety halt--> halted
 *   starting --dispatch failed--> failed_to_start (Kernel-decided, never adapter-driven)
 *   starting|running --Kernel stopped without a terminal record--> interrupted (H4, set on replay)
 */
type RunStatus = "starting" | "running" | "finished" | "failed" | "halted" | "failed_to_start" | "interrupted";

/** Action lifecycle — blocker 2. `finished`/`aborted` are terminal. */
type ActionState = "requested" | "started" | "finished" | "aborted";
interface ActionRecord {
  state: ActionState;
  actorId: string;
}

/**
 * Everything below is owned by ONE attempt (the current binding). A retry replaces it
 * wholesale: nothing of a previous attempt's actors, actions or workspace is reused.
 */
interface RunState {
  identity: RunIdentity;
  /** H1 — the adapter instance this attempt is bound to. */
  adapterInstanceId: string;
  status: RunStatus;
  /** Blocker 3 — this attempt's own transaction workspace (.dvl/tx/<runId>/attempt-<n>). */
  txWorkspace: string;
  /** H4 — rebuilt from the durable log by a restarted Kernel; `interrupted` not yet recorded. */
  interruptPending?: boolean;
  rootActorId?: string;
  actors: ActorTracker;
  actions: Map<string, ActionRecord>;
  endWaiters: ((s: RunStatus) => void)[];
}

/** Admission gate — action transitions: event → allowed from-states and resulting state. */
const ACTION_FSM: Record<string, { from: (ActionState | "none")[]; to: ActionState }> = {
  "action.requested": { from: ["none"], to: "requested" },
  "action.started": { from: ["none", "requested"], to: "started" },
  "action.updated": { from: ["started"], to: "started" },
  "action.finished": { from: ["started"], to: "finished" },
};
/** Events that are acts OF an actor (vs run-level/informational events). */
const ACTOR_SCOPED = (type: string) => type.startsWith("actor.") || type.startsWith("action.") || type === "workspace.hint" || type === "approval.requested";

export interface RetryOptions {
  /**
   * Blocker 3 — carry files forward ONLY from this explicitly selected safe mechanical
   * checkpoint: a VALIDATED FILE_SNAPSHOT of the same run whose registered manifest still
   * matches the bytes on disk. Absent ⇒ the new attempt starts from an empty workspace.
   */
  resumeFromEvidenceId?: string;
}

// ───────────────────────── actor lifecycle §46 ─────────────────────────

/**
 * "aborted" (H1): the adapter instance owning the actor died before it finished.
 * Resolved for the no-writer rule (its process group is killed), but never success.
 */
type ActorState = "declared" | "running" | "finished" | "aborted";
interface Actor {
  actorId: string;
  parentId?: string;
  state: ActorState;
  children: Set<string>;
  declaredByFork: boolean;
}

export class ActorTracker {
  private readonly actors = new Map<string, Actor>();

  get(actorId: string): Actor | undefined {
    return this.actors.get(actorId);
  }

  ensure(actorId: string): Actor {
    let a = this.actors.get(actorId);
    if (!a) {
      a = { actorId, state: "running", children: new Set(), declaredByFork: false };
      this.actors.set(actorId, a);
    }
    return a;
  }

  fork(parentId: string, childIds: string[]): void {
    const parent = this.ensure(parentId);
    for (const id of childIds) {
      parent.children.add(id);
      const existing = this.actors.get(id);
      if (existing) {
        existing.parentId = parentId;
        continue;
      }
      this.actors.set(id, { actorId: id, parentId, state: "declared", children: new Set(), declaredByFork: true });
    }
  }

  /** Returns true if the actor was NOT previously declared (fork race). */
  start(actorId: string): boolean {
    const known = this.actors.has(actorId);
    const a = this.ensure(actorId);
    a.state = "running";
    return !known;
  }

  finish(actorId: string): void {
    this.ensure(actorId).state = "finished";
  }

  /** H1 — owner died: abort every unresolved actor; returns the aborted ids. */
  abortUnresolved(): string[] {
    const ids: string[] = [];
    for (const a of this.actors.values()) if (this.abort(a.actorId)) ids.push(a.actorId);
    return ids;
  }

  /** H1 — owner instance died. Returns true if the actor was unresolved (and is now aborted). */
  abort(actorId: string): boolean {
    const a = this.actors.get(actorId);
    if (!a || a.state === "finished" || a.state === "aborted") return false;
    a.state = "aborted";
    return true;
  }

  /** §46: a parent is not fully finished while declared children are unresolved. */
  isFullyFinished(actorId: string, seen = new Set<string>()): boolean {
    if (seen.has(actorId)) return true; // cycle guard
    seen.add(actorId);
    const a = this.actors.get(actorId);
    if (!a || (a.state !== "finished" && a.state !== "aborted")) return false;
    for (const c of a.children) if (!this.isFullyFinished(c, seen)) return false;
    return true;
  }

  unresolved(): string[] {
    return [...this.actors.values()].filter((a) => a.state !== "finished" && a.state !== "aborted").map((a) => `${a.actorId}:${a.state}`);
  }

  aborted(): string[] {
    return [...this.actors.values()].filter((a) => a.state === "aborted").map((a) => a.actorId);
  }
}

// ───────────────────────── Kernel ─────────────────────────

export interface SnapshotResult {
  status: "SNAPSHOT_TAKEN" | "DEFERRED";
  reasons: string[];
  evidence?: EvidenceRecord;
}

export class Kernel {
  readonly store: EventStore;
  capabilities: AdapterCapabilities | null = null;

  private child: ChildProcess | null = null;
  private transport: NdjsonTransport | null = null;
  private readonly pending = new Map<string, { resolve: (f: Record<string, unknown>) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private readonly runs = new Map<string, RunState>();
  private readonly terminatedInstances = new Set<string>();
  /**
   * H1 — identity of the live adapter process. adapterSequence is only meaningful
   * within one instance; ordering state below is keyed by instance, never global.
   */
  private adapterInstanceId: string | null = null;
  private readonly lastAdapterSequence = new Map<string, number>(); // adapterInstanceId → last accepted seq
  private readonly actorSeq = new Map<string, number>(); // instanceKey(adapterInstanceId, runId, attempt, actorId) → last seq; binding-admitted frames only
  private readonly lastDeferralKey = new Map<string, string>();
  private lastMutationAt = 0;
  private durationTimer: NodeJS.Timeout | null = null;
  private closeWaiters: (() => void)[] = [];
  private closed = false;
  readonly limits: SafetyLimits;
  readonly queueLimits: QueueLimits;
  readonly projectId: string;
  /** H4 — exclusive ownership of the root; taken before this Kernel writes anything as owner. */
  private rootLock: RootLock | null = null;

  constructor(private readonly opts: KernelOptions) {
    this.store = new EventStore({ root: opts.root, fsync: opts.fsync, integrityKey: opts.integrityKey, expectedHead: opts.expectedHead, expectedHeads: opts.expectedHeads, hostDecision: opts.hostDecision, onCommit: opts.onCommit, onIncident: opts.onIncident, ioFaults: opts.ioFaults, confinement: opts.confinement, fsProbe: opts.fsProbe });
    const { events, evidence } = this.store.integrity;
    if (!events.ok || !evidence.ok) {
      // Fail closed: rejected records stay on disk as inert bytes and confer nothing.
      const summarize = (r: ChainReport) => ({ ok: r.ok, accepted: r.accepted, truncated: r.truncated, rejectedCount: r.rejected.length, rejected: r.rejected.slice(0, 50) });
      this.kernelEvent("kernel.integrity_violation", { events: summarize(events), evidence: summarize(evidence) });
    }
    if (this.store.rollbackAccepted) this.kernelEvent("kernel.anchor_rollback_accepted", this.store.rollbackAccepted);
    if (this.store.ephemeralKey) this.kernelEvent("kernel.integrity_key_ephemeral", { note: "no host integrityKey: durable records will not authenticate after restart" });
    this.limits = { maxDurationMs: 60_000, maxIncomingBytes: 256 * 1024 * 1024, ...opts.limits };
    this.queueLimits = { maxQueuedFrames: MAX_QUEUED_FRAMES, maxQueuedBytes: MAX_QUEUED_BYTES, ...opts.queueLimits };
    this.projectId = "proj_spike";
    this.rebuildRunsFromReplay();
  }

  /**
   * H4 — Kernel crash/restart recovery. Rebuild run/attempt state from the authenticated,
   * committed history, using Kernel-origin records only: an adapter-origin run.finished in the
   * log is a claim, never a completion. An attempt with no terminal kernel.run_<status> record
   * was live when the previous Kernel stopped: it becomes `interrupted` — terminal, never
   * success, eligible for retryRun(). Read-only here (a replaying Kernel may only be a reader);
   * start() records kernel.run_interrupted once the Kernel takes ownership of the root.
   */
  private rebuildRunsFromReplay(): void {
    for (const e of this.store.all()) {
      if (e.origin !== "kernel" || !e.runId) continue;
      const p = (e.payload ?? {}) as Record<string, unknown>;
      const run = this.runs.get(e.runId);
      if (e.type === "kernel.run_created") {
        const { adapterInstanceId, txWorkspace, ...identity } = p as unknown as RunIdentity & { adapterInstanceId: string; txWorkspace: string };
        this.runs.set(e.runId, { identity, adapterInstanceId, status: "starting", txWorkspace: path.join(this.opts.root, String(txWorkspace)), actors: new ActorTracker(), actions: new Map(), endWaiters: [] });
      } else if (run && e.type === "kernel.attempt_created") {
        run.identity = { ...run.identity, attempt: Number(p.attempt), workspaceId: String(p.workspaceId) };
        run.adapterInstanceId = String(p.adapterInstanceId);
        run.txWorkspace = path.join(this.opts.root, String(p.txWorkspace));
        run.status = "starting";
      } else if (run && e.attempt === run.identity.attempt && TERMINAL_RECORDS.has(e.type)) {
        if (!isTerminal(run.status)) run.status = TERMINAL_RECORDS.get(e.type)!;
      }
    }
    for (const run of this.runs.values()) {
      if (isTerminal(run.status)) continue;
      run.status = "interrupted";
      run.interruptPending = true;
    }
  }

  get transportStats() {
    return this.transport?.stats;
  }
  get stderrSpoolPath() {
    return this.transport?.stderrSpoolPath;
  }
  get noiseSpoolPath() {
    return this.transport?.noiseSpoolPath;
  }

  // ───────────── process supervision ─────────────

  start(): void {
    if (this.child) throw new Error("kernel already started");
    this.assertDurable();
    // H4 — fail closed before ANY owner write (interruption records, spawn records): a second
    // live Kernel on this root, running or paused, gets "root_locked" and changes nothing.
    this.acquireRoot();
    for (const run of this.runs.values()) {
      if (!run.interruptPending) continue;
      run.interruptPending = false;
      const { runId, attempt } = run.identity;
      this.kernelEvent("kernel.run_interrupted", { runId, attempt, adapterInstanceId: run.adapterInstanceId, reason: "Kernel restarted: the attempt has no terminal record" }, runId, attempt);
    }
    this.spawnAdapter();
  }

  /**
   * H1 — replace the adapter with a fresh process under a new adapterInstanceId.
   *
   * Default: only once the previous instance is fully closed. With { force: true }
   * a live instance is retired first: it is fenced (any frame it still delivers is
   * a stale_adapter_instance violation), its process group is SIGKILLed, and its
   * runs/actions/actors are terminated as failed/aborted. Capabilities are
   * per-instance: the caller must describe() again before run.start.
   */
  restartAdapter(opts: { force?: boolean } = {}): void {
    if (!this.child) throw new Error("kernel not started");
    if (!this.closed) {
      if (!opts.force) throw new Error("restartAdapter: previous adapter instance is still running");
      const old = this.adapterInstanceId!;
      this.kernelEvent("kernel.adapter_instance_retired", { adapterInstanceId: old, reason: "forced restart" });
      this.kill("SIGKILL");
      this.terminateInstance(old, "adapter instance retired by forced restart");
      if (this.durationTimer) clearTimeout(this.durationTimer);
      // Waiters were waiting on the retired instance: from the Kernel's view it is gone.
      this.closeWaiters.splice(0).forEach((w) => w());
    }
    this.capabilities = null;
    this.spawnAdapter();
  }

  get currentAdapterInstanceId(): string | null {
    return this.adapterInstanceId;
  }

  private spawnAdapter(): void {
    const [cmd, ...args] = this.opts.adapterCommand;
    if (!cmd) throw new Error("adapterCommand is empty");
    // H2: the instance id exists BEFORE the process, so its spool areas can be created
    // fresh (never shared, never inherited) and handed to it at spawn.
    const adapterInstanceId = this.newAdapterInstanceId();
    const spools = this.store.createInstanceSpools(adapterInstanceId);
    const child = spawn(cmd, args, {
      cwd: this.opts.root,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.opts.adapterEnv, DVL_PROJECT_ROOT: this.opts.root, DVL_ADAPTER_SPOOL_DIR: spools.adapterDir },
      detached: process.platform !== "win32", // own process group → killable as a unit
    });
    this.child = child;
    this.closed = false;
    this.adapterInstanceId = adapterInstanceId;
    this.lastAdapterSequence.set(adapterInstanceId, 0);
    this.kernelEvent("kernel.adapter_spawned", {
      adapterInstanceId,
      pid: child.pid,
      argv: this.opts.adapterCommand,
      kernelSpool: path.relative(this.opts.root, spools.kernelDir),
      adapterSpool: path.relative(this.opts.root, spools.adapterDir),
    });

    // The instance id is bound into these closures at spawn time: frames are
    // attributed to the pipe they arrived on, not to whatever instance is current.
    try {
      this.transport = this.newTransport(child, adapterInstanceId, spools.kernelDir);
    } catch (e) {
      // H2: diagnostics could not be opened safely in the Kernel spool. Never leave the
      // just-spawned child running without a supervised, drained transport, and never let
      // the previous instance's transport stand in for it.
      child.kill("SIGKILL");
      this.transport = null;
      this.closed = true;
      this.terminatedInstances.add(adapterInstanceId);
      this.kernelEvent("kernel.adapter_spawn_failed", { adapterInstanceId, reason: (e as Error).message });
      throw e;
    }

    const spawnedAt = Date.now();
    this.durationTimer = setTimeout(() => {
      // Only ever halts the instance it was armed for.
      if (this.adapterInstanceId !== adapterInstanceId) return;
      this.haltForSafety(`maxDurationMs ${this.limits.maxDurationMs} exceeded`, { kind: "max_duration", maxDurationMs: this.limits.maxDurationMs, elapsedMs: Date.now() - spawnedAt });
    }, this.limits.maxDurationMs);
    this.durationTimer.unref();
  }

  private newTransport(child: ChildProcess, adapterInstanceId: string, kernelDir: string): NdjsonTransport {
    return new NdjsonTransport(child, {
      // H2: stderr + non-DVL1 stdout drain into THIS instance's Kernel-owned spool.
      spoolDir: kernelDir,
      diagnosticsName: "diagnostics",
      // H2: every diagnostics create/append (stderr, noise, lazy overflow) is confined to this
      // instance's Kernel spool and revalidated per write; no descriptor is kept between writes.
      diagnosticSink: {
        create: (fileName) => this.store.createDiagnostic(adapterInstanceId, fileName),
        append: (fileName, data) => this.store.appendDiagnostic(adapterInstanceId, fileName, data),
      },
      // H3: bounded, instance-owned queue; a fresh one for every instance.
      adapterInstanceId,
      maxQueuedFrames: this.queueLimits.maxQueuedFrames,
      maxQueuedBytes: this.queueLimits.maxQueuedBytes,
      maxIncomingBytes: this.limits.maxIncomingBytes,
      onFrame: (f, bytes, entryInstanceId) => this.ingest(f, bytes, entryInstanceId),
      onIssue: (i) => this.onTransportIssue(i, adapterInstanceId),
      onClose: (info) => this.onAdapterClosed(info, adapterInstanceId),
    });
  }

  /** Random, never pid- or counter-derived; checked against ids already in the store. */
  private newAdapterInstanceId(): string {
    const seen = new Set(this.store.all().map((e) => e.adapterInstanceId).filter(Boolean));
    for (;;) {
      const id = newId("ainst");
      if (seen.has(id)) continue;
      // Also unique against spool areas on disk (e.g. another Kernel on this root).
      if (fs.existsSync(this.store.kernelSpoolDirOf(id)) || fs.existsSync(this.store.adapterSpoolDirOf(id))) continue;
      return id;
    }
  }

  /**
   * H2 retention: remove untrusted adapter areas of instances that are not live.
   * The live instance's area and the whole Kernel spool are never removed.
   */
  pruneAdapterSpools(): string[] {
    const live = new Set<string>();
    if (this.adapterInstanceId && !this.closed && !this.terminatedInstances.has(this.adapterInstanceId)) live.add(this.adapterInstanceId);
    const removed = this.store.pruneAdapterSpools(live);
    if (removed.length > 0) this.kernelEvent("kernel.adapter_spool_pruned", { removed, kept: [...live] });
    return removed;
  }

  /** §10 — handshake. Rejects on missing fields or unsupported contract version. */
  async describe(): Promise<AdapterCapabilities> {
    const reply = await this.request("adapter.describe", { contractVersion: CONTRACT_VERSION });
    const caps = (reply.payload as { capabilities?: unknown } | undefined)?.capabilities as Partial<AdapterCapabilities> | undefined;
    const missing = REQUIRED_CAPABILITY_FIELDS.filter((k) => caps?.[k] === undefined);
    if (!caps || missing.length > 0) {
      this.kernelEvent("kernel.capabilities_rejected", { missing });
      throw new Error(`capability declaration incomplete: missing ${missing.join(", ")}`);
    }
    if (!caps.supportedContractVersions!.includes(CONTRACT_VERSION)) {
      this.kernelEvent("kernel.capabilities_rejected", { reason: "contract version", offered: caps.supportedContractVersions });
      throw new Error(`adapter does not support ${CONTRACT_VERSION}`);
    }
    this.capabilities = caps as AdapterCapabilities;
    this.kernelEvent("kernel.capabilities_accepted", { adapterId: caps.adapterId, commandExecutionMode: caps.commandExecutionMode, eventFidelity: caps.eventFidelity });
    return this.capabilities;
  }

  /** §11 — DVL issues identity; the provider receives a task, never ownership. */
  async startRun(task: RunTask, attempt = 1): Promise<RunIdentity> {
    this.assertDurable();
    if (!this.capabilities) throw new Error("describe() must succeed before run.start");
    const runId = newId("run");
    const decisions = { db: "postgres", style: "spike" };
    const identity: RunIdentity = {
      projectId: this.projectId,
      taskId: newId("task"),
      workerId: newId("wrk"),
      runId,
      attempt,
      workspaceId: newId("ws"),
      decisionSnapshotVersion: 1,
      decisionSnapshotHash: sha256(JSON.stringify(decisions)),
    };
    const txWorkspace = this.createAttemptWorkspace(runId, attempt);
    const run: RunState = { identity, adapterInstanceId: this.adapterInstanceId!, status: "starting", txWorkspace, actors: new ActorTracker(), actions: new Map(), endWaiters: [] };
    this.runs.set(runId, run);
    this.kernelEvent("kernel.run_created", { ...identity, adapterInstanceId: this.adapterInstanceId, txWorkspace: path.relative(this.opts.root, txWorkspace) }, runId, attempt);
    await this.dispatch(run, identity, task);
    return identity;
  }

  /**
   * The ONLY way a run continues after its attempt ended: the Kernel creates attempt N+1,
   * binds it to the CURRENT adapter instance, gives it a FRESH workspace (blocker 3) and
   * dispatches it atomically (blocker 4). The terminal attempt stays terminal history.
   * Every precondition — including checkpoint safety — is checked before anything changes.
   */
  async retryRun(runId: string, task: RunTask, opts: RetryOptions = {}): Promise<RunIdentity> {
    this.assertDurable();
    if (!this.capabilities) throw new Error("describe() must succeed before run.start");
    const run = this.runs.get(runId);
    if (!run) throw new Error(`unknown run ${runId}`);
    if (!isTerminal(run.status)) throw new Error(`run ${runId} attempt ${run.identity.attempt} is not terminal (status=${run.status})`);
    const checkpoint = opts.resumeFromEvidenceId ? this.loadCheckpoint(runId, opts.resumeFromEvidenceId) : null;

    const previous = { attempt: run.identity.attempt, status: run.status, adapterInstanceId: run.adapterInstanceId, workspaceId: run.identity.workspaceId, txWorkspace: run.txWorkspace };
    this.archiveAttemptWorkspace(runId, previous);

    const identity: RunIdentity = { ...run.identity, attempt: previous.attempt + 1, workspaceId: newId("ws") };
    const txWorkspace = this.createAttemptWorkspace(runId, identity.attempt);
    run.identity = identity;
    run.adapterInstanceId = this.adapterInstanceId!;
    run.status = "starting";
    run.txWorkspace = txWorkspace;
    run.rootActorId = undefined;
    run.actors = new ActorTracker();
    run.actions = new Map();
    run.endWaiters = [];
    this.kernelEvent(
      "kernel.attempt_created",
      {
        runId,
        attempt: identity.attempt,
        workspaceId: identity.workspaceId,
        txWorkspace: path.relative(this.opts.root, txWorkspace),
        adapterInstanceId: run.adapterInstanceId,
        previousAttempt: previous.attempt,
        previousStatus: previous.status,
        previousAdapterInstanceId: previous.adapterInstanceId,
        resumeFromEvidenceId: checkpoint?.evidenceId ?? null,
      },
      runId,
      identity.attempt,
    );
    if (checkpoint) {
      for (const f of checkpoint.files) {
        const abs = path.join(txWorkspace, f.path);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, f.bytes, { flag: "wx" });
      }
      this.kernelEvent(
        "kernel.checkpoint_restored",
        { runId, attempt: identity.attempt, fromAttempt: checkpoint.attempt, evidenceId: checkpoint.evidenceId, files: checkpoint.files.map((f) => f.path) },
        runId,
        identity.attempt,
      );
    }
    await this.dispatch(run, identity, task);
    return identity;
  }

  /** Blocker 3 — every attempt gets a brand-new directory; an existing one is never reused. */
  private createAttemptWorkspace(runId: string, attempt: number): string {
    const runDir = path.join(this.store.dvlDir, "tx", runId);
    fs.mkdirSync(runDir, { recursive: true });
    const dir = path.join(runDir, `attempt-${attempt}`);
    fs.mkdirSync(dir); // throws EEXIST rather than inherit anything
    return dir;
  }

  /** Blocker 3 — final disposition of a superseded attempt's workspace: hashed, registered, left in place, never reused. */
  private archiveAttemptWorkspace(runId: string, prev: { attempt: number; status: RunStatus; workspaceId: string; txWorkspace: string }): void {
    const files = listFiles(prev.txWorkspace);
    const manifest = files.map((rel) => {
      const st = fs.lstatSync(path.join(prev.txWorkspace, rel));
      return { path: rel, symlink: st.isSymbolicLink(), bytes: st.size, hash: st.isSymbolicLink() ? null : sha256(fs.readFileSync(path.join(prev.txWorkspace, rel))) };
    });
    const manifestRef = this.store.spoolArtifact(JSON.stringify(manifest, null, 2), {
      owner: KERNEL_SPOOL_OWNER,
      mimeType: "application/json",
      summary: `archived workspace of ${runId} attempt ${prev.attempt} (${prev.status})`,
      provenance: { origin: "attempt_archive", runId, attempt: prev.attempt },
    });
    this.kernelEvent(
      "kernel.workspace_archived",
      { runId, attempt: prev.attempt, workspaceId: prev.workspaceId, previousStatus: prev.status, txWorkspace: path.relative(this.opts.root, prev.txWorkspace), files, manifestRef },
      runId,
      prev.attempt,
    );
  }

  /**
   * Blocker 3 — a checkpoint is safe only if it is a Kernel-VALIDATED FILE_SNAPSHOT of THIS
   * run, its manifest is a registered Kernel artifact, and every listed file still has
   * exactly the snapshotted bytes in that attempt's workspace. Returns the verified bytes.
   */
  private loadCheckpoint(runId: string, evidenceId: string): { evidenceId: string; attempt: number; files: { path: string; bytes: Buffer }[] } {
    const ev = this.store.allEvidence().find((e) => e.evidenceId === evidenceId);
    if (!ev) throw new Error(`unknown checkpoint ${evidenceId}`);
    if (ev.runId !== runId) throw new Error(`checkpoint ${evidenceId} belongs to run ${ev.runId}, not ${runId}`);
    if (ev.evidenceType !== "FILE_SNAPSHOT" || ev.validationStatus !== "VALIDATED" || ev.source !== "DVL_RUNTIME_CAPTURE") {
      throw new Error(`checkpoint ${evidenceId} is not a VALIDATED FILE_SNAPSHOT (${ev.evidenceType}/${ev.validationStatus})`);
    }
    const ref = ev.artifactRefs[0];
    const v = ref ? this.store.verifyKernelArtifact(ref) : { ok: false as const, reason: "no manifest" };
    if (!v.ok) throw new Error(`checkpoint ${evidenceId} manifest not trusted: ${v.reason}`);
    // Parse exactly the bytes whose hash matches the registration (no verify/read race).
    const manifestBytes = fs.readFileSync(path.join(this.opts.root, ref!.path));
    if (sha256(manifestBytes) !== ref!.hash) throw new Error(`checkpoint ${evidenceId} manifest changed after verification`);
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as { path: string; inside: boolean; symlink: boolean; hash: string | null }[];
    const ws = path.join(this.store.dvlDir, "tx", runId, `attempt-${ev.attempt}`);
    const files = manifest.map((m) => {
      const abs = path.resolve(ws, m.path);
      if (!m.inside || m.symlink || !abs.startsWith(ws + path.sep)) throw new Error(`checkpoint ${evidenceId} lists an unsafe path: ${m.path}`);
      let bytes: Buffer;
      try {
        const fd = fs.openSync(abs, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
          bytes = fs.readFileSync(fd);
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        throw new Error(`checkpoint bytes changed: ${m.path} (missing or not a regular file)`);
      }
      if (sha256(bytes) !== m.hash) throw new Error(`checkpoint bytes changed: ${m.path}`);
      return { path: m.path, bytes };
    });
    return { evidenceId, attempt: ev.attempt, files };
  }

  /**
   * Blocker 4 — dispatch with a final disposition. If run.start cannot be delivered and
   * acknowledged, the attempt becomes terminal `failed_to_start`; it is never left live.
   */
  private async dispatch(run: RunState, identity: RunIdentity, task: RunTask): Promise<void> {
    try {
      await this.sendRunStart(identity, task, run.txWorkspace, { db: "postgres", style: "spike" });
    } catch (e) {
      if (run.identity.attempt === identity.attempt && !isTerminal(run.status)) {
        this.kernelEvent(
          "kernel.attempt_dispatch_failed",
          { runId: identity.runId, attempt: identity.attempt, adapterInstanceId: run.adapterInstanceId, reason: (e as Error).message },
          identity.runId,
          identity.attempt,
        );
        this.endRun(run, "failed_to_start");
      }
      throw e;
    }
  }

  private async sendRunStart(identity: RunIdentity, task: RunTask, txWorkspace: string, decisions: Record<string, string>): Promise<void> {
    await this.request("run.start", {
      ...identity,
      role: task.role,
      goal: task.goal,
      acceptanceCriteria: task.acceptanceCriteria,
      workspaceRoot: this.opts.root,
      transactionWorkspaceRoot: txWorkspace,
      scope: task.scope,
      activeProjectDecisions: decisions,
      resumeContext: null,
      mechanicalCheckpoint: null,
      validatedCheckpoint: null,
      budget: { maxDurationMs: this.limits.maxDurationMs },
      credentialsRef: null, // §51: never inline credentials
      scenario: task.scenario,
    });
  }

  /** Per-attempt actor state of a run (blocker 2). */
  actorsOf(runId: string): ActorTracker {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`unknown run ${runId}`);
    return r.actors;
  }

  waitForRunEnd(runId: string, timeoutMs = 15_000): Promise<RunStatus> {
    const run = this.runs.get(runId);
    if (!run) return Promise.reject(new Error(`unknown run ${runId}`));
    if (isTerminal(run.status)) return Promise.resolve(run.status);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`run ${runId} did not end within ${timeoutMs}ms (status=${run.status})`)), timeoutMs);
      run.endWaiters.push((s) => {
        clearTimeout(t);
        resolve(s);
      });
    });
  }

  runStatus(runId: string): RunStatus | undefined {
    return this.runs.get(runId)?.status;
  }

  txWorkspaceOf(runId: string): string {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`unknown run ${runId}`);
    return r.txWorkspace;
  }

  /** Wait until every frame already drained has been processed. */
  async settle(): Promise<void> {
    await this.transport?.whenIdle();
  }

  /** H4 — true while this Kernel holds the root ownership lock. */
  get ownsRoot(): boolean {
    return this.rootLock?.held ?? false;
  }

  /**
   * H4 — take ownership, then prove this Kernel's replay is still the whole committed history:
   * a Kernel that replayed while another owner was still appending would otherwise continue
   * the chain from a stale head (a fork) and decide recovery from an old view. Stale ⇒ the
   * lock is released again and nothing is written; the host must open a fresh Kernel.
   */
  private acquireRoot(opts: { forRecovery?: boolean } = {}): void {
    if (this.rootLock) return;
    const lock = RootLock.acquire(this.opts.root);
    // Recovery is the one case where disk is beyond the boundary by design; recover() measures
    // and quarantines that tail itself at the moment it runs (under the lock).
    const drift = opts.forRecovery ? null : this.store.diskBeyondReplay();
    if (drift) {
      lock.release();
      throw new RootLockError(`the logs changed after this Kernel replayed them (${drift}): open a fresh Kernel`, "stale_replay");
    }
    this.rootLock = lock;
  }

  async shutdown(timeoutMs = 3_000): Promise<void> {
    try {
      await this.stopAdapter(timeoutMs);
    } finally {
      // Ownership ends only after the adapter was told to stop and, if needed, SIGKILLed.
      this.rootLock?.release();
      this.rootLock = null;
    }
  }

  private async stopAdapter(timeoutMs: number): Promise<void> {
    if (!this.child) return;
    if (!this.closed) {
      // A halted/terminated instance is never commanded again: its process was killed and a
      // write to its stdin may wait forever for a 'drain' that never comes.
      if (!this.terminatedInstances.has(this.adapterInstanceId!)) {
        try {
          await this.transport!.send({ type: "adapter.shutdown", requestId: newId("req") }, timeoutMs); // bounded
        } catch {
          /* already gone */
        }
      }
      const exited = await this.waitClosed(timeoutMs);
      if (!exited) {
        this.kill("SIGKILL");
        await this.waitClosed(timeoutMs);
      }
    }
    if (this.durationTimer) clearTimeout(this.durationTimer);
  }

  waitClosed(timeoutMs: number): Promise<boolean> {
    if (this.closed) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), timeoutMs);
      this.closeWaiters.push(() => {
        clearTimeout(t);
        resolve(true);
      });
    });
  }

  // ───────────── no-writer rule + snapshot §46 / INV-28 ─────────────

  noWriterReasons(runId: string): string[] {
    const run = this.runs.get(runId);
    if (!run) return [`unknown run ${runId}`];
    const reasons: string[] = [];
    if (!run.rootActorId) reasons.push("root actor not yet started");
    else if (!run.actors.isFullyFinished(run.rootActorId)) reasons.push(`actors unresolved: ${run.actors.unresolved().join(", ")}`);
    const active = [...run.actions].filter(([, a]) => a.state === "started").map(([id]) => id);
    if (active.length > 0) reasons.push(`active actions: ${active.join(", ")}`);
    const quiet = this.opts.quiescenceMs ?? QUIESCENCE_MS;
    const sinceMutation = Date.now() - this.lastMutationAt;
    if (sinceMutation < quiet) reasons.push(`filesystem not quiescent (${sinceMutation}ms < ${quiet}ms since last mutation hint)`);
    return reasons;
  }

  /**
   * Attempt a FILE_SNAPSHOT now. If any writer may still be active, the Kernel
   * refuses (DEFERRED) and records why. It never snapshots optimistically.
   */
  async trySnapshot(runId: string): Promise<SnapshotResult> {
    await this.settle();
    const reasons = this.noWriterReasons(runId);
    if (reasons.length === 0) {
      // Independent check: workspace bytes must be stable across the quiescence window.
      const quiet = this.opts.quiescenceMs ?? QUIESCENCE_MS;
      const before = fingerprint(this.txWorkspaceOf(runId));
      await sleep(quiet);
      await this.settle();
      const after = fingerprint(this.txWorkspaceOf(runId));
      const again = this.noWriterReasons(runId);
      if (before !== after) again.push("workspace bytes changed during quiescence window");
      if (again.length === 0) return { status: "SNAPSHOT_TAKEN", reasons: [], evidence: this.captureFileSnapshot(runId) };
      reasons.push(...again);
    }
    // Record a deferral only when the *category* of blocking reasons changes, so
    // awaitSnapshot polling does not flood the event log.
    const key = reasons.map((r) => r.split(/[:(]/)[0]!.trim()).join("|");
    if (this.lastDeferralKey.get(runId) !== key) {
      this.lastDeferralKey.set(runId, key);
      this.kernelEvent("kernel.snapshot_deferred", { reasons }, runId);
    }
    return { status: "DEFERRED", reasons };
  }

  /** Poll until the no-writer condition holds, then snapshot. */
  async awaitSnapshot(runId: string, timeoutMs = 10_000): Promise<SnapshotResult> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const r = await this.trySnapshot(runId);
      if (r.status === "SNAPSHOT_TAKEN" || Date.now() > deadline) return r;
      await sleep(50);
    }
  }

  // ───────────── ingestion ─────────────

  private async ingest(frame: Record<string, unknown>, rawBytes: number, adapterInstanceId: string): Promise<void> {
    if (this.opts.processingDelayMs) await sleep(this.opts.processingDelayMs);
    if (this.opts.frameGate) await this.opts.frameGate(String(frame.type));

    const type = frame.type as string;
    const aid = adapterInstanceId;

    // 0) H1 fencing: a frame from a retired or terminated instance never touches state.
    //    Checked at processing time, so frames queued before retirement — or still queued
    //    when the instance was halted (H3) — are fenced too: recorded, never truth.
    if (aid !== this.adapterInstanceId || this.terminatedInstances.has(aid)) {
      this.store.append({ origin: "adapter", trust: "protocol_violation", type, adapterInstanceId: aid, payload: capPayload(this, aid, frame, type) });
      this.kernelEvent("kernel.protocol_violation", {
        kind: "stale_adapter_instance",
        type,
        adapterInstanceId: aid,
        currentAdapterInstanceId: this.adapterInstanceId,
        terminated: this.terminatedInstances.has(aid),
      });
      return;
    }

    // §49 maxIncomingBytes is charged by the transport at the drain boundary (blocker C),
    // per adapter instance, before parsing/queueing/gates — never again here.

    // 1) Responses to Kernel commands.
    if ((RESPONSE_TYPES as readonly string[]).includes(type)) {
      const requestId = frame.requestId as string | undefined;
      this.store.append({ origin: "adapter", trust: "untrusted_observation", type, adapterInstanceId: aid, payload: capPayload(this, aid, frame.payload, type) });
      const p = requestId ? this.pending.get(requestId) : undefined;
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(requestId!);
        p.resolve(frame);
      }
      return;
    }

    // 2) Transport-level ordering (§46, C13, H1): adapterSequence strictly +1 across
    //    ALL event frames of ONE adapter instance — including ones later rejected — so
    //    one bad frame does not cascade into spurious gaps. Duplicates/reorders within
    //    the instance are dropped. A new instance starts its own sequence at 1; global
    //    order across instances is kernelSequence, never (instanceId, seq) sorting.
    const adapterSequence = frame.adapterSequence;
    const runIdRaw = frame.runId as string | undefined;
    const attemptRaw = frame.attempt as number | undefined;
    if (typeof adapterSequence !== "number" || !Number.isInteger(adapterSequence)) {
      this.store.append({ origin: "adapter", trust: "protocol_violation", type, adapterInstanceId: aid, payload: capPayload(this, aid, frame, type) });
      this.kernelEvent("kernel.protocol_violation", { kind: "missing_adapter_sequence", type, adapterInstanceId: aid });
      return;
    }
    const lastSeq = this.lastAdapterSequence.get(aid) ?? 0;
    if (adapterSequence <= lastSeq) {
      this.kernelEvent(
        "kernel.protocol_violation",
        { kind: "duplicate_or_reordered", type, adapterInstanceId: aid, adapterSequence, lastAdapterSequence: lastSeq, frameHash: sha256(JSON.stringify(frame)) },
        runIdRaw,
        attemptRaw,
      );
      return;
    }
    if (adapterSequence !== lastSeq + 1) {
      this.kernelEvent("kernel.protocol_violation", { kind: "event_gap", errorClass: "event_gap", adapterInstanceId: aid, expected: lastSeq + 1, got: adapterSequence }, runIdRaw, attemptRaw);
    }
    this.lastAdapterSequence.set(aid, adapterSequence);

    // 2b) H1: instance identity is Kernel-assigned. An adapter claiming one (the frozen
    //     contract defines no such field) is not trusted: flagged, never applied.
    if (frame.adapterInstanceId !== undefined && frame.adapterInstanceId !== aid) {
      this.store.append({ origin: "adapter", trust: "protocol_violation", type, adapterInstanceId: aid, adapterSequence, runId: runIdRaw, attempt: attemptRaw, payload: capPayload(this, aid, frame, type) });
      this.kernelEvent("kernel.protocol_violation", { kind: "adapter_instance_mismatch", type, adapterInstanceId: aid, claimed: frame.adapterInstanceId }, runIdRaw, attemptRaw);
      return;
    }

    // 3) Adapter must never emit truth (§6, INV-5). Stored as violation, never applied.
    if (FORBIDDEN_ADAPTER_EVENTS.has(type)) {
      this.store.append({ origin: "adapter", trust: "protocol_violation", type, adapterInstanceId: aid, adapterSequence, runId: runIdRaw, attempt: attemptRaw, payload: capPayload(this, aid, frame.payload, type) });
      this.kernelEvent("kernel.truth_violation", { attemptedType: type, note: "Adapter cannot create official truth by event emission (INV-5)" }, runIdRaw, attemptRaw);
      return;
    }

    // 4) Envelope validation §46.
    const env = { actorId: frame.actorId, actorSequence: frame.actorSequence, runId: frame.runId, attempt: frame.attempt };
    const missing = Object.entries(env).filter(([, v]) => v === undefined).map(([k]) => k);
    if (missing.length > 0) {
      this.store.append({ origin: "adapter", trust: "protocol_violation", type, adapterInstanceId: aid, adapterSequence, payload: { missing, frame: capPayload(this, aid, frame, type) } });
      this.kernelEvent("kernel.protocol_violation", { kind: "missing_envelope_fields", type, missing }, runIdRaw, attemptRaw);
      return;
    }
    const actorId = env.actorId as string;
    const actorSequence = env.actorSequence as number;
    const runId = env.runId as string;
    const attempt = env.attempt as number;
    const run = this.runs.get(runId);

    // 4b) Admission gate (blockers A + 2): identity binding AND a legal transition of the
    //     authoritative run/actor/action state machines. A rejected event is kept as a
    //     violation and mutates nothing — no state change, no Evidence.
    const verdict = run ? this.admit(run, aid, attempt, type, actorId, frame.payload) : null;

    // 4c) Per-actor ordering, tracked separately from lifecycle so fork races stay detectable.
    //     H1: ordering state belongs to one execution stream — (instance, run, ATTEMPT,
    //     actor) — and only frames that pass the BINDING checks (right owner instance, right
    //     attempt) may read or advance it. A frame rejected for binding never moves any
    //     expectation, so it can neither pollute the authorized attempt nor pre-load a future
    //     Kernel-created attempt; attempt N+1 starts its actor streams at 1 even on the same
    //     instance. A frame of the authorized stream that is rejected only by the lifecycle
    //     rules still occupies its slot (the adapter's counter moved), avoiding false gaps.
    const bindingRejected = verdict?.reason === "run_owned_by_other_instance" || verdict?.reason === "attempt_mismatch";
    if (!bindingRejected) {
      const actorKey = instanceKey(aid, runId, String(attempt), actorId);
      const lastActorSeq = this.actorSeq.get(actorKey) ?? 0;
      if (actorSequence !== lastActorSeq + 1) {
        this.kernelEvent("kernel.protocol_violation", { kind: "actor_sequence_gap", adapterInstanceId: aid, actorId, expected: lastActorSeq + 1, got: actorSequence }, runId, attempt);
      }
      this.actorSeq.set(actorKey, Math.max(lastActorSeq, actorSequence));
    }

    if (run && verdict) {
      this.store.append({ origin: "adapter", trust: "protocol_violation", type, adapterInstanceId: aid, runId, attempt, adapterSequence, actorId, actorSequence, payload: capPayload(this, aid, frame.payload, type, runId) });
      this.kernelEvent(
        "kernel.protocol_violation",
        {
          kind: "run_binding_violation",
          ...verdict,
          type,
          runId,
          attempt,
          actorId,
          adapterSequence,
          adapterInstanceId: aid,
          boundAdapterInstanceId: run.adapterInstanceId,
          boundAttempt: run.identity.attempt,
          status: run.status,
        },
        runId,
        attempt,
      );
      return;
    }

    // 5) Unknown event types: stored, never trusted (§56).
    const known = (PROVIDER_EVENT_TYPES as readonly string[]).includes(type);
    if (!run) this.kernelEvent("kernel.protocol_violation", { kind: "unknown_run", runId, type }, runId, attempt);

    // 6) Persist BEFORE acting on it.
    const stored = this.store.append({
      origin: "adapter",
      trust: known ? "untrusted_observation" : "protocol_violation",
      type,
      adapterInstanceId: aid,
      runId,
      attempt,
      adapterSequence,
      actorId,
      actorSequence,
      causalParentEventId: frame.causalParentEventId as string | undefined,
      payload: capPayload(this, aid, frame.payload, type, runId),
    });
    if (!known || !run) return;

    this.applyEvent(run, stored, (frame.payload ?? {}) as Record<string, unknown>);
  }

  /**
   * The single admission decision for an event naming a known run. Returns null when the
   * event may be applied, otherwise why not. Order: binding, terminal, run FSM, actor FSM,
   * action FSM. Pure: never mutates.
   */
  private admit(
    run: RunState,
    aid: string,
    attempt: number,
    type: string,
    actorId: string,
    rawPayload: unknown,
  ): { reason: string; machine?: "run" | "actor" | "action"; from?: string; actionId?: string } | null {
    if (run.adapterInstanceId !== aid) return { reason: "run_owned_by_other_instance" };
    if (attempt !== run.identity.attempt) return { reason: "attempt_mismatch" };
    if (isTerminal(run.status)) return { reason: "run_terminal", machine: "run", from: run.status };
    // Run FSM.
    const runOk = type === "run.started" ? run.status === "starting" : type === "run.failed" ? run.status === "starting" || run.status === "running" : run.status === "running";
    if (!runOk) return { reason: "illegal_transition", machine: "run", from: run.status };
    // Actor FSM: a finished/aborted actor can no longer act.
    if (ACTOR_SCOPED(type)) {
      const st = run.actors.get(actorId)?.state;
      if (st === "finished" || st === "aborted") return { reason: "illegal_transition", machine: "actor", from: st };
    }
    // Action FSM.
    const rule = ACTION_FSM[type];
    if (rule) {
      const actionId = (rawPayload as { actionId?: unknown } | undefined)?.actionId;
      if (typeof actionId !== "string" || actionId.length === 0) return { reason: "illegal_transition", machine: "action", from: "invalid_action_id" };
      const cur = run.actions.get(actionId);
      if (cur && cur.actorId !== actorId) return { reason: "illegal_transition", machine: "action", from: `owned_by:${cur.actorId}`, actionId };
      const from = cur?.state ?? "none";
      if (!(rule.from as string[]).includes(from)) return { reason: "illegal_transition", machine: "action", from, actionId };
    }
    return null;
  }

  private applyEvent(run: RunState, ev: StoredEvent, payload: Record<string, unknown>): void {
    const actorId = ev.actorId!;
    const actors = run.actors;
    const lifecycle = ev.type === "run.started" || ev.type.startsWith("actor.");
    if (!lifecycle && ACTOR_SCOPED(ev.type) && !actors.get(actorId)) {
      // An actor we never saw start is acting: treat it as a live writer (conservative),
      // and attach it under the root so the root cannot be "fully finished" without it.
      actors.start(actorId);
      if (run.rootActorId && run.rootActorId !== actorId) actors.fork(run.rootActorId, [actorId]);
      this.kernelEvent("kernel.actor_undeclared", { actorId, type: ev.type }, run.identity.runId, ev.attempt);
    }
    switch (ev.type) {
      case "run.started":
        run.status = "running";
        run.rootActorId = actorId;
        actors.start(actorId);
        break;
      case "actor.fork": {
        const children = Array.isArray(payload.childActorIds) ? (payload.childActorIds as string[]) : [];
        actors.fork(actorId, children);
        break;
      }
      case "actor.started": {
        const parentId = payload.parentActorId as string | undefined;
        const undeclared = actors.start(actorId);
        if (undeclared) {
          // Fork race: child started before parent declared it. Attach to parent conservatively.
          if (parentId) actors.fork(parentId, [actorId]);
          else if (run.rootActorId && run.rootActorId !== actorId) actors.fork(run.rootActorId, [actorId]);
          this.kernelEvent("kernel.actor_fork_race", { actorId, parentActorId: parentId ?? run.rootActorId, note: "actor.started before actor.fork; attached conservatively" }, run.identity.runId, ev.attempt);
        }
        break;
      }
      case "actor.finished":
        actors.finish(actorId);
        if (!actors.isFullyFinished(actorId)) {
          this.kernelEvent("kernel.actor_finish_pending_children", { actorId, unresolved: actors.unresolved() }, run.identity.runId, ev.attempt);
        }
        break;
      case "action.requested":
      case "action.started":
      case "action.updated":
        // Transition already admitted by the FSM gate; only record the resulting state.
        run.actions.set(String(payload.actionId), { state: ACTION_FSM[ev.type]!.to, actorId });
        break;
      case "action.finished":
        run.actions.set(String(payload.actionId), { state: "finished", actorId });
        this.maybeCreateEvidence(run, ev, payload);
        break;
      case "workspace.hint":
        this.lastMutationAt = Date.now();
        break;
      case "run.finished":
        this.endRun(run, "finished");
        break;
      case "run.failed":
        this.endRun(run, "failed");
        break;
      default:
        // provider.message / intent_hint / usage etc: stored, zero truth weight (INV-7, INV-8).
        break;
    }
  }

  // ───────────── evidence §31–34 ─────────────

  /**
   * Turn a provider's action.finished observation into an EvidenceRecord.
   * Phase 1 honesty: the Kernel executed nothing, so source = PROVIDER_HARNESS_RECORD
   * and status can reach at most PERSISTED. Never VALIDATED (INV-24).
   */
  private maybeCreateEvidence(run: RunState, ev: StoredEvent, payload: Record<string, unknown>): void {
    const kind = payload.kind as string | undefined;
    const typeMap: Record<string, EvidenceType> = { command: "COMMAND_EXECUTION", test: "TEST_RESULT", build: "BUILD_RESULT" };
    const evidenceType = kind ? typeMap[kind] : undefined;
    if (!evidenceType) return;

    const refs: ArtifactRef[] = [];
    let status: EvidenceStatus = "PERSISTED";
    let reason = "bounded trust: provider harness record; DVL did not execute this operation (§32, §34)";
    const outputRef = payload.outputRef;
    if (outputRef !== undefined) {
      // H2: the adapter's claim is never attached. Only bytes the Kernel verified and
      // imported into its own spool are referenced, via a Kernel-issued ref.
      const aid = ev.adapterInstanceId!;
      let imp: ReturnType<EventStore["importAdapterArtifact"]>;
      try {
        imp = this.store.importAdapterArtifact(outputRef, aid, { runId: run.identity.runId, attempt: run.identity.attempt, sourceEventId: ev.eventId });
      } catch (e) {
        // Defence in depth: an unexpected import failure still yields CORRUPTED evidence
        // instead of escaping into the transport handler and losing evidence processing.
        imp = { ok: false, reason: `artifact import failed: ${(e as Error).message}` };
      }
      if (imp.ok) {
        refs.push(imp.ref);
        this.kernelEvent(
          "kernel.artifact_imported",
          {
            adapterInstanceId: aid,
            artifactRef: imp.ref.artifactRef,
            path: imp.ref.path,
            sourceArtifactRef: imp.ref.sourceArtifactRef,
            sourcePath: (outputRef as { path: string }).path,
            sourceEventId: ev.eventId,
            hash: imp.ref.hash,
            byteSize: imp.ref.byteSize,
          },
          run.identity.runId,
          ev.attempt,
        );
      } else {
        status = "CORRUPTED";
        reason = `artifact verification failed: ${imp.reason}`;
        this.kernelEvent("kernel.artifact_rejected", { adapterInstanceId: aid, reason: imp.reason, sourceEventId: ev.eventId }, run.identity.runId, ev.attempt);
      }
    }
    // Blocker B: attach a Kernel-spooled payload ref ONLY if the Kernel itself replaced this
    // very event's payload (object identity). An adapter-supplied `__spooled` key is just data.
    if (ev.payload !== null && typeof ev.payload === "object" && KERNEL_SPOOL_MARKERS.has(ev.payload)) {
      refs.push((ev.payload as { __spooled: ArtifactRef }).__spooled);
    }
    // H2: the Kernel could not spool this event's oversized payload safely: its content is
    // not available as Kernel material, so the evidence cannot be trusted.
    if (ev.payload !== null && typeof ev.payload === "object" && KERNEL_SPOOL_REFUSED.has(ev.payload)) {
      status = "CORRUPTED";
      reason = `payload spooling refused: ${(ev.payload as { __spoolRefused: string }).__spoolRefused}`;
    }

    const summary = String(payload.summary ?? `${kind} exit=${String(payload.exitCode)}`).slice(0, 280);
    const rec: EvidenceRecord = {
      evidenceId: newId("evd"),
      projectId: run.identity.projectId,
      taskId: run.identity.taskId,
      workerId: run.identity.workerId,
      runId: run.identity.runId,
      attempt: ev.attempt!,
      workspaceId: run.identity.workspaceId,
      evidenceType,
      source: "PROVIDER_HARNESS_RECORD",
      timestamp: new Date().toISOString(),
      causality: { sourceEventId: ev.eventId, causalParentEventId: ev.causalParentEventId },
      artifactRefs: refs,
      payloadSummary: summary,
      integrityHash: sha256(JSON.stringify({ refs: refs.map((r) => r.hash), summary, exitCode: payload.exitCode ?? null })),
      validationStatus: status,
      relatedActionId: payload.actionId as string | undefined,
      statusReason: reason,
    };
    this.store.putEvidence(rec);
    this.kernelEvent("kernel.evidence_recorded", { evidenceId: rec.evidenceId, evidenceType, validationStatus: status }, run.identity.runId, ev.attempt);
  }

  /** §34 FILE_SNAPSHOT: DVL hashes file bytes itself and checks scope → may be VALIDATED. */
  private captureFileSnapshot(runId: string): EvidenceRecord {
    const run = this.runs.get(runId)!;
    const files = listFiles(run.txWorkspace);
    const manifest = files.map((rel) => {
      const abs = path.join(run.txWorkspace, rel);
      const inside = path.resolve(abs).startsWith(path.resolve(run.txWorkspace) + path.sep);
      const st = fs.lstatSync(abs);
      return { path: rel, inside, symlink: st.isSymbolicLink(), hash: st.isSymbolicLink() ? null : sha256(fs.readFileSync(abs)), bytes: st.size };
    });
    const violations = manifest.filter((m) => !m.inside || m.symlink);
    const aborted = run.actors.aborted();
    const ref = this.store.spoolArtifact(JSON.stringify(manifest, null, 2), {
      owner: KERNEL_SPOOL_OWNER,
      mimeType: "application/json",
      summary: `snapshot of ${files.length} files`,
      provenance: { origin: "snapshot", runId, attempt: run.identity.attempt },
    });
    const rec: EvidenceRecord = {
      evidenceId: newId("evd"),
      projectId: run.identity.projectId,
      taskId: run.identity.taskId,
      workerId: run.identity.workerId,
      runId,
      attempt: run.identity.attempt,
      workspaceId: run.identity.workspaceId,
      evidenceType: "FILE_SNAPSHOT",
      source: "DVL_RUNTIME_CAPTURE",
      timestamp: new Date().toISOString(),
      causality: { sourceEventId: "kernel.snapshot" },
      artifactRefs: [ref],
      payloadSummary: `${files.length} files hashed by Kernel after no-writer condition`,
      integrityHash: ref.hash,
      validationStatus: violations.length === 0 ? "VALIDATED" : "REJECTED",
      statusReason:
        (violations.length === 0 ? "Kernel hashed bytes after no-writer condition; all paths inside tx workspace" : `scope violations: ${violations.map((v) => v.path).join(", ")}`) +
        (aborted.length > 0 ? `; run status ${run.status}, actors aborted by adapter termination: ${aborted.join(", ")}` : ""),
    };
    this.store.putEvidence(rec);
    this.kernelEvent("kernel.snapshot_taken", { evidenceId: rec.evidenceId, files: files.length, runStatus: run.status, abortedActors: aborted }, runId);
    return rec;
  }

  // ───────────── internals ─────────────

  private request(type: CommandType, payload: unknown): Promise<Record<string, unknown>> {
    if (!this.transport) throw new Error("kernel not started");
    const requestId = newId("req");
    const timeoutMs = this.opts.requestTimeoutMs ?? 5_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        this.kernelEvent("kernel.request_timeout", { type, requestId, errorClass: "timeout" });
        reject(new Error(`${type} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      const cmd: CommandFrame = { type, requestId, payload };
      this.kernelEvent("kernel.command_sent", { type, requestId });
      this.transport!.send(cmd, timeoutMs).catch((e: Error) => {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(e);
      });
    });
  }

  private onTransportIssue(issue: TransportIssue, adapterInstanceId: string): void {
    // Noise is expected and already spooled; only count it in the store as a diagnostic.
    if (issue.kind === "noise") return;
    if (issue.kind === "diagnostics_refused") {
      const { kind: _k, ...d } = issue;
      this.kernelEvent("kernel.spool_integrity_violation", { kind: "diagnostics_refused", ...d });
      return;
    }
    if (issue.kind === "input_rejected") {
      // H3: an oversized / malformed / partial DVL1 frame never reached ingest. The stream is
      // no longer trustworthy: fail closed for the instance it came from (halt once; the
      // transport already sealed its queue). Only bounded, escaped fields are recorded.
      const { kind: _kind, ...r } = issue;
      if (adapterInstanceId !== this.adapterInstanceId || this.terminatedInstances.has(adapterInstanceId)) {
        this.kernelEvent("kernel.transport_issue", { kind: "input_rejected", stale: true, ...r });
        return;
      }
      this.haltForSafety(`transport input rejected (${r.reason})`, {
        kind: "transport_input_rejected",
        ...r,
        lastAcceptedAdapterSequence: this.lastAdapterSequence.get(adapterInstanceId) ?? null,
      });
      return;
    }
    if (issue.kind === "byte_limit") {
      const { kind: _kind, ...b } = issue;
      if (adapterInstanceId !== this.adapterInstanceId || this.terminatedInstances.has(adapterInstanceId)) {
        this.kernelEvent("kernel.transport_issue", { kind: "byte_limit", stale: true, ...b });
        return;
      }
      this.haltForSafety(`maxIncomingBytes ${b.maxIncomingBytes} exceeded`, {
        kind: "max_incoming_bytes",
        ...b,
        lastAcceptedAdapterSequence: this.lastAdapterSequence.get(adapterInstanceId) ?? null,
      });
      return;
    }
    if (issue.kind === "queue_overflow") {
      const { kind: _kind, ...q } = issue;
      if (adapterInstanceId !== this.adapterInstanceId || this.terminatedInstances.has(adapterInstanceId)) {
        // A dead/retired instance cannot halt the live one; record as diagnostics only.
        this.kernelEvent("kernel.transport_issue", { kind: "queue_overflow", stale: true, ...q, overflowSpoolPath: path.relative(this.opts.root, q.overflowSpoolPath) });
        return;
      }
      this.haltForSafety(`protocol queue limit exceeded (maxQueuedFrames=${q.maxQueuedFrames}, maxQueuedBytes=${q.maxQueuedBytes})`, {
        kind: "queue_overflow",
        ...q,
        overflowSpoolPath: path.relative(this.opts.root, q.overflowSpoolPath),
        lastAcceptedAdapterSequence: this.lastAdapterSequence.get(adapterInstanceId) ?? null,
      });
      return;
    }
    this.kernelEvent("kernel.transport_issue", issue.kind === "overflow" ? { kind: "overflow", bytes: issue.bytes } : { kind: issue.kind, reason: issue.reason });
  }

  private onAdapterClosed(info: { code: number | null; signal: NodeJS.Signals | null }, adapterInstanceId: string): void {
    if (adapterInstanceId !== this.adapterInstanceId) {
      // A retired instance must never fail the live instance's runs or requests.
      this.kernelEvent("kernel.adapter_exited", { ...info, adapterInstanceId, stale: true });
      this.terminateInstance(adapterInstanceId, "retired adapter instance exited"); // idempotent
      return;
    }
    this.closed = true;
    this.kernelEvent("kernel.adapter_exited", { ...info, adapterInstanceId, stats: this.transport?.stats });
    // No kill here: the process has exited and been reaped, so its pid/pgid may already
    // belong to an unrelated process. kill() refuses to signal an exited child anyway.
    this.terminateInstance(adapterInstanceId, "adapter exited before run.finished");
    if (this.durationTimer) clearTimeout(this.durationTimer);
    this.closeWaiters.splice(0).forEach((w) => w());
  }

  /**
   * H1 — everything owned by a dead or retired adapter instance is terminated:
   * (Process-level termination is kill()'s job and happens only while the child is
   * still alive; this method only updates Kernel state.)
   * pending requests rejected, non-terminal runs failed (provider_unavailable),
   * active actions and unresolved actors aborted. Never "finished". Idempotent.
   * Without this, a crashed instance's orphans would block the snapshot gate forever.
   */
  private terminateInstance(adapterInstanceId: string, reason: string): void {
    if (this.terminatedInstances.has(adapterInstanceId)) return;
    this.terminatedInstances.add(adapterInstanceId);
    if (adapterInstanceId === this.adapterInstanceId) {
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`adapter instance terminated before replying to ${id}`));
      }
      this.pending.clear();
    }
    for (const run of this.runs.values()) {
      if (run.adapterInstanceId !== adapterInstanceId || isTerminal(run.status)) continue;
      this.kernelEvent("kernel.run_failed", { errorClass: "provider_unavailable", reason, adapterInstanceId }, run.identity.runId, run.identity.attempt);
      this.endRun(run, "failed");
    }
    // Final disposition of everything the dead instance owned: the actions and actors of
    // every attempt bound to it are aborted (never "finished").
    for (const run of this.runs.values()) {
      if (run.adapterInstanceId !== adapterInstanceId) continue;
      const { runId, attempt } = run.identity;
      for (const [actionId, a] of run.actions) {
        if (a.state !== "requested" && a.state !== "started") continue;
        a.state = "aborted";
        this.kernelEvent("kernel.action_aborted", { actionId, actorId: a.actorId, adapterInstanceId, runId, attempt, reason }, runId, attempt);
      }
      for (const actorId of run.actors.abortUnresolved()) {
        this.kernelEvent("kernel.actor_aborted", { actorId, adapterInstanceId, runId, attempt, reason }, runId, attempt);
      }
    }
  }

  /**
   * Safety halt of the CURRENT adapter instance: recorded once, its runs halted (never
   * finished), the process killed, and the instance terminated so that anything it
   * still has queued is fenced (H1) instead of becoming truth (H3).
   */
  private haltForSafety(reason: string, details: Record<string, unknown> = {}): void {
    const aid = this.adapterInstanceId;
    if (aid && this.terminatedInstances.has(aid)) return; // already halted/terminated: one record
    const runIds = [...this.runs.values()].filter((r) => r.adapterInstanceId === aid && !isTerminal(r.status)).map((r) => r.identity.runId);
    this.kernelEvent("kernel.safety_halt", { errorClass: "halted_by_safety_limit", reason, adapterInstanceId: aid, runIds, at: new Date().toISOString(), ...details }, runIds[0]);
    for (const run of this.runs.values()) if (!isTerminal(run.status)) this.endRun(run, "halted");
    this.kill("SIGKILL");
    if (aid) this.terminateInstance(aid, `halted_by_safety_limit: ${reason}`);
  }

  /**
   * Signal the current adapter only while Node has not observed it exit.
   * exitCode/signalCode are set when the child is reaped; after that its pid and
   * process-group id can be recycled by the OS, so signalling them is unsafe.
   * While the group leader is alive and unreaped, its pgid cannot be reused, so the
   * group kill (§49: terminate adapter/process group) is safe; any failure falls back
   * to a direct kill of the child only.
   */
  private kill(signal: NodeJS.Signals): void {
    const child = this.child;
    if (!child || child.pid === undefined) return;
    if (child.exitCode !== null || child.signalCode !== null || child.killed) return;
    if (process.platform !== "win32") {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        /* group not signalable: fall back to the child itself */
      }
    }
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }

  private endRun(run: RunState, status: RunStatus): void {
    if (isTerminal(run.status)) return;
    run.status = status;
    this.kernelEvent(`kernel.run_${status}`, { runId: run.identity.runId }, run.identity.runId, run.identity.attempt);
    run.endWaiters.splice(0).forEach((w) => w(status));
  }

  /**
   * Append a Kernel record. H2: if the durable log refuses the write (unsafe log path, or the
   * store sealed itself after a post-write integrity detection) the Kernel fails closed
   * WITHOUT throwing into timers/handlers: the record is not durable, it is not added to
   * history, and the refusal is kept in `durableWriteRefusals` for the host.
   */
  kernelEvent(type: string, payload: unknown, runId?: string, attempt?: number): StoredEvent | null {
    try {
      return this.store.append({ origin: "kernel", trust: "kernel_truth", type, payload, runId, attempt });
    } catch (e) {
      if (!(e instanceof SpoolIntegrityError)) throw e;
      this.durableWriteRefusals.push({ type, code: e.code, reason: e.message });
      return null;
    }
  }

  /**
   * H2 — no new work while the durable store cannot commit: sealed after an uncertain write,
   * or opened with an uncommitted tail / persisted seal (explicit recovery required first).
   */
  private assertDurable(): void {
    if (this.store.sealed) throw new SpoolIntegrityError(`durable store sealed: ${this.store.sealed}`, "sealed");
    const r = this.store.recovery;
    if (r?.source === "anchor_mismatch") throw new SpoolIntegrityError("durable store cannot reach the host commit boundary (anchor mismatch): restore the logs or reopen with an explicit host rollback decision", "anchor_mismatch");
    if (r) throw new SpoolIntegrityError(`durable store requires recovery (${r.source}); call recoverDurableTail()`, "recovery_required");
  }

  /**
   * H2 — the host's explicit recovery decision: quarantine the uncommitted tail beyond the
   * commit boundary, truncate the logs to it, clear the seal, and record the recovery.
   */
  recoverDurableTail(): ReturnType<EventStore["recover"]> {
    const owned = this.ownsRoot;
    this.acquireRoot({ forRecovery: true }); // H4 — recovery truncates the logs: owner only
    const before = { recovery: this.store.recovery, incident: this.store.incident, sealed: this.store.sealed };
    let report: ReturnType<EventStore["recover"]>;
    try {
      report = this.store.recover();
    } catch (e) {
      if (!owned) {
        this.rootLock?.release(); // a refused recovery does not keep ownership it took for itself
        this.rootLock = null;
      }
      throw e;
    }
    this.kernelEvent("kernel.durable_recovery", { ...before, ...report });
    return report;
  }

  /** H2 — Kernel records that could not be made durable (see kernelEvent). */
  readonly durableWriteRefusals: { type: string; code: string; reason: string }[] = [];
}

// ───────────────────────── helpers ─────────────────────────

/**
 * §47 / INV-29 — Kernel-side enforcement of the 32KB inline cap.
 * A conformant adapter spools itself; a non-conformant one gets its payload
 * spooled defensively and a protocol violation recorded. Nothing >32KB lands
 * inline in the event log.
 */
/**
 * Blocker B — payload objects the Kernel itself created by spooling an oversized payload.
 * Identity-based, so an adapter payload that merely contains a `__spooled` key never matches.
 */
const KERNEL_SPOOL_MARKERS = new WeakSet<object>();
/** H2 — payload objects standing in for an oversized payload the Kernel could not spool safely. */
const KERNEL_SPOOL_REFUSED = new WeakSet<object>();

function capPayload(k: Kernel, adapterInstanceId: string, payload: unknown, type: string, runId?: string): unknown {
  if (payload === undefined) return undefined;
  const json = JSON.stringify(payload);
  const bytes = Buffer.byteLength(json);
  if (bytes <= MAX_INLINE_PAYLOAD_BYTES) return payload;
  // H2: spooled into the sending instance's own Kernel-owned spool, ref stamped with it.
  let ref: ArtifactRef;
  try {
    ref = k.store.spoolArtifact(json, {
      owner: adapterInstanceId,
      mimeType: "application/json",
      summary: `oversized inline payload of ${type} (${bytes} bytes) spooled by Kernel`,
      provenance: { origin: "kernel_spooled_payload", runId },
    });
  } catch (e) {
    if (!(e instanceof SpoolIntegrityError)) throw e;
    // The event is still recorded (without the payload), so lifecycle processing continues;
    // nothing was written outside the spool and nothing is registered.
    k.kernelEvent("kernel.spool_integrity_violation", { kind: "payload_spool_refused", adapterInstanceId, type, bytes, reason: e.message }, runId);
    const refused = { __spoolRefused: e.message, __note: "payload exceeded 32KB inline cap; Kernel spooling refused" };
    KERNEL_SPOOL_REFUSED.add(refused);
    return refused;
  }
  k.kernelEvent("kernel.protocol_violation", { kind: "inline_payload_exceeded", type, bytes, limit: MAX_INLINE_PAYLOAD_BYTES, artifactRef: ref.artifactRef }, runId);
  const marker = { __spooled: ref, __note: "payload exceeded 32KB inline cap; spooled by Kernel" };
  KERNEL_SPOOL_MARKERS.add(marker);
  return marker;
}

function instanceKey(...parts: string[]): string {
  return parts.join("\u0000");
}

function isTerminal(s: RunStatus): boolean {
  return s === "finished" || s === "failed" || s === "halted" || s === "failed_to_start" || s === "interrupted";
}

/** H4 — the Kernel's terminal records (endRun / start()) and the status each one proves. */
const TERMINAL_RECORDS = new Map<string, RunStatus>((["finished", "failed", "halted", "failed_to_start", "interrupted"] as const).map((s) => [`kernel.run_${s}`, s]));

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function listFiles(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(abs, base));
    else out.push(path.relative(base, abs));
  }
  return out.sort();
}

function fingerprint(dir: string): string {
  return listFiles(dir)
    .map((rel) => {
      const st = fs.lstatSync(path.join(dir, rel));
      return `${rel}:${st.size}:${st.mtimeMs}`;
    })
    .join("|");
}
