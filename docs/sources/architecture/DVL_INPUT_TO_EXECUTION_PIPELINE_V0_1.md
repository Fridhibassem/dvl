# DVL — Input → Execution-Ready Project Pipeline
## Architecture Note v0.1 — Working / Not Frozen

**Purpose:** Preserve the current mechanism for later DVL implementation. This is an architecture note, not a claim that the mechanism is already built or validated.

## 1. Core idea

DVL should accept the user's project in the form the user naturally has it: a short idea, a detailed prompt, an existing plan, project files/repository, or supporting artifacts.

The user should not need to manually create DVL's internal planning and graph layers.

DVL transforms the input progressively while preserving the original user intent:

```text
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

The deeper layers add understanding and execution structure. They must not silently replace the user's original product intent.

---

## 2. Input layer

Possible inputs include:

- a simple idea;
- a normal prompt;
- an existing `PLAN.md`;
- an existing repository/folder;
- requirements/specification files;
- project artifacts supplied by the user.

First action: preserve an immutable/versioned **Source Intent Baseline**. This is the reference used to detect intent drift later.

If the user's input changes, create a new project-intent version rather than silently rewriting the original baseline.

---

## 3. Normal layer

### Normal Plan

Human-readable statement of what the user actually requested:

- goal;
- actors/users;
- explicit features;
- explicit constraints;
- explicit acceptance expectations;
- explicit decisions already made by the user.

It should avoid unnecessary architecture invention.

### Normal Graph

Represents the explicit structure already present in the input:

- feature → feature;
- actor → action;
- component → component;
- explicit dependencies;
- explicit inputs/outputs;
- explicit constraints.

Purpose: establish traceable project structure without deep inference.

---

## 4. Smart layer

Smart enriches the Normal layer conservatively.

### Smart Plan

Adds directly implied structure such as:

- stable entities and IDs;
- direct dependencies;
- inputs and outputs;
- output consumers;
- interfaces/contracts;
- direct invariants;
- missing explicit decisions/questions;
- acceptance structure;
- provenance back to the Normal requirement.

Rule:

> Smart asks: **What is directly implied by what the user requested?**

### Smart Graph

Turns those direct relations into machine-usable project relations while retaining lineage to the Normal layer.

Smart must preserve Normal:

```text
NORMAL INTENT ⊆ SMART UNDERSTANDING
```

Depth may increase. Intent may not drift.

---

## 5. Ultra layer

Ultra recursively searches for execution-relevant relations that are real in the software/project but were not explicit at the first levels.

It reasons across:

- data flow;
- control flow;
- state transitions;
- resources;
- concurrency;
- failure/recovery;
- integration;
- output consumers;
- cross-layer effects;
- external effects;
- verification/invalidation.

Recursive pattern:

```text
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

Ultra can discover **missing work**, not only ordering between existing tasks.

Ultra does not invent software logic. The relationships already exist in the intended system; Ultra attempts to expose enough of them before execution that they do not have to be discovered later through failure and rework.

---

## 6. Ultra-Pro layer

Ultra-Pro attacks the Ultra result itself.

It asks, among other things:

- What relation did Ultra miss?
- What assumption is being treated as fact?
- What happens under concurrency?
- What happens after crash/retry/recovery?
- What happens when external systems are delayed or contradictory?
- What happens when resources disappear?
- Is a proposed invariant actually enforceable?
- Does a fix create a new consequence?
- Is there a missing actor, timer, consumer, resource, transition, gate, or task?

High-risk hypotheses can be experimentally checked before implementation where practical.

Ultra-Pro stops when another recursion yields no execution-relevant change to tasks, dependencies, ordering, WAIT/HOLD state, resources/conflicts, invariants, evidence, consumers, or execution consequences.

This is a practical stopping condition, not a claim of perfect unknown-unknown coverage.

---

## 7. Canonical graph / URG

After discovery and validation, execution-relevant relations belong in the canonical graph rather than in multiple competing sources of truth.

Each important relation should be traceable, for example:

```text
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

Typical relation families can include dependency, prerequisite, produces/consumes, affects, resource use, conflicts, serialization, safe parallelism, gates, verification, invalidation, external effects and others defined by the final DVL relation contract.

**Important:** the graph is not a decorative diagram. A relation is valuable when it can affect execution, verification, integration, or project truth.

---

## 8. Compiler

The Graph-to-Task Compiler is **deterministic projection**, not another reasoning agent.

It consumes the canonical graph and produces execution-ready task contracts.

It must not silently invent, rename, merge, regroup or delete canonical project meaning.

A task contract can contain:

- task ID and WHY;
- dependencies;
- inputs;
- outputs;
- consumers;
- resources;
- conflicts;
- parallel/sequential relations;
- WAIT/HOLD conditions;
- human/external gates;
- invariants;
- acceptance criteria;
- required evidence;
- unlocks;
- relation IDs and roles;
- invalidation/re-evaluation triggers;
- requested authority/scope.

Possible runtime states include:

```text
GO / READY
WAIT
HOLD
ASK_USER
BLOCK
RUNNING
CLAIMED_DONE
VERIFIED
FAILED
```

Compiler output is a projection of project truth, not a second canonical truth.

---

## 9. Orchestrator + Smart Décalage

The Orchestrator does not simply start every task that exists.

It continuously asks:

- Which tasks are actually ready?
- Which can safely run together?
- Which worker/provider should receive each assignment?
- Which tasks must wait for dependencies?
- Which resources collide?
- Which work waits for verification?
- Which human/external gates are unresolved?
- Which previous assignments became stale after project change?

Smart Décalage delays work because of **state**, not arbitrary sleep timers.

Examples:

- prerequisite not ready;
- resource locked;
- conflicting external operation;
- verification backlog;
- authority unavailable;
- project decision changed;
- environment unavailable;
- recovery in progress;
- unresolved high-risk condition.

Goal:

> **Maximum safe useful concurrency — not maximum worker count.**

---

## 10. Large-project behavior

A project may eventually contain 5,000 or 10,000 tasks. That must never mean 5,000 or 10,000 workers are started.

Example:

```text
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
only the safe/useful subset is dispatched
```

DVL should maintain control of **project state**, not try to keep every task active.

Large graph support must eventually be validated for incremental graph updates, compiler latency, scheduler latency, event-store pressure, memory, resource locks, backpressure and crash recovery. 5k/10k scale is a target until benchmarked; it is not yet a proven capability.

---

## 11. Runtime discovery and controlled failure

Pre-execution discovery will never be perfect.

If execution reveals an undeclared resource, relation, conflict or invalid assumption:

```text
Runtime observation
      ↓
Kernel/Harness detects evidence
      ↓
affected action/work is controlled or held
      ↓
evidence enters project state
      ↓
canonical graph is updated by the appropriate reasoning/control path
      ↓
compiler reprojects affected tasks
      ↓
orchestrator re-evaluates affected assignments
      ↓
execution continues safely where possible
```

The compiler itself should not reason about and mutate the canonical graph.

Desired property:

> **Failure becomes controlled project state instead of project chaos.**

Examples:

- worker dies → assignment can be revoked/reassigned;
- task fails → affected work is re-evaluated, not blindly restart everything;
- resource conflict → hold/serialize/reassign;
- requirement changes → invalidate the affected region;
- verification fails → targeted rework;
- new relation appears → update graph and re-evaluate affected work.

---

## 12. Kernel boundary

The graph, compiler and orchestrator do not grant execution authority.

The Kernel remains the law/enforcement boundary.

```text
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

---

## 13. Intent-preservation law

Every deeper transformation must remain traceable to the original intent.

```text
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

If deeper analysis finds a necessary condition that conflicts with the user's accepted baseline, DVL must not silently redefine the product. It should surface the conflict and, where required, `ASK_USER`.

Golden principle:

> **Depth may increase. Intent may not drift.**

---

## 14. Mechanism in one sentence

> DVL takes the user's natural project input, preserves its original intent, progressively discovers and validates the project's execution-relevant relation structure, compiles that structure into traceable task contracts, schedules only safe useful work, enforces actions through the Kernel, and feeds runtime evidence back into the project graph so the system can remain in control as the project changes or fails.

---

## 15. Status / non-claims

This document captures the intended architecture direction for later implementation.

It does **not** claim that:

- DVL is already built;
- Ultra discovers every possible relation;
- 5k/10k tasks are already proven;
- long autonomous runs are already reliable;
- Kernel H1–H4 are solved;
- graph/compiler correctness alone guarantees application correctness.

Those require implementation and real tests.

---

**Working architecture note — preserve for later consolidation into the DVL master architecture and final Kernel/runtime contracts.**
