# H1 Regression Coverage Report

Date: 2026-10-06. Scope: H1 only (association of adapter events with the run, attempt and lifecycle they may modify).

## Summary

- **Candidate implementation:**
  - branch `claude/hopeful-feynman-5tukg2`, H1 implementation at `6072705`;
  - regression coverage added in local commit **`88badf7`**.
- **Not pushed. Not merged to `main`.**
- **Result:** the eight H1 cases that were previously validated only by temporary runtime experiments are now permanent conformance tests in **C18**.
  - All pass.
  - No production-code change was required: every new test passed against the unchanged H1 implementation.
  - A mutation check confirms each test fails when the H1 guard it covers is disabled.

## Files added / changed

| File | Kind | Change |
|---|---|---|
| `dvl-spike/src/conformance/c18-h1-run-isolation.test.ts` | **added** | New suite C18, 8 tests |
| `dvl-spike/src/conformance/harness.ts` | test infrastructure | `injectFrames(k, frames)` and `frame(...)` helpers |
| `dvl-spike/src/mock-provider/mock-provider.ts` | test infrastructure | `adapter.ping` accepts `payload.emit`: the current adapter emits the given frames with a valid process-wide `adapterSequence` and a per run/attempt/actor `actorSequence`, then pongs. Plain pings are unchanged. Adds `Emitter.nextAdapterSequence()` |
| `dvl-spike/src/mock-provider/scenarios.ts` | test infrastructure | `idle` scenario: acknowledges `run.start` and emits nothing, so a test's injected frames are the only lifecycle input |
| `dvl-spike/src/kernel/*` | production | **unchanged** (`git diff 6072705 -- dvl-spike/src/kernel` is empty) |

**Why frame injection:** the temporary experiments used a separate scripted adapter. The committed tests reproduce that capability inside the repository's own mock adapter. Every injected frame comes from the **current, handshaken adapter instance** with valid sequencing, so the tests exercise the run/attempt/lifecycle admission rules rather than stale-pipe fencing.

## Exact new test cases (C18 — "C18 H1 run/attempt isolation from the current adapter")

1. **Same `actionId` in two concurrent runs: one run can't clear, finish, or create Evidence for the other's action.**
   - Setup: R1 starts `act_same`; R2 sends `action.finished act_same` without having started it.
   - R2's frame is rejected (`illegal_transition`).
   - R1's `act_same` stays active; there's no Evidence in either run.
   - R2's own start and finish of `act_same` produce exactly one R2 Evidence record, and R1 is unaffected.
   - R1 then finishes its own action normally.
2. **Same `actorId` in two concurrent runs: actor lifecycle and no-writer state stay per run.**
   - Setup: R1's `w` and `root` are finished, so R1 has no blocking writers.
   - R2 reuses `root` and `w`, leaving `w` running with an active action. All of R2's frames are accepted, with no violations.
   - R1's actors stay `finished`, and R1's no-writer condition stays clear. R2 shows its own active action.
3. **Same `actorId` after adapter replacement: the previous run's actor state is unchanged.**
   - Setup: R2 on instance A has `w` running. A exits, so R2 becomes `failed` and `w`/`root` become `aborted`.
   - The new instance runs R3, reusing `w`, through to `finished`. All frames are accepted.
   - R2 stays `failed`, and its `w`/`root` stay `aborted`.
4. **Current valid adapter targets a HALTED old run: it stays halted, with no Evidence and no state change.**
   - Setup: the run is halted by `maxDurationMs` (2000 ms), which terminates that instance.
   - The fresh instance sends `run.started`, an action start/finish, `actor.finished` and `run.finished` for it.
   - All 5 are rejected (`run_owned_by_other_instance`). The status stays `halted`; there's no Evidence, no `kernel.run_finished`, and `root` is unchanged.
5. **Same current adapter targets its own FAILED run: it stays failed, with no Evidence.**
   - Setup: `run.started` then `run.failed` from the current adapter.
   - The same adapter then sends the full script for that run and attempt.
   - All 5 are rejected (`run_terminal`). The status stays `failed`; there's no Evidence, no active actions, and no `kernel.run_finished`.
6. **Wrong attempt against an old run can't modify execution state.**
   - **(a)** The current instance's own failed run, addressed with attempt 2: all 5 frames rejected (`attempt_mismatch`).
   - **(b)** After an adapter replacement, the new instance addresses the same old run with attempt 2: all 5 rejected (`run_owned_by_other_instance`).
   - In both cases the status stays `failed` and there's no Evidence. In (b), `root` keeps the state the previous instance's termination left (`aborted`).
7. **`action.finished` without a matching `action.started`: no Evidence, no state change.**
   - The unmatched finish is rejected (`illegal_transition`).
   - There's no Evidence and no `kernel.evidence_recorded`; the run stays `running` with no active action.
   - The same `actionId` then follows the legal start/finish path and produces exactly one Evidence record.
8. **A normal valid current run completes with all H1 guards active.**
   - The sequence:
     - `run.started`;
     - fork, then `actor.started w`;
     - `action.requested` → `started` → `updated` → `finished` (test);
     - `actor.finished` ×2;
     - `run.finished`.
   - All 10 frames are accepted, with no violations.
   - The run is `finished`, with one `act_ok` Evidence record (PERSISTED) and no blocking writers.

**Item 7 is now covered twice:**
- C14 ("action.finished without action.started: rejected, no Evidence") through the mock scenario path;
- C18 test 7 through injection from the current adapter, which additionally checks for no active action and that the legal path works afterwards.

## Mutation check of C18 (temporary edits to `kernel.ts`, restored byte-for-byte after each)

| Guard disabled | C18 tests that fail |
|---|---|
| Whole admission gate (`admit()` result ignored) | 1, 4, 5, 6, 7 |
| Owner check (`run_owned_by_other_instance`) | 4, 6 |
| Attempt check (`attempt_mismatch`) | 6 |
| Terminal check (`run_terminal`) | 5 |
| Action state rules (`ACTION_FSM`) | 1, 7 |
| Actor/action state shared across all runs (not per run/attempt) | 1, 2, 3, 8 |

Every guarded behaviour is detected by at least one C18 test. Test 8 deliberately passes under the gate-level mutations: it is the "legitimate execution still works" control. It fails only when shared state makes earlier tests' actors leak into its run.

## Test results

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` (3 consecutive runs) | **18 files, 116/116 passed** each run (was 108 before C18) |
| `npm run spike` | exit 0, "SPIKE OK — every scenario reached its expected terminal state" |
| C18 alone (3 consecutive runs) | 8/8 passed each run |

Per-suite counts: C01 6, C02 4, C03 6, C04 4, C05 4, C06 13, C07 10, C08 14, C09 4, C10 7, C11 7, C12 5, C13 6, C14 8, C15 5, C16 3, C17 2, **C18 8**.

## Production-code change required

**No.** None of the new regression tests exposed a failure in the current H1 implementation. Production files under `dvl-spike/src/kernel/` are unchanged.

## Final H1 regression-coverage assessment

- **Covered by committed tests on this branch:**
  - the current valid adapter naming another instance's run (C10, C18-4, C18-6b);
  - a wrong attempt (C10, C18-6a/6b);
  - terminal runs: finished (C10), failed (C18-5) and halted (C18-4);
  - a second `run.started` on a live run (C10);
  - an unmatched or duplicate action finish (C14, C18-7);
  - `actionId` reuse across concurrent runs (C18-1);
  - `actorId` reuse across concurrent runs (C18-2) and across adapter instances (C18-3);
  - legal retry and attempt rebinding (C10, C16);
  - stale-pipe fencing (C06);
  - the normal path (C14, C18-8).

  Every H1 case validated only by the temporary experiments in `DVL_H1_RUNTIME_VALIDATION.md` now has a committed, mutation-checked regression test.
- **Still open, outside this task's scope of adding tests:**
  - **Merge state.** The H1 implementation and its regression coverage exist only on `claude/hopeful-feynman-5tukg2`, with `88badf7` local and not pushed. `origin/main` still lacks them, and its runtime behaviour there remains as reported in `DVL_H1_RUNTIME_VALIDATION.md` (not closed).
  - **Observation carried over, unchanged and not tested here.** The per-actor sequence check is keyed by instance, run and actor, not attempt (`kernel.ts`, `instanceKey(aid, runId, actorId)`). A same-instance attempt N+1 that restarts `actorSequence` at 1 would record diagnostic `actor_sequence_gap` violations for valid frames. The frames are still admitted; no state change was observed from this.
