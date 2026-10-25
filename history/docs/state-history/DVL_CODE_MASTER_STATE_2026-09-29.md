# DVL CODE 😈 — MASTER STATE 
## MiMo Deep Investigation — Independent Research Checkpoint

**Date:** 2026-09-29  
**Product:** DVL Code 😈 — Corporation fb  
**Mode:** Research / Discussion ONLY  
**Implementation:** NOT AUTHORIZED  
**Architecture decision:** NOT AUTHORIZED  
**Current status:** FREEZE — Waiting for Claude independent investigation

---

# 1. DVL CODE 😈 — PRODUCT INTENT

DVL Code is intended to be a desktop development environment in the broad category of:

- Codex
- Claude Code
- Zadloop
- MiMo Code / MiMo Desktop

But DVL is not intended to stop at being a chat + terminal coding agent.

Core direction:

**DVL Desktop**
→ **Dynamic Project Environment**
→ **Live Dynamic Rooms**
→ **Replaceable Workers / Providers**
→ **Project-owned work and truth**

When the user selects:

**New Project / Open Project**

DVL should not merely open another chat.

It should instantiate a project-specific environment around the actual project.

The environment itself is dynamic.

Rooms/components are also dynamic.

They may appear, activate, change, become blocked, complete, or disappear according to actual project state and events.

Potential examples include:

- Meeting Room
- Skills Scan
- Contract
- Architecture
- Plan Graph
- Design Room
- Live Working Room
- Tools Box
- Security Room
- Decision Room
- URL Live
- Verification
- Product / Delivery

These are conceptual candidates.

They are NOT yet ratified architecture.

---

# 2. CRITICAL GOVERNANCE

We are still in:

**UNDERSTAND → RESEARCH → DISCUSS**

NOT:

**DESIGN → IMPLEMENT**

No decision has been made regarding:

- Electron
- Tauri
- OpenCode
- MiMo
- custom runtime
- provider architecture
- worker protocol
- orchestration kernel
- persistence model
- event architecture

DVL must first be understood completely.

Technology must later be evaluated against DVL.

DVL must NOT be reshaped around whatever MiMo/OpenCode happens to provide.

---

# 3. RESEARCH RULE

We are investigating MiMo deeply.

We do NOT trust feature names alone.

Examples:

`Smart`

`Agent`

`Compose`

`Workflow`

`Memory`

`Queue`

may hide several different mechanisms.

Research therefore follows:

**word → source → state → caller → owner → lifecycle → persistence → transition → failure behavior**

A relationship is accepted only when implementation/evidence supports it.

We explicitly avoid inventing:

- secret kernels
- deliberate hidden codes
- intentional deception
- unified mechanisms that source does not prove

Architectural grammar can emerge without being intentionally named.

---

# 4. IMPORTANT CORRECTION

An earlier hypothesis centered on:

**Claim → Ownership → Reconciliation**

Research corrected part of it.

MiMo currently has lazy orphan repair/sweeps.

However, the explicit concept:

**write-ahead execution claims + startup reconciliation**

was referenced as prior OpenCode-v2 machinery.

Therefore:

**CLAIM is NOT currently established as a hidden Xiaomi/MiMo primitive.**

Do not attribute inherited OpenCode concepts to Xiaomi without provenance verification.

---

# 5. VERIFIED SEPARATION: WORK INTENT ≠ EXECUTION

MiMo's durable inbox / turn queue provides an important distinction.

A message/work intention may exist persistently before execution begins.

Therefore:

**Intent**
≠
**Execution**

This is important.

Execution does not have to create work identity.

Work may already exist before a worker begins executing it.

---

# 6. QUEUE vs STEER

Research identified two different semantics.

## QUEUE

New intent waits until current execution reaches an appropriate later boundary.

Conceptually:

**future work intent**

## STEER

New information/change can affect the current execution at an appropriate safe boundary rather than becoming an entirely separate future turn.

Conceptually:

**mutation of current work intent**

Therefore:

**New Work**
≠
**Change Existing Work**

This distinction may become important to DVL later.

No architecture decision yet.

---

# 7. SAFE BOUNDARIES

A recurring mechanism appeared.

Changes are not necessarily allowed at arbitrary moments during execution.

Examples include:

- queueing
- steering
- deferred configuration refresh
- runner settlement
- workflow terminal state
- exclusive admission
- host-owned admission

This suggests the existence of **safe transition boundaries**.

Conceptually:

**Intent arrives**

→ Is affected execution active?

→ Is transition currently legal?

If NO:

**queue / defer**

If legal at an internal boundary:

**steer / apply**

This is stronger than simple UI state.

---

# 8. BUSY / IDLE ARE NOT JUST UI LABELS

An important finding:

Certain configuration changes cannot safely happen while executions are live because configuration refresh can dispose an Instance and terminate runners.

Therefore runtime state such as:

**busy**

and:

**idle**

can participate in deciding whether a transition is currently legal.

This produced an important distinction:

**UI appears finished**
≠
**stream finished**
≠
**runner settled**
≠
**resource is safe to transition**

`idle` can therefore function as something close to a:

**legal transition window**

in particular subsystems.

---

# 9. QUIESCENCE

Current strongest systems concept:

# QUIESCENCE

Instead of stopping the entire system for every change, the affected resource may need to reach a safe/quiescent state.

Potential grammar:

**ACTIVE**

→ affected execution continues/settles

→ **QUIESCENT**

→ transition becomes legal

→ state changes

→ next execution begins

This is currently a research interpretation.

It is NOT yet established as a formal MiMo-wide architecture.

---

# 10. NO CENTRAL TRANSITION ARBITER FOUND

Important negative finding:

We have NOT found evidence of one central MiMo component that decides every system transition.

Instead, evidence currently suggests **distributed/local gates**.

Examples:

Session:
- busy
- idle

Actor:
- running
- settled
- terminal

Workflow:
- running
- completed
- failed
- cancelled

MCP:
- host-owned admission

Instance:
- resource lifetime/disposal

Queue:
- delayed work intent

Therefore current hypothesis is:

# LOCAL AUTHORITY + SAFE TRANSITION BOUNDARIES

rather than:

# ONE CENTRAL ARBITER

Do not upgrade this hypothesis to architecture truth without more evidence.

---

# 11. ADMISSION

The word family around `admission` is important.

Observed vocabulary includes concepts such as:

- exclusive admission
- host-owned admission
- admission boundaries

Admission asks:

> Is this execution/transition allowed to enter now?

It is different from execution itself.

Current conceptual chain:

**INTENT**
→ **ADMISSION**
→ **OWNERSHIP**
→ **EXECUTION**

---

# 12. OWNERSHIP

Ownership vocabulary repeatedly appears around execution.

Important distinction:

**Task identity**
can be different from
**Actor/Worker identity**

The Worker can be temporary.

The work can persist.

Conceptually:

**Task**
→ exists

**Worker**
→ becomes responsible for executing it

**Worker dies**
→ Task does not necessarily disappear

This supports an important DVL research direction:

> Project/DVL may own work while Worker temporarily owns execution.

This is NOT yet ratified DVL architecture.

---

# 13. SETTLEMENT

Another major distinction:

**Worker says DONE**
does not necessarily mean
**execution has settled**.

MiMo changes/issues repeatedly distinguish actual execution settlement from apparent terminal output.

Conceptually:

**model answer**
≠
**tool completion**
≠
**runner settlement**
≠
**verified task completion**

This is extremely important for DVL.

Worker self-report must not automatically become project truth.

---

# 14. TERMINAL OUTCOME

Research indicates a meaningful ordering:

**execution settles**

before

**terminal outcome becomes safely publishable**

Conceptually:

**EXECUTE**
→ **SETTLE**
→ **DECLARE/PUBLISH TERMINAL OUTCOME**

rather than:

**Agent says finished**
→ automatically everything is finished.

---

# 15. DURABLE STATE ≠ LIVE STATE

Another strong distinction appeared.

Vocabulary includes:

**recoverable actor-owned live state**

and:

**durable scheduling**

This suggests two different universes:

## Durable operational state

Can survive beyond immediate execution/process boundaries.

## Live state

Represents what is currently executing and who owns it.

Therefore:

**Persistence**
≠
**Current execution reality**

The bridge between them is a major research target.

---

# 16. DURABLE ≠ CORRECT

Persistence alone does not make state authoritative.

A stale checkpoint can survive correctly at the storage level while being semantically wrong.

Therefore:

> **Durable state can durably preserve an error.**

This was demonstrated by stale task information causing already-completed work to be treated as unfinished.

Important rule:

**Persistence ≠ Truth**

---

# 17. WORKER TELEMETRY ≠ EXECUTION TRUTH

Research across coding-agent interfaces showed that structured worker output can be incomplete.

A worker's public event stream may omit internal operations.

Therefore:

**Worker telemetry**
cannot automatically be treated as complete execution truth.

External evidence may include:

- process lifecycle
- filesystem changes
- git diff
- hashes
- command exit codes
- build results
- tests
- security checks
- integration checks

This is especially important for replaceable black-box workers.

---

# 18. UI ≠ TRUTH

MiMo had cases where an operation such as Actor spawn could appear completed because the spawning tool call completed while the spawned Actor remained active.

Therefore:

**Tool Event**
≠
**Actor Lifecycle**

and:

**UI representation**
≠
**execution truth**

Correct UI may require runtime state separate from individual tool events.

---

# 19. CHECKPOINT ≠ TRUTH

A critical bug showed stale checkpoint state representing an already-finished Task as still open.

The reconstructed context then told the Agent to resume work.

Conceptually:

**Reality: DONE**

but

**Checkpoint: OPEN**

then:

**Rebuild**
→ Resume instruction
→ Agent executes unnecessary work again.

Therefore:

**Persistent checkpoint**
≠
**authoritative truth automatically**

---

# 20. STATE CAN CREATE WORK

This leads to an important conclusion:

Normally we think:

**Work**
→ changes
→ State

But stale state can also generate new work:

**State**
→ reconstructed context
→ Agent behavior
→ Execution

Therefore:

# STATE CAN CREATE WORK

This makes truth management extremely important.

Bad state can generate bad execution.

---

# 21. TRUTH PRECEDENCE

A major research concept emerged:

When sources disagree:

- Worker statement
- live runtime
- Task DB
- checkpoint
- memory
- filesystem
- git
- test evidence

which source wins?

This produces:

# TRUTH PRECEDENCE

Possible dimensions:

**Authority**
→ Who may produce/change state?

**Freshness**
→ Is this state still current?

**Evidence**
→ What proves it?

**Precedence**
→ Which source wins during conflict?

This is currently a research framework.

No DVL policy has been ratified.

---

# 22. WRITE AUTHORITY

Memory investigation exposed another important problem.

There can be a difference between:

**Designed Write Authority**

and:

**Enforced Write Authority**

Documentation may intend one component to own a state mutation, while tool permissions may still allow another Agent to write the underlying state directly.

Therefore:

# POLICY ≠ ENFORCEMENT

This applies beyond memory.

Future DVL investigation must distinguish:

> Who SHOULD be allowed to change truth?

from:

> Who CAN physically change it?

---

# 23. CHECKPOINT AS EXECUTABLE CONTEXT

Checkpoint is not merely passive history.

When reconstructed and injected into an Agent, it can influence future execution.

Therefore a useful conceptual term is:

# EXECUTABLE CONTEXT

Not executable as code.

Rather:

> persisted state capable of changing future Agent behavior when rehydrated.

This makes stale context dangerous.

---

# 24. MEMORY / STATE SOURCES ARE NOT UNIFIED

Current evidence does NOT show one universal MiMo Truth Store.

Instead there are multiple state systems:

- Session DB/state
- Task state
- Actor runtime/live state
- Workflow journal
- Checkpoints
- Memory
- Filesystem
- Git
- Queue/inbox
- process reality

Different systems have different:

- writers
- lifecycles
- recovery paths
- precedence
- failure modes

Do not falsely merge them into one architecture.

---

# 25. INSTANCE / SESSION / RUNSTATE / SYNC

Research indicates useful separation between concepts.

## Session

Persistent interaction identity.

## RunState / Runner

Current live execution.

## Sync

Projection/synchronization of runtime state toward clients.

## Instance

Runtime/resource boundary involved in lifecycle/disposal.

## UI/TUI

Can attach to an already-running runtime.

Therefore:

**Persistent identity**
≠
**execution**
≠
**state projection**
≠
**UI connection**

This is an important architecture lesson.

---

# 26. HOME ≠ WORKSPACE

`MIMOCODE_HOME` can isolate MiMo's persistent runtime/config/cache/database/memory universe.

`directory` represents the workspace/work universe.

Therefore:

**Runtime persistence universe**
≠
**Project workspace**

This distinction is useful but does NOT automatically imply security isolation.

---

# 27. DRIVE-MIMO

MiMo contains mechanisms for programmatically driving another MiMo process with:

- separate HOME
- disposable workspace
- structured event output

This demonstrates a useful parent→worker relationship.

A parent system can operate another coding runtime as a black-box-ish worker without rewriting the worker's entire internal harness.

This supports continued investigation of:

**DVL Runtime**
→ **Native Worker Harness**

but does not decide DVL architecture.

---

# 28. CREDENTIAL / CAPABILITY BOUNDARY

MiMo changes show efforts to prevent real provider credentials and sensitive environment information from automatically propagating into child processes.

Instead, child execution can receive restricted/scoped access paths.

Conceptual lesson:

**Parent owns credential**
→ **Child receives capability**

rather than:

**Child receives master secret**

This resembles capability brokering.

Again:

research lesson only.

---

# 29. CONTEXT INHERITANCE IS EXPLICIT

Actor context can conceptually vary from:

- fresh/no inherited conversation
- selected state/checkpoints
- fuller context

Therefore:

**Fresh Worker context is technically feasible.**

It is not merely a DVL fantasy.

But DVL's exact context-envelope design remains unresolved.

---

# 30. ACTOR ≠ WORKFLOW

MiMo has at least two substantially different orchestration styles.

## Actor path

More autonomous / LLM-driven.

## Workflow path

More deterministic / journaled / structured.

Therefore:

**Multi-Agent** is too broad a label.

It can hide:

**probabilistic orchestration**

and:

**deterministic orchestration**

inside the same product.

---

# 31. EVENT PROVENANCE

A MiMo fix referring to publishing Bus events using the calling Fiber's Instance indicates that events must preserve correct runtime provenance.

Conceptually:

Event from execution realm A must not accidentally become event from realm B.

This matters for:

- worker isolation
- project isolation
- event routing
- UI projection
- debugging

---

# 32. SCOPE / FIBER

MiMo/OpenCode use Effect concepts such as:

- Scope
- Fiber

These participate in resource lifetime and concurrent execution.

Important warning:

Do NOT automatically call `Instance` the central kernel.

Ownership/lifetime may be distributed across scopes/fibers/resources.

---

# 33. FAILURE LANGUAGE

Repeated vocabulary includes:

- orphan
- sweep
- abort cascade
- bounded lifetime
- settlement
- recovery
- resume

This suggests significant engineering attention to lifecycle correctness.

But MiMo currently does NOT demonstrate a complete universal:

**Actor dies → another Actor automatically inherits Task**

succession protocol.

Do not claim that it does.

---

# 34. ORPHAN

An orphan can emerge when persisted/runtime representation indicates work was active but the execution that owned it no longer exists.

Current MiMo behavior includes lazy repair mechanisms.

However:

full startup reconciliation + automatic bounded re-drive was identified as incomplete/missing in investigated public material.

Therefore:

**Orphan repair**
≠
**complete automatic succession**

---

# 35. RECONCILIATION

Earlier hypothesis:

> MiMo may contain one Continuous Reconciliation Engine.

Current conclusion:

**NOT PROVEN.**

More accurate:

MiMo has multiple local repair/recovery/reconciliation mechanisms.

They may share recurring engineering principles, but no unified central engine has yet been demonstrated.

---

# 36. CURRENT DEEPEST PATTERN

After all corrections, the strongest recurring pattern currently is:

# INTENT
↓
# ADMISSION
↓
# OWNERSHIP
↓
# EXECUTION
↓
# SAFE BOUNDARY / QUIESCENCE
↓
# SETTLEMENT
↓
# STATE TRANSITION
↓
# PUBLISH / PROJECT
↓
# RECOVERY IF REALITY DIVERGES

This is an analytical grammar.

It is NOT claimed as an official MiMo architecture.

---

# 37. LOCAL AUTHORITY

The strongest current hypothesis is:

> Resources/subsystems locally determine whether transitions affecting them are legal.

Rather than one universal central brain deciding every transition.

Examples may include:

- Session execution state
- Actor lifecycle
- Workflow lifecycle
- MCP admission
- Instance lifetime
- queue scheduling

This gives:

# LOCAL AUTHORITY + SAFE TRANSITION BOUNDARIES

Current hypothesis only.

---

# 38. AFFECTED SCOPE — CURRENT OPEN QUESTION

We reached the next major unresolved question:

> When a change arrives, how does the system know exactly what is affected?

Example:

Worker A:
Backend database work.

Worker B:
Logo design.

User changes database architecture.

A sophisticated system should ideally identify:

Backend = affected.

Logo = unaffected.

Then:

Backend
→ safe boundary / hold / transition.

Logo
→ continues.

This is potentially crucial to DVL's Dynamic Project Environment.

But:

**WE HAVE NOT YET PROVEN THAT MiMo HAS A GENERAL AFFECTED-SCOPE ENGINE.**

This is the current research frontier.

---

# 39. DYNAMIC PROJECT ENVIRONMENT — POSSIBLE DEEPER MEANING

Originally DVL dynamic behavior focused heavily on:

- Rooms appearing
- Rooms disappearing
- environment adapting

Research suggests a potentially deeper interpretation worth investigating:

> Dynamic may also mean that individual project resources/tasks transition independently according to their own state, dependencies, authority and affected scope.

Therefore dynamic UI could eventually be a projection of dynamic project state rather than the source of dynamism.

This remains a hypothesis.

---

# 40. IMPORTANT DVL PRINCIPLE UNDER INVESTIGATION

Potential future principle:

# PROJECT OWNS WORK.
# WORKER OWNS TEMPORARY EXECUTION.

Example:

`TASK-481`

exists independently.

Claude executes it.

Claude crashes.

`TASK-481` remains.

Another worker may later:

- inspect evidence
- continue
- restart
- rollback
- re-execute

depending on future DVL rules.

This is conceptually strong.

It is NOT yet ratified.

---

# 41. ANOTHER POTENTIAL DVL PRINCIPLE

Worker result should potentially become:

**Candidate State**

not automatically:

**Project Truth**

Potential future chain:

Worker
→ Candidate Result
→ Evidence
→ Independent Verification
→ Authorized Transition
→ Project Truth

Again:

NOT RATIFIED.

---

# 42. THREE LEVELS OF OBSERVATION

Current useful analytical separation:

## Worker Truth Claim

What Worker says happened.

## Environment Reality

Processes/files/git/commands/runtime state.

## Verification Evidence

Independent tests/security/integration/acceptance.

None should automatically be collapsed into another.

---

# 43. BIGGEST WARNING DISCOVERED

The most dangerous failure may not be:

> Worker crashes.

It may be:

> System successfully persists the wrong interpretation of reality.

Because then:

**Wrong State**
→ rebuild
→ context
→ worker
→ new wrong execution.

Therefore DVL must eventually think deeply about:

- truth mutation
- precedence
- reconciliation
- evidence
- stale-state detection

No implementation decision yet.

---

# 44. CURRENT WORD FAMILIES

## ORGANIZATION

- Task
- Actor
- Team
- Inbox
- Registry

## EXECUTION

- Instance
- Scope
- Fiber
- Runner
- RunState
- Bus

## CONTINUITY

- Journal
- Checkpoint
- Memory
- Replay
- Resume
- Recoverable
- Durable

## AUTHORITY

- Admission
- Ownership
- Permission
- Capability
- Gate

## TRANSITION

- Busy
- Idle
- Defer
- Queue
- Steer
- Settle
- Terminal
- Dispose
- Bootstrap
- Publish

These groups are analytical.

They are NOT claimed to be official Xiaomi layers.

---

# 45. WHAT WE HAVE NOT FOUND

We currently have NO sufficient evidence for:

- one hidden MiMo central kernel controlling everything
- one universal Project Truth system
- one universal reconciliation engine
- complete worker succession
- complete automatic restart/redrive
- general affected-resource computation
- a secret coded vocabulary deliberately hidden by Xiaomi
- DVL-equivalent Dynamic Project Environment
- DVL-equivalent Project Contract/Architecture/Plan Graph authority

These remain unknown/unproven.

---

# 46. MOST IMPORTANT CURRENT RESEARCH RESULT

The deepest result so far is NOT:

"MiMo has multi-agent."

It is:

> Correct agentic systems require explicit separation between durable work intent, temporary execution ownership, live execution reality, settlement, persistent state, evidence, and the legal boundaries at which state may change.

And:

> Bugs repeatedly appear when those boundaries are confused.

---

# 47. CURRENT FRONTIER

The next research question would be:

# AFFECTED SCOPE

Specifically:

When a transition/change occurs:

1. What resource does it target?
2. Who owns that resource?
3. What active executions depend on it?
4. Which executions must reach quiescence?
5. Which executions can continue?
6. What state becomes invalid?
7. What state remains valid?
8. Who authorizes the transition?
9. How is the transition propagated?
10. How is correctness re-established afterward?

But this investigation is currently PAUSED.

---

# 48. WHY PAUSED

Bassem explicitly decided:

> Wait for Claude.

Therefore we intentionally stop generating additional major hypotheses now.

This prevents contamination between ChatGPT's independent investigation and Claude's independent investigation.

---

# 49. CLAUDE COMPARISON PROTOCOL

When Claude's raw report arrives:

## STEP 1 — DO NOT MERGE

Read Claude's report independently.

Do not retrofit it into ChatGPT's findings.

## STEP 2 — CLAUDE-ONLY FINDINGS

Extract things Claude discovered that ChatGPT did not.

## STEP 3 — CHATGPT-ONLY FINDINGS

Preserve things ChatGPT found that Claude did not.

## STEP 4 — INDEPENDENT OVERLAP

Identify findings independently discovered by both.

These deserve particularly strong attention.

## STEP 5 — CONTRADICTIONS

Find where Claude and ChatGPT disagree.

Return to source/evidence.

Do not vote.

## STEP 6 — PROVENANCE

Separate:

- Xiaomi/MiMo additions
- inherited OpenCode architecture
- third-party runtime behavior
- hypotheses

## STEP 7 — ZOOM OUT

Only after comparison:

Return to the whole DVL Code concept.

Ask:

> What does this research actually mean for DVL?

## STEP 8 — NO AUTOMATIC ADOPTION

MiMo mechanisms are evidence/input.

They do not become DVL architecture automatically.

---

# 50. FREEZE POINT

## CHATGPT CURRENT FINAL RESEARCH VECTOR

**Ownership**

→ **Transition Legality**

→ **Quiescence / Safe Boundary**

→ **Affected Scope**

with supporting concerns:

**Truth Authority**

**Truth Precedence**

**Freshness**

**Evidence**

**Settlement**

**Recovery**

---

# 51. STATUS

**DVL Code 😈:** Concept / research phase.

**MiMo investigation:** ChatGPT independent pass paused.

**Claude:** Independent investigation pending.

**Comparison:** Pending Claude raw report.

**Architecture:** NOT RATIFIED.

**Implementation:** NOT AUTHORIZED.

**Code:** DO NOT START.

---

# 52. NEXT ACTION

Wait for Claude.

When Claude report arrives:

**DO NOT immediately agree.**

Run:

**Claude-only**
vs
**ChatGPT-only**
vs
**Independent overlap**
vs
**Contradictions**
vs
**Unknowns**

Then return to DVL Code 😈 with the full picture.

---

**END OF MASTER STATE — FREEZE HERE**
