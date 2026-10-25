# DVL — FULL RESUME / MASTER HANDOFF
**Date:** 2026-10-12  
**Status:** Working project resume / handoff. **NOT a new frozen architecture.**  
**Purpose:** Preserve the current DVL state, the architecture already established, the V-Next test baseline, and the latest independent Codex + Claude adversarial findings without silently accepting their proposals.

---

## 0. NON-NEGOTIABLE SOURCE RULE

For DVL architecture work:

- Do **not** invent, infer, simplify, rename, redesign, or fill gaps as if they were accepted architecture.
- Use what is explicitly established in DVL sources and explicit user decisions.
- If sources conflict, expose the conflict; do not resolve it silently.
- Missing = **NOT DEFINED IN SOURCES**.
- Claude/Codex findings and corrections remain **PROPOSALS / TEST FINDINGS** until explicitly accepted.
- Simulation/model-check evidence is not physical implementation evidence.
- The invalid assistant-created V2 architecture must not be used as canonical architecture.

---

# 1. DVL PRODUCT

**DVL Code 😈** is a local desktop coding-agent product with a Dynamic Project Environment.

Core product direction:
- Open a local folder / Git project.
- Read/write project files.
- Terminal, tests, build, dev server, preview, chat, uploads.
- Multiple providers can be used with role separation where possible.
- Dynamic project rooms include Meeting/Chat, Live Tasks, Design, and URL Live / Live Product.
- DVL is not a legal/company-management system; the “company” analogy describes coordinated specialist work.

Internal terminology preference: **Workers**, not subagents.

---

# 2. CENTRAL DVL ARCHITECTURE — PRESERVED

The central architecture has **not been replaced** by V-Next, Codex, or Claude.

```text
USER INPUT / PROJECT
        ↓
SOURCE INTENT BASELINE
        ↓
P/N — NORMAL PLAN + NORMAL GRAPH
        ↓
P/S — SMART PLAN + SMART GRAPH
        ↓
P/UL — ULTRA PLAN + ULTRA GRAPH
        ↓
P/ULTPR — ULTRA-PRO RE-AUDIT / DEEP GRAPH
        ↓
CANONICAL URG — ULTRA RELATION GRAPH
        ↓
DETERMINISTIC GRAPH-TO-TASK COMPILER
        ↓
EXECUTION-READY TASK CONTRACTS
        ↓
SMART ORCHESTRATOR + SMART DÉCALAGE
        ↓
TASK → ASSIGNMENT → WORKER → PROVIDER/RUNTIME
        ↓
KERNEL-CONTROLLED ACTION REQUESTS
        ↓
HARNESS / WORKSPACE / TOOLS / RUNTIME
        ↓
CANDIDATE + EVIDENCE
        ↓
REQUIRED REVIEW / SECURITY CONTROLS
        ↓
VERIFICATION
        ↓
INTEGRATION
        ↓
PROJECT TRUTH
        ↓
MODULE / RELEASE AUDIT
        ↓
FINDINGS → FIX WORK THROUGH NORMAL DVL PIPELINE
        ↓
RUNTIME / AUDIT FEEDBACK
        ↺
AFFECTED UNDERSTANDING / URG / COMPILATION / EXECUTION RE-EVALUATION
```

The architecture is a feedback system, not a one-way pipeline.

---

# 3. FIXED UNDERSTANDING PIPELINE

The required order is:

```text
Normal → Smart → Ultra → Ultra-Pro
```

**Ultra and Ultra-Pro are not optional.**

Do not reintroduce an adaptive-depth architecture unless the user explicitly reopens that decision.

### P/N — Project / Normal
Captures what the user explicitly asked for: goal, actors/users, explicit features, constraints, acceptance expectations, and accepted decisions. It should not invent unnecessary architecture.

### P/S — Project / Smart
Finds directly implied structure: stable entities/IDs, dependencies, inputs/outputs, consumers, interfaces/contracts, direct invariants, missing decisions/questions, acceptance structure, and provenance.

Question: **What is directly implied by what the user requested?**

### P/UL — Project / Ultra
Recursively searches hidden execution-relevant relations: data, control, state, resources, concurrency, failure/recovery, integration, output consumers, cross-layer relations, external effects, verification, invalidation, etc.

### P/ULTPR — Project / Ultra-Pro
Attacks the Ultra understanding for missed relations, assumptions, crash/retry behavior, concurrency, external delays, disappearing resources, fix-induced consequences, missing actors/timers/consumers/resources/transitions/gates/tasks, and enforceability.

### Central intent law

> **Depth may increase. User intent may not drift.**

The purpose of all four passes is:

> **Keep the product the user actually asked for while progressively discovering the relations required to build it correctly.**

Lineage:

```text
SOURCE INTENT
→ NORMAL
→ SMART
→ ULTRA
→ ULTRA-PRO
→ URG RELATION
→ TASK
→ OUTPUT + EVIDENCE
```

Lineage alone does not necessarily prove semantic agreement; this has become an active adversarial-test area.

---

# 4. URG — ULTRA RELATION GRAPH

URG is the canonical machine graph of all **currently discovered execution-relevant relations**.

“Currently discovered” does not mean omniscient.

Examples of relation families:

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

Truth separation:

```text
URG / machine graph = canonical relation truth
Visual Ultra Graph = human-readable projection
Compiled Task Contracts = execution projection
```

URG is **not** Project Truth.

Runtime observations cannot directly become graph truth merely because a Worker/provider asserted them. A proposal must go through DVL validation/control before authoritative graph update.

---

# 5. DETERMINISTIC GRAPH-TO-TASK COMPILER

The Compiler is a deterministic projection mechanism, **not another reasoning brain**.

Core laws:
- No relation loss.
- No silent invention/rename/merge/regroup/delete of meaning.
- Every compiled execution relation traces back to URG.
- Task Contracts carry execution-relevant relations.
- Outputs identify consumers or terminal status.
- GO / WAIT / HOLD / ASK / BLOCK are dynamic execution states.
- Task files/contracts are projections, not a second source of truth.
- Compiler output does not grant authority.

Task Contract direction includes:
- Task identity / why
- dependencies
- inputs / outputs / consumers
- resources / conflicts
- parallel/sequential constraints
- WAIT/HOLD/gates
- invariants
- acceptance
- evidence requirements
- unlocks
- relation IDs
- invalidation triggers
- requested authority

---

# 6. TASK → ASSIGNMENT → WORKER

Canonical execution model:

```text
Task → Assignment → Worker → Provider/runtime
```

- **Task** = durable work.
- **Assignment** = temporary/revocable authority/lease.
- **Worker** = temporary executor.
- Worker may die; work survives.
- Preserve work ≠ preserve authority.
- A recovered/stale Worker does not regain authority merely because it still has local state or a surviving process.

---

# 7. SMART ORCHESTRATOR + SMART DÉCALAGE

The Orchestrator coordinates readiness, assignments, safe parallelism, waits, verification, human/external gates, stale assignment re-evaluation, and resource-aware execution.

Goal:

> **Maximum safe useful concurrency — not maximum Worker count.**

Smart Décalage is state-driven flow control:

> **Delay by state, not arbitrary timer.**

It handles dependency waits, resource contention, verification backlog, decisions, unavailable environments, authority, recovery, risk, provider/context pressure, admission/backpressure, yielding, anti-starvation/thrashing, and bounded HOLD pressure.

Neither Orchestrator nor Décalage grants Kernel authority.

---

# 8. KERNEL + HARNESS

## Kernel
Kernel is the law/enforcement layer, not planner, graph, compiler, provider, reviewer, or orchestrator.

It owns/enforces the DVL-controlled boundaries around:
- identity
- Assignment authority
- scope
- stale fencing
- isolation
- action classification
- durable event truth
- security policy
- execution constraints
- evidence authority
- integration prerequisites

Conceptual decision:

```text
ALLOW / BLOCK / ASK_USER
```

Kernel ALLOW and execution success are separate facts.

## Harness
Harness is the execution engine around provider/runtime work:
- provider adapter
- context/tool loop
- filesystem/terminal/tests/dev server/browser/DB/MCP
- process supervision
- sandboxing
- usage/budget observation
- safe stop/checkpoints
- evidence capture

Official workspace changes become Project Truth only through Integration.

---

# 9. EVIDENCE → VERIFICATION → INTEGRATION

Evidence can include diffs, command outputs, tests/builds, migrations, screenshots/browser/runtime evidence, security scans, artifacts, and human acceptance.

Worker claim ≠ evidence.

LLM review may find problems and support FAIL/INSUFFICIENT, but provider prose alone is not authoritative PASS.

Critical invariant:

```text
Worker FINISHED
≠ Verification PASS
≠ Integration
≠ Project Truth
```

Only Integration changes Project Truth, after current-truth revalidation.

---

# 10. REVIEW / SECURITY / AUDIT — CURRENT ARCHITECTURE FRONTIER

Review, Security, and Audit are being made native to the existing DVL architecture.

They are **not a second brain** and do not replace the core pipeline.

Risk/control direction:

```text
Task
 ↓
What family is it?
 ↓
Does it carry a risk indicator?
 ↓
What risk level?
 ↓
What control is required?
```

Possible control result:
- normal execution
- review
- security
- stronger verification
- audit / stop

Risky producer direction:

```text
Producer implementation
→ required Review / Security controls
→ Verification
→ PASS
→ affected consumers can proceed
```

Unrelated work should continue where safe.

Audit levels:

```text
Task controls
Module audit
Full-product / release audit
```

Audit finding direction:

```text
Finding
→ Fix Task
→ normal DVL pipeline
→ Evidence
→ Verification
→ Integration
→ re-audit where required
```

The Review/Security/Audit source remains a **new architecture direction / not final frozen law** unless explicitly frozen later.

---

# 11. RECOVERY

Recovery Barrier direction:

```text
BOOT
→ RECOVERY MODE
→ load durable Project Truth
→ replay Kernel state
→ discover workspaces/processes
→ reconcile
→ revalidate Assignments/authority
→ EXECUTION ENABLED
```

Mutation/effect states include direction such as:

```text
PREPARED
STARTED
OUTCOME_CONFIRMED
OUTCOME_UNKNOWN
```

Unknown non-idempotent effects must not be blindly rerun.

After restart, stale processes/Workers/Assignments/ambiguous effects must not silently become authority or truth.

---

# 12. PROVIDER TOKEN / CONTEXT SAFE HANDOFF

Current working mechanism, not frozen Kernel law:

```text
GREEN
→ AMBER
→ RED
→ SAFE BOUNDARY
→ CHECKPOINT + EVIDENCE + STATE FLUSH
→ REVOKE / HIBERNATE / STOP
→ REASSIGN / RESUME
```

Provider/context truth states:

```text
REPORTED
ESTIMATED
UNKNOWN
```

Do not invent precision where the provider does not expose it.

Safe stop preserves work; it does not verify, integrate, or create Project Truth.

No fixed simulation threshold such as 0.35 becomes law without explicit acceptance/physical evidence.

---

# 13. HIGH-CONCURRENCY POSITION

Large logical Task counts do not mean equally large live Worker counts.

Example direction:

```text
10,000 logical Tasks
→ structurally ready subset
→ conflict filtering
→ verification/gate waits
→ host/provider/runtime budget
→ safe useful subset dispatched
```

Target machine for current physical work: **Mac with 8 GB RAM**.

400–500 logical/high-load simulation work must not be presented as proof that 400–500 physical Workers can run simultaneously on that machine.

---

# 14. H1–H4 STATUS

## H1 — CLOSED
Established spike work includes identity/fencing/crash cleanup and associated tests.

## H2 — CLOSED
Spool isolation, metadata/index, large-output handling, draining, diagnostics, stale attribution, quarantine, traversal/symlink/non-clobber hardening, etc.

## H3 — CLOSED
Queue/Safety-Halt hardening and related work.

## H4 — CLOSED ON macOS
Physical macOS evidence reached 304/304 PASS in the established H4 scope.

Important limits:
- This does not close Windows/Linux physical enforcement.
- It does not establish OS/power-loss durability in every dimension.
- It does not certify every provider.
- It does not establish production readiness.
- New architecture-level boundary findings must not be falsely described as proof that the closed H4 implementation exhibited those bugs unless specifically demonstrated.

---

# 15. V-NEXT — WHAT IT IS

`DVL_ARCHITECTURE_VNEXT_RECONCILIATION_2026-10-12.md` was created as a **reconciled architecture candidate for adversarial re-test**, not as frozen DVL law.

It preserved the central DVL architecture and collected candidate hardening ideas from earlier Claude/Codex attacks.

Its candidate set was labelled R1–R20 and covered areas including:
- intent contradiction guard
- partition seam handling
- scoped/additive delta understanding
- accepted URG delta recompilation
- stable Task meaning vs contract revision
- graph-preserving split
- resource-edge authority
- live-process host accounting
- immutable/verified recovery
- write-ahead effect identity
- controlled egress
- capacity uncertainty
- wait/fit/split
- evidence lifecycle correction
- freshness binding
- consumer risk propagation
- effect-aware replay
- reviewer independence
- generated security evidence
- audit finding identity/freshness

**None of R1–R20 became law merely by appearing in V-Next.**

---

# 16. CODEX V-NEXT ADVERSARIAL RE-TEST — LATEST CODEX RESULT

Codex tested V-Next and preserved the fixed pipeline. Its report explicitly said no correction was frozen.

Reported result rows:
- PASS: 59
- FAIL: 7 rows
- INCONCLUSIVE: 8
- REQUIRES PHYSICAL RUNTIME TEST: 11

Codex identified **six specification-boundary findings**:

## Codex VN-F01 — accepted graph delta vs contract publication race
A material URG change can become accepted before the affected old Task Contract is fenced. During that interval an old Assignment may still commit.

Codex proposal: accepted material delta should make affected contracts pending/stale before old authority can commit; compiled publication must be ordered/compared against graph revision. Unrelated work remains runnable.

**Status: CODEX FINDING / PROPOSAL — NOT ACCEPTED LAW.**

## Codex VN-F02 — effect identity can be lost across Task split
An external effect may already be STARTED/ambiguous under parent Task P. If P is split into child C and journal identity is Task-derived, C may appear to have no prior effect and resend it.

Codex proposal: stable logical-effect lineage independent of Task replacement; split/recompile maps child occurrence to unresolved existing effect identity.

**Status: CODEX FINDING / PROPOSAL.**

## Codex VN-F03 — concurrent effect send claim race
Two authorized senders can both observe PREPARED and both send before either records STARTED.

Codex proposal: atomic PREPARED→STARTED claim for the logical effect before first send; recovery of STARTED remains reconcile/HOLD.

**Status: CODEX FINDING / PROPOSAL.**

## Codex VN-F04 — immutable checkpoint may still be incoherent
A checkpoint can hash correctly yet combine state copied from different transaction moments, e.g. A=0 and B=1 even though valid transaction boundaries require A=B.

Codex proposal: committed checkpoint must represent a consistent execution cut, not only immutable/hash-valid bytes.

**Status: CODEX FINDING / PROPOSAL.**

## Codex VN-F05 — authority identity ABA/reuse after crash
If an authority epoch/incarnation can be reused after crash, a stale survivor may present an identity equal to a newly current Assignment.

Codex proposal: durable non-reusable authority incarnation/Assignment identity before exposure; fail closed on ambiguous recovery.

This finding does **not** prove the closed H4 implementation actually reuses epochs.

**Status: CODEX FINDING / PROPOSAL.**

## Codex VN-F06 — stale capacity observation can erase newer exhaustion
A delayed optimistic provider-capacity observation can arrive after a newer exhaustion event and reopen admission, causing churn.

Codex proposal: order observations by provenance/epoch/causality and latch exhaustion until a qualified newer reset.

**Status: CODEX FINDING / PROPOSAL.**

### Codex candidate disposition
Codex reported bounded/model-level survival for R1, R8, R14, R16, R17, R18, R20; R2 and R19 remained inconclusive; several cross-owner candidates required modification due to VN-F01–F06.

Codex also reported BH-01 and BH-02 passing its stronger regression forms in that run.

### Codex final verdict
Another scoped architecture-correction round before treating the whole V-Next boundary contract as ready for implementation; focused physical feasibility spikes can proceed in parallel.

---

# 17. CLAUDE V-NEXT ADVERSARIAL RE-TEST — LATEST CLAUDE RESULT

Claude independently attacked V-Next using an extended Round-2 simulator/model suite.

Its headline verdict:

> **NEEDS ANOTHER ARCHITECTURE CORRECTION ROUND FIRST — a short one.**

Claude states:
- the **central architecture held**;
- **no new brain is needed**;
- several V-Next candidates fail as written or only fail in composition;
- implementing V-Next as written risks encoding wrong schemas/data models;
- results remain simulation/model/spec evidence, not production proof.

Reported test scope included:
- end-to-end projects of 10 / 44 / 130 / 182 logical Tasks;
- peak 5–6 physical Workers in its 8 GB model;
- 3 arms × 20 seeds;
- Round-2 regression suite;
- more than 1.8M interleavings in the stated suite;
- typed contradiction/seam attacks;
- graph/compiler delta attacks;
- BH-01 and BH-02;
- crash/effect models;
- composition attacks.

The four understanding stages were modeled as rule engines; real LLM recall was not proven.

---

# 18. CLAUDE VN-1 → VN-13 FINDINGS

## Claude VN-1 — decision representation / semantic contradiction
A simple allows/restricts guard missed numeric, temporal, permission, and mislabelled contradictions.

Claude proposal: accepted decisions represented as typed predicates where possible and checked against derived nodes/built product; inexpressible consequential ambiguity → scoped ASK.

Risk: more ASK ceremony and real Ultra-Pro labelling quality remains unproven.

**Status: CLAUDE PROPOSAL.**

## Claude VN-2 — BLOCK can leave resource leases held
A Task can become BLOCKed after runtime graph/cycle change while its Assignment/lease remains held, starving unrelated Tasks sharing the resource.

Claude proposal: BLOCK revokes affected Assignment and releases leases while work survives at last safe checkpoint.

**Status: CLAUDE PROPOSAL.**

## Claude VN-3 — cycle/delta affected-set incompleteness
Local/source-only recompilation can miss cycles passing through Tasks outside the local set and leave target/consumer contracts stale.

Claude proposal: global/incremental reachability cycle check on accepted delta and include relevant source + target/contracts in affected projection.

**Status: CLAUDE PROPOSAL.**

## Claude VN-4 — Task identity unstable if based on reworded meaning
A full understanding rerun can reword semantically identical nodes and accidentally re-key/retire Tasks, orphaning Assignments/checkpoints/journal references.

Claude proposal: persistent Task/node identity minted once at acceptance; contract version separate; re-derived nodes matched before acceptance.

Risk: incorrect matching can merge different meanings.

**Status: CLAUDE PROPOSAL.**

## Claude VN-5 — checkpoint freshness basis taken too late
A Task can resume from content based on an older Project Decision but acquire freshness pins at finish under the new decision, making stale content appear current.

Claude proposal: decision/policy pins inherit from checkpoint/content lineage rather than being silently retaken at finish.

**Status: CLAUDE PROPOSAL.**

## Claude VN-6 — effect identity lost across split
Same family as Codex VN-F02: effect intent under a parent Task can be duplicated after graph-preserving split if the child receives a new Task-derived key.

Claude proposal: effect journal identity follows URG effect lineage + declared effect meaning through splits.

**Status: CLAUDE PROPOSAL.**

## Claude VN-7 — egress safety can create needless HOLD flood
With durable authority, gateway blocks/stops many stale sends, but journal state may be unable to distinguish “never forwarded” from “possibly sent”, causing unnecessary HOLDs.

Claude proposal: durable gateway record that proves a blocked request never left before refusal/forwarding boundary, while ambiguous post-forward crash remains reconcile/HOLD.

**Status: CLAUDE PROPOSAL.**

## Claude VN-8 — revocation alone does not fence every non-workspace resource
Open DB sessions, ports, browser profiles, caches, detached/double-fork children may survive revocation/process-group assumptions.

Claude proposal: per-resource-class fencing/namespace/reclamation rules; physical validation required.

**Status: CLAUDE PROPOSAL / PHYSICAL QUESTION.**

## Claude VN-9 — BH-01 needs stronger atomic evidence semantics
Separating validation from usage is insufficient if Integration checks validity and commits non-atomically, if usage becomes authority, or if corrupted bytes can be revalidated under the same identity.

Claude proposal: content-addressed Evidence ID, atomic validity comparison with Integration commit, corruption terminal for that ID, usage never grants eligibility.

**Status: CLAUDE PROPOSAL.**

## Claude VN-10 — BH-02 replay classification must be observed, not Worker-declared
Worker-declared effect class can reproduce label-based replay mistakes. Even observed classification can miss unmediated network effects.

Claude proposal: Harness-observed effects, fresh equivalent environment for state-mutating replay, network effects held to effect policy; real egress containment required to close physical completeness.

**Status: CLAUDE PROPOSAL.**

## Claude VN-11 — partition seam recall remains fidelity-dependent
Summary-based seam passes recover only part of hidden cross-module semantic relations when summary fidelity drops.

Claude proposal: deterministic joins for canonical resource names and treat unexported/unknown interfaces as unknown rather than absent; semantic seam recall remains a real reasoning-quality question.

**Status: CLAUDE PROPOSAL / INCONCLUSIVE SEMANTIC QUALITY.**

## Claude VN-12 — generic external-effect reconciliation is insufficient
Package publish, deploy, cloud creation, etc. need effect-specific reconciliation semantics. “Lookup” alone may misclassify half-applied or already-published outcomes.

Claude proposal: per-effect-class reconciliation contracts; unsupported external systems remain HOLD rather than guessed.

**Status: CLAUDE PROPOSAL.**

## Claude VN-13 — HOLD without owner can become permanent silent deadlock
An effect can enter an unresolved HOLD state through a non-recovery path without a reconcile owner or ASK.

Claude proposal: unresolved HOLD names an owner and creates scoped escalation/ASK where required.

**Status: CLAUDE PROPOSAL.**

---

# 19. CLAUDE BH-01 RESULT

Claude's stronger model says BH-01 is **not fully closed by a weak interpretation of R14**.

Observed model direction:
- exclusive `CONSUMED` replacing `VALIDATED` = original bug;
- accepting CONSUMED as valid = unsafe;
- orthogonal validation/usage but non-atomic Integration check/commit = unsafe;
- usage treated as authority = unsafe;
- corrupted bytes revalidated under same identity = unsafe;
- atomic validity compare at commit = safe in model;
- atomic + content-addressed identity = safe in model.

Claude verdict:

> PASS **with modification** in the model; not fully closed by R14 as written.

**No modification is accepted into DVL yet.**

---

# 20. CLAUDE BH-02 RESULT

Claude says BH-02 is closed **in principle**, but physical completeness remains open.

Key lesson:
- replay classification cannot be trusted merely because the Worker declares an effect class;
- Harness observation is stronger;
- state-mutating verification may require fresh/hash-equivalent environment;
- network/external effects must remain under effect policy;
- unmediated sockets can still bypass the model unless real egress containment works.

Claude verdict:

> PASS with modification in simulation; physical egress containment still requires runtime testing.

**Not frozen.**

---

# 21. CLAUDE COMPOSITION FINDINGS

Claude explicitly tested requested combinations. Important failures included:

1. **Decision change + stale evidence + handoff/rebase** → stale candidate can integrate if checkpoint basis pins are retaken too late.
2. **Provider exhaustion + Task split + runtime URG update + effect already sent** → duplicate effect if effect identity follows Task replacement.
3. **Audit fix + cycle + provider outage** → BLOCKed lease holder can starve unrelated resource work.
4. **Kernel restart + ambiguous effect + stale Worker return** → durable authority closes stale return, but missing “never forwarded” proof creates excessive HOLDs.
5. **Checkpoint recovery + rebase + changed decision** → same freshness-basis problem.

Other combinations held in Claude's model or remained inconclusive due to seam/semantic recall.

---

# 22. CODEX ↔ CLAUDE — CLEAR OVERLAP

This section records overlap only; it does **not** accept the proposed fixes.

## Strong overlap A — external effect identity across Task split
- Codex VN-F02
- Claude VN-6

Both independently expose the same boundary family: Task topology/identity can change while the business effect must remain the same durable occurrence.

## Strong overlap B — external-effect send/reconciliation boundary
- Codex VN-F03: atomic claim race before send.
- Claude VN-7: need proof of “never forwarded” to avoid unnecessary HOLD.
- Claude VN-12: reconciliation semantics differ by effect class.
- Claude VN-13: unresolved HOLD needs an owner/escalation.

These are related but not identical subproblems.

## Strong overlap C — authority/recovery identity
- Codex VN-F05: ABA/reused authority incarnation after crash.
- Claude VN-7 includes durable epoch in its crash model.
- Claude VN-8 attacks resource classes where process/role revocation alone is insufficient.

Again: related boundary family, not identical finding.

## Strong overlap D — freshness/current-truth binding
- Codex VN-F01: accepted graph delta can outrun compiled/fenced contract publication.
- Claude VN-5: checkpoint content can inherit old decisions while pins are retaken under new decisions.
- Claude VN-9: evidence validity must still be current at Integration commit.

These attack different freshness dimensions around the same broad “current truth at commit” concern.

## Strong overlap E — capacity/handoff uncertainty
- Codex VN-F06: stale optimistic observation can erase exhaustion.
- Claude retains R12/R13 broadly but leaves provider signal semantics/physical behavior open.

Codex currently has the more explicit new failure in this family.

## Checkpoint/replay overlap
- Codex VN-F04: immutable/hash-valid snapshot can still be torn/incoherent.
- Claude VN-10/BH-02: replay correctness depends on equivalent starting environment.
- Claude VN-8 notes non-workspace state required to rebuild resource namespaces.

Codex's coherent-cut finding remains a distinct open candidate issue even if Claude's latest report did not reproduce it as the same named failure.

---

# 23. DIFFERENCES — DO NOT SILENTLY RECONCILE

Codex and Claude do **not** produce identical candidate dispositions.

Examples:
- Codex reported R14 survived its bounded BH-01 model; Claude's stronger interleaving model says R14 as written needs stronger atomic/content-addressed semantics.
- Codex reported R17 survived its BH-02 model; Claude says BH-02 passes only with observed classification/containment refinements and leaves physical completeness open.
- Claude finds explicit BLOCK/lease starvation, Task identity churn, seam-fidelity, effect-class reconciliation, and silent-HOLD ownership issues not expressed as the same Codex F01–F06 findings.
- Codex finds accepted-delta publication race, coherent-cut checkpoint issue, atomic send-claim race, authority ABA, and stale capacity-observation ordering as explicit boundary failures.

These differences must be tested/reconciled; they must **not** be automatically merged into frozen architecture.

---

# 24. CURRENT STATUS OF V-NEXT AFTER BOTH TESTS

The correct project state is:

```text
ESTABLISHED DVL CENTRAL ARCHITECTURE
        ↓
V-NEXT RECONCILIATION CANDIDATE (R1–R20)
        ↓
CODEX ADVERSARIAL RE-TEST
        ├─ VN-F01 … VN-F06
        └─ physical/inconclusive items
        ↓
CLAUDE ADVERSARIAL RE-TEST
        ├─ VN-1 … VN-13
        └─ physical/inconclusive items
```

**Nothing from Codex VN-F01–F06 or Claude VN-1–VN-13 has been accepted/frozen into DVL architecture yet.**

Both evaluators' high-level direction is compatible on one important point:
- the central architecture did not require replacement;
- no new “brain” was demonstrated as necessary;
- remaining failures are primarily boundary/data-model/composition obligations inside existing ownership areas;
- more architecture correction/reconciliation is needed before treating V-Next as an implementation baseline;
- selected physical feasibility work can run separately, but simulation cannot close physical questions.

---

# 25. PHYSICAL / RUNTIME QUESTIONS STILL OPEN

The combined evaluator reports keep the following classes open for real testing, especially on the real 8 GB Mac and real providers:

1. macOS egress containment: curl/raw sockets/DNS/SDK auto-retry/scanner uploads.
2. Resource-edge fencing and surviving DB/cache/port/browser sessions.
3. Detached/double-fork child containment and confirmed reclamation.
4. Real 8 GB RAM/CPU/process/tool profiles and OOM/jetsam behavior.
5. Coherent checkpoint + content-copy/hash/restore + fsync/power-loss behavior and cost.
6. Real provider capacity/context signals: REPORTED / ESTIMATED / UNKNOWN, quota/reset/retry behavior.
7. Cross-provider context/handoff fidelity.
8. External-effect reconciliation for payment/email/SMS/deploy/package publish/cloud mutation.
9. Real Normal/Smart/Ultra/Ultra-Pro recall, contradiction detection, seam fidelity, and re-derived identity matching on real repositories.
10. Durable writer / atomic publication / evidence-freshness commit latency.
11. Real security-control discrimination, false positives, malicious generated tests, and audit noise/coverage.
12. Windows/Linux physical enforcement later; macOS H4 closure does not generalize automatically.

---

# 26. WHAT IS NOT PROVEN

Do not claim any of the following from current evidence:

- Production readiness.
- V-Next frozen law.
- Codex/Claude proposals accepted.
- All external effects exactly-once.
- Complete semantic recall by P/S, P/UL, or P/ULTPR.
- Complete cross-module seam discovery.
- Real 8 GB Mac performance from simulations alone.
- Windows/Linux enforcement from macOS evidence.
- Real provider token/capacity fidelity from abstract models.
- Complete security/audit detection quality.
- That every H4 implementation path contains any newly modeled architecture bug.

---

# 27. NEXT DECISION POINT

The project is **not** at “rewrite the architecture.”

It is at:

```text
Preserve established DVL architecture
        ↓
Reconcile Codex VN-F01–F06
with Claude VN-1–VN-13
        ↓
Identify:
- same root cause
- complementary requirement
- evaluator disagreement
- source already covers it
- genuinely missing boundary
- physical-only question
        ↓
User explicitly decides what becomes candidate correction
        ↓
Re-test corrected candidate
        ↓
Only then consider freezing architecture changes
        ↓
Physical/runtime implementation tests
```

No evaluator proposal should skip the explicit user decision step.

---

# 28. SHORT HANDOFF FOR A NEW SESSION

If a new DVL session starts, begin from this state:

> DVL's central architecture remains Normal → Smart → Ultra → Ultra-Pro → URG → deterministic Compiler → Smart Orchestrator/Smart Décalage → Task → Assignment → Worker → Kernel/Harness → Evidence → Review/Security → Verification → Integration → Project Truth → Audit → Feedback. V-Next is a candidate hardening layer, not frozen law. Codex attacked it and reported VN-F01–F06. Claude independently attacked it and reported VN-1–VN-13. Both say the central architecture held and no new brain was demonstrated as necessary, but V-Next should not yet be treated as an implementation baseline. None of their proposed corrections is accepted automatically. The next architecture task is source-aware Codex↔Claude reconciliation, followed by explicit user decisions and another adversarial re-test. Physical tests remain separate and are required for OS/network/resource/provider/context/security claims.

---

# 29. IMPORTANT ARTIFACT STATUS

### Canonical / source architecture references
Use the established DVL source documents, including the source-reconstructed core and original pipeline/kernel/master-state documents, when exact canonical architecture is required.

### V-Next
`DVL_ARCHITECTURE_VNEXT_RECONCILIATION_2026-10-12.md`

Status: **candidate adversarial-test baseline, not frozen law.**

### Latest Codex adversarial result
`DVL V-Next adversarial re-test — 2026-10-12`

Status: **evaluator report; VN-F01–F06 are findings/proposals.**

### Latest Claude adversarial result
`DVL V-Next Adversarial Re-test — 12 Oct 2026`

Status: **evaluator report; VN-1–VN-13 are findings/proposals.**

### Invalid architecture artifact
`DVL_ARCHITECTURE_CURRENT_STATE_V2_2026-10-11.md`

Status: **INVALID / DO NOT USE AS DVL ARCHITECTURE.**

---

# END STATE

**Central DVL architecture: PRESERVED.**  
**H1/H2/H3: CLOSED.**  
**H4: CLOSED ON macOS within established scope.**  
**Review/Security/Audit: active architecture frontier, not fully frozen.**  
**V-Next: candidate only.**  
**Codex findings: not accepted law.**  
**Claude findings: not accepted law.**  
**Next architecture work: Codex ↔ Claude reconciliation, explicit decisions, re-test.**  
**Physical/runtime proof: still required for explicitly open areas.**
