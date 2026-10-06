# DVL H1 Runtime Validation — adapterInstanceId / run ownership

Date: 2026-10-06. Scope: H1 only (association of adapter events with the run, attempt and lifecycle they may modify).

## H1 Result

**PARTIALLY CLOSED**

The result depends on which repository state is meant by "current". Both states were validated with identical experiments:

| State | Commit | H1 at runtime |
|---|---|---|
| `origin/main` (merged default branch) | `38e39b2` (= merge `5fee597` + one documentation upload) | **Not closed** — every reported behaviour reproduces |
| `claude/hopeful-feynman-5tukg2` (local checkout, unmerged) | `6072705` | Closed for every tested path; none of the reported behaviours reproduce |

The run-ownership and lifecycle changes (commits `c01ffd6`, `6072705`) exist only on the unmerged branch. `origin/main` does not contain them (`git merge-base --is-ancestor c01ffd6 origin/main` → no).

## Existing Implementation

All references below come from **source inspection**. Runtime behaviour is reported separately in "Runtime Experiments".

### `origin/main` (`38e39b2`) — `dvl-spike/src/kernel/kernel.ts`
- `ingest()` (l.512):
  - The check at l.522 rejects frames whose `adapterInstanceId` is not the current, non-terminated instance. This handles stale pipes only.
  - After envelope validation, an event naming any known `runId` is stored and passed to `applyEvent()` (l.648–650).
  - Nothing compares the run's owning instance or attempt, or the run's status, with the incoming event.
- `applyEvent()` (l.653):
  - `run.started` sets `status = "running"` unconditionally.
  - `run.finished` and `run.failed` call `endRun()`.
  - `action.finished` creates Evidence without checking for a matching `action.started`.
- **Actor state is Kernel-global:** `readonly actors = new ActorTracker()` (l.185) is keyed by `actorId` only.
- **Action state is Kernel-global:** `activeActions` (l.192) is keyed by `actionId` only.
- `terminateInstance()` (l.880) fails the dead instance's runs.

### `6072705` (branch) — `dvl-spike/src/kernel/kernel.ts`
- **Per-attempt state:** `RunState` (l.~105–119) carries per-attempt `actors: ActorTracker` (l.116) and `actions: Map<string, ActionRecord>` (l.117). `actorsOf(runId)` is at l.608.
- **Stale-pipe check:** `ingest()` (l.731) keeps the l.741 check.
- **Admission gate:** for an event naming a known run, `ingest()` calls `admit()` (l.839) before storing it as accepted. On rejection, the event is stored as `protocol_violation` and `applyEvent()` is not called.
- **`admit()`** (l.892) applies, in order:
  1. owning instance (`run_owned_by_other_instance`);
  2. attempt (`attempt_mismatch`);
  3. terminal status (`run_terminal`);
  4. the run transition rules (`run.started` only from `starting`; `run.failed` from `starting|running`; everything else requires `running`);
  5. the actor rules (a finished or aborted actor can't emit actor- or action-scoped events);
  6. the action rules via `ACTION_FSM` (l.122): `requested → started → updated* → finished`, advanced only by the owning actor.
- **`retryRun()`** (l.444) is the only way to continue a terminal run. It creates attempt N+1, binds it to the current instance, and gives it fresh actor and action state and a fresh workspace.
- **`terminateInstance()`** (l.1173) fails the instance's runs and aborts their actions and actors per attempt.
- **Per-actor sequence key:** `instanceKey(aid, runId, actorId)` (l.828), with no attempt component. See the observation under "Remaining Gap".

## Runtime Experiments

### Method (common to all experiments)
- **States under test:** pristine exports of both commits (`git archive`) in a temporary directory, linked to the existing `node_modules`. The tracked working tree was not modified.
- **Driver:** a temporary script, `h1-experiments.mts`, run with `npx tsx h1-experiments.mts <dvl-spike dir> puppet-adapter.mjs`. It uses the **real** `Kernel` class, the real NDJSON/stdio transport, and a separately spawned adapter process.
- **Test adapter (`puppet-adapter.mjs`):**
  - It answers `adapter.describe` and `run.start` correctly, so it is the **current, valid, handshaken adapter instance**.
  - When the driver sends `adapter.ping` with a list of frames, it emits them with valid, monotonic `adapterSequence` and valid `actorSequence`. Every event therefore arrives in order from the live instance; none comes from a stale pipe.
- **Recorded per experiment:** run status, Evidence records, whether each adapter frame was stored as accepted (`untrusted_observation`) or rejected (`protocol_violation`), recorded violations, and actor/action state. Actor state is read via `actorsOf()` where it exists and via the global `actors` tracker otherwise.
- **Where the files are:** temporary tools and raw logs are in the session scratchpad, `…/scratchpad/h1val/`: `tools/`, `main-experiments.log`, `branch-experiments.log`, and the test/typecheck/spike logs. They are not part of the repository.

### E1 / E7 — current adapter sends valid-sequence events for a run created by a previous instance
- **Setup:**
  1. Instance A starts run R1 and emits `run.started` plus `action.started act_a`, so R1 is `running`.
  2. A is retired, either gracefully (`shutdown` + `restartAdapter()`) or forcibly (`restartAdapter({force:true})`). R1 becomes `failed`.
  3. The current instance B (handshake complete) emits, with valid sequence numbers, `run.started`, `action.started act_b`, `action.finished act_b (kind=test)`, `actor.finished`, `run.finished`, all naming R1, attempt 1.
- **Expected:** R1 stays `failed`, no Evidence is created, and no actor/action state changes.

| | main `38e39b2` | branch `6072705` |
|---|---|---|
| R1 status after B's events | **`failed` → `finished`** (both retire modes) | `failed` (unchanged) |
| Evidence for R1 | **`act_b@a1: PERSISTED` created** | none |
| B's 5 frames | all accepted | all rejected, `run_owned_by_other_instance` ×5 |
| R1 `root` actor | `finished` (driven by B) | `aborted` (from A's termination; unchanged by B) |

### E2 — current adapter sends events with the wrong attempt
- **E2a. Setup:** B's own live run R (attempt 1, `running`). B emits `action.started` / `action.finished (test)` / `run.finished` with `attempt: 2`.
- **E2b. Setup:** R is then `failed` after B is retired. The next instance C emits a full script for R with `attempt: 2`.
- **E2c. Setup (branch only, since `retryRun` doesn't exist on main):**
  1. `retryRun(R)` creates attempt 2, bound to the current instance.
  2. That instance first emits attempt-1 events.
  3. Then it emits attempt-2 events.
- **Expected:** a mismatched attempt never modifies the run; a Kernel-created attempt is accepted.

| | main | branch |
|---|---|---|
| E2a status / Evidence | **`running` → `finished`; `act_w@a2: PERSISTED` created** | stays `running`; no Evidence; 3× `attempt_mismatch` |
| E2b status / Evidence | **`failed` → `finished`; another Evidence (`act_w2@a2`)** | stays `failed`; no Evidence; 5× `run_owned_by_other_instance` |
| E2c attempt-1 events after retry | n/a | all 5 rejected (`attempt_mismatch`); status stays `starting`; no Evidence |
| E2c attempt-2 events | n/a | all accepted; `finished`; `act_new@a2: PERSISTED` |

### E3 — `run.started` (and further events) for a run already finished, failed or halted
- **Setup:**
  - **finished / failed:** the current instance's own run is driven to `finished` (`run.finished`) or `failed` (`run.failed`). The **same** instance then emits `run.started`, then `action.started` / `action.finished (test)` and the opposite terminal event.
  - **halted:** the run is halted by `maxDurationMs: 1500`, which also terminates that instance. A fresh current instance then emits the full script for the halted run. A same-instance halted case isn't possible, because a halt terminates the instance.
- **Expected:** the terminal state stays terminal, and no Evidence is created.

| Run state | main | branch |
|---|---|---|
| finished | **`run.started` → `running`; final `failed`; `act_t: PERSISTED` created** | stays `finished`; 4× `run_terminal`; no Evidence |
| failed | **`run.started` → `running`; final `finished`; `act_t: PERSISTED` created** | stays `failed`; 4× `run_terminal`; no Evidence |
| halted | **final `finished`; `act_h: PERSISTED` created** | stays `halted`; 5× `run_owned_by_other_instance`; no Evidence |

### E4 — `action.finished` without a matching `action.started`
- **Setup:** the current instance's own `running` run; it emits only `action.finished act_nostart (kind=test)`.
- **Expected:** no Evidence and no execution-state change.
- **main:** accepted; **`act_nostart: PERSISTED` Evidence created**; run stays `running`.
- **branch:** rejected (`illegal_transition`, action rules); no Evidence; run stays `running`; no active actions.

### E5 — same `actionId` in two concurrent runs of the current instance
- **Setup:** runs R1 and R2, both `running`, on the same current instance.
  - (a) R1 `action.started act_same`, then R2 `action.finished act_same` with no start in R2.
  - (b) R2 starts and finishes its own `act_same`.
  - (c) R1 finishes its own `act_same`.
- **Expected:** neither run's action state or Evidence is affected by the other.

| Step | main | branch |
|---|---|---|
| (a) R1 active actions | **`act_same` → cleared by R2's event** | `act_same` still active in R1 |
| (a) Evidence | **R2 receives `act_same: PERSISTED` for an action it never started** | none; R2 event rejected (`illegal_transition`) |
| (b) | accepted; **R2 now holds 2 Evidence records for `act_same`** | accepted; R2 has 1 Evidence record; R1's `act_same` still active |
| (c) | accepted; R1 Evidence created, although R1's active-action state had already been cleared in (a) | accepted; R1 Evidence created; R1's active actions now none |

### E6 — same `actorId` across runs and across adapter instances
- **Setup:**
  1. R1 forks, starts and finishes actor `w`, then finishes `root`. R1 has no unresolved writers.
  2. R2 (same instance) reuses `root` and `w`; `w` starts and leaves an action active.
  3. The instance then exits.
  4. A new instance runs R3, which reuses `w` through to `run.finished`.
- **Expected:** each run's actor lifecycle is independent.

| Observation | main | branch |
|---|---|---|
| R1 actors after R2's events | **`w: finished → running`, `root: finished → running`** | `w: finished`, `root: finished` (unchanged) |
| R1 no-writer reasons after R2's events | **`actors unresolved: root:running, w:running` and `active actions: act_w2`**, so R1's snapshot condition is now blocked by R2 | none |
| R2 `w` after its instance died | `finished` (global state overwritten by later events) | `aborted` |
| R2 `w` after R3 ran | `finished` | `aborted` (unchanged by R3) |
| R3 | `finished`, no violations | `finished`, no violations |

### E8 — normal valid current-run behaviour
- **Setup:** the current instance's own run:
  - `run.started`;
  - fork, then `actor.started w`;
  - `action.requested` → `action.started` → `action.updated` → `action.finished` (test), all by `w`;
  - `actor.finished w`, `actor.finished root`;
  - `run.finished`.
- **Expected:** `finished`, one Evidence record, no violations.
- **main:** `finished`; `act_ok: PERSISTED`; all 10 frames accepted; no violations.
- **branch:** `finished`; `act_ok: PERSISTED`; all 10 frames accepted; no violations.

### Existing suites (run before the experiments, on pristine exports)

| State | `npm run typecheck` | `npm test` | `npm run spike` |
|---|---|---|---|
| main `38e39b2` | exit 0 | 9 files, **64/64** passed | SPIKE OK |
| branch `6072705` | exit 0 | 17 files, **108/108** passed | SPIKE OK |

On `main`, all 64 tests pass even though E1–E6 above all fail. The suite there doesn't exercise these cases.

## Existing Test Coverage

### `origin/main` (`38e39b2`)
- **C06** (`c06-adapter-instance-id.test.ts`) covers:
  - per-instance `adapterSequence`;
  - duplicate and gap detection;
  - stale or retired instance fencing (the old-pipe case);
  - forged instance ID;
  - per-instance `actorSequence`;
  - replay.

  None of its tests has the **current** valid instance naming another instance's run, a wrong attempt, or a terminal run.
- **No tests** for E1–E6. This matches the runtime result: every one of those behaviours reproduces while the suite stays green.

### `6072705` (branch)
- **C10** (`c10-run-binding.test.ts`) covers:
  - a fresh instance naming another instance's terminal run, via the full mock script (E1/E7 shape, `failed` run);
  - a wrong attempt on a live run (E2a);
  - same-instance events after its own terminal run (E3 for `finished`);
  - a second `run.started` on a live run;
  - legal `retryRun`;
  - attempt-1 events after a retry (E2c);
  - `retryRun` refused on a non-terminal run.
- **C14** (`c14-lifecycle-fsm.test.ts`) covers:
  - finish without start (E4);
  - duplicate finish;
  - update before start;
  - run events before `run.started`;
  - a finished actor acting;
  - one actor finishing another actor's action;
  - the normal path (E8).
- **C16** (`c16-retry-atomicity.test.ts`) covers late events for a `failed_to_start` attempt.
- **C06** covers stale-pipe fencing as on main.
- **Not covered by committed tests** (covered only by the temporary experiments above):
  - the current instance naming a **halted** run (E3 halted);
  - the same instance naming its own **failed** run (E3 failed; C10 covers `finished`);
  - **the same `actionId` in two concurrent runs** (E5);
  - **the same `actorId` across concurrent runs**, with the other run's no-writer state checked (E6);
  - wrong attempt against an old run owned by another instance (E2b). Ownership is checked first there, so this reduces to E1.

## Remaining Gap

1. **Merge state.**
   - **What:** the behaviour that closes H1 exists only in the unmerged branch commit `6072705` (`c01ffd6` + `6072705`).
   - **Where:** `origin/main` (`38e39b2`).
   - **Smallest incorrect behaviour:** `Kernel.ingest()` calls `applyEvent()` for any known `runId` without comparing the run's bound instance, its attempt or its status (l.648–650). Actor and action state is keyed globally by `actorId` / `actionId` (l.185, l.192).
   - **Consequence (runtime-verified):** the current valid adapter can revive `finished`, `failed` and `halted` runs, create Evidence for other runs and attempts, and change the actor/action state of a concurrent run.
2. **Committed tests on the branch don't yet cover E5, E6, E3-halted and same-instance E3-failed.** The runtime behaviour there is correct per the experiments, but a regression in those paths would not fail the suite.
3. **Observation, branch, not an H1 failure in the tested paths.** The per-actor sequence check is keyed by instance, run and actor, not attempt (l.828). In E2a/E2c it recorded diagnostic `actor_sequence_gap` violations alongside the attempt-mismatch rejections. **Inferred, not tested:** if the same instance served attempt N+1 of a run and restarted `actorSequence` at 1, the Kernel would record `actor_sequence_gap` violations for valid frames. Those frames would still be admitted, and no run state was seen to change because of this.

## Final H1 Verdict

**Can one valid current execution still affect another run/attempt/terminal execution incorrectly?**

- **On `origin/main` (`38e39b2`): yes.** This is observed at runtime:
  - the current valid adapter revived failed, finished and halted runs to `running`/`finished`;
  - it created Evidence for other instances' runs and for unbound attempts;
  - it cleared another concurrent run's active action;
  - it reset another run's finished actors to `running`.
- **On `6072705` (unmerged branch): no, for every path tested.**
  - Cross-instance, cross-attempt, terminal-run, unmatched-finish, `actionId`-reuse and `actorId`-reuse events were rejected or isolated, with no state or Evidence change.
  - The normal current-run path still completes.
  - H1 is closed in the repository only once that change is on the default branch.
