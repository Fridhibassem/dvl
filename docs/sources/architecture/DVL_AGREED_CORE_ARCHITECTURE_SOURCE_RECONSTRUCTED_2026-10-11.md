# DVL CODE 😈 --- AGREED CORE ARCHITECTURE / SOURCE-RECONSTRUCTED MASTER STATE

**Date:** 2026-10-11\
**Status:** SOURCE-RECONSTRUCTED ARCHITECTURE CHECKPOINT\
**Scope:** Core project/execution architecture only.\
**Rule for this document:** Nothing is added because it "sounds right."
The content below is reconstructed only from the DVL project source
files, recorded test evidence, and the user's explicit current status
corrections.

------------------------------------------------------------------------

# 0. SCOPE --- WHAT THIS FILE IS AND IS NOT

This file is about the DVL **core architecture we discussed for
understanding a project, discovering relations, compiling Tasks,
controlling workload, executing safely, recovering, verifying,
integrating, and auditing**.

This file does **not** redesign the UI.

This file does **not** redesign the normal coding-agent product surface.

This file does **not** redesign the Dynamic Project Environment / Rooms.

Those product/UX parts remain separate from this architecture
reconstruction.

The existing product baseline only establishes the boundary:

``` text
DVL starts as a complete desktop Coding Agent
        ↓
then opens into the Dynamic Project Environment
```

The core architecture below exists underneath that product.

------------------------------------------------------------------------

# 1. AUTHORITY / EVIDENCE DISCIPLINE

The DVL sources explicitly separate:

``` text
FROZEN PRODUCT
≠
FROZEN-FOR-SPIKE CONTRACT
≠
WORKING ARCHITECTURE
≠
REAL IMPLEMENTATION
≠
RESEARCH
```

The Core Stable Contract v0.3.2 is:

``` text
FROZEN FOR SPIKE
```

It must not be silently rewritten by later architecture prose.

The working architecture may evolve from implementation/test evidence.

The current user-confirmed blocker status is:

``` text
H1 = CLOSED
H2 = CLOSED
H3 = CLOSED
H4 crash/recovery = CLOSED ON macOS ONLY
```

The older October 8 Master State recorded H1--H3 as previously closed
and then deliberately re-opened for second-perspective review, and H4 as
not yet closed. That is historical state, not the current status.

The current status above is the explicit newer project decision.

For H4, the platform qualification is strict:

``` text
macOS physical/runtime closure
≠
Windows closure
≠
Linux closure
≠
universal production closure
```

Production readiness is not claimed.

Final Kernel law is not claimed frozen.

------------------------------------------------------------------------

# 2. FUNDAMENTAL DVL LAWS

From the Frozen Stable Contract and preserved architecture:

``` text
Providers execute.
Providers suggest.
Providers observe.
Providers may fail or disappear.

DVL owns Project Truth.
```

And:

``` text
Worker can die.
Work survives.
```

And:

``` text
Preserve work ≠ preserve authority.
```

And:

``` text
Activity shows motion.
Evidence proves outcome.
```

And:

``` text
Depth may increase.
Intent may not drift.
```

And:

``` text
Worker FINISHED
≠ Verification PASS
≠ Integration
≠ Project Truth
```

The Provider is not DVL.

The Adapter is not Project Truth.

Provider memory is temporary.

Provider sessions are disposable.

Provider conversation history is never Project Truth.

------------------------------------------------------------------------

# 3. THE AGREED INPUT → EXECUTION ARCHITECTURE

The dedicated Input → Execution architecture note records the pipeline
as:

``` text
USER INPUT
   ↓
SOURCE / INTENT BASELINE
   ↓
NORMAL PLAN + NORMAL GRAPH
   ↓
SMART PLAN + SMART GRAPH
   ↓
ULTRA PLAN + ULTRA GRAPH
   ↓
ULTRA-PRO RE-AUDIT / DEEP GRAPH
   ↓
CANONICAL EXECUTION-RELEVANT GRAPH (URG)
   ↓
DETERMINISTIC GRAPH-TO-TASK COMPILER
   ↓
EXECUTION-READY TASK CONTRACTS
   ↓
ORCHESTRATOR + SMART DÉCALAGE
   ↓
TASK → ASSIGNMENT → WORKER
   ↓
KERNEL + HARNESS
   ↓
VERIFICATION → INTEGRATION
   ↓
RUNTIME EVIDENCE
   ↺ affected graph / tasks are re-evaluated
```

The October 8 Master State expresses the same architecture in expanded
runtime form:

``` text
USER INPUT / PROJECT
        ↓
SOURCE INTENT BASELINE
        ↓
NORMAL UNDERSTANDING
        ↓
SMART ENRICHMENT
        ↓
ULTRA DISCOVERY
        ↓
ULTRA-PRO RE-AUDIT
        ↓
CANONICAL URG
        ↓
DETERMINISTIC GRAPH-TO-TASK COMPILER
        ↓
COMPILED TASK CONTRACTS
        ↓
SMART ORCHESTRATOR + SMART DÉCALAGE
        ↓
TASK → ASSIGNMENT / TEMPORARY AUTHORITY
        ↓
WORKER + PROVIDER
        ↓
KERNEL-CONTROLLED ACTION REQUESTS
        ↓
HARNESS / RUNTIME / WORKSPACE / TOOLS
        ↓
EVIDENCE
        ↓
VERIFICATION
        ↓
INTEGRATION / CURRENT-TRUTH REVALIDATION
        ↓
PROJECT TRUTH
        ↓
RUNTIME FEEDBACK
        ↓
AFFECTED GRAPH UPDATE / RECOMPILE / RE-EVALUATE
```

The architecture is explicitly a **feedback system**, not a one-way
pipeline.

------------------------------------------------------------------------

# 4. WHY SOURCE INTENT EXISTS

DVL accepts the project in the form the user naturally has it:

``` text
short idea
normal prompt
detailed plan
existing PLAN.md
existing repository/folder
requirements/specification files
supporting project artifacts
```

The user is not required to manually build DVL's internal graph/planning
layers.

First, DVL preserves an immutable/versioned:

``` text
SOURCE INTENT BASELINE
```

If the user's input changes, DVL creates a new project-intent version
instead of silently rewriting the old baseline.

Purpose:

``` text
preserve what the user actually asked for
+
give later/deeper reasoning something to trace back to
+
detect intent drift
```

This is why the deeper pipeline is allowed to discover more relations
but is not allowed to silently replace the product.

------------------------------------------------------------------------

# 5. NORMAL --- NORMAL PLAN + NORMAL GRAPH

## 5.1 Normal Plan

Normal Plan is the human-readable representation of what the user
actually requested.

It captures:

``` text
goal
actors/users
explicit features
explicit constraints
explicit acceptance expectations
explicit decisions already made by the user
```

Rule:

``` text
avoid unnecessary architecture invention
```

Normal is not supposed to "improve" the user's product by replacing it
with another product.

## 5.2 Normal Graph

Normal Graph represents explicit structure already present in the input:

``` text
feature → feature
actor → action
component → component
explicit dependencies
explicit inputs/outputs
explicit constraints
```

Purpose:

``` text
traceable project structure
without deep inference
```

------------------------------------------------------------------------

# 6. SMART --- SMART PLAN + SMART GRAPH

Smart enriches Normal conservatively.

## 6.1 Smart Plan

Smart adds directly implied structure:

``` text
stable entities and IDs
direct dependencies
inputs and outputs
output consumers
interfaces/contracts
direct invariants
missing explicit decisions/questions
acceptance structure
provenance back to the Normal requirement
```

The source gives the Smart question exactly as:

> **What is directly implied by what the user requested?**

## 6.2 Smart Graph

Smart Graph turns those direct relations into machine-usable project
relations while retaining lineage to Normal.

The preserved rule is:

``` text
NORMAL INTENT ⊆ SMART UNDERSTANDING
```

And:

``` text
Depth may increase.
Intent may not drift.
```

Smart Graph architecture discussions also explicitly include two
categories of relations:

### Logical / semantic relations

``` text
Task → Task
Task → Project Decision
Task → Contract
Task → Domain
Component → Contract
```

### Physical / runtime relations

``` text
Task → File
Task → Directory
Task → Database
Task → Migration
Task → Port
Task → Process
Task → External API
Task → Cache
Task → Browser Session
Task → Runtime Resource
```

The Graph is intended to remain:

``` text
dynamic
sparse
hierarchical where useful
locally recomputable
capable of adding validated runtime-discovered relationships
```

The Graph is not an oracle.

------------------------------------------------------------------------

# 7. ULTRA --- ULTRA PLAN + ULTRA GRAPH

Ultra searches recursively for real execution-relevant relations that
were not explicit at Normal/Smart level.

It reasons across:

``` text
data flow
control flow
state transitions
resources
concurrency
failure/recovery
integration
output consumers
cross-layer effects
external effects
verification/invalidation
```

Its recursive pattern is:

``` text
Trigger
  ↓
Effect
  ↓
Hidden consequence
  ↓
Relation / invariant / missing work
  ↓
Treat the new finding as another trigger
  ↓
Search again
```

The strengthened form preserved in the Master State is:

``` text
Relation
  ↓
fix
  ↓
treat fix as new trigger
  ↓
discover the next consequence
```

Ultra can discover missing work, not only ordering between already-known
Tasks.

The source is explicit:

> Ultra does not invent software logic. The relationships already exist
> in the intended system; Ultra attempts to expose enough of them before
> execution that they do not have to be discovered later through failure
> and rework.

Ultra continues while another recursion produces execution-relevant
change to:

``` text
task
dependency
ordering
WAIT/HOLD
resource conflict
invariant
evidence requirement
consumer
external effect
failure/recovery consequence
```

Ultra does not claim perfect unknown-unknown coverage.

------------------------------------------------------------------------

# 8. ULTRA-PRO --- RE-AUDIT / DEEP GRAPH

Ultra-Pro attacks the Ultra result itself.

The recorded questions include:

``` text
What relation did Ultra miss?

What assumption is being treated as fact?

What changes under concurrency?

What happens after crash/retry/recovery?

What if an external system is delayed or contradictory?

What if a resource disappears?

Can the invariant actually be enforced?

Does the proposed fix create another consequence?

Is there a missing actor, timer, consumer, gate,
transition, resource, task, or evidence requirement?
```

High-risk hypotheses can be experimentally checked before implementation
where practical.

Ultra-Pro is:

``` text
re-audit
+
deepening
```

It is explicitly **not a license to rewrite user intent**.

Practical stopping condition:

``` text
another recursion produces no execution-relevant change to:
tasks
dependencies
ordering
WAIT/HOLD
resources/conflicts
invariants
evidence
consumers
execution consequences
```

This is not a claim of omniscience.

------------------------------------------------------------------------

# 9. WHY NORMAL → SMART → ULTRA → ULTRA-PRO EXISTS

This purpose is directly preserved by the input pipeline and
intent-preservation law.

The transformations are linked by lineage:

``` text
SOURCE INTENT
   ↓ lineage
NORMAL
   ↓ lineage
SMART
   ↓ lineage
ULTRA
   ↓ lineage
ULTRA-PRO
   ↓ lineage
URG RELATION
   ↓ lineage
TASK
   ↓ lineage
OUTPUT + EVIDENCE
```

The goal is:

``` text
keep the original user product/intention
+
progressively expose the relations required to execute it correctly
+
make every deeper result traceable back to the source
```

If deeper analysis finds a necessary condition that conflicts with the
accepted baseline:

``` text
DVL does not silently redefine the product
```

It surfaces the conflict and, when required:

``` text
ASK_USER
```

Golden law:

``` text
Depth may increase.
Intent may not drift.
```

------------------------------------------------------------------------

# 10. ONE CANONICAL EXECUTION-RELEVANT GRAPH --- URG

Official short name:

``` text
URG — Ultra Relation Graph
```

Definition preserved in the Master State:

> **URG is the canonical machine graph of all currently discovered
> execution-relevant project relations.**

"Currently discovered" does not mean omniscient.

A relation may exist without creating a new Task or WAIT.

Recorded relation families include:

``` text
DEPENDS_ON
REQUIRES_PREREQ
PRODUCES
CONSUMED_BY
SOFT_CONSUMES
AFFECTS
COUPLES
USES
CONFLICTS_WITH
MUST_SERIALIZE_WITH
CAN_PARALLEL_WITH
HOLDS_ON
GATED_BY
BLOCKED_BY
ENFORCES
CHECKS
VERIFIED_BY
INVALIDATES
CLOSES
TOUCHES
INTRODUCES
ARISES_FROM
CREATED_BY
FIX_INTRODUCED
OBSERVES
EXTERNAL_EFFECT
```

Do not call every relation a dependency.

Canonical truth model:

``` text
URG / machine graph
    = canonical relation truth

Visual Ultra Graph
    = human-readable projection

Compiled Task Contracts
    = execution projection
```

An important historical structural issue was the split between visual
graph edges and plan-only relations. The long-term answer recorded in
the Master State is:

> **One canonical URG contains every execution-relevant relation.**

No hidden split should remain between:

``` text
visual graph
plan-only relations
machine graph
```

------------------------------------------------------------------------

# 11. RELATION TRACEABILITY / PROVENANCE

The input pipeline gives an example relation record:

``` text
relationId
source
target
relationType
origin: USER | NORMAL | SMART | ULTRA_DISCOVERED
parentRelationId
rootRequirementId
evidenceRefs
confidence/status
projectVersion
discoveryDepth
invalidationTriggers
executionImpact
```

The Graph is not decorative.

A relation matters when it can affect:

``` text
execution
verification
integration
project truth
```

Runtime-discovered dependencies are not automatically Project Truth.

The consolidation architecture records:

``` text
Worker observation
      ↓
Dependency proposal
      ↓
DVL validation
      ↓
ACCEPT / REJECT
      ↓
Smart Graph update
      ↓
Affected active work reconsidered
```

Provider/Worker assertion alone cannot pollute canonical graph truth.

------------------------------------------------------------------------

# 12. DETERMINISTIC GRAPH-TO-TASK COMPILER

The compiler is:

``` text
deterministic projection
```

It is **not another reasoning agent**.

It consumes canonical graph relations and produces execution-ready Task
Contracts.

Compiler laws preserved in the Master State:

``` text
1. No relation loss.

2. Do not silently invent, rename, merge, regroup,
   or delete canonical meaning.

3. Every compiled relation traces back to URG.

4. Each Task contains relations relevant to its execution.

5. Every output declares its consumer(s),
   or is explicitly terminal.

6. GO / WAIT / HOLD / ASK / BLOCK are dynamic runtime states.

7. Compiled task files are projections,
   not a second canonical truth.

8. Compiler output never grants authority.
```

Desired Task Contract includes:

``` text
Task ID
WHY / purpose
inputs
dependencies/prerequisites
outputs
output consumers
resources
conflicts
parallel/sequential constraints
WAIT/HOLD conditions
human/external gates
invariants
acceptance criteria
required evidence
unlocks
relation IDs + roles
invalidation/re-evaluation triggers
requested scope/authority
```

Authority remains:

``` text
Assignment + Kernel
```

not compiler output.

## Preserved compiler experiment

The October 8 checkpoint records:

``` text
100 visual graph edges → 100 tasks
deterministic compiler status OK
explicit per-task consumer mapping
terminal-task identification
41 terminal tasks
```

Compiler-output consumers recorded include:

``` text
Orchestrator
Smart Décalage
Workers/providers
Kernel
Harness/runtime
Evidence collector
Verification
Integration/Project Truth
Graph updater
human
dashboards/audit
```

------------------------------------------------------------------------

# 13. TASK-FIRST EXECUTION MODEL

Canonical direction:

``` text
Task
  ↓
Assignment
  ↓
Worker
  ↓
Provider / Runtime
```

Not:

``` text
Worker
  ↓
Task
```

## Task

Durable unit / durable intent.

Carries things such as:

``` text
goal
acceptance criteria
known decisions/contracts
state
dependency relationships
```

## Assignment

Temporary execution binding / revocable authority.

Architecture discussions record authority/fencing information such as:

``` text
Worker identity
Attempt
Assignment epoch/generation
Workspace
scope
relevant decision snapshot/anchors
```

## Worker

Ephemeral executor.

A Worker owns no durable Project Truth.

A Worker may disappear without destroying the Task.

Core rule:

``` text
Preserve work ≠ preserve authority.
```

A stale/revoked Worker may return artifacts that can be inspected or
salvaged, but old authority does not automatically return.

------------------------------------------------------------------------

# 14. PROJECT DECISIONS / SCOPED PROJECT MEANING

The architecture consolidation records the semantic conflict problem:

Two Workers can edit different files, compile successfully, pass local
tests, and still implement contradictory business meaning.

Consequential shared project meaning is represented as DVL-owned Project
Decisions / Contracts.

Conceptual record:

``` text
decisionId
version
value
status
knownAffectedDomains
provenance
```

Provider/Worker statements cannot directly modify Project Decisions.

Workers should receive relevant scoped Project Decisions, not every
project decision.

Purpose:

``` text
reduce context noise
reduce token cost
reduce irrelevant contradictions
reduce unnecessary reasoning burden
```

Candidates may carry relevant decision/version anchors.

Purpose:

``` text
local invalidation
local revalidation
preserve unrelated parallel work
```

Global invalidation is rejected as the default strategy.

------------------------------------------------------------------------

# 15. SMART ORCHESTRATOR

Orchestrator coordinates work.

The October 8 Master State records that it decides:

``` text
which Tasks are structurally ready
which Worker/provider gets each Assignment
what can safely run in parallel
what must wait
what waits for verification
what needs human/external approval
when state changes require re-evaluation
```

The Input Pipeline expresses the continuous questions:

``` text
Which Tasks are actually ready?

Which can safely run together?

Which Worker/provider should receive each Assignment?

Which Tasks must wait for dependencies?

Which resources collide?

Which work waits for verification?

Which human/external gates are unresolved?

Which previous Assignments became stale after project change?
```

Optimization target:

> **Maximum safe useful concurrency --- not maximum worker count.**

Orchestrator does not grant execution authority.

The consolidation architecture also states Orchestrator does not:

``` text
grant Kernel authority
issue authoritative PASS
directly promote Project Truth
override resource isolation
override stale-attempt fencing
```

------------------------------------------------------------------------

# 16. SMART DÉCALAGE

Smart Décalage is state-driven flow control.

Preserved principle:

> **Delay by state, not by arbitrary timer.**

Recorded causes of delay/HOLD include:

``` text
prerequisite not ready
resource locked
conflicting resource
shared external API conflict
verification backlog
project decision changed
environment unavailable
authority missing
recovery in progress
unresolved high-risk condition
Provider/Worker budget danger
```

Smart Décalage cannot override Kernel law.

The architecture consolidation describes its responsibilities as:

``` text
admission pressure
backpressure
local yielding
contention shaping
concurrency adjustment
anti-starvation
anti-thrashing
hysteresis/damping
bounded active HOLD pressure
```

Its goal is not maximum Worker utilization.

Its recorded goal is:

> **maximum useful, safe convergence toward Project Truth.**

Smart Décalage never grants authority.

------------------------------------------------------------------------

# 17. WORKLOAD / LARGE PROJECT CONTROL

The Input Pipeline explicitly says:

``` text
5,000 or 10,000 total Tasks
does not mean
5,000 or 10,000 Workers
```

Its example:

``` text
10,000 total tasks
      ↓
canonical graph evaluates current state
      ↓
73 structurally ready
      ↓
21 conflict on resources
9 wait for verification
6 wait for gates
machine/runtime budget reduces concurrency further
      ↓
only safe/useful subset is dispatched
```

DVL controls project state rather than trying to keep every Task active.

Large graph support still requires validation for:

``` text
incremental graph updates
compiler latency
scheduler latency
event-store pressure
memory
resource locks
backpressure
crash recovery
```

The 5k/10k numbers are targets until benchmarked, not proven
capabilities.

------------------------------------------------------------------------

# 18. HIGH-CONCURRENCY / 700-TASK SIMULATION EVIDENCE

The recorded 700-Task simulation workload contained:

``` text
700 Tasks
19 clusters
301 code
225 Terraform
69 drills
59 deploys
27 migrations
19 external irreversible effects

400 apparent parallel candidates
300 waiting/dependent Tasks

19 irreversible consequence Tasks
104 high-consequence Tasks
577 low-consequence Tasks

57 Tasks requiring human authority
139 hidden semantic dependency edges

252 Tasks holding an exclusive physical resource

shared quotas:
AWS control-plane API rate
KMS request rate
concurrent deploys
```

The simulation reported that the full internal control architecture
materially improved execution hygiene.

Recorded simulation results included:

``` text
bad runtime actions: -43% to -57%
semantically defective integrations: -38% to -43%
waste: -26% to -40%
duplicate executions: -100%
verification backlog: -83%
durable inventory: -67%
makespan: ~2% better
useful concurrency: roughly unchanged (~21 running Tasks)
```

But the same simulation explicitly found:

``` text
execution-safety architecture improved
≠
plan-level semantic correctness solved
```

It states that plan-level semantic fault damage was not materially
improved by the internal V1→V7 control mechanisms.

The report says the plan choice Normal→Ultra had much more effect on
project damage than the outer→V1→V7 execution architecture.

This is evidence for keeping two different problems separate:

``` text
UNDERSTANDING / RELATION DISCOVERY
vs
EXECUTION SAFETY / CONCURRENCY CONTROL
```

The simulation is simulation evidence, not physical production proof.

------------------------------------------------------------------------

# 19. RESOURCE / CONCURRENCY CONTROL

Recorded runtime resources include:

``` text
files/directories
Git/worktrees
ports/processes
DB/schema/migrations
Redis/cache
queues
browser sessions
external APIs
credentials
CPU/RAM/disk/network
provider/context/budget capacity
```

Recorded resource states/relations include:

``` text
shareable-read
exclusive-write
serialize
parallel-safe
state-gated
human-gated
external-authority-gated
budget-gated
```

Ownership split:

``` text
Graph describes relations.
Orchestrator / Décalage schedule.
Kernel / runtime enforce real boundaries.
```

------------------------------------------------------------------------

# 20. KERNEL --- LAW / ENFORCEMENT BOUNDARY

Kernel is not:

``` text
planner
graph
compiler
orchestrator
Provider
reviewer
```

Kernel owns/enforces:

``` text
DVL-issued identity
Assignment authority
scope
stale-authority fencing
isolation
allowed/forbidden action classification
durable event truth
security policy
execution constraints
evidence authority
integration prerequisites
```

Conceptual permission outputs:

``` text
ALLOW
BLOCK
ASK_USER
```

Execution result is separate:

``` text
Kernel = ALLOW
Execution = FAILED
```

Prompt instructions are not security boundaries.

The Frozen Contract's authority layering is:

``` text
L-0 System Enforcement
workspace isolation
transaction worktree
filesystem restrictions
sandbox/container where supported
network policy
path canonicalization
process supervision

L-1 Provider Configuration
provider-native permissions
provider-native sandbox
provider-native allowed tools

L-2 Instruction
natural-language task instructions
```

Only L-0 is authoritative.

L-1 is defense in depth.

L-2 is advisory.

Restricted-shell law:

``` text
restricted role + no real sandbox = no shell access
```

------------------------------------------------------------------------

# 21. HARNESS / RUNTIME

Harness executes what Kernel allows.

``` text
Kernel = law
Harness = execution engine
```

Recorded Harness/runtime responsibilities include:

``` text
provider adapter
context preparation
tool loop
filesystem
terminal
tests
dev server
browser
DB runtime
MCP tools
process supervision
sandbox/container
usage/budget observation
safe stop / hibernation support
checkpoint production
```

The transaction-workspace rule from the Frozen Contract:

``` text
A Run writes to a transaction worktree or staging layer.

Official project workspace is updated only by Integration Gate.
```

If a Run is aborted/stale/interrupted/fails before validation:

``` text
preserve safe mechanical checkpoint if available
archive dirty diff under .dvl/stale_attempts/
preserve logs/observations for diagnostics
discard unsafe transaction workspace when necessary
restart from latest safe mechanical checkpoint
or latest validated checkpoint
```

Half-written or half-applied state must not silently become Project
Truth.

------------------------------------------------------------------------

# 22. PROVIDER BOUNDARY

Provider may:

``` text
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

Provider may not:

``` text
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

Adapter translates between:

``` text
Provider-native protocol
        ↕
DVL Provider Boundary Contract
```

Adapter observations remain non-authoritative.

It cannot emit authoritative truth such as:

``` text
evidence.validated
verification.PASS
integration.accepted
official_project_state_changed
```

------------------------------------------------------------------------

# 23. LIVE ACTIVITY ≠ EVIDENCE

Provider intent hints can support Live Task UI:

``` text
Creating users table
Running authentication tests
Updating Login component
```

But intent hints have:

``` text
zero truth weight
```

They cannot satisfy Evidence, Verification, or Integration gates.

The Frozen Contract defines fidelity levels:

``` text
L3 — Live
L2 — Delayed
L1 — Narrative
L0 — Opaque
```

DVL must degrade honestly.

It must never fabricate live state.

------------------------------------------------------------------------

# 24. EVIDENCE → VERIFICATION → INTEGRATION

Worker claims are not proof.

Recorded evidence types include:

``` text
file diff
file snapshot
command output
test result
build result
migration result
screenshot
browser interaction
runtime observation
security scan
generated artifact
scoped human acceptance
```

Law:

``` text
Activity shows motion.
Evidence proves outcome.
```

Therefore:

``` text
Worker FINISHED
≠ Verification PASS
≠ Integration
≠ Project Truth
```

An LLM review may advise, find issues, or support FAIL /
INSUFFICIENT_EVIDENCE.

An LLM review alone cannot create authoritative PASS.

Only Integration changes official Project Truth.

Integration must revalidate relevant current truth because:

``` text
Worker finishes
↓
Verification PASS
↓
Decision changes
↓
Integration requested
```

An old PASS cannot automatically authorize integration after relevant
truth changed.

------------------------------------------------------------------------

# 25. RUNTIME DISCOVERY / CONTROLLED FAILURE

Pre-execution discovery is not perfect.

The Input Pipeline records:

``` text
Runtime observation
      ↓
Kernel/Harness detects evidence
      ↓
affected action/work is controlled or held
      ↓
evidence enters project state
      ↓
canonical graph updated by appropriate reasoning/control path
      ↓
compiler reprojects affected Tasks
      ↓
orchestrator re-evaluates affected Assignments
      ↓
execution continues safely where possible
```

Desired property:

> **Failure becomes controlled project state instead of project chaos.**

Examples:

``` text
Worker dies
→ Assignment can be revoked/reassigned

Task fails
→ affected work re-evaluated, not blindly restart everything

resource conflict
→ hold / serialize / reassign

requirement changes
→ invalidate affected region

verification fails
→ targeted rework

new relation appears
→ update graph and re-evaluate affected work
```

Compiler itself does not reason about and mutate the canonical graph.

------------------------------------------------------------------------

# 26. RECOVERY BARRIER / H4 ARCHITECTURE

Recovery philosophy:

``` text
Worker can die.
Work survives.

Preserve work ≠ preserve stale authority.
```

Recovery Barrier direction:

``` text
BOOT
  ↓
RECOVERY MODE
  ↓
load durable Project Truth
  ↓
replay durable Kernel state
  ↓
discover workspaces/processes
  ↓
reconcile
  ↓
revalidate Assignments/authority
  ↓
EXECUTION ENABLED
```

Unknown non-idempotent effects must not be blindly re-run.

Recorded conceptual mutation states:

``` text
PREPARED
STARTED
OUTCOME_CONFIRMED
OUTCOME_UNKNOWN
```

If outcome remains unknown after inspection:

``` text
local safe HOLD
```

Desired H4 invariant recorded in the October 8 Master State:

> **After restart, DVL may preserve recoverable work, but no stale
> process, stale Worker, stale Assignment, or ambiguous effect may
> silently become current authority or Project Truth.**

------------------------------------------------------------------------

# 27. PROVIDER BUDGET / TOKEN / CONTEXT SAFE HANDOFF --- WORKING ARCHITECTURE ADDITION

The October 8 Master State records this as:

``` text
NEW WORKING MECHANISM
NOT FROZEN KERNEL LAW
```

Problem:

A Worker may be doing useful work while Provider capacity approaches:

``` text
model context window exhaustion
token usage budget exhaustion
cost budget limit
provider quota/rate/account limit
turn/tool/runaway limit
session/provider availability loss
```

Desired behavior recorded:

> **Detect danger before exhaustion, enter a warning zone, preserve work
> at a safe boundary, revoke stale authority, then resume/reassign
> safely.**

Truthful observability labels:

``` text
REPORTED
ESTIMATED
UNKNOWN
```

DVL must not invent an exact remaining percentage when the Provider does
not expose enough information.

Recorded working state machine:

``` text
GREEN
  ↓
AMBER / WARNING
  ↓
RED / SAFE-STOP REQUIRED
  ↓
SAFE BOUNDARY
  ↓
CHECKPOINT + EVIDENCE + STATE FLUSH
  ↓
REVOKE / HIBERNATE / STOP
  ↓
REASSIGN OR RESUME
```

Safe stop means:

``` text
WORK PRESERVED
```

It does not mean:

``` text
TASK VERIFIED
TASK INTEGRATED
PROJECT TRUTH CHANGED
```

Handoff does not transfer authority by itself.

A replacement Worker still requires normal Assignment/Kernel authority.

The October 8 architecture explicitly says the Provider Budget mechanism
should reuse H4 recovery primitives where possible rather than create a
second recovery system.

------------------------------------------------------------------------

# 28. REVIEW / SECURITY / AUDIT --- RECORDED PLUS DIRECTION, NOT FINAL LAW

The October 11 Security / Review / Audit file is explicitly marked:

``` text
PLUS / NEW ARCHITECTURE DIRECTION
NOT FINAL LAW YET
```

It says this addition does not replace the existing architecture.

The normal base remains:

``` text
Input / Plan
↓
Deep Understanding
↓
Graph / Relations / Edges
↓
Compiler
↓
Task Contracts
↓
Orchestrator
↓
Workers
↓
Evidence
↓
Verification
↓
Integration
↓
Project Truth
```

Security/review/audit are to be mounted on top of the existing Task
system rather than becoming a disconnected product.

Core separation recorded:

``` text
DVL = company brain / system / law / manager / project truth
Workers = bounded specialists / hands / execution units
Kernel = law enforcement
Orchestrator = manager of work, timing, dependencies, controls
Compiler = turns graph into task contracts
Review/Security/Audit = specialist controls, not the main brain
```

And:

``` text
Brain ≠ Hands
DVL ≠ Worker
Project Truth ≠ Provider claim
```

A Worker receives local bounded work, not global company authority.

------------------------------------------------------------------------

# 29. RISK FAMILY / INDICATOR DIRECTION

The Plus file distinguishes:

``` text
Family = where the Task belongs
Indicator = whether this specific Task is risky
Level = medium / high / critical
Control = review / security / stop / audit / verification strength
```

Important rule:

``` text
Family gives context.
Indicator gives control.
Consumers give impact.
Kernel enforces the stop.
```

Not every Task in a risky module is automatically critical.

Risk depends on more than code:

``` text
product type
+ environment
+ users
+ data
+ traffic
+ exposure
+ operational criticality
+ Task output
+ consumers
```

The Plus file explicitly says maximum review/security/audit on
everything would choke the product.

Recorded principle:

``` text
apply the minimum safe control required by risk
```

------------------------------------------------------------------------

# 30. REVIEW / SECURITY AS CONTROL TASKS

The Plus direction records:

``` text
Review and Security are generated control Tasks.
```

Example:

``` text
Original Task:
T42 Implement payment webhook

Generated Review Task:
R42 Review payment webhook output and consumer impact

Generated Security Task:
S42 Security review payment webhook and state transition risk
```

They have:

``` text
taskId
role
input package
expected output
evidence required
pass/fail result
findings
```

Review/Security Worker may not silently change Project Truth.

If fixes are required:

``` text
DVL generates fix/rework Tasks
```

Consumer-aware review sees:

``` text
original Task
why it exists
expected output
actual output
changed files/resources
downstream consumers
dependencies
invariants
what must not break
evidence required
```

Consumer-aware Security reviews the Task in its graph position, not in
isolation.

------------------------------------------------------------------------

# 31. RISKY PRODUCER / CONSUMER FLOW

The Plus file records:

``` text
Producer ready
=
implementation done
+
required review/security passed
+
verification passed
```

A risky producer is not ready merely because implementation finished.

Affected consumers wait.

Unrelated Tasks can continue in parallel.

The file explicitly connects this to preserving Smart Décalage and
avoiding global choking.

------------------------------------------------------------------------

# 32. AUDIT DIRECTION

The Plus architecture distinguishes:

``` text
Review/Security = inside Task pipeline
Audit/Red Team = after module or product integration
```

Three levels are recorded:

``` text
1. Task-level controls
2. Module audit
3. Full product audit
```

Module audit occurs after a module is integrated.

Full product audit occurs after integrated product / major release
candidate.

Recorded flow:

``` text
Full product integration
↓
Full audit / red team
↓
Findings with evidence
↓
Fix Tasks
↓
Re-review / re-security / re-verification
↓
Re-integration
```

Audit produces findings, not silent changes.

An auditor may propose a fix, but:

``` text
DVL creates a fix Task
Fix passes normal pipeline
Only Integration changes Project Truth
```

This entire Security/Review/Audit section remains a recorded Plus
architecture direction, not final frozen law.

------------------------------------------------------------------------

# 33. H1 --- CURRENTLY CLOSED

## What H1 is

Historical H1 checkpoint:

``` text
adapterInstanceId / stale-instance fencing
```

Recorded solved elements:

``` text
Kernel-assigned adapterInstanceId
adapterSequence scoped per adapter instance
stale/dead instance fencing
crash cleanup with aborted actors/actions
safe process kill guard
C06 adapterInstanceId tests expanded
```

## H1 evidence recorded

The dedicated H1 solved checkpoint records:

``` text
Phase 1.1 / H1 adapterInstanceId completed

Repo:
Fridhibassem/dvl-spike-phase-1

Main commit:
3d616af

H1 implemented on Claude branch
Gemini reviewed twice
Final Gemini result: PASS
Merged to main
GitHub Actions CI #4 completed successfully

npm test: 37/37 PASS
6 test files PASS
npm run spike: SPIKE OK
npm run typecheck: PASS

C06 adapterInstanceId tests expanded to 13 tests
```

Later hardening evidence also records H1 C06 continuing to pass together
with H2/H3 suites.

## Current project status

``` text
H1 = CLOSED
```

This current status is the user's explicit latest correction.

------------------------------------------------------------------------

# 34. H2 --- CURRENTLY CLOSED

## What H2 is

Historical hardening checkpoint:

``` text
Adapter Spool Isolation
```

Recorded implementation/test areas:

``` text
per-adapterInstanceId spool namespace
Kernel-owned spool metadata/index
large-output spooling
continuous stdout/stderr draining
non-DVL1 stdout treated as diagnostics
stale-instance spool attribution
partial-write quarantine
traversal/symlink protections
non-clobber publication
32 KB inline boundary tests
H2-01 through H2-10 conformance tests
```

## H2 evidence recorded

The hardening checkpoint records:

``` text
npm test          → 74/74 PASS
npm run spike     → SPIKE OK
npm run typecheck → PASS
```

It also records mutation tests that deliberately broke protections and
were caught, including:

``` text
accept .partial claims → caught
fenced spool recorded as complete → caught
exclusive 32 KB rule → caught
drop symlinked-dir check → caught
ignore artifact status → caught
no partial quarantine → caught
paused stdout drain → caught
```

Relevant suites recorded:

``` text
C06 — adapter instance identity / fencing
C07 — adapter spool isolation
C08 — queue limits
C09 — safety-halt regression
C10 — H2 spool spec
```

At that historical checkpoint H2 still awaited independent closure
review. That is historical evidence state.

## Current project status

``` text
H2 = CLOSED
```

This current status is the user's explicit latest correction.

------------------------------------------------------------------------

# 35. H3 --- CURRENTLY CLOSED

## What H3 is

Historical hardening checkpoint:

``` text
Queue / Safety-Halt Hardening
```

Recorded evidence in the H1/H2/H3 hardening checkpoint:

``` text
H3 queue logic intentionally left unchanged during H2 work
C08/C09 H3-related suites continued to pass
no Smart Décalage logic was added as part of H2
```

Relevant suites:

``` text
C08 — queue limits
C09 — safety-halt regression
```

The historical checkpoint correctly refused to claim closure before the
independent combined review.

## Current project status

``` text
H3 = CLOSED
```

This current status is the user's explicit latest correction.

No extra final H3 evidence is invented in this document beyond the
evidence actually present in the retrieved source set.

------------------------------------------------------------------------

# 36. H4 --- CLOSED ON macOS ONLY

## What H4 is

H4 is the Kernel-process:

``` text
crash
replay
reconstruction
recovery
stale authority
ambiguous external-effect
```

frontier.

The architecture required H4 to challenge:

``` text
Kernel dies after durable event write
Kernel dies before durable event write
Worker/provider continues briefly after Kernel death
adapter survives/dies in different ordering
transaction workspace contains safe/unsafe partial work
surviving process tree
non-idempotent action outcome unknown
replay must not duplicate authoritative effects
stale Assignment must not revive
old Worker cannot regain authority by reconnecting
Project Truth reconstructs from durable DVL state
evidence refs remain attributable
unknown outcomes become HOLD/inspection
execution disabled until Recovery Barrier satisfied
```

## H4 adversarial history

A later adversarial review found real blockers and explicitly refused
closure at that time.

Examples found included:

``` text
B1 — oversized action.started payload could disappear on replay
B2 — non-owner Kernel could reconcile and fork log ownership
B3 — retry/reconciliation could proceed while old executor was alive
```

Those findings are important historical evidence because H4 was not
closed merely from the first green tests.

Subsequent work recorded changes such as:

``` text
root ownership / stale replay checks
UNKNOWN written before terminal interruption
process fencing
brokered filesystem effects
confinement
durable PREPARED identity
fsync before scoped effects
refusal of raw-command fallback
```

A later record states:

``` text
There is now no raw-command fallback in the launch code.
```

and records migration regressions passing with confinement enforced.

## macOS physical evidence recorded

The H4 candidate evidence record reports a final conformance baseline:

``` text
C27: 14
C28: 5
C29: 11
C30: 23
C31: 15

C27–C31: 68

Full conformance suite:
304 tests in 31 files

304/304 PASS
31/31 files PASS
zero skipped/pending tests

TypeScript typecheck PASS
git diff --check PASS
```

Physical environment recorded:

``` text
macOS 13.7.8 (22H730)
Node 24.9.0
Vitest 2.1.9
```

The evidence explicitly says Linux/Windows behavior in those tests is
exercised through platform seams and is:

``` text
NOT physical Linux/Windows execution evidence
```

The macOS confinement evidence records a host-owned Seatbelt profile and
denial of direct:

``` text
filesystem writes
network sockets
DB/API mutation
raw credentials
native shell/tool mutation
spawned-child escape
```

It also records crash cases around:

``` text
before durable PREPARED
after PREPARED before effect
after effect before outcome
surviving old executor
```

The evidence explicitly does **not** establish OS/power-loss durability.

## Current project status

The user's current explicit status is:

``` text
H4 crash/recovery = CLOSED ON macOS ONLY
```

Therefore this document does not claim:

``` text
Windows H4 closed
Linux H4 closed
power-loss durability proven
all provider integrations certified
production readiness
```

------------------------------------------------------------------------

# 37. WHAT H1--H4 CLOSURE DOES NOT MEAN

Current closure does not mean the entire DVL architecture is
production-ready.

The Frozen Contract itself distinguishes core contract from
implementation evidence.

The Input Pipeline also explicitly states that graph/compiler
correctness alone does not guarantee application correctness.

Current closure status means the corresponding hardening/recovery
frontier has reached the current project's accepted evidence threshold
in its stated scope.

For H4 that scope is macOS only.

------------------------------------------------------------------------

# 38. SEPARATION OF RESPONSIBILITIES --- SHORT FORM

The Input Pipeline gives the separation directly:

``` text
Graph understands
Compiler projects
Orchestrator schedules
Décalage controls timing
Kernel authorizes/blocks
Harness executes + records evidence
Verifier judges evidence
Integration revalidates project truth
```

This separation is fundamental.

Expanded:

``` text
USER INTENT
    ↓
Source Intent Baseline
    ↓
Normal Plan + Normal Graph
    ↓
Smart Plan + Smart Graph
    ↓
Ultra Plan + Ultra Graph
    ↓
Ultra-Pro Re-audit / Deep Graph
    ↓
URG
    ↓
Deterministic Compiler
    ↓
Task Contracts
    ↓
Orchestrator + Smart Décalage
    ↓
Task → Assignment → Worker
    ↓
Kernel authorization
    ↓
Harness / Provider execution
    ↓
Evidence
    ↓
Verification
    ↓
Integration
    ↓
Project Truth
    ↓
Runtime feedback
    ↺
affected relations / Tasks / Assignments re-evaluated
```

------------------------------------------------------------------------

# 39. CURRENT ARCHITECTURE STATUS --- SOURCE-ONLY

``` text
Product/UI detailed architecture:
OUTSIDE THIS FILE'S SCOPE

Normal desktop coding-agent baseline:
PRESERVED / separate product discussion

Dynamic Project Environment / Rooms:
PRESERVED / separate product discussion

Source Intent Baseline:
PRESERVED

Normal Plan + Normal Graph:
PRESERVED

Smart Plan + Smart Graph:
PRESERVED

Ultra Plan + Ultra Graph:
PRESERVED

Ultra-Pro Re-audit / Deep Graph:
PRESERVED

URG:
CANONICAL EXECUTION-RELEVANT RELATION GRAPH
WORKING / STRONG / NOT CLAIMED OMNISCIENT

Graph-to-Task Compiler:
DETERMINISTIC PROJECTION
WORKING / STRONG

Task → Assignment → Worker:
CANONICAL EXECUTION MODEL

Smart Orchestrator:
WORKING ARCHITECTURE

Smart Décalage:
WORKING ARCHITECTURE

Kernel:
LAW / ENFORCEMENT BOUNDARY
FINAL LAW NOT CLAIMED FROZEN

Harness:
EXECUTION BOUNDARY

Evidence → Verification → Integration:
CORE DIRECTION PRESERVED

Project Truth:
DVL-OWNED
ONLY INTEGRATION CHANGES OFFICIAL TRUTH

Provider Budget / Safe Handoff:
WORKING ARCHITECTURE ADDITION
NOT FROZEN KERNEL LAW IN THE OCTOBER 8 SOURCE

Security / Review / Audit Individual Plus:
NEW ARCHITECTURE DIRECTION
NOT FINAL LAW YET

H1:
CLOSED

H2:
CLOSED

H3:
CLOSED

H4:
CLOSED ON macOS ONLY

Windows/Linux H4:
NOT CLAIMED CLOSED

Production readiness:
NOT CLAIMED
```

------------------------------------------------------------------------

# 40. SOURCES USED FOR THIS RECONSTRUCTION

This document is reconstructed from the DVL project source set,
especially:

``` text
DVL_CORE_STABLE_CONTRACT_FINAL_V0_3_2_FROZEN_FOR_SPIKE.md

DVL_INPUT_TO_EXECUTION_PIPELINE_V0_1.md

DVL_MASTER_STATE_UPDATE_2026-10-08.md

DVL_ARCHITECTURE_CONSOLIDATION_V1_SEMANTIC_V1_TO_V7(1).md

DVL_SMART_ORCHESTRATION_FUTURE_ARCHITECTURE_REVIEW.md

DVL_700_TASK_HIGH_CONCURRENCY_SIMULATION_REPORT.md

DVL_700_TASK_FULL_INTERNAL_ARCHITECTURE_SIMULATION_REPORT.md

DVL_SECURITY_REVIEW_AUDIT_INDIVIDUAL_PLUS_MASTER_STATE_2026-10-11(1).md

DVL_H1_H2_H3_HARDENING_MASTER_STATE_V1(1).md

H1-solved.txt

H4 adversarial / physical evidence records from 2026-10-10
```

Current status corrections supplied explicitly by the user:

``` text
H1 CLOSED
H2 CLOSED
H3 CLOSED
H4 CLOSED ON macOS ONLY
```

No Claude/Codex proposal from the later architecture investigation is
promoted into this architecture unless it already exists in the source
architecture above or was explicitly accepted.

------------------------------------------------------------------------

# 41. RESUME POINT

For the core architecture, resume from:

``` text
SOURCE INTENT
→ NORMAL PLAN + NORMAL GRAPH
→ SMART PLAN + SMART GRAPH
→ ULTRA PLAN + ULTRA GRAPH
→ ULTRA-PRO RE-AUDIT / DEEP GRAPH
→ URG
→ DETERMINISTIC COMPILER
→ TASK CONTRACTS
→ SMART ORCHESTRATOR + SMART DÉCALAGE
→ TASK → ASSIGNMENT → WORKER
→ KERNEL + HARNESS
→ EVIDENCE
→ VERIFICATION
→ INTEGRATION
→ PROJECT TRUTH
→ RUNTIME FEEDBACK / RE-EVALUATION
```

with:

``` text
H1 CLOSED
H2 CLOSED
H3 CLOSED
H4 CLOSED ON macOS ONLY
```

and with the product/UX/Dynamic Project Environment discussion kept
separate from this core architecture checkpoint.

# END
