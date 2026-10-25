# DVL CORE STABLE CONTRACT — FINAL V0.3.2

**Status:** FROZEN FOR SPIKE  
**Date:** 2026-10-02  
**Purpose:** This file freezes the stable core contract of DVL before implementation begins. No more text-review loops should change this contract before the Spike. Future changes must come from Spike evidence, not from more theoretical review.

---

## 0. Freeze Rule

This contract is frozen for the Spike.

```text
No more contract review loop.
No more Claude/Gemini text iteration.
Next useful evidence comes from running the Spike.
```

The next step is not another review.  
The next step is Phase 1 implementation:

```text
Mock Provider
Kernel Event Store
NDJSON stdio loop
First conformance tests
```

---

## 1. Fundamental Law

```text
Providers execute.
Providers suggest.
Providers observe.
Providers may fail or disappear.

DVL owns Project Truth.
```

A Provider is not DVL.

An Adapter is not Project Truth.

A Worker can die.

Recoverable work must survive.

Unsafe work must be archived as diagnostic context and must not be silently lost.

---

## 2. Three-Layer Stable Structure

DVL is separated into three layers:

```text
1. Provider Boundary Contract
   What Providers and Adapters may send or receive.

2. Kernel Truth Spec
   How DVL creates truth from workspace state, events, evidence, validation,
   verification, human acceptance, and integration.

3. Execution Safety Spec
   How DVL prevents dirty workspaces, runtime contamination, approval deadlocks,
   double execution, uncontrolled shell access, and runaway loops.
```

The Provider Boundary must never directly create official Project Truth.

---

## 3. Core Architecture

```text
DVL Product / Rooms / User Experience
        ↓
DVL Core
Kernel · Orchestrator · Project State · Workspace · Event Store
        ↓
Provider Boundary Contract
        ↓
Provider Adapter
        ↓
Replaceable Provider / Runtime
Claude · Codex · Gemini · Kimi · ACP · OpenCode · OpenHands · Local Model · Future Provider
```

Inside DVL Core:

```text
Kernel Truth Spec
Evidence Ledger · Verification Gate · Integration Gate · Project Truth

Execution Safety Spec
Sandbox · Transaction Workspace · Runtime Isolation · Hibernation · Tool Boundary
```

---

## 4. DVL-Owned Truth

The following state belongs only to DVL:

```text
Project State
Project Decisions
Design Memory
Task State
Worker State
Run State
Workspace State
Event Store
Evidence Ledger
Verification State
Integration State
Authorization State
Recovery State
Human Acceptance Records
```

Provider memory is temporary.

Provider sessions are disposable.

Provider conversation history is never Project Truth.

---

## 5. Provider Role

A Provider may:

```text
analyze
suggest
plan
write code through permitted tools
edit files through permitted tools
request command execution
review code
test through permitted tools
design
generate artifacts
report progress
request authorization
ask questions
emit intent hints
```

A Provider may not:

```text
own Project State
decide final truth
grant itself authority
mark evidence as validated
issue authoritative PASS
mark work officially integrated
bypass DVL scope
replace DVL verification
replace DVL evidence
```

---

## 6. Adapter Role

The Adapter is DVL-owned code, but it is not the source of Project Truth.

The Adapter translates between:

```text
Provider-native protocol
        ↕
DVL Provider Boundary Contract
```

The Adapter may emit:

```text
raw observations
activity events
provider messages
tool requests
approval requests
capability declarations
error reports
usage reports
intent hints
```

The Adapter must not emit authoritative truth events such as:

```text
evidence.validated
verification.PASS
integration.accepted
official_project_state_changed
```

Only the Kernel Truth Spec can create truth.

---

## 7. Stable Identity Model

Every execution unit must use DVL-issued identity:

```text
projectId
taskId
workerId
runId
attempt
workspaceId
providerId
adapterId
projectVersion
decisionSnapshotVersion
```

Definitions:

```text
Worker:
A DVL-level unit of responsibility.

Run:
One Kernel-managed execution of a task through one Adapter.

Attempt:
One concrete start or restart of a Run.

Workspace:
An isolated local work area controlled by DVL.

Mechanical Checkpoint:
A resumable checkpoint that passed cheap safety checks but is not Project Truth.

Validated Checkpoint:
A DVL-approved truth checkpoint backed by sufficient validated evidence.
```

A Provider-native session ID may exist, but it is metadata only.

---

## 8. Command Execution Modes

Every Adapter must declare a command execution mode:

```text
commandExecutionMode:
  dvl_tools
  gated_native
  none
```

### 8.1 dvl_tools

The Provider calls DVL-owned tools.

DVL executes the operation and returns the tool result.

This is the preferred mode.

Evidence from this mode can become authoritative if captured by DVL-controlled runtime.

### 8.2 gated_native

The Provider engine executes its own native tool after DVL approval.

DVL gates and contains the operation, but does not execute it.

Output from this path is a bounded-trust `PROVIDER_HARNESS_RECORD`, not authoritative truth by itself.

### 8.3 none

No shell/file/runtime execution is allowed.

### 8.4 No Double Execution

```text
No double execution.
```

DVL must never execute an approved operation if the Provider engine will also execute the same operation.

For state-mutating actions, double execution is forbidden.

Examples:

```text
database migrations
seed scripts
external deployments
package installs
file deletes
credential changes
```

---

## 9. Provider Boundary Commands

DVL Core may send these command semantics to an Adapter:

```text
adapter.describe
run.start
run.stop
run.hibernate
run.resume_after_auth
run.update_decisions
approval.respond
run.answer
adapter.ping
adapter.shutdown
```

---

## 10. adapter.describe

The Adapter declares:

```text
adapterId
adapterVersion
providerName
providerEngine
supportedContractVersions
supportedModels
authModes
eventFidelity
approvalSupport
midRunUpdateSupport
safeStopSupport
hibernationSupport
resumeSupport
subagentBehavior
usageReporting
scopeMapping
budgetDimensions
commandExecutionMode
runtimeEvidenceObservationSupport
```

Capabilities must be declared truthfully.

Unsupported capabilities must be reported, not faked.

Declared capabilities must be tested by conformance tests.

---

## 11. run.start

Starts a Run or Attempt.

It must include:

```text
runId
attempt
taskId
workerId
role
goal
acceptance criteria
workspace root
transaction workspace root
scope
active project decisions
decisionSnapshotVersion
decisionSnapshotHash
resume context
mechanical checkpoint if any
validated checkpoint if any
budget
credentials reference
```

The Provider receives the task.

It does not receive ownership of the project.

---

## 12. run.stop

Stops a Run.

Supported modes:

```text
interrupt
cancel
force
safe_boundary_if_supported
```

`safe_boundary_if_supported` is a capability, not a universal guarantee.

If safe boundary is unavailable, DVL interrupts or cancels the provider and protects the project using transaction workspace rules.

---

## 13. run.hibernate

Used when the Run must wait for human authorization or long external input.

Hibernation is not abort.

A hibernated Run must preserve its current transaction workspace unless it is explicitly marked unsafe.

DVL persists:

```text
pending action
authorization request
current run state
last completed action
current transaction workspace
resume instructions
authorizationIntentId if present
```

The run may later resume or restart with the authorization decision injected.

---

## 14. run.resume_after_auth

Resumes or restarts a hibernated run after the user responds.

The Provider receives:

```text
authorization decision
allowed grant or denial reason
current project decisions
decisionSnapshotVersion
decisionSnapshotHash
short decision summary
validated checkpoint
mechanical checkpoint if safe
pending action context
authorizationIntentId
```

---

## 15. Authorization Approval Path

If the user approves a pending action:

### In `dvl_tools` mode

DVL executes the tool call once through DVL-owned tools and returns the tool result.

### In `gated_native` mode

The Provider executes the native tool after approval.

DVL must not execute the same operation.

The result is a `PROVIDER_HARNESS_RECORD` unless DVL later performs a safe authoritative verification action.

---

## 16. Authorization Denial Path

If the user denies a pending action, DVL must preserve the run when possible.

DVL injects a native denial result where supported, or a synthetic tool-result equivalent:

```text
is_error: true
error_code: USER_DENIED
message: "Action denied by user policy: <reason>"
```

The Provider may then replan.

The Provider must not treat denial as permission to perform the same action differently.

---

## 17. Allow-After-Restart Pre-Grant

If a provider cannot defer and resume natively, hibernation may require restart.

To avoid asking the user twice for the same approved action, DVL may store a one-time pre-grant.

Preferred identity:

```text
authorizationIntentId
semanticActionSignature
```

Fallback identity:

```text
actionHash = hash(canonical command + cwd + target + scope + normalized args)
```

If the restarted provider requests the same semantic action, DVL may auto-allow it once.

If the request differs materially, DVL must ask the user again.

Raw command string hashing alone is insufficient when semantic normalization is available.

---

## 18. run.update_decisions

Propagates accepted project changes to active Runs.

Examples:

```text
Database changed from MySQL to SQL Server.
Brand theme changed.
Security policy changed.
API contract changed.
```

If mid-run update is supported, the Adapter may apply or queue the update.

If unsupported, DVL uses the restart path:

```text
stop affected Run
preserve safe mechanical checkpoint if available
archive dirty diff as diagnostic context
restart from latest safe mechanical checkpoint or latest validated checkpoint
inject updated decisions
continue safely
```

---

## 19. Provider Boundary Events

The Adapter may emit these event families:

```text
run.started
run.needs_input
run.finished
run.failed
heartbeat

actor.fork
actor.started
actor.finished

action.requested
action.started
action.updated
action.finished

approval.requested
usage.reported
workspace.hint
log.diagnostic

provider.message
provider.intent_hint
provider.error
```

The Adapter may also emit raw native events for diagnostics.

Raw native events are never Project Truth.

---

## 20. Activity Events Are Not Evidence

Activity events describe motion.

They do not prove outcome.

```text
action.started → tests are starting
action.finished → command ended
```

This does not prove that tests passed.

Rule:

```text
Activity shows motion.
Evidence proves outcome.
```

---

## 21. Intent Hints for Live UI

Human-readable live labels may require Provider semantic intent.

The Adapter may emit:

```text
provider.intent_hint
```

Examples:

```text
"Creating users table"
"Running authentication tests"
"Updating Login component"
```

Intent hints are allowed for UI only.

They have zero truth weight.

They must not satisfy Evidence, Verification, or Integration Gates.

The UI must visually separate provider-written intent from DVL-verified state.

Intent hints must be length-limited and character-limited.

A Provider hint such as “all tests passed” must not be displayed as verified truth unless the Evidence Ledger supports it.

---

## 22. Live Fidelity Levels

Providers expose different visibility.

DVL must degrade honestly.

```text
L3 — Live:
Provider emits action lifecycle with targets and timing.

L2 — Delayed:
Provider emits completed actions after the fact.

L1 — Narrative:
Provider reports what it claims it did.

L0 — Opaque:
Provider exposes only start and finish.
```

UI rules:

```text
L3 → NOW — ...
L2 → JUST DONE — ...
L1 → AGENT REPORTS — ...
L0 → RUNNING — no detailed live state available
```

DVL must never fabricate live state.

L3 is action-level visibility, not effect-level truth.

Shell effects and hidden file mutations must be discovered by DVL workspace/evidence mechanisms.

---

## 23. Scope and Authority

The Kernel owns scope and authority.

Prompt instructions are not security boundaries.

DVL enforces scope in layers:

```text
L-0 System Enforcement:
workspace isolation
transaction worktree
filesystem restrictions
sandbox/container where supported
network policy
path canonicalization
process supervision

L-1 Provider Configuration:
provider-native permissions
provider-native sandbox
provider-native allowed tools

L-2 Instruction:
natural-language task instructions
```

Only L-0 is authoritative.

L-1 is defense in depth.

L-2 is advisory.

---

## 24. No Sandbox, No Shell

Restricted roles that need shell access require a real sandbox.

```text
restricted role + no real sandbox = no shell access
```

Command-pattern rules alone are not a security boundary.

If no reliable sandbox exists, the role must run without shell or be marked degraded/unsupported.

---

## 25. Authorization Rule

When a Provider requests an action, DVL classifies it.

Possible outcomes:

```text
auto_allow
auto_deny
ask_user
hibernate_for_user
```

Provider-supplied risk labels are untrusted hints.

The Kernel computes risk from:

```text
action kind
target
scope
project policy
user policy
task context
runtime state
```

Human authorization must be asynchronous-capable.

Long user waits must not cause provider stream deadlocks.

---

## 26. Workspace Transaction Boundary

All unverified mutations must occur inside an isolated transaction workspace.

Default rule:

```text
A Run writes to a transaction worktree or staging layer.
Official project workspace is updated only by Integration Gate.
```

If a Run is aborted, stale, interrupted, or fails before validation:

```text
preserve safe mechanical checkpoint if available
archive dirty diff under .dvl/stale_attempts/
preserve logs and observations for diagnostics
discard unsafe transaction workspace when necessary
restart from latest safe mechanical checkpoint or latest validated checkpoint
```

DVL must not promote half-written syntax, half-applied migrations, or dirty runtime state into official Project Truth.

---

## 27. Safe Mechanical Checkpoint

A mechanical checkpoint is resumable, but not truth.

It is safe only if it passes graded checks.

### 27.1 Universal checks

Always enforced where possible:

```text
files exist when expected
file byte size is reasonable
valid UTF-8 for text files when applicable
no null-byte corruption for text files
write handles are closed
no active DVL tool call is writing
filesystem quiescence period has passed
```

### 27.2 Opportunistic language checks

If cheap parser support exists, DVL may run:

```text
JS/TS/JSX/TSX parse
JSON parse
Python ast.parse
Markdown/frontmatter parse
other cheap built-in syntax checks
```

### 27.3 Unknown/heavy stacks

If no cheap parser exists, the checkpoint may be provisionally safe using universal checks only.

It is still not Project Truth.

### 27.4 Unsafe checkpoint

If syntax appears truncated, corrupted, or unsafe:

```text
checkpointStatus = UNSAFE_FOR_RESUME
```

Recovery falls back to latest validated checkpoint and keeps the unsafe diff as diagnostic context only.

### 27.5 Migration state

Half-applied migration state cannot be detected from files alone.

Migration state safety can only be assessed if the migration ran inside a DVL-controlled isolated database or equivalent controlled runtime.

---

## 28. Runtime Isolation

Non-idempotent runtime operations must run in isolated environments where supported, or be marked degraded/unsupported.

Examples:

```text
database migrations
integration tests
long-running dev servers
browser tests
background ports
Redis or queue workers
package install side effects
filesystem permission changes
```

DVL Execution Supervisor should use:

```text
temporary database schema
shadow database
transactional rollback
containerized runner where available
shadow port
isolated environment variables
temporary cache
sandboxed process group
Copy-on-Write or shared cache layers
```

Runtime evidence must not contaminate the user's primary local environment.

---

## 29. Live Product Room Serving Target

The primary Live Product Room must not serve directly from an in-flight transaction workspace.

Serving targets:

```text
Primary Live Product Room:
latest Validated Checkpoint or stable Staging Preview checkpoint

Transaction Workspace:
agent working area, not directly bound to the primary live preview

Staging Preview:
optional preview target after mechanical checkpoint passes
```

Unvalidated, half-written transaction workspaces must not bind directly to the main Live Product Room port.

---

## 30. Runtime Evidence Is First-Class

A Worker claim is not proof.

Natural-language completion is not proof.

DVL requires Runtime Evidence for meaningful task outcomes.

Runtime Evidence proves what actually happened in the workspace or runtime.

Examples:

```text
file diff
file snapshot
command output
test result
build result
database migration result
screenshot
runtime observation
browser interaction result
security scan result
verification verdict
generated artifact
human acceptance
```

---

## 31. Kernel-Owned EvidenceRecord

Only the Kernel Truth Spec creates official EvidenceRecords.

The Provider or Adapter may provide observations.

The Kernel decides whether to create an EvidenceRecord.

Minimum fields:

```text
evidenceId
projectId
taskId
workerId
runId
attempt
workspaceId
evidenceType
source
timestamp
causality
artifactRefs
payloadSummary
integrityHash
validationStatus
relatedActionId
```

Evidence types:

```text
FILE_DIFF
FILE_SNAPSHOT
COMMAND_EXECUTION
TEST_RESULT
BUILD_RESULT
DB_MIGRATION_RESULT
SCREENSHOT
RUNTIME_OBSERVATION
SECURITY_SCAN_RESULT
ADVISORY_REVIEW
HUMAN_ACCEPTANCE
VERIFICATION_VERDICT
GENERATED_ARTIFACT
DIVERGENCE_RECORD
```

---

## 32. Evidence Source Trust Classes

Evidence sources must be classified.

```text
DVL_RUNTIME_CAPTURE
WORKSPACE_GIT_ENGINE
HEADLESS_BROWSER
DVL_EXECUTION_SUPERVISOR
PROVIDER_HARNESS_RECORD
PROVIDER_AGENT_CLAIM
ADVISORY_LLM_REVIEW
HUMAN_ACCEPTANCE
VERIFICATION_GATE
```

Trust rules:

```text
DVL_RUNTIME_CAPTURE:
authoritative if captured by DVL-controlled supervisor.

WORKSPACE_GIT_ENGINE:
authoritative for file state and diffs.

HEADLESS_BROWSER:
authoritative for captured UI state if controlled by DVL.

DVL_EXECUTION_SUPERVISOR:
authoritative only when DVL executed or re-ran the operation through DVL-owned tools or DVL-controlled runtime.

PROVIDER_HARNESS_RECORD:
bounded trust only. Useful observation, not final truth.

PROVIDER_AGENT_CLAIM:
zero authority by itself.

ADVISORY_LLM_REVIEW:
may support FAIL or INSUFFICIENT_EVIDENCE, but cannot create PASS alone.

HUMAN_ACCEPTANCE:
authoritative only when explicit, recorded, scoped, and visible.

VERIFICATION_GATE:
authoritative only when based on validated evidence and allowed gate rules.
```

---

## 33. Evidence Lifecycle

Evidence moves through explicit states:

```text
OBSERVED
RECORDED
PERSISTED
VALIDATING
VALIDATED
REJECTED
CORRUPTED
CONSUMED
```

Rules:

```text
Observed data is not evidence yet.
Evidence must be persisted before verification.
Evidence must have per-type validation.
Rejected or corrupted evidence cannot satisfy completion.
Persisted evidence survives Worker death.
Only validated evidence may support Integration.
```

`CONSUMED` means evidence has been used by a Verification Gate, Integration Gate, or recorded Human Acceptance decision.

---

## 34. Per-Type Validation Rules

`VALIDATED` must mean something specific per evidence type.

Examples:

```text
FILE_DIFF:
DVL recomputes git diff from transaction workspace.

FILE_SNAPSHOT:
DVL hashes file bytes and verifies path is inside scope.

COMMAND_EXECUTION:
DVL captured command, cwd, stdout, stderr, exit code, duration, and process metadata by executing it through DVL-owned tools/runtime.

TEST_RESULT:
DVL executed or re-ran the test command and parsed structured test output or verified exit code and logs.

BUILD_RESULT:
DVL executed or re-ran the build command and captured exit code and artifacts.

DB_MIGRATION_RESULT:
DVL executed migration once through dvl_tools in isolated DB/runtime, or verified outcome through passive state inspection. DVL must not re-run non-idempotent migrations.

SCREENSHOT:
DVL-controlled browser captured screenshot with URL, viewport, timestamp, and artifact hash.

RUNTIME_OBSERVATION:
DVL-controlled observer captured DOM, network, console, IPC, runtime state, or controlled filesystem state.

SECURITY_SCAN_RESULT:
DVL captured scanner output, tool version, config, and findings artifact.

ADVISORY_REVIEW:
structured review stored as advisory only.

HUMAN_ACCEPTANCE:
explicit user decision recorded with scope, reason, timestamp, and affected evidence/task.
```

“Captured” means executed by DVL or captured directly by DVL-owned tool/runtime. It does not mean merely watching provider output.

---

## 35. Idempotent vs State-Mutating Operations

DVL re-run is allowed only for idempotent or verification actions.

```text
Idempotent / verification actions:
tests
builds
linters
format checks
static scanners
read-only analyzers
```

For these, DVL may re-run to create authoritative `DVL_EXECUTION_SUPERVISOR` evidence.

State-mutating actions must not be re-run blindly:

```text
database migrations
seed scripts
external deployments
package installs
write operations
delete operations
credential changes
```

State-mutating actions must either:

```text
run once through dvl_tools under DVL control
or be verified by passive state inspection
or require explicit scoped HUMAN_ACCEPTANCE
```

---

## 36. Evidence Sufficiency

Not every action requires evidence.

Harmless reads do not require evidence.

Evidence is required when a task:

```text
mutates files
changes runtime state
runs tests
builds artifacts
modifies database schema
claims milestone completion
exports components
performs security review
requests official integration
```

If required evidence is missing:

```text
status = INSUFFICIENT_EVIDENCE
```

---

## 37. Divergence Protocol

If Provider harness output and DVL-supervised output disagree, DVL must not silently ignore the difference.

DVL creates:

```text
evidence.divergence_detected
```

Fields:

```text
harnessRecordId
supervisorRecordId
divergenceType
command
cwd
envDiff
stdoutDiff
stderrDiff
exitCodeDiff
timestamp
```

Divergence is evaluated only against the final milestone verification command tied to completion, not intermediate scratchpad failures.

Normal agent self-correction must not be blocked by earlier exploratory failed tests if final DVL-supervised verification passes.

Flaky test policy:

```text
On divergence, DVL may re-run the verification command N times before final verdict.
Default Spike value: N = 2.
Record flake rate and environment differences in the Evidence Ledger.
```

Provider pass + DVL fail cannot become automatic PASS.

DVL pass after provider fail may pass if tied to final milestone verification and flake policy is satisfied.

---

## 38. Verification Gates

Verification evaluates:

```text
Task Goal
Worker Claim
Validated Evidence
Current Project Decisions
Scope Compliance
```

Verdicts:

```text
PASS
FAIL
INSUFFICIENT_EVIDENCE
```

Rules:

```text
PASS requires deterministic or DVL-captured validated evidence.

An LLM reviewer cannot issue authoritative PASS alone.

An LLM reviewer may produce FAIL or INSUFFICIENT_EVIDENCE.

A verdict must cite evidence IDs.

The Kernel must verify that cited evidence exists and is VALIDATED.
```

For automatic PASS on code, build, test, migration, or deployment tasks:

```text
DVL must execute, re-run, or verify through DVL-owned runtime/evidence rules.
Provider-native observed output alone is insufficient.
```

---

## 39. Advisory Review vs Authoritative Verification

LLM-based review is advisory unless backed by deterministic evidence or explicit human acceptance.

Examples:

```text
Codex code review
Kimi security review
Claude explanation
Gemini design critique
```

These may produce:

```text
ADVISORY_REVIEW
finding
recommendation
suspected issue
FAIL suggestion
INSUFFICIENT_EVIDENCE suggestion
```

They must not alone produce:

```text
authoritative PASS
official integration
project truth promotion
```

---

## 40. Design / Conversational Lifecycle

Design Room work has a different lifecycle from deterministic code tasks.

Design lifecycle states:

```text
DESIGN_DRAFT
DESIGN_STAGED
DESIGN_ACCEPTED
EXPORT_REQUESTED
```

`DESIGN_STAGED` is a lifecycle state, not a verification verdict.

Design acceptance is a subtype of `HUMAN_ACCEPTANCE` scoped to visual/design intent.

Design acceptance does not automatically prove code correctness.

---

## 41. Export Component Handshake

When the user triggers Export Component, DVL must split visual acceptance from code integration.

### Export Component Gate

Local/syntactic checks only:

```text
AST parse when available
JSX/TSX syntax validity when applicable
no unclosed tags
no truncated generated file
scope check
```

If passed, the component artifact can be saved to the project component library or staging area.

### Project Integration Gate

Full semantic checks happen later when the component is wired into a page/app/task:

```text
import resolution
typecheck if available
build check if required
runtime render check if required
```

Exporting a component must not break the canonical project workspace.

---

## 42. Integration Gate

No work becomes official Project Truth without Integration.

Integration requires:

```text
validated evidence
verification verdict OR explicit scoped HUMAN_ACCEPTANCE
scope compliance
decision consistency
no unresolved blocking errors
clean transaction workspace
current project decisions
```

Rule:

```text
No validated evidence → no automatic verification PASS.
No verification PASS → no automatic integration.
Explicit scoped HUMAN_ACCEPTANCE may override only when recorded and auditable.
No integration → not official Project Truth.
```

Human override is allowed only as explicit `HUMAN_ACCEPTANCE` evidence.

It must be visible, scoped, recorded, and auditable.

---

## 43. Resume and Failover

Resume is built by DVL.

A new Attempt may run on:

```text
same Provider
different Provider
local runtime
future Provider
```

The replacement Worker receives:

```text
task goal
current project decisions
decisionSnapshotVersion
decisionSnapshotHash
latest safe mechanical checkpoint if available
last validated checkpoint
validated evidence
rejected evidence
dirty attempt archive if useful
current verification state
remaining work
```

A replacement Provider must not need the previous Provider's private session memory.

Default recovery resumes from the latest safe mechanical checkpoint if available; otherwise it falls back to latest validated checkpoint.

---

## 44. Stale Worker Protection and Decision Anchoring

A Worker becomes stale when:

```text
project decisions change
scope changes
security policy changes
design system changes
API contract changes
decision snapshot may have been lost or compacted
worker context may no longer contain current truth
```

DVL must not rely on detecting provider compaction.

DVL must inject decision anchors deterministically:

```text
full decision snapshot at attempt start
full decision snapshot at restart when needed
decisionSnapshotVersion per tool result
decisionSnapshotHash per tool result
short decision summary per tool result
current decision anchor in resume payloads
```

The full snapshot should not be injected after every tool call unless required; version/hash/short summary are the default lightweight anchors.

Verification must check outputs against current decisions.

A stale Worker cannot integrate work until resolved.

Resolution options:

```text
revalidate
restart
replan
discard
human accept explicitly
```

---

## 45. Subagents and Internal Decomposition

DVL should not control internal model cognition.

DVL controls the external tool boundary.

Provider-internal subagents are acceptable only if all external effects pass through the DVL Tool Boundary or are contained and observable according to declared capability.

Rules:

```text
Internal reasoning forks are allowed.
Internal subagents are allowed if contained.
All file writes must pass through DVL boundary or be contained by L-0 sandbox and detected by workspace evidence.
All shell commands must be gated or executed according to commandExecutionMode.
All network/tool calls must pass through DVL boundary or be denied by L-0 policy.
All mutations must be attributable to parent runId or a DVL Worker.
If internal effects bypass the boundary, provider fidelity degrades or provider is rejected.
```

If DVL needs independent authority, scope, evidence, or verification, it must create a real DVL Worker.

---

## 46. Actor Lifecycle and No-Writer Rule

Events:

```text
actor.fork
actor.started
actor.finished
```

Every event must carry:

```text
adapterSequence
actorId
actorSequence
runId
attempt
```

Optional causality anchor:

```text
causalParentEventId
```

Actor rules:

```text
A parent actor that forks child actors must declare actor.fork before child execution where possible.
A parent actor cannot be considered fully finished while declared child actors are unresolved.
DVL must not snapshot or validate while registered actors may still write.
```

No-writer condition should use:

```text
all registered actors finished
no active DVL tool call
filesystem quiescence in transaction workspace
process tree killed/exited when required
```

Default filesystem quiescence for Spike:

```text
250ms with no mutation events in the transaction workspace
```

OS process tree survival alone is not enough, because detached daemons and watchers may outlive the relevant write window.

---

## 47. Transport and Delivery

The Spike transport is:

```text
NDJSON over stdio with frame prefix
```

Protocol frames must start with:

```text
DVL1:
```

Example:

```text
DVL1:{"type":"run.started","adapterSequence":1}
```

Rules:

```text
stdout is for protocol frames.
stderr is for diagnostics and goes to spool.
Any stdout line without DVL1: is diagnostic noise and must not be parsed as protocol.
Kernel must continuously drain stdout independently of event processing.
Kernel must continuously drain stderr to diagnostic spool.
```

Inline payload limit:

```text
32KB max inline payload
```

Large logs, diffs, compiler output, test output, AST dumps, and diagnostics must be spooled to disk:

```text
.dvl/spool/<artifactId>.log
.dvl/spool/<artifactId>.json
```

Events carry:

```text
artifactRef
hash
summary
byteSize
mimeType
```

---

## 48. Error Normalization

Provider-specific errors must be normalized.

Minimum classes:

```text
auth_failed
quota_exhausted
rate_limited
provider_unavailable
network_lost
context_overflow
model_unavailable
model_refused
tool_failure
permission_failure
scope_violation
event_gap
timeout
sandbox_error
account_blocked
turn_limit
budget_exceeded
internal_adapter_error
unknown_provider_failure
halted_by_safety_limit
```

Each error should declare:

```text
retryable
retry_after_s if known
provider_code
message
```

The Kernel decides whether to:

```text
retry
backoff
fail over
ask user
hibernate
pause
fail task
```

---

## 49. Cost, Usage, and Runaway Limits

Usage data must be honest.

Possible source labels:

```text
reported
estimated
unknown
```

Rule:

```text
Estimated cost must not be shown as exact.
Unknown cost must not be invented.
```

Each Adapter must declare which budget dimensions it can enforce live:

```text
time
tokens
cost
attempt count
tool count
incoming bytes/chunks
```

If a budget dimension is only available at run end, it cannot be used for live enforcement.

DVL must enforce L-0 surrogate limits regardless of provider capability:

```text
maxDurationSeconds
maxToolCalls
maxIncomingBytes
maxIncomingChunks
maxConsecutiveAssistantMessages
maxNoProgressTime
```

If a surrogate limit is breached:

```text
DVL terminates adapter/process group
Run = budget_exceeded or halted_by_safety_limit
```

---

## 50. Security Rules

Provider-originated text is untrusted.

This includes:

```text
labels
summaries
risk hints
assistant messages
tool descriptions
claimed test outputs
claimed diffs
raw provider frames
intent hints
```

DVL must protect against:

```text
prompt injection
fake completion
fake test claims
path traversal
symlink escape
workspace escape
secret leakage
out-of-scope tools
unauthorized network use
provider session leakage
repo-controlled provider configuration
persistent external allow rules
```

Provider configuration loaded from the repository is untrusted.

Provider settings, hooks, and permission rules must be isolated or disabled unless explicitly approved by DVL Kernel policy.

---

## 51. Credentials and Branding

Credentials are owned by DVL secure storage.

The Adapter receives credentials per Run through a secure channel.

Credentials must not appear in:

```text
events
raw frames
logs
evidence artifacts
provider messages
diagnostics
```

Provider authentication modes must be declared.

Product design must respect provider terms and branding constraints.

If a provider forbids subscription-login resale or specific branding, DVL must not build against that assumption without explicit approval.

---

## 52. Mock Provider

DVL must build a deterministic Mock Provider before trusting real Providers.

The Mock Provider must simulate:

```text
success
failure
delay
authorization request
authorization deny
authorization approve-after-restart
file write
test run
command output
large output spooling
crash
provider disconnect
missing evidence
corrupted evidence
stale worker
scope violation
dirty workspace
provider replacement
actor lifecycle
actor fork race
L0/L1/L2/L3 fidelity
human approval hibernation
```

The Kernel must be testable without token cost and without real AI behavior.

---

## 53. Conformance Suite

A Provider Adapter is not DVL-compatible until it passes conformance tests.

Minimum scenarios:

```text
C01 handshake and capability declaration
C02 happy path with ordered events
C03 truthful fidelity declaration
C04 Worker crash and recovery
C05 Adapter death
C06 Provider outage
C07 approval allow / deny / timeout
C08 approval hibernation and resume
C09 out-of-scope write blocked
C10 decision change during active work
C11 dirty workspace discarded on stale abort
C12 rate limit and failover
C13 duplicate / out-of-order events
C14 secret redaction
C15 parallel isolation
C16 forward compatibility
C17 heartbeat and stall
C18 budget exceeded
C19 subagent tool-boundary compliance
C20 cross-provider failover
C21 evidence produced and persisted
C22 missing evidence blocks completion
C23 corrupted evidence rejected
C24 fake Provider claim overridden by DVL capture
C25 failed final test produces FAIL, not PASS
C26 validated evidence allows verification
C27 integration blocked without PASS or scoped HUMAN_ACCEPTANCE
C28 human acceptance recorded as evidence
C29 runtime isolation prevents dirty DB/port leakage
C30 LLM reviewer cannot produce PASS alone
C31 no double execution
C32 no sandbox, no shell
C33 export component requires local syntax check
C34 divergence detection and flaky test handling
C35 actor lifecycle prevents premature snapshot
C36 pre-grant allow-after-restart
C37 oversized payload spooling and continuous stdout drain
C38 frame-prefix handling of stdout noise
C39 filesystem quiescence no-writer rule
C40 semantic action signature avoids duplicate user approval
```

If C20 cross-provider failover fails in Phase 3, the contract must not be promoted as stable. It must be revised from Spike evidence.

---

## 54. Spike Plan

### Phase 1 — Mock Provider

Build:

```text
Mock Provider
Kernel Event Store
NDJSON stdio loop
DVL1 frame prefix
continuous stdout/stderr drain
payload spooling
actor lifecycle
basic evidence records
first conformance tests
```

### Phase 2 — Claude Adapter

Build thin real adapter path.

Test:

```text
DVL-owned tools vs gated native tools
approval hibernation
decision anchoring
adapter death
file/event completeness
large payload handling
```

### Phase 3 — Second Real Adapter

Add a second thin adapter:

```text
ACP Gemini CLI
or Codex adapter
```

Purpose:

```text
prove provider replaceability
run C20 cross-provider failover
validate the Stable Contract boundary against more than one real provider
```

---

## 55. Evidence Audit Discipline

Every load-bearing assumption must be classified:

```text
Verified Fact
Official Documentation
Inference
Unverified Assumption
Design Proposal
Spike Result
```

Rules:

```text
Documentation is not verified runtime behavior.
Inference is not fact.
Design proposal is not provider guarantee.
Unverified assumption must not be hidden.
Provider behavior must be proven by Spike or conformance tests.
```

---

## 56. Versioning

Contract version:

```text
dvl.provider-core/0.3.2
```

Status:

```text
FROZEN_FOR_SPIKE
```

Rules:

```text
Minor version = additive changes
Major version = breaking changes
Adapters declare supported versions
Unknown fields are ignored where safe
Unknown events are stored but not trusted
Provider-specific extensions stay in ext or x.provider.*
```

No further text review should create a new version before Phase 1 Spike evidence.

---

## 57. Stable Invariants

```text
INV-1:
DVL owns Project Truth.

INV-2:
Providers are replaceable executors.

INV-3:
Provider memory is not durable truth.

INV-4:
A Provider cannot grant itself authority.

INV-5:
An Adapter cannot create official truth by event emission.

INV-6:
Live state must not be fabricated.

INV-7:
Intent hints are UI-only and carry zero truth weight.

INV-8:
Activity events are not evidence.

INV-9:
Runtime Evidence is required for meaningful completion.

INV-10:
EvidenceRecords are created by the Kernel Truth Spec.

INV-11:
Verification consumes validated evidence, not claims.

INV-12:
LLM review cannot produce authoritative PASS alone.

INV-13:
Integration requires PASS or explicit scoped HUMAN_ACCEPTANCE.

INV-14:
Recoverable work survives; unsafe work is archived, not silently lost.

INV-15:
Recovery may resume from latest safe mechanical checkpoint, but only validated checkpoint is Project Truth.

INV-16:
Dirty unverified workspaces are archived, not promoted.

INV-17:
Non-idempotent runtime execution must be isolated where supported, or marked degraded/unsupported.

INV-18:
Restricted role + no real sandbox = no shell access.

INV-19:
Provider capabilities must be declared honestly and tested.

INV-20:
Unsupported capability must degrade honestly.

INV-21:
Provider-specific features stay behind Adapters.

INV-22:
DVL controls the tool/effect boundary, not internal model cognition.

INV-23:
No double execution.

INV-24:
Automatic PASS for promotion-critical code work requires DVL-owned or DVL-verified evidence.

INV-25:
State-mutating operations must not be blindly re-run.

INV-26:
Design acceptance is human acceptance scoped to visual intent, not proof of code correctness.

INV-27:
Decision anchors must be deterministic and lightweight.

INV-28:
Actor lifecycle must be known or filesystem/process quiet must be verified before snapshot.

INV-29:
Large outputs must be spooled, not pushed inline over stdio.

INV-30:
Contract assumptions must be classified and audited.
```

---

## 58. Final Stable Rule

The DVL Stable Contract is not a Provider API.

It is a DVL-owned truth boundary.

The Provider Boundary Contract carries observations and requests.

The Kernel Truth Spec creates official truth.

The Execution Safety Spec protects the workspace and runtime.

A Provider may claim, suggest, execute, fail, or disappear.

Only DVL-owned workspace state, DVL-captured evidence, validated artifacts, deterministic checks, explicit human acceptance, verification verdicts, and Integration Gate decisions can promote work into official Project Truth.

Therefore the contract remains stable because it depends on DVL-owned truth, not on Provider memory, Provider honesty, Provider UI, idle network streams, dirty runtime state, or Provider-specific APIs.

---

## 59. Next Step

Stop reviewing this text.

Build Phase 1.

```text
Mock Provider
Kernel Event Store
NDJSON stdio loop
First conformance tests
```

The next useful contract update must come from Spike results.

