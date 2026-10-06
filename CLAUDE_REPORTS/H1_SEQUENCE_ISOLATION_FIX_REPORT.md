# H1 Sequence Isolation Fix Report

Date: 2026-10-07. Scope: H1 only — the confirmed Codex finding "actor ordering / actorSequence
tracking is not isolated by attempt". No H2/H3/H4 work, no architecture change.

Base: `claude/hopeful-feynman-5tukg2` at `c062be9` (fast-forwarded to the remote first; that
commit removed two documents, which remain removed).

## Confirmed problem (reproduced before any production change)

In `Kernel.ingest()` the per-actor ordering check ran **before** the admission gate and was
keyed by `(adapterInstanceId, runId, actorId)` — no attempt:

- **Same-instance retry:** attempt 2 restarting `actorSequence` at 1 hit attempt 1's
  expectation → false `actor_sequence_gap`.
  - Reproduced by new test C19-A on unchanged code: **2 false gap violations**.
- **Wrong-attempt pollution:** rejected attempt-2 frames advanced the expectation shared with
  attempt 1, so valid attempt-1 frames looked out of order.
  - Reproduced by C19-B on unchanged code: **2 false gap violations**.
  - The lifecycle and Evidence assertions in the same test already held, which confirms the
    defect was confined to ordering metadata.

## Exact fix — `dvl-spike/src/kernel/kernel.ts`, `ingest()`

1. **The admission verdict is computed first.** `const verdict = run ? this.admit(...) : null`
   now runs before any ordering state is read.
2. **Ordering is keyed by the execution stream** `instanceKey(aid, runId, attempt, actorId)`.
   Attempt N+1 therefore starts its actor streams at 1, even on the same adapter instance.
3. **Ordering is read and advanced only by frames that pass the binding checks.**
   - `bindingRejected` covers `run_owned_by_other_instance` and `attempt_mismatch`. Frames
     rejected for either reason never read or move any expectation. They can neither pollute
     the authorized attempt nor pre-load a future Kernel-created attempt.
   - A frame of the authorized stream that is rejected **only by the lifecycle rules** (for
     example an illegal transition) still occupies its sequence slot, because the adapter's
     counter moved. This prevents a false gap on the next legitimate frame.
4. **The rejection path is unchanged:** the event is stored as `protocol_violation` with a
   `run_binding_violation`, and nothing is applied. Lifecycle, Evidence and stale-pipe
   protections are untouched.

**Design note:** a first attempt that moved ordering *after full admission* passed tests A and
B. However, it made a lifecycle-rejected frame skip its slot and produce a **false gap**. New
test C19-C exposed this (mutation M3 below). The final rule distinguishes binding rejections
from lifecycle rejections.

## Exact new regression tests — `dvl-spike/src/conformance/c19-h1-actor-sequence-isolation.test.ts`

All frames come from the current, handshaken adapter with explicit `actorSequence` values (`harness.injectFrames`).

- **A. Same-instance retry: attempt 2 restarts root actorSequence at 1 with no false
  actor_sequence_gap.**
  - Attempt 1: root seq 1 (`run.started`), 2 (`run.failed`) → `failed`.
  - `retryRun` creates attempt 2 on the **same** instance (asserted).
  - Attempt 2: root seq 1, 2, 3 (`run.started`, `actor.finished`, `run.finished`).
  - Expect: all accepted, run `finished`, no `actor_sequence_gap`, no violations.
- **B. Rejected wrong-attempt frames do not move the authorized attempt's actor ordering.**
  - Attempt 1 accepts seq 1. Attempt-2 frames with seq 2, 3, 4 (`action.started`,
    `action.finished`, `run.finished`) are all rejected as `attempt_mismatch`.
  - The run stays `running`; there's no Evidence and no active action.
  - Valid attempt-1 seq 2, 3 are accepted with no `actor_sequence_gap`; the run is `finished`
    with no Evidence.
  - Extension: after `retryRun` creates attempt 2, its root stream starts cleanly at 1 (seq 1,
    2 accepted, no gap). The earlier rejected attempt-2 frames did not pre-load it.
- **C. A lifecycle-rejected frame of the authorized attempt still occupies its sequence slot
  (no false gap after it).**
  - Seq 1 `run.started`, then seq 2 `action.finished` without a start (rejected,
    `illegal_transition`), then seq 3 `actor.finished`, then seq 4 `run.finished`.
  - Expect: seq 2 rejected, others accepted, no gap, `finished`, no Evidence.

### Mutation check (temporary edits, `kernel.ts` restored byte-for-byte)

| Mutation | C19 failing tests |
|---|---|
| M1 ordering key without attempt | A, B |
| M2 binding-rejected frames advance ordering | B |
| M3 only fully admitted frames advance ordering (over-correction) | C |
| M4 original pre-fix Kernel (`c062be9`) | A, B |

## Full-suite reliability fixes (test-side only; assertions not weakened)

- **C13 test 6 — Linux-only `/proc/<pid>/environ`:**
  - The mock adapter can now dump its own `process.env` to stderr (`DVL_MOCK_DUMP_ENV`,
    test-only). The Kernel drains stderr to the instance's diagnostics spool.
  - The test asserts the dump is present (non-vacuous), that it carries `DVL_PROJECT_ROOT`, and
    that it contains no raw, hex or base64 form of the integrity key.
  - The `/proc` check is kept when `/proc` exists.
  - **Verified:** with `/proc` disabled (simulating macOS), the test passes on the real Kernel
    and **fails** on a Kernel mutated to pass the key in the adapter's environment.
- **C16 — handshake timeout:**
  - **Cause:** `requestTimeoutMs: 400` also bounds the `adapter.describe` handshake, which a
    cold adapter spawn can exceed on slower machines. A fixed 1.5 s sleep raced the late
    adapter output.
  - **Fix:** `REQUEST_TIMEOUT_MS = 3000` (handshake headroom), `ACK_DELAY_MS = 4500` (so
    `run.start`, and only it, still times out), and polling until the late adapter's
    `run.finished` has been processed.
  - Assertions are unchanged: dispatch times out, the attempt is `failed_to_start`, all ≥10
    late events are rejected (`run_terminal`), there's no Evidence, and attempt numbering stays
    monotonic.
  - **Verified:** 3/3 passed twice under 6 concurrent CPU-busy loops.

## Changed files

| File | Kind |
|---|---|
| `dvl-spike/src/kernel/kernel.ts` | production — the ordering fix in `ingest()` (+ `actorSeq` comment) |
| `dvl-spike/src/conformance/c19-h1-actor-sequence-isolation.test.ts` | **new** regression suite (3 tests) |
| `dvl-spike/src/conformance/c13-durable-authority.test.ts` | portable environment check |
| `dvl-spike/src/conformance/c16-retry-atomicity.test.ts` | handshake-safe timing, polling instead of sleep |
| `dvl-spike/src/mock-provider/mock-provider.ts` | test-only `DVL_MOCK_DUMP_ENV` |
| `CLAUDE_REPORTS/H1_SEQUENCE_ISOLATION_FIX_REPORT.md` | this report |

## Results

| Command | Result |
|---|---|
| `npm test` run #1 | exit 0 — 19 files, **119/119 passed** |
| `npm test` run #2 | exit 0 — 19 files, **119/119 passed** |
| `npm test` run #3 | exit 0 — 19 files, **119/119 passed** |
| `npm run typecheck` | exit 0 |
| `npm run spike` | exit 0 — "SPIKE OK — every scenario reached its expected terminal state" |

Per suite: C01 6, C02 4, C03 6, C04 4, C05 4, C06 13, C07 10, C08 14, C09 4, C10 7, C11 7,
C12 5, C13 6, C14 8, C15 5, C16 3, C17 2, C18 8, **C19 3** (previously 116 tests).

## Ready for Codex re-review?

**Yes — ready for re-review of this finding.**
- Both reported behaviours, and a third adjacent one (a lifecycle-rejected frame causing a
  false gap after the fix), are reproduced, fixed and pinned by mutation-checked C19 tests.
- All pre-existing suites (C01–C18) pass unchanged in behaviour.
- The two reported full-suite issues are resolved without weakening assertions.

**Not claimed here:**
- an H1 PASS (that is Codex's verdict);
- any change to `main` (not pushed, not merged).
