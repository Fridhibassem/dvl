# DVL Architecture V-Next — Evidence Reconciliation Baseline

**Date:** 2026-10-12  
**Status:** RECONCILED ARCHITECTURE CANDIDATE FOR ADVERSARIAL RE-TEST — **NOT FROZEN KERNEL LAW**  
**Purpose:** consolidate only the preserved DVL architecture plus corrections supported by the supplied Claude / Claude Desktop / Round-2 / Codex findings. Simulation results are evidence, not production proof.

---

## 0. Non-negotiable preserved architecture

The understanding pipeline remains fixed and ordered:

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
INTEGRATION / CURRENT-TRUTH REVALIDATION
  ↓
PROJECT TRUTH
  ↓
MODULE / RELEASE AUDIT
  ↓
FINDINGS → FIX TASKS
  ↓
RUNTIME / AUDIT / DECISION FEEDBACK
  ↓
AFFECTED UNDERSTANDING → URG → RECOMPILE → RE-EVALUATE
```

**No adaptive or optional Ultra / Ultra-Pro.**  
**No new brain.**  
**Task → Assignment → Worker remains canonical.**  
**Only Integration changes Project Truth.**

Core separation remains:

```text
Graph understands relations.
Compiler projects relations into Task Contracts.
Orchestrator schedules and coordinates.
Smart Décalage controls state-driven timing / pressure.
Kernel authorizes, fences and enforces.
Harness executes and records evidence.
Review / Security inspect under required controls.
Verification judges authoritative evidence.
Integration revalidates against current truth.
Audit checks Task / Module / Release scope and returns findings to normal work.
```

---

## 1. Reconciliation rule

A finding is not promoted merely because an evaluator proposed it. V-Next distinguishes:

- **PRESERVED** — already part of DVL architecture/source direction.
- **RECONCILED CANDIDATE** — reproduced or independently reinforced and fits an existing owner without creating a second brain.
- **OPEN / PHYSICAL** — cannot be closed by simulation.
- **EXPERIMENTAL NUMBER** — threshold/cadence/RAM/token number that must not become law from simulation.

The two Codex contract findings BH-01/BH-02 are specification corrections. They do **not** establish implementation bugs.

---

## 2. Intent preservation and deep understanding

### 2.1 Golden law

> **Depth may increase. User intent may not drift.**

Lineage is necessary but not sufficient. A derived node can have perfect lineage and still contradict the accepted product meaning.

V-Next candidate rule:

```text
Derived relation / invariant / hardening
  ↓
Must retain source lineage
  AND
Must not contradict accepted decisions / acceptance constraints
  ↓
if contradiction or unresolved consequential ambiguity
  → REJECTED/PROPOSED relation + scoped ASK
  → affected scope waits
  → unrelated work continues
```

This incorporates the Round-2 N13 result. A lineage-only drift guard is insufficient.

### 2.2 Missing acceptance anchors

Claude Desktop round 1 proposed K2: derive acceptance examples for source capabilities that lack them, but do not silently turn them into Source Truth. Round-2 instead demonstrates contradiction checks where accepted decisions exist.

**Reconciled position:** generated acceptance/oracle material is **non-authoritative until accepted or independently grounded**. DVL may batch scoped clarification when consequential ambiguity prevents a safe decision. Do not mandate one ASK per module as law; that was a simulation policy.

### 2.3 Partitioned understanding / seams

Large projects may exceed one reasoning context. If P/UL or P/ULTPR is partitioned, cross-partition relations cannot be assumed discovered.

**Candidate:** P/ULTPR performs an explicit seam pass over partition interfaces, consumers, shared resources, decisions and invariants before URG finalization for that revision.

This preserves the fixed four-stage pipeline; it does not create another stage or brain.

### 2.4 Delta re-understanding

A runtime relation, audit finding, fix, or Project Decision change must not trigger blind replacement of the whole URG from a fresh non-deterministic pass.

**Candidate:** affected deltas re-enter the existing understanding machinery in scoped form; accepted existing relations remain until explicitly rejected/invalidated with provenance. Decision changes require deep delta re-analysis before older pinned candidates can integrate when relevance is not yet known.

Important: Round-2 specifically supports P/UL + P/ULTPR on a Project Decision delta. This is a **delta path**, not permission to skip the fixed four stages for initial project understanding.

---

## 3. URG lifecycle and Compiler boundary

URG remains canonical relation truth for currently discovered execution-relevant relations; it is not Project Truth.

### 3.1 Relation lifecycle

Runtime/provider assertions cannot directly rewrite canonical relations. Relations need stable identity, provenance and lifecycle such as proposed/accepted/rejected/invalidated where applicable.

### 3.2 Every accepted delta goes through Compiler

```text
Observation / Decision / Audit finding / Runtime proposal
  ↓
DVL validation / understanding
  ↓
URG accepted delta
  ↓
AFFECTED-SUBGRAPH COMPILATION
  ↓
cycle + conservation + contract checks
  ↓
Orchestrator re-evaluation
```

No direct `URG delta → mutate Task Contract` bypass. If the accepted delta closes an execution dependency cycle, affected work is BLOCKed and routed to scoped re-audit/decision handling rather than deadlocking silently.

### 3.3 Task identity versus contract version

Round-2 found downstream churn when Task IDs are content-addressed over mutable contract content.

**Candidate:** durable Task identity represents stable work meaning; contract revision/version changes separately. A material contract change fences/re-evaluates affected in-flight authority without unnecessarily re-keying unrelated/downstream Tasks.

Exact identity schema remains to be specified and tested.

### 3.4 Split is a graph change, not an Orchestrator rewrite

If a Task cannot fit a permitted execution target, the Orchestrator may **request** a split. It does not edit Task structure itself.

```text
no-fit Task
→ split proposal
→ DVL/URG relation update
→ Compiler
→ replacement Task Contracts + preserved consumers/lineage
→ Orchestrator schedules
```

This prevents lost consumer edges.

---

## 4. Authority, fencing and shared resources

Assignment remains temporary revocable authority. A stale/recovered Worker never regains authority automatically.

### 4.1 Execute-time authority check

Admission/dispatch is not permission forever. Kernel must reject stale authority at the authoritative action/commit boundary.

### 4.2 Non-workspace resources

Workspace isolation alone is insufficient for shared DBs, ports, caches, browser profiles and similar host resources.

**Candidate:** authoritative access to non-workspace mutable resources must be tied to current Assignment authority using a resource-edge fencing mechanism appropriate to that resource (epoch-bound lease/token/credential/namespace/proxy). A revoked epoch cannot continue authoritative mutation merely because its process is still alive.

### 4.3 Fenced-but-alive processes still consume resources

A fenced process is stale in authority, but still physically alive until exit is confirmed. Host admission must continue accounting for its RAM/process/resource footprint until confirmed termination/reclamation.

No simulated RAM value becomes law.

---

## 5. Checkpoint and recovery integrity

Preserved law: **checkpoint ≠ PASS ≠ Project Truth**.

A committed checkpoint must not be a mutable reference to a workspace an old process can still change.

**Candidate:** checkpoint content used for resume is immutable/content-addressed or equivalently frozen; its integrity is verified before restore; resume occurs into a fresh/controlled workspace under a new Assignment. Partial/uncommitted checkpoint state cannot become resume truth.

Exact storage/copy strategy is implementation work and needs physical SSD-cost testing.

---

## 6. External irreversible effects

Preserved lifecycle remains conceptually:

```text
Effect Intent
→ durable PREPARED / INTENT identity
→ STARTED
→ provider/system outcome
→ CONFIRMED

crash with ambiguous outcome
→ OUTCOME_UNKNOWN
→ RECONCILE
→ CONFIRMED_DONE | CONFIRMED_NOT_DONE | STILL_UNKNOWN
→ HOLD / HUMAN where unresolved
```

### 6.1 Write-ahead effect identity

Before a mediated irreversible effect leaves DVL, its logical effect identity/intent must be durable. `INTENT without RESULT` means ambiguity, not “never sent.” Blind resend is forbidden.

### 6.2 Transport retry hole

Durable identity protects recovery/resume only if every actual send/retry is governed by it. Provider SDK auto-retry or a stale live process can otherwise duplicate an effect outside the normal tool loop.

**Candidate:** declared irreversible effects must leave through a Harness-controlled egress/effect boundary that checks current authority and the effect journal and disables or controls unsafe transport retries.

**OPEN / PHYSICAL:** unrestricted shell/raw socket/network bypass cannot be declared solved by simulation. A real OS/network containment test is required.

---

## 7. Provider capacity, context and Safe Handoff

Truth classes remain:

```text
REPORTED
ESTIMATED
UNKNOWN
```

UNKNOWN must never be converted into fake precision.

### 7.1 ESTIMATED

Do not treat an estimate as an exact point value. Admission/handoff must account for its uncertainty/error bound. Exact error model is provider-specific and not frozen.

### 7.2 UNKNOWN

UNKNOWN cannot rely solely on a predictive watermark. Observed overflow/failure must feed the same safe recovery/split path without inventing a capacity number.

### 7.3 Fit and split

The previous exact `0.35 × target window` is **not law**. Round-2 also treats its quantum/cadence values as placeholders.

Preserved architectural requirement:

```text
continuation must demonstrably fit the permitted target
OR
DVL waits for a viable target when availability is transient
OR
DVL requests a graph-preserving split
```

Known reset/ETA is a state for Décalage to wait on. Unknown/indefinite unavailability needs a bounded policy, but the bound is not frozen.

---

## 8. Candidate, Evidence, Verification and Integration

### 8.1 BH-01 — validation and consumption are orthogonal

The frozen contract's evidence lifecycle can be read as making `CONSUMED` replace `VALIDATED`, while later gates require validated evidence. V-Next corrects the specification model:

```text
Evidence validation state
  = VALIDATED | REJECTED | CORRUPTED | INVALIDATED | ...

Evidence usage history
  = append-only records of Verification / Integration / Human Acceptance use
```

Using evidence does **not** erase its validation status. Integration must still re-check validity, candidate binding and freshness at use time. A record used by Verification and then invalidated/corrupted must be rejected by Integration.

### 8.2 Evidence/candidate freshness binding

Candidate evidence must bind enough current-truth dependencies to reject stale work without globally invalidating unrelated work. Reconciled candidate scope includes:

- candidate/artifact identity;
- relevant base/read-set inputs;
- relevant Project Decision versions discovered through URG lineage/closure;
- applicable risk/control-policy version;
- material environment assumptions;
- consumer/input dependencies where they affect correctness.

Integration compares the relevant pins atomically against current truth.

Because URG can miss a relation, a Project Decision change may require the deep delta pass before an older candidate is declared unaffected.

### 8.3 Rebase cannot launder stale assumptions

Rebase may refresh the base revision needed for integration, but must not silently refresh decision/policy/input/risk pins for work that was not rebuilt/reverified under those new assumptions.

### 8.4 Risk escalation propagates to consumers

If a producer/input becomes higher risk or requires stronger controls after a consumer was built, the affected consumer closure cannot rely on the old control state. Consumer evidence binds the relevant input candidate/control state; escalation invalidates/re-gates the affected closure while unrelated work continues.

---

## 9. BH-02 — replay is effect-aware, not label-aware

The frozen contract's categorical treatment of `tests` / `builds` as rerunnable is underspecified. A test/build may mutate an isolated persistent DB, generate files, run hooks, seed fixtures or call external systems.

V-Next candidate rule:

```text
command label (test/build/lint/scan) does not by itself grant replay safety

classify actual execution contract:
  PURE / READ-ONLY
  IDEMPOTENT MUTATION
  STATE-MUTATING WITH FRESH/RESTORED ISOLATION
  NON-IDEMPOTENT / EXTERNAL
  UNKNOWN
```

Authoritative reruns and divergence retries require either:

- an equivalent fresh/restored isolated starting state; or
- a demonstrated repeat-safe setup/cleanup/idempotency contract.

Otherwise the command follows the existing state-mutating/ambiguous-effect policy. Isolation from the user's environment is necessary but does not by itself prove replay equivalence.

Required regressions:
1. test creates fixed unique fixture; repeated authoritative execution in equivalent fresh state passes;
2. reuse of persistent mutated fixture state is refused unless repeat safety is declared/proven;
3. evidence valid at Verification but corrupted/invalidated before Integration is rejected.

---

## 10. Review / Security / Verification

Review and Security remain specialist controls mounted on normal Tasks; they do not become a second planner or truth owner.

```text
Task family
→ risk indicator
→ risk level
→ required control
→ Review / Security / stronger Verification / Audit / STOP as required
```

High-risk producer readiness remains:

```text
implementation complete
+ required controls complete
+ authoritative evidence
+ Verification PASS
= eligible for Integration revalidation
```

Affected consumers wait; unrelated Tasks continue.

### 10.1 Independence provenance

Reviewer/security independence comes from DVL/Kernel Assignment/provider provenance, never a Worker's self-description. Single-provider mode may be truthfully marked degraded rather than pretending independence.

### 10.2 Generated security-test quality

Round-2 proposes a negative-control/mutant test: a generated security check should demonstrate that it can fail on a seeded vulnerable case before being trusted as meaningful evidence.

**Status:** strong candidate, not frozen universal law. It needs calibration against real security-test families because not every security property maps cleanly to one mutation strategy.

---

## 11. Audit

Audit remains Task / Module / Release scoped and returns findings to normal DVL work:

```text
Finding
→ reproduce / classify
→ Fix Task
→ understanding/URG as affected
→ Compiler
→ normal execution + controls
→ Verification
→ Integration
→ affected re-audit
```

### 11.1 Finding identity

Finding identity should be structural (location/seam + violated invariant + reproducer/evidence anchor), not raw LLM wording, so rephrased noise does not create new findings indefinitely.

### 11.2 Audit PASS freshness

Module/release PASS is evidence over a particular truth/risk/policy state. A relevant later change invalidates the affected audit PASS and triggers scoped re-audit, not global restart.

### 11.3 Convergence

Unreproduced findings remain observations/advisory rather than automatically generating fix loops. Exact audit-pass counts remain experimental, not law.

---

## 12. What the evaluator rounds agree on

Across the supplied reports, the repeated architectural pattern is:

1. **The fixed four-stage understanding pipeline is preserved.** No evidence supports replacing it with adaptive optional depth.
2. **Most serious failures occur at boundaries/seams**, not because DVL lacks another intelligence component.
3. **Authority must be checked at the resource/effect edge**, not merely at dispatch.
4. **Durability requires immutable/committed state plus freshness**, not just “a checkpoint exists.”
5. **Evidence must remain bound to the exact candidate and relevant current assumptions.**
6. **Runtime/audit/decision feedback must return through URG + Compiler**, never mutate execution contracts directly.
7. **Review/Security/Audit remain controls, not truth owners.**
8. **Provider/context uncertainty must remain explicit.**
9. **Simulation is not physical proof.**

---

## 13. Corrections reconciled into the V-Next test baseline

These are **RECONCILED CANDIDATES**, not frozen law:

| ID | Reconciled correction | Existing owner |
|---|---|---|
| R1 | intent contradiction guard in addition to lineage | P/ULTPR + Project Decisions |
| R2 | partition seam pass for deep understanding | P/ULTPR |
| R3 | scoped/additive delta re-understanding; explicit relation retraction | Understanding + URG |
| R4 | every accepted URG delta recompiles affected subgraph with cycle/conservation checks | Compiler |
| R5 | stable Task meaning identity separated from contract revision | Compiler |
| R6 | Task split proposed through URG and recompiled | DVL/URG + Compiler |
| R7 | execute/commit-time fencing plus resource-edge authority for non-workspace resources | Kernel + Harness |
| R8 | fenced-but-live processes remain in host resource accounting | Décalage/Host admission |
| R9 | immutable/verified committed checkpoint restored into fresh controlled workspace | Harness + Recovery |
| R10 | durable write-ahead logical effect identity; ambiguous outcome never blindly resent | Kernel journal |
| R11 | controlled egress for declared irreversible effects; authority+journal checked at send/retry edge | Harness + Kernel |
| R12 | ESTIMATED capacity uses uncertainty; UNKNOWN uses observation without fake precision | Harness + Décalage |
| R13 | no-fit handling waits or graph-preserving split; no frozen 0.35 rule | Décalage + URG + Compiler |
| R14 | evidence validation state separated from append-only usage history (BH-01) | Evidence/Kernel |
| R15 | freshness pins + atomic Integration compare; rebase cannot repin assumptions silently | Verification + Integration |
| R16 | input risk/control escalation invalidates affected consumer evidence | Verification + Integration |
| R17 | verification replay classified by effects/environment, not command label (BH-02) | Kernel + Harness + Verification |
| R18 | reviewer independence from authoritative Assignment/provider provenance | Kernel + Review/Security |
| R19 | generated security evidence needs demonstrated discriminating power/negative control where applicable | Security + Verification |
| R20 | audit finding identity structural; audit PASS freshness scoped | Audit |

---

## 14. Explicitly NOT promoted to architecture law

Do **not** freeze from the simulations:

- adaptive/optional Ultra or Ultra-Pro;
- `0.35 × window`;
- overflow count `2`;
- checkpoint cadence `5`;
- quantum `3`;
- transient wait `60`;
- split depth `3`;
- AMBER `0.70` / RED `0.85`;
- simulated RAM reservations or worker counts;
- exact audit pass count;
- exact module ASK count;
- exact integration batch period;
- any simulated makespan/defect percentage as product fact;
- production readiness.

---

## 15. Open items that require physical/runtime evidence

The architecture must remain explicitly open on:

1. real macOS network/egress containment, including curl/raw socket/DNS/SDK retry bypass;
2. unkillable/orphan process fencing and resource reclamation;
3. real 8 GB Mac RAM profiles and jetsam behavior;
4. checkpoint copy/hash/restore cost and durability on the real filesystem;
5. real provider REPORTED / ESTIMATED / UNKNOWN capacity signals;
6. real context fidelity after handoff/rebuild and cross-provider continuation;
7. provider-specific idempotency and outcome lookup for irreversible effects;
8. real P/S, P/UL and P/ULTPR recall, contradiction detection and seam-summary fidelity;
9. real event-writer / atomic freshness-compare latency;
10. real security-control discrimination and audit false-positive/noise behavior;
11. Windows/Linux physical enforcement later; macOS H4 closure is not generalized.

---

## 16. Required next adversarial re-test

The next evaluator must attack **this V-Next reconciliation**, not redesign DVL.

Mandatory regressions:

```text
A. Intent
- valid-lineage semantic contradiction
- numeric/temporal/permission contradiction not expressible as allows/restricts
- missing acceptance anchor
- partition seam hidden relation
- decision delta that URG previously missed

B. Graph / Compiler
- accepted runtime delta closes a cycle
- unrelated delta does not churn Task identity
- material contract revision fences affected work only
- split preserves every producer/consumer/resource/risk relation

C. Authority / Recovery
- revoked unkillable process writes shared DB/cache/port/browser profile
- stale SDK retry after revoke
- checkpoint references data old process mutates
- Kernel crash around grant/revoke/checkpoint/effect INTENT

D. Context / Capacity
- REPORTED, ESTIMATED error, UNKNOWN sudden overflow
- transient quota reset versus indefinite outage
- no provider fits continuation
- cross-provider smaller window

E. Evidence / Verification / Integration
- BH-01: VALIDATED evidence used by Verification remains eligible for Integration if still valid
- BH-01 negative: invalidate/corrupt after PASS → Integration rejects
- stale decision/policy/input/risk/environment/consumer change after PASS
- rebase attempt cannot launder stale pins
- risk escalation after consumer already built

F. Replay
- BH-02: state-mutating integration test rerun on persistent fixture must not be treated safe merely because label=test
- fresh/restored equivalent fixture permits authoritative rerun
- build hook/generator with mutation follows effect-aware classification

G. Security / Audit
- same provider pretends independence
- weak generated security test that passes vulnerable mutant
- repeated finding rephrased by LLM
- stale module PASS after risk/policy/truth change
- release seam across modules

H. External effects
- crash after provider applies effect before RESULT
- provider auto-retry
- no idempotency key / no lookup
- unrestricted shell/network bypass attempt
```

The evaluator must label each result:

`RULE / EXECUTABLE SIMULATION / ABSTRACT MODEL CHECK / PHYSICAL RUNTIME EVIDENCE / INCONCLUSIVE`.

A simulation cannot close a physical containment claim.

---

## 17. V-Next verdict

The evidence does **not** justify freezing a new Kernel law yet. It does justify a stronger architecture candidate for the next test.

The central architecture survives:

```text
Normal → Smart → Ultra → Ultra-Pro
→ URG
→ Compiler
→ Smart Orchestrator + Smart Décalage
→ Task → Assignment → Worker
→ Kernel + Harness
→ Evidence + Review/Security
→ Verification
→ Integration
→ Project Truth
→ Audit
→ feedback through understanding/URG/Compiler
```

The major corrections are seam hardening: intent contradiction, delta understanding, resource-edge fencing, immutable recovery state, effect egress/journaling, honest capacity handling, evidence freshness, effect-aware replay, consumer risk propagation, and audit freshness/identity.

**No new brain is required by the supplied evidence.**  
**No production-readiness claim is justified.**  
**Next step: adversarial re-test this V-Next candidate, then physical/runtime tests on the real 8 GB Mac before deciding what becomes frozen law.**
