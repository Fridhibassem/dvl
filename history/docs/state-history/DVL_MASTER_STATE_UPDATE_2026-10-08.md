# DVL CODE 😈 — MASTER STATE UPDATE

**Date:** 2026-10-08  
**Status:** CURRENT CONSOLIDATED CHECKPOINT — product baseline + Ultra/Ultra-Pro + URG + compiler + orchestration + Kernel/Harness + H4 frontier + provider-budget safe handoff  
**Supersedes for resume purposes:** `DVL_MASTER_STATE_RESUME_2026-10-06.md`  
**Does NOT silently replace:** `DVL_CORE_STABLE_CONTRACT_FINAL_V0_3_2_FROZEN_FOR_SPIKE.md`

---

# 0. WHY THIS UPDATE EXISTS

This file updates the DVL master state so later work resumes from the current frontier instead of from the older 2026-10-06 checkpoint.

It consolidates:

- the locked DVL Product Baseline;
- the Frozen-for-Spike Core Stable Contract;
- the current Ultra / Ultra-Pro discovery direction;
- the canonical Ultra Relation Graph (URG);
- the deterministic Graph-to-Task Compiler;
- Smart Orchestrator + Smart Décalage;
- Kernel / Harness / Evidence / Verification / Integration separation;
- recovery and stale-authority rules;
- the current implementation frontier at H4;
- a new working mechanism for proactive Provider/Worker token-budget exhaustion protection.

Important separation:

```text
FROZEN PRODUCT
≠ FROZEN-FOR-SPIKE CONTRACT
≠ WORKING ARCHITECTURE
≠ REAL IMPLEMENTATION
≠ RESEARCH
```

Do not promote research, simulation, or prose into Project Truth without implementation evidence.

---

# 1. CURRENT DVL TRUTH IN ONE SENTENCE

> **DVL is a complete desktop Coding Agent that opens into a Dynamic Project Environment; user intent is preserved, Ultra and Ultra-Pro discover execution-relevant relations, one canonical URG stores current discovered relations, a deterministic Graph-to-Task Compiler projects them into execution-ready Task Contracts, Smart Orchestrator + Smart Décalage coordinate safe useful concurrency, Assignment grants temporary authority, Kernel enforces law, Harness executes, Evidence proves outcomes, Verification judges evidence, Integration revalidates current truth, and only Integration changes official Project Truth.**

Core laws:

> **Complexity inside. Simplicity outside.**

> **Worker can die. Work survives.**

> **DVL owns Project Truth.**

> **Preserve work ≠ preserve authority.**

> **Activity shows motion. Evidence proves outcome.**

> **Depth may increase. Intent may not drift.**

New working safety principle:

> **Provider budget can die. Project work must survive.**

---

# 2. PRODUCT BASELINE — LOCKED

DVL remains first a **complete desktop Coding Agent**, not merely:

- an orchestrator;
- a dashboard;
- a reviewer;
- a design tool;
- a multi-agent show;
- a project manager.

Normal coding-agent parity includes:

- open/create local or Git project;
- read/create/edit/delete project files;
- run terminal commands;
- run tests/builds/dev servers;
- preview and interact with the running product;
- natural project chat;
- upload plans/files/screenshots/images/references;
- use one or multiple AI providers;
- continue safely after interruptions.

After a project opens, DVL becomes a **Dynamic Project Environment**.

Core rooms remain:

- **Meeting / Chat Room**
- **Live Tasks Room**
- **Design Room**
- **Live Product Room**

Sidebar baseline:

- Settings
- Providers
- Skills
- Toolbox

Product principle:

> **AI handles complexity. DVL exposes meaningful reality. The human keeps control.**

The product baseline must not be silently weakened because implementation is easier another way.

---

# 3. CANONICAL UNIT MODEL

Current durable/execution terminology:

```text
Task
  ↓
Assignment
  ↓
Worker
  ↓
Provider / Runtime
```

Definitions:

- **Task** = durable unit of project work.
- **Assignment** = temporary revocable authority binding.
- **Worker** = temporary executor.
- **Provider** = AI/model/runtime source used by a Worker.

Canonical direction:

> **Task → Assignment → Worker**

Not:

> Worker → Task

A Worker can disappear without deleting the Task or durable work.

A recovered Worker does not automatically recover old authority.

---

# 4. CURRENT END-TO-END ARCHITECTURE

```text
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

This is a **feedback system**, not a one-way pipeline.

---

# 5. NO SEPARATE “SEMANTIC LAYER”

Current decision remains:

> **Do not add a separate semantic subsystem merely to hold meaning already represented elsewhere.**

Meaning is already represented by:

- project decisions;
- URG relations;
- relation roles;
- lineage;
- invariants;
- resources/conflicts;
- outputs and consumers;
- evidence requirements;
- runtime evidence;
- verification;
- invalidation/re-evaluation triggers.

Older documents may contain the word “semantic”, but current architecture does not require a separate Semantic Graph / Semantic Control layer.

---

# 6. INPUT → NORMAL → SMART → ULTRA → ULTRA-PRO

## 6.1 Source Intent Baseline

DVL preserves the user's original accepted intent/version before deeper reasoning.

Examples of natural input:

- short idea;
- normal prompt;
- detailed plan;
- repository/folder;
- requirements/spec files;
- supporting artifacts.

Golden law:

> **Depth may increase. Intent may not drift.**

---

## 6.2 Normal

Normal captures what the user explicitly requested:

- goal;
- actors/users;
- features;
- explicit constraints;
- accepted decisions;
- acceptance expectations.

It should avoid unnecessary invention.

---

## 6.3 Smart

Smart adds directly implied structure:

- stable entities/IDs;
- direct dependencies;
- inputs/outputs;
- consumers;
- interfaces/contracts;
- direct invariants;
- missing explicit questions;
- acceptance structure;
- provenance.

Rule:

> **What is directly implied by what the user requested?**

---

## 6.4 Ultra

Ultra recursively searches for hidden but execution-relevant relations.

Recursive mechanism:

```text
Trigger
  ↓
Effect
  ↓
Hidden consequence
  ↓
Relation / invariant / missing task / resource consequence
  ↓
Treat finding or fix as a new trigger
  ↓
Search again
```

Strengthened rule:

> **Relation → fix → treat fix as new trigger → discover the next consequence.**

Ultra stops only when another recursion produces no execution-relevant change to:

- task;
- dependency;
- ordering;
- WAIT/HOLD;
- resource conflict;
- invariant;
- evidence requirement;
- consumer;
- external effect;
- failure/recovery consequence.

Ultra does not claim perfect unknown-unknown coverage.

---

## 6.5 Ultra-Pro

Ultra-Pro attacks the Ultra result itself.

It asks:

- What relation did Ultra miss?
- What assumption is being treated as fact?
- What changes under concurrency?
- What happens after crash/retry/recovery?
- What if an external system is delayed or contradictory?
- What if a resource disappears?
- Can the invariant actually be enforced?
- Does the proposed fix create another consequence?
- Is there a missing actor, timer, consumer, gate, transition, resource, task, or evidence requirement?

Ultra-Pro is a re-audit/deepening mechanism, not a license to rewrite user intent.

---

# 7. ONE CANONICAL GRAPH — URG

Official short name:

# **URG — Ultra Relation Graph**

Definition:

> **URG is the canonical machine graph of all currently discovered execution-relevant project relations.**

Important:

> **Currently discovered** does not mean omniscient.

A relation can exist without creating a new task or WAIT.

Relation families can include:

```text
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

Current canonical truth model:

```text
URG / machine graph
    = canonical relation truth

Visual Ultra Graph
    = human-readable projection

Compiled Task Contracts
    = execution projection
```

---

# 8. GRAPH-TO-TASK / ULTRA-PRO COMPILER STATE

Current concept:

- **Operation:** URG Task Compilation
- **Component:** Graph-to-Task Compiler / URG Task Compiler
- **Output:** Compiled Task Contracts

The compiler is **deterministic projection**, not another reasoning system.

Compiler laws:

1. No relation loss.
2. Do not silently invent, rename, merge, regroup, or delete canonical meaning.
3. Every compiled relation traces back to URG.
4. Each Task contains the relations relevant to its execution.
5. Every output declares its consumer(s), or is explicitly terminal.
6. GO / WAIT / HOLD / ASK / BLOCK are dynamic runtime states.
7. Compiled task files are projections, not a second canonical truth.
8. Compiler output never grants authority.

Desired Task Contract includes:

- Task ID;
- WHY / purpose;
- inputs;
- dependencies/prerequisites;
- outputs;
- output consumers;
- resources;
- conflicts;
- parallel/sequential constraints;
- WAIT/HOLD conditions;
- human/external gates;
- invariants;
- acceptance criteria;
- required evidence;
- unlocks;
- relation IDs + roles;
- invalidation/re-evaluation triggers;
- requested scope/authority.

Authority remains:

```text
Assignment + Kernel
```

not the compiler.

---

# 9. LATEST COMPILER EXPERIMENT PRESERVED

Latest strong compiler checkpoint currently preserved:

- **100 visual graph edges → 100 tasks**
- deterministic compiler status OK
- explicit per-task consumer mapping
- terminal-task identification
- compiler-output consumer model
- **41 terminal tasks**

Compiler output consumers include:

- Orchestrator;
- Smart Décalage;
- Workers/providers;
- Kernel;
- Harness/runtime;
- Evidence collector;
- Verification;
- Integration/Project Truth;
- Graph updater;
- human;
- dashboards/audit.

Result flow:

```text
Task PASS
   ↓
dependent task(s), with reason
OR
terminal result
   ↓
Project Truth / launch gate
```

---

# 10. W105 / RELATION SPLIT

Historical/current structural issue:

8 Ultra tasks were present in the plan/relations but did not touch relations drawn in the six visual graph diagrams:

```text
UG-2
UG-3
UG-4
UH-8
UI-1
UJ-1
UJ-2
UX-1
```

The long-term answer remains:

> **One canonical URG contains every execution-relevant relation.**

No hidden split should remain between:

- visual graph;
- plan-only relations;
- machine graph.

A task does not need a visual edge if it has canonical URG relations.

---

# 11. SMART ORCHESTRATOR

Orchestrator coordinates work.

It decides:

- which tasks are structurally ready;
- which Worker/provider gets each Assignment;
- what can safely run in parallel;
- what must wait;
- what waits for verification;
- what needs human/external approval;
- when state changes require re-evaluation.

Optimization target:

> **Maximum safe useful concurrency — not maximum worker count.**

Orchestrator does **not** grant execution authority.

---

# 12. SMART DÉCALAGE

Smart Décalage is state-driven flow control.

Principle:

> **Delay by state, not by arbitrary timer.**

Possible causes of delay/HOLD:

- prerequisite not ready;
- resource locked;
- conflicting resource;
- shared external API conflict;
- verification backlog;
- project decision changed;
- environment unavailable;
- authority missing;
- recovery in progress;
- unresolved high-risk condition;
- Provider/Worker budget danger (new working addition; see Section 18).

Smart Décalage cannot override Kernel law.

---

# 13. RESOURCE / CONCURRENCY CONTROL

Important runtime resources include:

- files/directories;
- Git/worktrees;
- ports/processes;
- DB/schema/migrations;
- Redis/cache;
- queues;
- browser sessions;
- external APIs;
- credentials;
- CPU/RAM/disk/network;
- provider/context/budget capacity.

Possible resource states/relations:

```text
shareable-read
exclusive-write
serialize
parallel-safe
state-gated
human-gated
external-authority-gated
budget-gated
```

The graph describes relations.

Orchestrator/Décalage schedule.

Kernel/runtime enforce real boundaries.

---

# 14. KERNEL

Kernel is the law/enforcement boundary.

Kernel is **not**:

- planner;
- graph;
- compiler;
- orchestrator;
- Provider;
- reviewer.

Kernel owns/enforces:

- DVL-issued identity;
- Assignment authority;
- scope;
- stale-authority fencing;
- isolation;
- allowed/forbidden action classification;
- durable event truth;
- security policy;
- execution constraints;
- evidence authority;
- integration prerequisites.

Conceptual permission outputs remain:

```text
ALLOW
BLOCK
ASK_USER
```

Execution result is separate:

```text
Kernel = ALLOW
Execution = FAILED
```

Prompt instructions are not security boundaries.

---

# 15. HARNESS / RUNTIME

Harness executes what Kernel allows.

```text
Kernel = law
Harness = execution engine
```

Harness/runtime may include:

- provider adapter;
- context preparation;
- tool loop;
- filesystem;
- terminal;
- tests;
- dev server;
- browser;
- DB runtime;
- MCP tools;
- process supervision;
- sandbox/container;
- usage/budget observation;
- safe stop / hibernation support;
- checkpoint production.

Restricted-shell law:

> **No real sandbox → no shell for restricted roles.**

---

# 16. EVIDENCE → VERIFICATION → INTEGRATION

Worker claims are not proof.

Evidence may include:

- file diff;
- file snapshot;
- command output;
- test result;
- build result;
- migration result;
- screenshot;
- browser interaction;
- runtime observation;
- security scan;
- generated artifact;
- scoped human acceptance.

Law:

> **Activity shows motion. Evidence proves outcome.**

Therefore:

```text
Worker FINISHED
≠ Verification PASS
≠ Integration
≠ Project Truth
```

An LLM review can advise, find issues, or support FAIL / INSUFFICIENT_EVIDENCE.

An LLM review alone cannot create authoritative PASS.

Only Integration changes official Project Truth.

---

# 17. RECOVERY / H4 DIRECTION

Recovery philosophy:

> **Worker can die. Work survives.**

But:

> **Preserve work ≠ preserve stale authority.**

Recovery Barrier direction:

```text
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
revalidate assignments/authority
  ↓
EXECUTION ENABLED
```

Unknown non-idempotent effects must not be blindly re-run.

Conceptual mutation states:

```text
PREPARED
STARTED
OUTCOME_CONFIRMED
OUTCOME_UNKNOWN
```

If outcome remains unknown after inspection:

```text
local safe HOLD
```

External irreversible side effects remain a high-risk open area.

---

# 18. NEW WORKING MECHANISM — PROVIDER BUDGET GUARD / SAFE HANDOFF

## 18.1 Problem

A Worker may be executing useful project work while its Provider approaches one of these limits:

- model context window exhaustion;
- token usage budget exhaustion;
- cost budget limit;
- provider quota/rate/account limit;
- turn/tool/runaway limit;
- session/provider availability loss.

If DVL waits until the Provider simply dies, work may be left in a dirty transaction workspace, context may be lost, and a replacement Worker may not know the safe continuation point.

The desired behavior is proactive:

> **Detect danger before exhaustion, enter a warning zone, preserve work at a safe boundary, revoke stale authority, then resume/reassign safely.**

This mechanism is a **working architecture addition**, not yet Frozen Kernel law.

---

## 18.2 Do not confuse three different “tokens”

### A. Provider credential / API key

This is a secret credential.

It must never appear in:

- events;
- logs;
- evidence;
- UI diagnostics;
- provider messages;
- exported artifacts.

DVL stores credentials securely.

### B. Usage / quota / cost budget

This is runtime capacity:

- tokens consumed;
- estimated cost;
- remaining provider quota where observable;
- run/turn/tool budget.

### C. Model context window

This is the current model's available context capacity for the active Run.

The Budget Guard primarily monitors **B + C**, not the secret credential.

---

## 18.3 Truthful observability

Every budget signal must be labeled:

```text
REPORTED
ESTIMATED
UNKNOWN
```

Rules:

- reported provider usage may be displayed as reported;
- estimated values must be labeled estimated;
- unknown remaining capacity must not be invented;
- if a Provider exposes no live usage data, DVL uses safe surrogate limits.

Possible surrogate limits:

```text
maxDurationSeconds
maxToolCalls
maxIncomingBytes
maxIncomingChunks
maxConsecutiveAssistantMessages
maxNoProgressTime
configured token/cost ceiling
context-pressure heuristic where measurable
```

---

## 18.4 Budget zones

Proposed state machine:

```text
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

### GREEN

Normal operation.

DVL can continue to dispatch actions allowed by normal scheduling.

### AMBER

Provider/Worker is approaching a configured limit.

UI example:

```text
Provider Budget — WARNING
Worker W17 approaching context/token budget.
Safe handoff may be required soon.
```

Behavior:

- avoid starting unnecessarily large new sub-work;
- prioritize completing current bounded action;
- prepare checkpoint metadata;
- reduce speculative branching;
- prepare replacement/failover candidate if available.

### RED

Provider/Worker is too close to exhaustion to safely begin new risky work.

UI example:

```text
RED ZONE — PROVIDER CAPACITY LOW
Preparing safe stop to protect project work.
```

Behavior:

- do not begin a new non-idempotent mutation unless already explicitly safe/required;
- request safe boundary if Provider supports it;
- finish or terminate the current atomic action according to Kernel/runtime policy;
- stop spawning Provider-internal work that increases risk;
- flush current run metadata;
- create safe mechanical checkpoint if possible;
- capture file/runtime evidence;
- classify dirty/unsafe work;
- persist remaining-work summary;
- preserve transaction workspace if safe;
- revoke or expire the current Assignment before another Worker receives authority;
- hibernate / safe-stop / fail over / reassign.

---

## 18.5 Safe Handoff Record

Before handoff, DVL should persist a bounded record such as:

```text
handoffId
projectId
taskId
workerId
runId
attempt
providerId
adapterInstanceId
assignmentId / leaseVersion
decisionSnapshotVersion
decisionSnapshotHash

budgetReason:
  context_pressure
  token_budget_low
  cost_budget_low
  provider_quota_low
  turn_limit_near
  safety_surrogate_limit

budgetSource:
  REPORTED
  ESTIMATED
  UNKNOWN

lastCompletedAction
currentActionState
pendingAction
safeMechanicalCheckpointRef
latestValidatedCheckpointRef
transactionWorkspaceRef
evidenceRefs
dirtyDiffRef
remainingWork
resumeInstructions
currentVerificationState
timestamp
```

Do **not** persist secret credentials in the record.

---

## 18.6 Safe stop is not automatic PASS

A successful safe handoff means:

```text
WORK PRESERVED
```

It does **not** mean:

```text
TASK VERIFIED
TASK INTEGRATED
PROJECT TRUTH CHANGED
```

The replacement Worker still operates under normal evidence, verification, and integration rules.

---

## 18.7 Authority rule during handoff

Golden rule:

> **Preserve work ≠ preserve authority.**

When RED Zone causes reassignment:

```text
old Assignment
   ↓
REVOKED / EXPIRED
   ↓
old Worker = stale
   ↓
new Assignment
   ↓
new Worker receives current scope + decisions + checkpoint
```

If the old Worker returns later, it cannot mutate the project under the stale Assignment.

---

## 18.8 Handoff target selection

Possible next step:

```text
same Provider / fresh context
different model in same Provider
different Provider
local runtime
WAIT/HOLD for user/provider recovery
```

The new Worker receives only the durable/current DVL state needed to continue:

- Task goal;
- acceptance criteria;
- current project decisions;
- current URG/task contract;
- remaining work;
- safe checkpoint;
- validated evidence;
- relevant diagnostic context;
- current verification state;
- newly issued Assignment.

It must not require the previous Provider's private hidden memory.

---

## 18.9 Smart Décalage integration

Provider capacity becomes a runtime resource.

Example:

```text
Task T42 READY
Worker W9 assigned
Provider context enters AMBER
    ↓
Smart Décalage stops speculative expansion
    ↓
RED reached
    ↓
HOLD new mutations
    ↓
safe checkpoint
    ↓
reassign
```

This makes budget exhaustion controlled project state instead of surprise failure.

---

## 18.10 Suggested future conformance scenarios

Add tests similar to:

```text
PB01 — usage budget enters AMBER and UI state is truthful
PB02 — RED prevents starting new risky mutation
PB03 — safe boundary supported → clean checkpoint + stop
PB04 — safe boundary unsupported → transaction workspace protects project
PB05 — context overflow occurs before handoff → crash recovery path still works
PB06 — old Worker returns after reassignment → stale authority blocked
PB07 — replacement Worker resumes from checkpoint without previous private session
PB08 — unknown usage does not invent percentage
PB09 — estimated usage is labeled estimated
PB10 — dirty checkpoint is not promoted to Project Truth
PB11 — handoff preserves evidence refs
PB12 — non-idempotent in-flight effect becomes OUTCOME_UNKNOWN, not blindly rerun
PB13 — same Provider fresh context handoff
PB14 — cross-provider handoff
PB15 — budget alarm storm does not create retry/reassignment loop
```

Exact thresholds remain experimental.

Do not freeze percentages such as 80%/90%/95% until measured.

---

# 19. LIVE TASK ROOM ADDITION

The Live Tasks Room should expose budget danger only when meaningful.

Possible per-Worker state:

```text
RUNNING
BUDGET WARNING
RED ZONE — SAFE HANDOFF
HIBERNATING
CHECKPOINTING
REASSIGNING
RECOVERING
VERIFICATION WAITING
```

The UI must distinguish:

- provider-reported data;
- DVL estimates;
- DVL safety state;
- verified project truth.

Never display a fake exact remaining token percentage if the Provider does not expose enough data.

---

# 20. RESEARCH FINDINGS — KEEP AS RESEARCH, NOT LAW

Recent research files reinforce several directions but do not automatically modify Frozen law.

Useful research themes include:

- test Harness behavior, not only model intelligence;
- crash/recovery as normal distributed-system events;
- re-check authority after recovery;
- progressive Skill loading to reduce context/token pressure;
- failure-injection testing;
- dynamic graph as operational state, not a visual animation;
- bounded/hot graph ideas at high concurrency;
- token exhaustion as a failure scenario;
- persistent/managed agent ideas as external reference.

These remain:

```text
RESEARCH / CANDIDATE / EXPERIMENT
```

until accepted through architecture review and real implementation evidence.

---

# 21. IMPLEMENTATION FRONTIER — UPDATED 2026-10-08

## 21.1 H1 / H2 / H3 status clarification

H1, H2, and H3 reached a **closed/solved checkpoint in the implementation track** according to the prior testing/review progression.

However, DVL deliberately decided **not to treat that first closure as the final word**.

Current policy:

> **H1 / H2 / H3 are re-opened for a second-perspective review, not because they are known broken, but because we want to attack them again from a different review angle before final architectural trust.**

Therefore their state should be represented as:

```text
H1 — CLOSED ON FIRST PASS / RE-OPENED FOR SECOND-PERSPECTIVE REVIEW
H2 — CLOSED ON FIRST PASS / RE-OPENED FOR SECOND-PERSPECTIVE REVIEW
H3 — CLOSED ON FIRST PASS / RE-OPENED FOR SECOND-PERSPECTIVE REVIEW
H4 — STARTED / IN PROGRESS / NOT CLOSED
```

This distinction is important:

```text
RE-OPENED FOR REVIEW
≠ KNOWN FAILED
≠ IMPLEMENTATION REGRESSION
≠ NEVER CLOSED
```

The purpose of reopening H1–H3 is additional confidence through a different review lens, for example:

- adversarial review;
- recovery-oriented review;
- distributed-systems failure review;
- state/authority consistency review;
- filesystem/isolation review;
- race-condition review;
- invariant-focused review;
- failure-injection review.

The exact second-review method may differ by blocker.

If the second-perspective review finds no valid issue, the item returns to CLOSED with stronger confidence.

If it finds a real defect:

```text
finding
  ↓
reproduce
  ↓
fix
  ↓
regression test
  ↓
independent re-review
  ↓
close again
```

## 21.2 H4 current frontier

The active engineering frontier is:

# **H4 — STARTED / IN PROGRESS / NOT CLOSED**

H4 is the real Kernel-process crash/replay/reconstruction safety frontier.

Important evidence discipline:

- H1–H3 previous closure is preserved as historical implementation evidence;
- their current reopening is a deliberate second-review decision;
- reopening does not erase previous passing tests or reviews;
- H4 is the currently unfinished implementation frontier;
- H4 must not be marked CLOSED until real crash/replay/reconstruction evidence satisfies the closure rule.

Closure rule remains:

> **Implementation + valid regression test + independent review + required physical/runtime validation.**

---

# 22. H4 — WHAT IT MUST PROVE

H4 is the real Kernel-process crash/replay/reconstruction frontier.

At minimum, H4 must challenge:

- Kernel dies after durable event write;
- Kernel dies before durable event write;
- Worker/provider continues briefly after Kernel death;
- adapter process survives / dies in different ordering;
- transaction workspace contains safe and unsafe partial work;
- process tree may contain surviving processes;
- non-idempotent action outcome may be unknown;
- replay must not duplicate authoritative effects;
- stale Assignment must not revive;
- old Worker cannot regain authority merely by reconnecting;
- Project Truth must reconstruct from durable DVL state;
- evidence refs must remain attributable;
- unknown outcomes become HOLD/inspection paths;
- execution must remain disabled until Recovery Barrier is satisfied.

Desired invariant:

> **After restart, DVL may preserve recoverable work, but no stale process, stale Worker, stale Assignment, or ambiguous effect may silently become current authority or Project Truth.**

---

# 23. H4 + PROVIDER BUDGET GUARD CONNECTION

These two mechanisms should be designed consistently.

H4 handles:

```text
UNEXPECTED DEATH
```

Provider Budget Guard handles:

```text
PREDICTED / APPROACHING EXHAUSTION
```

Both converge on the same durability concepts:

```text
persist
checkpoint
capture evidence
classify dirty state
revoke stale authority
reconcile
resume/reassign
verify
integrate
```

Therefore the new budget mechanism should reuse H4 recovery primitives where possible rather than create a second recovery system.

---

# 24. CURRENT OPEN ENGINEERING QUESTIONS

Do not claim solved yet:

- H4 crash replay/reconstruction;
- exact Safe Handoff thresholds;
- exact Provider context-remaining observability across Providers;
- quota/usage APIs differ by Provider;
- reliable estimation when Provider usage is unknown;
- non-idempotent action near budget exhaustion;
- safe-stop support differs by Provider;
- cross-provider handoff under real workloads;
- external irreversible effects;
- production-grade filesystem/OS isolation;
- real large-graph 5k/10k performance;
- real 400–500 concurrency on target hardware;
- exact verification backpressure thresholds;
- full salvage/rebase strategy;
- GC races/deletion crash semantics;
- final Kernel law.

---

# 25. UPDATED NEXT ENGINEERING ORDER

Current practical order:

```text
1. Preserve Locked Product Baseline.

2. Preserve Frozen-for-Spike Contract as the test target.
   Do not rewrite it merely because of prose ideas.

3. Preserve current Input → Normal → Smart → Ultra → Ultra-Pro → URG direction.

4. Keep URG as canonical relation truth.

5. Keep Graph-to-Task Compiler deterministic.

6. Finish remaining canonical-graph / relation-loss cleanup
   including W105 if still present in the active implementation branch.

7. Run the planned second-perspective review on H1, H2, and H3.
   Preserve their prior closure evidence while deliberately attacking them again
   from a different review/failure perspective.

8. If H1/H2/H3 second review finds a real issue:
      reproduce → fix → regression test → independent re-review → close again.

9. Continue current H4 implementation and experiments.

10. H4 must prove real Kernel crash/replay/reconstruction safety.

11. Add Provider Budget Guard / Safe Handoff first as a working design
    and failure-injection test target.

12. Test:
      context exhaustion
      token budget low
      quota loss
      provider death
      safe handoff
      stale-worker return
      cross-provider resume

13. Reuse H4 Recovery Barrier primitives for planned Safe Handoff.

14. Independent review after blocker fixes.

15. After Spike/Kernel foundation is credible:
      small real project
      ↓
      medium real project
      ↓
      larger project
      ↓
      high-concurrency stress

14. Only runtime evidence can justify freezing more Kernel/production law.
```

---

# 26. CURRENT SIMPLE ARCHITECTURE TO REMEMBER

```text
UNDERSTAND USER INTENT
        ↓
PRESERVE SOURCE INTENT
        ↓
NORMAL
        ↓
SMART
        ↓
ULTRA
        ↓
ULTRA-PRO
        ↓
CANONICAL URG
        ↓
COMPILE TASK CONTRACTS
        ↓
ORCHESTRATE + SMART DÉCALAGE
        ↓
ASSIGN TEMPORARY AUTHORITY
        ↓
MONITOR RUNTIME + PROVIDER CAPACITY
        ↓
KERNEL ENFORCES
        ↓
HARNESS EXECUTES
        ↓
SAFE CHECKPOINT / HANDOFF WHEN REQUIRED
        ↓
EVIDENCE
        ↓
VERIFY
        ↓
INTEGRATE
        ↓
PROJECT TRUTH
        ↓
FEEDBACK / GRAPH UPDATE / RECOMPILE
```

---

# 27. FINAL PRINCIPLES

```text
DVL owns Project Truth.

Task → Assignment → Worker.

Worker can die. Work survives.

Provider budget can die. Project work must survive.

Preserve work ≠ preserve authority.

Source intent is preserved.

Depth may increase. Intent may not drift.

Ultra discovers hidden execution-relevant relations.

Ultra-Pro attacks the Ultra result.

URG stores current discovered canonical relations.

Visual graph is a projection.

Compiler projects URG into Task Contracts.

Compiler does not grant authority.

Graph ≠ Orchestrator.

Orchestrator ≠ Kernel.

Kernel ≠ Harness.

Dispatch ≠ permission.

Execution success ≠ Verification PASS.

Verification PASS ≠ Integration.

Worker claim ≠ Evidence.

Activity shows motion.

Evidence proves outcome.

Safe stop ≠ PASS.

Checkpoint ≠ Project Truth.

Handoff ≠ authority transfer without a new Assignment.

Old Worker after reassignment = stale.

Unknown non-idempotent outcome ≠ permission to rerun.

Only Integration changes official Project Truth.

The user should not manage internal complexity.

DVL must expose meaningful reality, not fake certainty.
```

---

# 28. MASTER STATE STATUS — 2026-10-08

```text
Product Baseline:
LOCKED

Core Stable Contract v0.3.2:
FROZEN FOR SPIKE

Input → Normal → Smart → Ultra → Ultra-Pro direction:
WORKING / PRESERVED

Canonical URG:
WORKING / STRONG / NOT FINAL

Graph-to-Task Compiler:
WORKING / STRONG
Latest preserved experiment: 100 edges → 100 tasks
Explicit consumers: YES
Terminal tasks in preserved experiment: 41

Separate Semantic Layer:
RETIRED / DO NOT ADD

Smart Orchestrator:
WORKING ARCHITECTURE

Smart Décalage:
WORKING ARCHITECTURE

Kernel:
LAW / ENFORCEMENT BOUNDARY
FINAL LAW NOT YET FROZEN

Harness:
EXECUTION BOUNDARY

Evidence → Verification → Integration:
CORE DIRECTION PRESERVED

Recovery Barrier:
CORE DIRECTION PRESERVED

H1:
CLOSED FIRST PASS / RE-OPENED FOR SECOND-PERSPECTIVE REVIEW

H2:
CLOSED FIRST PASS / RE-OPENED FOR SECOND-PERSPECTIVE REVIEW

H3:
CLOSED FIRST PASS / RE-OPENED FOR SECOND-PERSPECTIVE REVIEW

H4:
STARTED / IN PROGRESS / NOT CLOSED

Provider Budget Guard / Safe Handoff:
NEW WORKING ADDITION
NOT FROZEN
MUST BE TESTED

Production Readiness:
NOT CLAIMED
```

---

# 29. SOURCE / AUTHORITY NOTES

This update consolidates project state from these existing DVL resources:

- `DVL_MASTER_PROJECT_STATE_V1_AR.md`
- `DVL_MASTER_PROJECT_STATE_V1_EN.md`
- `DVL_CORE_STABLE_CONTRACT_FINAL_V0_3_2_FROZEN_FOR_SPIKE.md`
- `DVL_MASTER_STATE_RESUME_2026-10-06.md`
- `DVL_INPUT_TO_EXECUTION_PIPELINE_V0_1.md`
- `DVL_ARCHITECTURE_CONSOLIDATION_V1_SEMANTIC_V1_TO_V7(1).md`
- `DVL_RESEARCH_SKILLS_AUDIT_TESTING_HARNESS_2026-10-07.md`
- `ZHILIN_YANG_DYNAMIC_GRAPH_MECHANISM_DEEP_RESEARCH.md`
- `GAGAN_BHAT_ANTHROPIC_MANAGED_AGENTS_RESEARCH_STATE.md`
- historical `H1-solved.txt`
- current 2026-10-08 project update from the user: H4 has been started and is not yet closed.

Conflict rule:

> When an older checkpoint conflicts with a newer evidence-backed checkpoint, use the newer checkpoint.  
> When a newer statement lacks implementation evidence, preserve it as current working state without pretending the missing evidence exists.

---

# 30. RESUME POINT

When DVL work resumes from this file, the immediate technical frontier is:

# **Second-perspective review of H1–H3 + H4 crash/replay/reconstruction + Provider Budget Guard / Safe Handoff integration**

Do not restart from product ideation.

Do not reopen the Frozen Contract by prose alone.

Do not add a new semantic subsystem.

Do not confuse compiler correctness with execution safety.

Do not treat a safe checkpoint as Project Truth.

Do not wait for Provider exhaustion if DVL can safely predict and hand off before failure.

**Current mission: prove that DVL can preserve work, revoke stale authority, recover or hand off safely, and continue from durable current truth.**
