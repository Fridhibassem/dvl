# DVL Phase 1.1 Hardening Plan

Status: Required before Phase 2 real provider adapter.

Phase 1 Spike is accepted, tested, pushed, and CI-passing.

## Goal

Before connecting a real provider such as Claude, Codex, Gemini, Kimi, or any external adapter, DVL must harden the runtime boundary.

## Required hardening tasks

### H1 — Add adapterInstanceId

Problem:
adapterSequence alone is ambiguous after adapter restart, crash, or retry.

Required:
Every adapter process instance must have a unique adapterInstanceId.

Acceptance:
Events are ordered by adapterInstanceId + adapterSequence, not adapterSequence alone.

Status: implemented — conformance suite C06 (`dvl-spike/src/conformance/c06-adapter-instance-id.test.ts`).
- Kernel assigns the id at spawn (random, never pid/counter-derived); adapter claims are flagged, never trusted.
- (adapterInstanceId, adapterSequence) is the per-instance uniqueness/continuity key; each instance starts at 1.
- Global order across instances remains kernelSequence — do not sort by instance id.
- adapterSequence is monotonic for the whole adapter process (across runs); actorSequence is validated
  per (adapterInstanceId, runId, actorId) — a new instance may restart an actor stream at 1.
- Fencing: `restartAdapter({ force: true })` retires a live instance; any later frame from a retired or
  terminated instance is a `stale_adapter_instance` violation and is never applied.
- Kill safety: the Kernel signals the adapter (group, falling back to the child) only while Node has not
  observed it exit (`exitCode`/`signalCode` null, not `killed`). Never after exit — the pid/pgid may be reused.
- Instance death (exit or retirement): owned runs failed (`provider_unavailable`),
  active actions → `kernel.action_aborted`, unresolved actors → `kernel.actor_aborted`. Aborted is resolved
  for the snapshot gate but is never success.

### H2 — Isolate adapter spool from Kernel truth spool

Problem:
The adapter currently can write artifacts into DVL spool space.

Required:
Adapter writes only to an untrusted adapter area.
Kernel verifies hash, size, and path.
Kernel imports verified artifacts into Kernel-owned storage.

Acceptance:
Provider cannot write directly into Kernel truth artifacts.

Status: implemented — conformance suite C07 (`dvl-spike/src/conformance/c07-adapter-spool-isolation.test.ts`).
- Layout: `.dvl/spool/<adapterInstanceId>/` is Kernel-owned (diagnostics, Kernel-spooled payloads, imported
  artifacts); `.dvl/adapter-spool/<adapterInstanceId>/` is the untrusted area, passed to the adapter as
  `DVL_ADAPTER_SPOOL_DIR`. Both are created fresh (non-recursive mkdir) before spawn.
- stderr and non-`DVL1:` stdout drain into the owning instance's Kernel spool, never parsed as protocol.
- An adapter artifactRef is accepted only as `.dvl/adapter-spool/<own id>/<safe filename>`: a regular file,
  opened with O_NOFOLLOW, size and hash verified on the exact bytes read, which are then imported into the
  Kernel spool under a Kernel-issued ref (`artifactRef`, `adapterInstanceId`, `hash`, `byteSize`, `mimeType`,
  `summary`, `path`, `sourceArtifactRef`). Rejected claims are never attached (evidence → CORRUPTED).
- Late output from a retired instance is fenced by H1 (`stale_adapter_instance`): no import, no evidence.
- Retention (`Kernel.pruneAdapterSpools`) removes only non-live untrusted areas; the Kernel spool is retained.
- Spool material never creates EvidenceRecords; evidence still originates only from `action.finished`.

### H3 — Add queue memory limits

Problem:
Drain-fast/process-later avoids pipe deadlock but can create unbounded memory growth.

Required:
Add maxQueuedFrames and maxQueuedBytes safety limits.

Acceptance:
If queue limits are exceeded, Kernel records a safety halt and stops the adapter safely.

Status: implemented, pending independent review — conformance suite C08 (`dvl-spike/src/conformance/c08-queue-limits.test.ts`).
- Per-instance FIFO frame queue inside the Kernel transport, bounded by `MAX_QUEUED_FRAMES` (1024) and
  `MAX_QUEUED_BYTES` (16 MiB); overridable per Kernel via `queueLimits` for tests.
- stdout/stderr drain never waits on processing (unchanged).
- Overflow seals the queue: the offending frame and all later frames go to
  `.dvl/spool/<adapterInstanceId>/diagnostics.queue-overflow.log` (disk, counted, never processed).
- One `kernel.safety_halt` (`halted_by_safety_limit`, `kind: queue_overflow`) with instance, runs, limits,
  depth/bytes at violation, last accepted / last queued / rejected adapterSequence, timestamp, spool path.
- Halt ends runs as `halted`, kills the adapter while alive, and terminates the instance, so frames still
  queued are fenced (stored as violations), never truth.
- Regression suite C09 (`c09-safety-halt-regression.test.ts`) covers the once-per-instance + fencing halt for
  the pre-H3 triggers `maxDurationMs` and `maxIncomingBytes`, including restart to a fresh instance.
- `maxIncomingBytes` is accounted per adapterInstanceId (it was Kernel-lifetime, a leftover from the
  single-instance Phase 1 Kernel, which made a fresh instance start over budget after a byte halt).

### H4 — Add Kernel crash replay test

Problem:
Phase 1 proves provider crash handling, but not Kernel crash/restart recovery.

Required:
Add a test that simulates Kernel interruption and verifies replay from JSONL event store.

Acceptance:
After restart, Kernel can reconstruct enough state to avoid false completion or corrupted truth.

Status (first crash test, pending independent review): the Kernel rebuilds runs from Kernel-origin
records on replay; an attempt without a terminal Kernel record is `interrupted` (never success),
recorded once by the next `start()`, continued only via `retryRun()`. Suite C27 SIGKILLs a
Kernel process mid-run against a synthetic project and the real khedma.tn project (tracked files
copied to a temp root; one harmless probe test staged in the attempt workspace only). See
`CLAUDE_REPORTS/H4_KERNEL_CRASH_REPLAY_REPORT.md`.

## Post-review fixes (Codex blocker candidates A–C) — pending independent review

- A (H1, run ownership): an adapter event naming a known run is applied only if its
  (adapterInstanceId, runId, attempt) equals the run's Kernel-created binding, the attempt is not terminal,
  and the transition is legal (`run.started` only from `starting`). Otherwise: `run_binding_violation`
  (`run_owned_by_other_instance` | `attempt_mismatch` | `run_terminal` | `illegal_transition`), stored, never
  applied. Continuation after a terminal attempt only via `Kernel.retryRun()` (attempt N+1, rebound to the
  current instance, `kernel.attempt_created`). Suite C10.
- B (H2, spool provenance): no OS sandbox — an adapter can physically write into `.dvl/spool/<id>/`.
  Location never grants trust: every Kernel spool write records `kernel.artifact_registered` (id, owner, path,
  hash, size, origin, run/attempt), rebuilt on replay from Kernel-origin records only; `verifyKernelArtifact`
  requires a matching registration plus a byte re-check. Evidence attaches a Kernel-spooled payload ref only
  for the exact payload object the Kernel created (adapter `__spooled` keys are data). Suite C11.
- C (H3, maxIncomingBytes): charged in the transport when stdout/stderr bytes are read — before splitting,
  parsing, queueing, gates — per instance, once. Breach seals the queue, one `kernel.safety_halt`
  (`kind: max_incoming_bytes`, stream, byte counts), instance killed and fenced. Suite C12; C09 updated.

## Post-review fixes, round 2 (Codex blockers 1–4) — pending independent review

- 1 (durable authority): the adapter can physically write `.dvl/events/events.jsonl` and
  `.dvl/evidence/evidence.jsonl` (same OS user, no sandbox). Both logs are HMAC-SHA256 chains keyed by a
  host-held `integrityKey` passed to the Kernel in memory (never env, disk or adapter). Replay accepts only
  lines whose MAC continues the last accepted line; forged/inserted lines are rejected, a modified, deleted or
  reordered line ends trust from that point (fail-closed), `kernel.integrity_violation` is recorded. Tail
  truncation/rollback is detected only against a host-held `expectedHead`. No key ⇒ ephemeral key: nothing
  authenticates after restart. Suite C13.
- 2 (lifecycle FSM): one admission gate (`Kernel.admit`) checks binding, terminal state, run FSM, actor FSM
  (finished/aborted actors cannot act) and action FSM (requested → started → updated* → finished, owner-actor
  only). Actor/action state is per attempt. Rejected events mutate nothing and create no Evidence. Suite C14.
- 3 (attempt workspaces): each attempt owns `.dvl/tx/<runId>/attempt-<n>` and a fresh workspaceId; a superseded
  workspace is archived (registered manifest) and never reused. Files carry forward only from an explicitly
  selected VALIDATED FILE_SNAPSHOT of the same run, byte-verified, checked before any attempt exists. Suite C15.
- 4 (atomic dispatch): a run.start that is not delivered and acknowledged makes the attempt terminal
  `failed_to_start` (`kernel.attempt_dispatch_failed`); retries stay monotonic. Suite C16.
- Also: `send()` waits for stdin drain only until a timeout or stdin close/error; every ArtifactRef field
  (incl. mimeType, summary, sourceArtifactRef) is bound to the Kernel registration. Suite C17.

## Execution rule

Implement one hardening task at a time.

Order:
1. H1 adapterInstanceId
2. H2 adapter spool isolation
3. H3 queue memory limits
4. H4 Kernel crash replay test

Each task must include tests and must keep CI green.
