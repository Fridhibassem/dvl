# DVL CODE 😈 — ÉTAPE 0 BASELINE PASS

**Date:** 2026-10-15  
**Status:** FROZEN — ÉTAPE 0 PASS  
**Scope:** Phase-1 Kernel / Harness safety spike baseline only

---

## 1. FINAL GATE

```text
ÉTAPE 0 = PASS ✅
```

Independent verification outcome:

```text
ÉTAPE 0.H = PASS
Confidence = High
```

Build law satisfied:

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

---

## 2. FROZEN GIT BASELINE

Repository track:

```text
Branch:
codex/h4-candidate

Pre-freeze HEAD:
05eef688102bf43e80e37cc024fa2169b1b8e850

Frozen baseline commit:
ae13301b8794889d33b3fdab08a85d99aa0e0b7a

Commit message:
test(conformance): make C07 C09 C10 baseline deterministic
```

Frozen commit contents:

```text
dvl-spike/src/conformance/c07-adapter-spool-isolation.test.ts
dvl-spike/src/conformance/c09-safety-halt-regression.test.ts
dvl-spike/src/conformance/c10-run-binding.test.ts
```

Diff size:

```text
3 files changed
40 insertions
16 deletions
```

Independent source verification confirmed:

```text
Production source changed by freeze commit: NONE
Tracked working tree after freeze: CLEAN
```

Local untracked `.DS_Store` / evidence-report artifacts are not part of the frozen source baseline.

---

## 3. VERIFIED TEST CORRECTIONS

### C09 — Safety-halt regression

Classification:

```text
TEST DEFECT
```

The deliberately short safety-halt budget remains scoped to the unhealthy adapter instance. The fresh healthy replacement receives a normal runtime budget and the test asserts it is not incorrectly halted.

```text
Production Kernel change: NONE
Production safety weakened: NO
```

### C07 — Adapter spool isolation

Classification:

```text
TEST / HARNESS SYNCHRONIZATION DEFECT
```

The non-deterministic completion heuristic:

```text
framesReceived > 2
+
200ms stdout silence
```

was replaced by an observable bounded completion condition tied to the finalized log artifact and required frame count.

```text
Production stale-instance fencing: INTACT
Evidence isolation: INTACT
Spool isolation: INTACT
Production change: NONE
```

### C10 — Run / attempt binding

Classification:

```text
TEST / HARNESS SYNCHRONIZATION DEFECT
```

Arbitrary fixed waits were replaced by bounded waits for terminal scenario events (`run.finished` / `run.failed`), followed by settlement of received transport work.

The substantive safety assertions remain active.

```text
Production run/attempt binding: INTACT
Stale authority protection: INTACT
Production change: NONE
```

---

## 4. EXECUTION EVIDENCE

After the three test-only corrections, the retained physical-Mac evidence records:

```text
npm run typecheck
PASS
```

Normal complete suite #1:

```text
Test Files 31 passed (31)
Tests      318 passed (318)
```

Normal complete suite #2:

```text
Test Files 31 passed (31)
Tests      318 passed (318)
Duration   166.05s
```

The freeze commit records the same corrected source bytes that produced those successful runs; committing did not alter their contents.

Additional independent verification after freeze confirmed TypeScript typecheck PASS. Full Vitest execution was not rerun in the Linux audit environment because the supplied dependency tree contains macOS-native Rollup dependencies; this is an environment-startup mismatch, not a conformance failure.

---

## 5. EVIDENCE LIMITATION RETAINED

The retained evidence does not fully contain every requested C07 post-patch ×10 repetition log.

This limitation is explicitly preserved and was judged non-blocking because the corrected test passed focused/full-file validation and was subsequently exercised by two consecutive complete 318/318 suite runs.

No stronger claim is made.

---

## 6. PHYSICAL BASELINE

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
Disk free:      ~94 GiB
```

This establishes a reproducible baseline environment. It does not establish broad hardware, macOS, Node, or production compatibility.

Sensitive machine identifiers remain intentionally excluded.

---

## 7. VERIFIED SCOPE

ÉTAPE 0 verifies the real Phase-1 Kernel / Harness safety-spike baseline.

It does **not** claim completion of:

```text
DVL Desktop Shell
DeepSeek Harness integration
Smart Graph / URG runtime
Task Compiler
Smart Orchestrator
Smart Décalage
Rooms / Dynamic Project Environment
production provider integration
production multi-worker runtime
full production verification/integration system
broad platform compatibility
production scalability
```

Those are outside this frozen baseline.

---

## 8. FINAL PRODUCTION SAFETY STATUS

```text
No demonstrated production Kernel/runtime safety violation remains from C09, C07, or C10.

Stale-instance fencing       VERIFIED INTACT
Run/attempt binding          VERIFIED INTACT
Evidence isolation           VERIFIED INTACT
Spool isolation              VERIFIED INTACT
Test corrections             TEST-ONLY
Production safety weakening  NOT FOUND
```

---

## 9. FINAL FREEZE DECLARATION

```text
0.A ✅ PASS
0.B ✅ PASS
0.C ✅ PASS
0.D ✅ COMPLETE
0.E ✅ PASS
0.F ✅ COMPLETE
0.G ✅ COMPLETE
0.H ✅ PASS

ÉTAPE 0 ✅ PASS — FROZEN
```

Canonical frozen implementation baseline:

```text
ae13301b8794889d33b3fdab08a85d99aa0e0b7a
```

This document freezes the outcome of ÉTAPE 0 only. It does not silently freeze future DVL architecture or claim production readiness.

---

## 10. NEXT GATE

The sequential build law is now satisfied for ÉTAPE 0.

```text
ÉTAPE 1 may be opened only as the next explicit build stage.
```

No ÉTAPE 1 implementation is started by this document.
