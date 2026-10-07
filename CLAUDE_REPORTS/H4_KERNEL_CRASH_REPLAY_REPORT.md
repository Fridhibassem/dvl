# H4 Kernel Crash Replay Report (first crash test)

## Identification

| | |
|---|---|
| Branch | `claude/sweet-curie-6o0u3u` |
| Base commit | `e55760f` (`main`, "remove sensitive contract references from spike") |
| Real target project | `Fridhibassem/khedma.tn` @ `c08ac81` (branch `task/KHD-002-design-system`), read-only |
| Scope | H4 only. H1/H2/H3 unchanged. Nothing pushed to khedma.tn, nothing merged |

## Finding on the base commit

The event store replayed the authenticated JSONL logs, but the **Kernel rebuilt no run
state from them**. After a restart, `runStatus(runId)` was `undefined`, `waitForRunEnd`
rejected with "unknown run", `retryRun` refused, and a replacement adapter's frames for the
run were `unknown_run`. Nothing said whether a replayed run had finished, failed, or was
still live when the Kernel died.

## Change

`dvl-spike/src/kernel/kernel.ts`

- New terminal run status `interrupted`: the attempt was live when the Kernel stopped; outcome
  unknown; **never success**.
- `rebuildRunsFromReplay()` (constructor): rebuilds each run from **Kernel-origin** records only
  (`kernel.run_created`, `kernel.attempt_created`, `kernel.run_<terminal>`). An adapter
  `run.finished` in the log is a claim and decides nothing. An attempt with no terminal Kernel
  record becomes `interrupted`. Construction stays read-only (a replaying Kernel may be a reader).
- `start()`: the Kernel that takes ownership of the root records `kernel.run_interrupted` once per
  such attempt. Replay of that record is terminal, so it is never written twice.
- Recovered runs keep their original adapter binding, so the new adapter instance is fenced
  (`run_owned_by_other_instance`). Continuation only via `retryRun()` (attempt N+1, fresh
  workspace, attempt N archived with `previousStatus: "interrupted"`).

`dvl-spike/src/mock-provider/scenarios.ts`: `H4_PROBE` plus scenarios `h4-target-probe`
(stage probe, then stay busy) and `h4-target-probe-finish`.

## Crash test (C27, `c27-h4-kernel-crash-replay.test.ts`)

The Kernel runs in its **own process** (`h4-kernel-host.ts`) and is killed with **SIGKILL**
after the probe write is committed: no shutdown, no flush. The integrity key reaches it over a
stdin pipe (never env or disk); it publishes every commit boundary to the test, which plays the
host and replays with the last one it holds.

| # | Asserts |
|---|---|
| 1 | Replay is intact (no rejected lines, no truncation, no recovery needed); run is `interrupted`; no `run.finished`, no `kernel.run_finished`, no FILE_SNAPSHOT; replay wrote nothing; the probe exists byte-exact only in `.dvl/tx/<run>/attempt-1`; project tree byte-identical; the adapter did not outlive the Kernel |
| 2 | `start()` records `kernel.run_interrupted` exactly once; an injected `run.finished` for the dead attempt is a binding violation; `retryRun` → attempt 2 `finished`; attempt 1 archived as `interrupted` with the probe in its manifest; a further restart replays `finished` and re-records nothing |
| 3 | The narrowest window: the adapter's `run.finished` committed, the Kernel's verdict not (logs cut at that commit boundary). Replay is `interrupted`, not `finished` |

Each case runs against a synthetic project (always, including CI) and **khedma.tn** when a
checkout exists (`DVL_H4_TARGET`, default a sibling `khedma.tn` checkout; CI has none and logs
that it ran the synthetic target only).

### khedma.tn safety

- Only `git ls-files` (tracked files) are copied into a temp root. `.env`, `.git`,
  `node_modules` and other ignored files are never read or copied.
- The only change ever staged is one new file, `tests/dvl-h4-probe.test.ts` (`expect(1 + 1).toBe(2)`),
  and only inside `.dvl/tx/...` of the temp copy. No application code, config, Prisma/database,
  deployment, secrets, network or external service is touched; nothing in khedma.tn is installed
  or executed.
- Tests assert the copy's project tree is byte-identical and the checkout's `HEAD` and
  `git status --porcelain --untracked-files=all` are unchanged.

## Verification

| Check | Result |
|---|---|
| `npm test` | 27 files, **242/242 passed** (236 before + 6 new) |
| `npm run typecheck` | clean |
| C27 against the base Kernel (`kernel.ts` reverted) | **6/6 fail** (`undefined` instead of `interrupted`; no interruption record) |
| C27 repeated | 3 further runs, 6/6 each |
| Without a khedma.tn checkout | 3/3 (synthetic only) |
| khedma.tn checkout after all runs | `HEAD` unchanged, `git status` empty |

## Limits (not solved by H4)

- **Two Kernels on one root at once** is still unsupported. A second Kernel that calls `start()` while
  the first still has a live run would mark it `interrupted` and both would append to one chain. There is
  no root lock yet.
- **Commit boundaries the host lost.** If the host's last anchor is older than the disk, replay
  needs `recoverDurableTail()` (H2 behaviour). Test 1 checks that path is not triggered here. It
  does not exercise the path.
- **Not rebuilt:** actor/action detail of a recovered attempt, the dead instance's adapter spool
  (still pruned by `pruneAdapterSpools`), and duration timers. An interrupted attempt is terminal, so
  none of that can act. A retry starts from an empty workspace unless a VALIDATED FILE_SNAPSHOT is
  selected.
- The probe was not executed under khedma.tn's own vitest, because that needs `npm ci` from the
  registry, which is out of scope here.
