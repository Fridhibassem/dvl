# DVL CODE 😈 — ÉTAPE 0.G BASELINE REPORT / EVIDENCE

**Date:** 2026-10-15  
**Project:** DVL Code 😈  
**Stage:** ÉTAPE 0.G — Baseline Report / Evidence  
**Status:** COMPLETE — READY FOR ÉTAPE 0.H INDEPENDENT VERIFICATION  
**Important:** This document does **not** declare ÉTAPE 0 PASS. Only ÉTAPE 0.H independent verification may support the final ÉTAPE 0 freeze.

---

## 1. BUILD LAW

DVL is being built under the strict sequential law:

```text
ÉTAPE
  → BUILD / EXECUTE
  → TEST
  → EVIDENCE
  → INDEPENDENT VERIFY
  → PASS
  → FREEZE
  → NEXT ÉTAPE
```

Critical rule:

> **No PASS → No next ÉTAPE.**

Current sequence:

```text
0.A — Canonical repo identification       ✅ PASS
0.B — Git truth / branch / commit          ✅ PASS
0.C — Real source + tests identification   ✅ PASS
0.D — Real implementation audit            ✅ COMPLETE
0.E — Baseline execution                   ✅ PASS
0.F — Mac environment truth                ✅ COMPLETE
0.G — Baseline report / evidence           ✅ THIS DOCUMENT
0.H — Independent verification             ⏳ NEXT
ÉTAPE 0 PASS                               🔒 NOT YET
ÉTAPE 1 — macOS Desktop Shell              🔒 NOT YET
```

---

## 2. BASELINE REPOSITORY TRUTH

Working repository:

```text
~/Desktop/dvl-spike-phase-1/dvl-spike
```

Git state captured during ÉTAPE 0.F:

```text
Branch:
codex/h4-candidate

HEAD:
05eef688102bf43e80e37cc024fa2169b1b8e850
```

This repository is **not the full DVL desktop product**.

It is the real **Phase-1 Kernel / Harness safety spike**, containing executable TypeScript implementation, mock runtime/provider pieces, durable event/evidence mechanisms, Git history, and 31 conformance test files.

Real implementation identified during the baseline audit includes core components such as:

```text
kernel.ts
event-store.ts
confined-fs.ts
frame.ts
ndjson-transport.ts
provider-confinement.ts
recovery-process.ts
root-lock.ts
spike-action-protocol.ts
mock-filesystem-boundary.ts
mock-launch.ts
types.ts
mock-provider/runtime pieces
31 conformance test files
```

Not yet present as a complete production product:

```text
DVL Desktop application
Normal coding-agent UX
Real production provider layer
DeepSeek Harness integration
Full project opener
Production terminal UI
Preview UI
Smart Graph runtime
Task Compiler runtime
Smart Orchestrator
Smart Décalage
Production multi-worker runtime
Verification system
Integration system
Dynamic Project Environment / Rooms
```

Therefore no architecture prose, research result, or future component is promoted here into implementation truth.

---

## 3. ÉTAPE 0.F — MAC ENVIRONMENT TRUTH

The physical baseline machine used for the final execution evidence is:

```text
Machine:        MacBook Air
Model:          MacBookAir7,2
CPU:            Dual-Core Intel Core i5 @ 1.8 GHz
RAM:            8 GB
Architecture:   x86_64

macOS:          13.7.8
Build:          22H730

Node:           v26.8.1
npm:            11.19.0
Git:            2.39.2 (Apple Git-143)

Disk free:      approximately 94 GiB

Repo path:
~/Desktop/dvl-spike-phase-1/dvl-spike

Branch:
codex/h4-candidate

HEAD:
05eef688102bf43e80e37cc024fa2169b1b8e850
```

Sensitive machine identifiers intentionally excluded from this evidence report:

```text
Serial number
Hardware UUID
Provisioning UDID
```

They are not required for reproducibility.

Working-tree capture at 0.F:

```text
M src/conformance/c07-adapter-spool-isolation.test.ts
M src/conformance/c09-safety-halt-regression.test.ts
M src/conformance/c10-run-binding.test.ts

Untracked:
../.DS_Store
../dvl-spike-phase-1.zip
.DS_Store
src/.DS_Store
```

The three modified conformance files correspond to the test-only synchronization/runtime-budget fixes investigated during 0.E.

No production Kernel source was intentionally modified by those three fixes.

---

## 4. BASELINE EXECUTION — INITIAL FAILURE SIGNAL

Initial normal physical-Mac execution produced:

```text
Test Files: 30 passed / 1 failed
Tests:      317 passed / 1 failed
```

The first observed failing file was:

```text
src/conformance/c09-safety-halt-regression.test.ts
```

Observed C09 failure modes included:

```text
adapter instance terminated before replying to req_...
```

and, on another normal full-suite run:

```text
Expected: "finished"
Received: "halted"
```

The baseline was therefore **not** declared passing at that time.

Investigation remained inside ÉTAPE 0.E.

---

## 5. C09 — SAFETY-HALT REGRESSION INVESTIGATION

### 5.1 Evidence

Focused C09 repetitions:

```text
C09 full file ×5
RUN 1 → 4/4 PASS
RUN 2 → 4/4 PASS
RUN 3 → 4/4 PASS
RUN 4 → 4/4 PASS
RUN 5 → 4/4 PASS
```

Serial full suite:

```bash
npx vitest run --maxWorkers=1 --minWorkers=1
```

Result:

```text
31/31 test files PASS
318/318 tests PASS
```

This showed that the failure was load/timing-sensitive rather than a stable deterministic Kernel failure.

### 5.2 Independent diagnosis

Gemini 4 Argon, acting as a distributed-systems/runtime/conformance reviewer, concluded:

```text
FINAL VERDICT: TEST DEFECT
Confidence: High
```

Root cause:

- C09 intentionally gave the original unhealthy adapter instance a short safety-halt budget.
- The fresh replacement instance inherited that same short budget.
- Under parallel-suite CPU/I/O load, stale/zombie-frame draining and mandatory persistence work consumed much of the fresh instance's time window.
- The healthy replacement could therefore be halted before completing its normal lifecycle.

### 5.3 Fix classification

Patch:

```text
DVL_C09_0E_FIX.patch
```

Scope:

```text
TEST CODE ONLY
```

Production Kernel semantics were not weakened.

The patch preserved the deliberately short timeout where the safety halt was supposed to occur, but restored a healthy runtime budget for the replacement instance and strengthened the test assertion around the replacement run.

---

## 6. C07 — ADAPTER SPOOL / STALE-INSTANCE FENCING INVESTIGATION

### 6.1 Full-suite failure

After C09 stabilization, a later normal full-suite execution failed at:

```text
src/conformance/c07-adapter-spool-isolation.test.ts
```

Test:

```text
7. late output of a retired instance is fenced:
no import, no evidence, nothing in the live instance's spool
```

Failure:

```text
expect(stale).toHaveLength(1)

Expected: 1
Received: 0
```

Full-suite result:

```text
317/318
```

### 6.2 Focused evidence

Before patching:

```text
Complete C07 file ×5
10/10 PASS on each run
```

This again showed load sensitivity.

### 6.3 Independent diagnosis

Argon concluded:

```text
FINAL VERDICT: TEST / HARNESS DEFECT
Confidence: High
```

The production safety invariant was **not violated**.

The test used a coupled heuristic:

```text
framesReceived > 2
AND
stdout quiet for > 200ms
```

Under full-suite contention, the 512 KiB spool/write/rename/hash path could take longer than 200ms after early frames had already arrived.

The test could therefore decide that emission was "finished" too early and forcibly kill the adapter before `action.finished` reached the transport.

### 6.4 Production status

Independent audit conclusion:

```text
PRODUCTION SAFETY STATUS: NOT VIOLATED
PRODUCTION CODE: NO CHANGE REQUIRED
```

The late/stale-instance fencing, evidence isolation, spool isolation, and transport/event persistence semantics remained intact for frames that actually arrived.

### 6.5 Minimal fix

Test-only synchronization was changed from the `>2 + 200ms quiet` heuristic to a bounded deterministic condition based on:

```text
finalized .log artifact exists
AND
framesReceived >= 6
```

No Kernel production code change was required.

### 6.6 Validation evidence

Post-patch:

```text
npm run typecheck                 PASS
focused C07 Test 7               PASS
```

A post-patch full-file PASS was observed.

**Evidence limitation:** the current retained conversation evidence does not contain complete logs proving every requested post-patch C07 ×10 repetition. This report therefore does not claim a fully documented C07 ×10 post-patch run.

This limitation is mitigated, but not erased, by the two final complete 318/318 full-suite passes recorded later.

---

## 7. C10 — RUN / ATTEMPT BINDING FENCE INVESTIGATION

### 7.1 Full-suite failure

After the C07 test fix, a normal full-suite run failed at:

```text
src/conformance/c10-run-binding.test.ts
```

Test:

```text
fresh adapter B naming A's terminal run:
no revival, no evidence, no actor/action state
```

Failure:

```text
expected 7 to be greater than or equal to 10
```

The safety assertions preceding this count assertion were not reported as violated.

### 7.2 Focused evidence

Before the patch:

```text
C10 focused repetitions PASS
```

After diagnosis and patch:

```text
npm run typecheck                   PASS
focused C10 Test 1                  PASS
complete C10 file ×10               PASS
```

### 7.3 Independent diagnosis

Argon concluded:

```text
FINAL VERDICT: TEST / HARNESS DEFECT
Confidence: High
```

The key behavior was:

```text
k.startRun(...)
→ command.ack arrives
→ startRun resolves
→ child runScenario continues asynchronously
```

The test then used:

```ts
await new Promise((r) => setTimeout(r, 600));
await k.settle();
```

The fixed sleep was not a valid completion barrier.

`k.settle()` drains transport work that has already arrived; it does not guarantee that the child process has emitted all future scenario frames.

Under full-suite CPU/I/O contention, only 7 forged frames had arrived when the assertion ran.

### 7.4 Safety invariant status

The independent audit found no evidence that:

```text
old terminal run revived
actor state was created/mutated
action state was created/mutated
trusted state was advanced
evidence was created
stale authority was restored
```

Production conclusion:

```text
PRODUCTION SAFETY STATUS: INTACT
PRODUCTION CODE: NO CHANGE REQUIRED
```

### 7.5 Minimal fix

The arbitrary fixed waits in relevant C10 tests were replaced by deterministic waits for the terminal adapter event of the scenario:

```text
run.finished
or
run.failed
```

using `waitForEvent(...)`, followed by `k.settle()`.

This retains bounded failure behavior if the expected terminal event never arrives.

---

## 8. FINAL 0.E VALIDATION

After the C09, C07, and C10 test-only corrections:

### TypeScript

```bash
npm run typecheck
```

Result:

```text
PASS
```

### Final normal full suite — Run #1

```bash
npm test
```

Result:

```text
Test Files 31 passed (31)
Tests      318 passed (318)
```

### Final normal full suite — Run #2

```bash
npm test
```

Result:

```text
Test Files 31 passed (31)
Tests      318 passed (318)

Duration 166.05s
```

This gave the required two consecutive normal complete-suite passes.

Therefore:

```text
ÉTAPE 0.E — BASELINE EXECUTION = PASS
```

---

## 9. TEST / EVIDENCE COMMANDS USED

Representative commands executed during 0.E / 0.F:

```bash
npm run typecheck

npm test

npx vitest run --maxWorkers=1 --minWorkers=1

for i in 1 2 3 4 5; do
  echo "===== C09 RUN $i ====="
  npx vitest run src/conformance/c09-safety-halt-regression.test.ts || break
done

for i in 1 2 3 4 5; do
  echo "===== C07 RUN $i ====="
  npx vitest run src/conformance/c07-adapter-spool-isolation.test.ts || break
done

npx vitest run src/conformance/c07-adapter-spool-isolation.test.ts -t "7. late output"

for i in 1 2 3 4 5 6 7 8 9 10; do
  echo "===== C10 RUN $i ====="
  npx vitest run src/conformance/c10-run-binding.test.ts || break
done

npx vitest run src/conformance/c10-run-binding.test.ts -t "fresh adapter B naming A's terminal run"

system_profiler SPHardwareDataType
sw_vers
uname -m
node -v
npm -v
git --version
df -h /
pwd
git branch --show-current
git rev-parse HEAD
git status --short
```

---

## 10. WHAT THE BASELINE CURRENTLY PROVES

The evidence supports the following claims:

1. The checked Phase-1 repository contains real executable Kernel/Harness-oriented implementation, not only design prose.
2. Its current conformance suite contains 31 files / 318 tests.
3. The suite can pass completely on the recorded physical 8 GB Intel Mac baseline.
4. Several full-suite-load failures were discovered rather than hidden.
5. C09, C07, and C10 were investigated as concurrency/timing/synchronization issues.
6. Independent specialist reviews classified the observed failures as test/harness defects rather than demonstrated production Kernel safety violations.
7. The chosen corrections were test-only and did not intentionally weaken Kernel production safety semantics.
8. After the corrections, two consecutive normal full-suite executions passed 318/318.
9. Environment truth was captured for reproducibility.
10. The baseline is ready to be independently verified in ÉTAPE 0.H.

---

## 11. WHAT THE BASELINE DOES NOT PROVE

This baseline does **not** prove:

```text
the full DVL desktop product exists
production provider integration is complete
all future hardware / macOS environments are compatible
production multi-worker orchestration is complete
Smart Graph / URG runtime exists
Smart Décalage runtime exists
Smart Orchestrator runtime exists
full verification/integration pipeline exists
all future race conditions are eliminated
real-world security is fully proven
production scalability is proven
400–500 parallel worker execution is proven
```

Those remain later engineering stages.

---

## 12. KNOWN LIMITATIONS / RISKS

### 12.1 Timing sensitivity in conformance tests

C09, C07, and C10 demonstrate that tests using wall-clock assumptions or short fixed waits can become flaky under parallel CPU/I/O contention.

Future rule:

> Prefer deterministic observable completion conditions over arbitrary sleeps or silence windows.

### 12.2 Baseline hardware is constrained

The current physical baseline is:

```text
Intel dual-core
8 GB RAM
```

This is useful because the suite passed under constrained hardware, but it is not a compatibility matrix.

### 12.3 Node version

The baseline currently uses:

```text
Node v26.8.1
```

This report records it as environment truth; it does not claim broad Node-version compatibility.

### 12.4 Working tree is not clean

The three validated conformance fixes remain modified in the working tree at capture time.

This must be considered during independent verification and before any final freeze/commit decision.

### 12.5 Untracked local files

`.DS_Store` files and a ZIP exist as untracked local artifacts.

They are not evidence of product functionality and should not be confused with source changes.

### 12.6 C07 post-patch repetition documentation gap

The retained evidence does not fully demonstrate every requested post-patch C07 ×10 run log.

Do not silently upgrade this to stronger evidence than exists.

---

## 13. SECURITY / PRIVACY NOTE

The raw `system_profiler` output included machine-specific identifiers.

They must not be copied into public or project evidence unless explicitly required:

```text
Serial Number
Hardware UUID
Provisioning UDID
```

This report intentionally excludes them.

---

## 14. 0.G VERDICT

```text
ÉTAPE 0.G — BASELINE REPORT / EVIDENCE
STATUS: COMPLETE ✅
```

Reason:

- repository truth recorded;
- real vs future implementation separated;
- baseline machine recorded;
- initial failures retained;
- C09/C07/C10 diagnoses retained;
- fixes classified;
- exact testing path retained;
- final 318/318 ×2 evidence retained;
- limitations and remaining risks retained;
- no claim of final ÉTAPE 0 PASS is made.

---

## 15. NEXT ALLOWED GATE

```text
ÉTAPE 0.H — INDEPENDENT VERIFICATION
```

0.H must review this evidence and the actual repository state independently.

The verifier must be allowed to return:

```text
PASS
FAIL
INSUFFICIENT EVIDENCE
```

The verifier must not approve simply because the implementation assistant or previous reviewers said PASS.

Only after successful 0.H may DVL create the final checkpoint:

```text
DVL_ETAPE_00_BASELINE_PASS.md
```

and consider:

```text
ÉTAPE 0 = PASS
```

Until then:

```text
ÉTAPE 1 — macOS Desktop Shell = LOCKED
```

---

## 16. CURRENT STOP POINT

```text
0.A ✅
0.B ✅
0.C ✅
0.D ✅
0.E ✅
0.F ✅
0.G ✅ COMPLETE
0.H 🟡 NEXT — INDEPENDENT VERIFICATION

ÉTAPE 0 PASS 🔒
ÉTAPE 1 🔒
```

**STOP HERE. DO NOT START ÉTAPE 1.**
