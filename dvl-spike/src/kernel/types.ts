/**
 * DVL Phase 1 Spike — shared types.
 * Source of truth: Core Contract reference removed from spike repo
 * Contract version: dvl.provider-core/0.3.2
 */

export const CONTRACT_VERSION = "dvl.provider-core/0.3.2";
export const FRAME_PREFIX = "DVL1:";
/** §47 — 32KB max inline payload. */
export const MAX_INLINE_PAYLOAD_BYTES = 32 * 1024;
/**
 * H3 — maximum size of ONE incoming DVL1 frame line, in bytes, prefix included, newline
 * excluded. Enforced while reading (never from a provider-supplied size), before JSON.parse.
 * Above the 32 KiB inline-payload cap so a non-conformant oversized inline payload can still be
 * received and defensively spooled by the Kernel; anything larger is rejected and the transport
 * fails closed.
 */
export const MAX_FRAME_BYTES = 1024 * 1024;
/** Per-line buffering cap of the stdout splitter (frames and noise alike) = the frame cap. */
export const MAX_LINE_BYTES = MAX_FRAME_BYTES;
/**
 * H3 — per adapter instance and per diagnostic stream (stderr, stdout noise, queue overflow):
 * at most this many bytes are written to the diagnostic spool; the rest is counted and dropped.
 */
export const MAX_DIAGNOSTIC_STREAM_BYTES = 8 * 1024 * 1024;
/**
 * H3 — part of each stream's MAX_DIAGNOSTIC_STREAM_BYTES reserved for the one-time "cap reached"
 * marker, so the file never exceeds the cap: payload ≤ cap − reserve, marker ≤ reserve.
 */
export const DIAGNOSTIC_CAP_MARKER_RESERVE = 160;
/** H3 — maximum bytes of any attacker-derived text in a diagnostic (reason detail / preview). */
export const MAX_DIAGNOSTIC_DETAIL_BYTES = 256;
/**
 * H3 — Spike limits for the Kernel-owned protocol frame queue of ONE adapter instance.
 * Parsed DVL1 frames waiting for Kernel processing may never exceed either bound;
 * exceeding one is a safety halt of that instance (never a silent drop).
 */
export const MAX_QUEUED_FRAMES = 1024;
export const MAX_QUEUED_BYTES = 16 * 1024 * 1024;
/** §46 — default filesystem quiescence for Spike. */
export const QUIESCENCE_MS = 250;

// ───────────────────────── Commands (Kernel → Adapter) §9 ─────────────────────────

export type CommandType =
  | "adapter.describe"
  | "run.start"
  | "run.stop"
  | "run.hibernate"
  | "run.resume_after_auth"
  | "run.update_decisions"
  | "approval.respond"
  | "run.answer"
  | "adapter.ping"
  | "adapter.shutdown";

export interface CommandFrame {
  type: CommandType;
  requestId: string;
  payload?: unknown;
}

// ───────────────────────── Capabilities §10 ─────────────────────────

export type CommandExecutionMode = "dvl_tools" | "gated_native" | "none";
export type FidelityLevel = "L0" | "L1" | "L2" | "L3";

export interface AdapterCapabilities {
  adapterId: string;
  adapterVersion: string;
  providerName: string;
  providerEngine: string;
  supportedContractVersions: string[];
  supportedModels: string[];
  authModes: string[];
  eventFidelity: FidelityLevel;
  approvalSupport: boolean;
  midRunUpdateSupport: boolean;
  safeStopSupport: boolean;
  hibernationSupport: boolean;
  resumeSupport: boolean;
  subagentBehavior: "none" | "contained" | "uncontained";
  usageReporting: "reported" | "estimated" | "unknown";
  scopeMapping: string;
  budgetDimensions: string[];
  commandExecutionMode: CommandExecutionMode;
  runtimeEvidenceObservationSupport: boolean;
}

export const REQUIRED_CAPABILITY_FIELDS: (keyof AdapterCapabilities)[] = [
  "adapterId",
  "adapterVersion",
  "providerName",
  "providerEngine",
  "supportedContractVersions",
  "supportedModels",
  "authModes",
  "eventFidelity",
  "approvalSupport",
  "midRunUpdateSupport",
  "safeStopSupport",
  "hibernationSupport",
  "resumeSupport",
  "subagentBehavior",
  "usageReporting",
  "scopeMapping",
  "budgetDimensions",
  "commandExecutionMode",
  "runtimeEvidenceObservationSupport",
];

// ───────────────────────── Events (Adapter → Kernel) §19 ─────────────────────────

export const PROVIDER_EVENT_TYPES = [
  "run.started",
  "run.needs_input",
  "run.finished",
  "run.failed",
  "heartbeat",
  "actor.fork",
  "actor.started",
  "actor.finished",
  "action.requested",
  "action.started",
  "action.updated",
  "action.finished",
  "approval.requested",
  "usage.reported",
  "workspace.hint",
  "log.diagnostic",
  "provider.message",
  "provider.intent_hint",
  "provider.error",
] as const;
export type ProviderEventType = (typeof PROVIDER_EVENT_TYPES)[number];

/** Non-event response frames (replies to commands). */
export const RESPONSE_TYPES = ["adapter.described", "adapter.pong", "command.ack"] as const;
export type ResponseType = (typeof RESPONSE_TYPES)[number];

/** §6 — truth events an Adapter must never emit. Kernel stores them as untrusted + flags. */
export const FORBIDDEN_ADAPTER_EVENTS = new Set([
  "evidence.validated",
  "verification.PASS",
  "integration.accepted",
  "official_project_state_changed",
]);

/** §47 — artifact reference carried by events instead of large inline payloads. */
export interface ArtifactRef {
  artifactRef: string; // artifactId
  path: string; // relative to project root. Kernel-issued: .dvl/spool/<owner>/<id>.log|json
  hash: string; // sha256:<hex>
  summary: string;
  byteSize: number;
  mimeType: string;
  /**
   * H2 — set by the Kernel on every ref it issues for adapter material (Kernel-spooled
   * payloads, imported adapter artifacts). Never taken from an adapter's claim.
   */
  adapterInstanceId?: string;
  /** H2 — the adapter's own artifactId for an imported artifact (diagnostic only). */
  sourceArtifactRef?: string;
}

/** H2 — Kernel spool owner for Kernel-originated artifacts not tied to an adapter instance. */
export const KERNEL_SPOOL_OWNER = "kernel";
/** H2 — upper bound on a single adapter artifact the Kernel will import (read into memory once). */
export const MAX_IMPORT_ARTIFACT_BYTES = 64 * 1024 * 1024;

/** §46 — every Provider event carries these. */
export interface ProviderEventFrame {
  type: string;
  adapterSequence: number;
  actorId: string;
  actorSequence: number;
  runId: string;
  attempt: number;
  causalParentEventId?: string;
  requestId?: string;
  payload?: Record<string, unknown>;
  ext?: Record<string, unknown>;
}

// ───────────────────────── Kernel Event Store ─────────────────────────

export type EventOrigin = "adapter" | "kernel";
export type EventTrust = "untrusted_observation" | "kernel_truth" | "protocol_violation";

export interface StoredEvent {
  eventId: string;
  kernelSequence: number;
  origin: EventOrigin;
  trust: EventTrust;
  type: string;
  receivedAt: string;
  /**
   * H1 — Kernel-assigned identity of the adapter process that produced this frame.
   * Set on every adapter-origin record. Never taken from the adapter's own claim.
   * Absent on kernel-origin records and on legacy (pre-H1) JSONL lines.
   */
  adapterInstanceId?: string;
  runId?: string;
  attempt?: number;
  adapterSequence?: number;
  actorId?: string;
  actorSequence?: number;
  actionId?: string;
  causalParentEventId?: string;
  payload?: unknown;
}

// ───────────────────────── Evidence §31–33 ─────────────────────────

export type EvidenceType =
  | "FILE_DIFF"
  | "FILE_SNAPSHOT"
  | "COMMAND_EXECUTION"
  | "TEST_RESULT"
  | "BUILD_RESULT"
  | "DB_MIGRATION_RESULT"
  | "SCREENSHOT"
  | "RUNTIME_OBSERVATION"
  | "SECURITY_SCAN_RESULT"
  | "ADVISORY_REVIEW"
  | "HUMAN_ACCEPTANCE"
  | "VERIFICATION_VERDICT"
  | "GENERATED_ARTIFACT"
  | "DIVERGENCE_RECORD";

export type EvidenceSource =
  | "DVL_RUNTIME_CAPTURE"
  | "WORKSPACE_GIT_ENGINE"
  | "HEADLESS_BROWSER"
  | "DVL_EXECUTION_SUPERVISOR"
  | "PROVIDER_HARNESS_RECORD"
  | "PROVIDER_AGENT_CLAIM"
  | "ADVISORY_LLM_REVIEW"
  | "HUMAN_ACCEPTANCE"
  | "VERIFICATION_GATE";

export type EvidenceStatus =
  | "OBSERVED"
  | "RECORDED"
  | "PERSISTED"
  | "VALIDATING"
  | "VALIDATED"
  | "REJECTED"
  | "CORRUPTED"
  | "CONSUMED";

export interface EvidenceRecord {
  evidenceId: string;
  projectId: string;
  taskId: string;
  workerId: string;
  runId: string;
  attempt: number;
  workspaceId: string;
  evidenceType: EvidenceType;
  source: EvidenceSource;
  timestamp: string;
  causality: { sourceEventId: string; causalParentEventId?: string };
  artifactRefs: ArtifactRef[];
  payloadSummary: string;
  integrityHash: string;
  validationStatus: EvidenceStatus;
  relatedActionId?: string;
  /** Why the Kernel assigned this status. Spike-only diagnostic. */
  statusReason?: string;
}

// ───────────────────────── Identity §7 ─────────────────────────

export interface RunIdentity {
  projectId: string;
  taskId: string;
  workerId: string;
  runId: string;
  attempt: number;
  workspaceId: string;
  decisionSnapshotVersion: number;
  decisionSnapshotHash: string;
}

// ───────────────────────── Error normalization §48 (subset used by Spike) ─────────────────────────

export type NormalizedErrorClass =
  | "event_gap"
  | "internal_adapter_error"
  | "unknown_provider_failure"
  | "provider_unavailable"
  | "timeout"
  | "halted_by_safety_limit";
