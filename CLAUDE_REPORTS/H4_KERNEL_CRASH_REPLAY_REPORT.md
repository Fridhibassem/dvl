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

---

## Split-brain fence: single-Kernel root ownership (follow-up)

### Blocker

Reproduced with a scratch script. Kernel A drives a run, and Kernel B starts on the same root
while A is still alive (a host's false "A crashed"). B records `kernel.run_interrupted`, and A
finishes and reports `finished` to its caller. On replay, A's `run.finished`/`kernel.run_finished`
are rejected by the HMAC chain (5 rejected lines), and durable truth says `interrupted`. The two
writers forked the log, and which verdict survives depends on write order.

### Fix

| Piece | What |
|---|---|
| `kernel/root-lock.ts` | *(Superseded by the flock lock, see "Cross-platform root lock" below.)* OS-backed lock: a Linux **abstract-namespace Unix socket** bound by the owning Kernel process. Exclusive (`EADDRINUSE` for every other binder, same process included). The OS drops it when the process dies (SIGKILL included), so there is no lock file and nothing to go stale. Still held by a SIGSTOPped owner. Close-on-exec, so the adapter child never inherits it (checked: a spawned child holds no copy). Named from the root's `(dev, inode)`, so path aliases share one lock. The bind/release runs on a worker thread and the caller blocks on `Atomics.wait` (bounded, 5 s), so `start()` stays synchronous. Non-Linux fails closed (`root_lock_unsupported`) |
| `Kernel.start()` | `assertDurable()`, **then acquire**, then any owner write (`kernel.run_interrupted`, spawn records). A refused Kernel writes nothing |
| `Kernel.recoverDurableTail()` | Acquires before truncating or recording. A refused recovery releases the ownership it took for itself |
| Stale-replay guard | After acquiring, the log sizes on disk must equal the store's committed bytes (`EventStore.diskBeyondReplay()`). Otherwise `stale_replay`: lock released, nothing written. Without it, a Kernel that replayed while the previous owner was still appending would take over after the owner died and continue the chain from a stale head (a fork) |
| `Kernel.shutdown()` | Releases ownership after the adapter is stopped |
| Errors | `RootLockError` with code `root_locked` / `stale_replay` / `root_lock_failed` / `root_lock_unsupported` |

### Tests (C28, `c28-h4-root-ownership.test.ts`)

The live owner is a Kernel in its own process (`h4-kernel-host.ts`), mid-run.

| # | Asserts |
|---|---|
| 1 | Construction does not own. `start()` owns, `shutdown()` releases. A Kernel that replayed before the owner wrote is refused `stale_replay` with zero bytes written; a fresh Kernel then takes over |
| 2 | Owner alive: `start()` and `recoverDurableTail()` are both `root_locked`; no `run_interrupted`, no `durable_recovery`, both logs byte-identical. A symlink alias maps to the same lock name |
| 3 | Same with the owner **SIGSTOPped** |
| 4 | Owner **SIGKILLed**: a fresh Kernel takes over and records the interruption exactly once |

### Changed existing tests

C07 tests 2 and 6 ran **two Kernels on one root in parallel** (their own comment said "one Kernel
per root is the design"). That state is now refused by design. Both tests now run the two Kernels
one after the other on the same root, using the host key (`kernelOn`), with every spool-isolation and
cross-import assertion kept. Test 6 picks each instance's evidence by `adapterInstanceId`,
because k2 now replays k1's evidence.

### Verification

| Check | Result |
|---|---|
| `npm test` | 28 files, **246/246**, three consecutive runs |
| `npm run typecheck` | clean |
| Lock disabled (falsification) | C28 tests 2 and 3 fail |
| Stale guard disabled (falsification) | C28 test 1 fails |
| Split-brain repro against the fix | B's `start()` throws `root_locked`; A is unaffected |
| khedma.tn checkout | `git status` empty |

### Known limits of the fence (not addressed, by request)

- **Network namespaces** *(resolved by the flock lock)*. Abstract sockets are per network namespace. Two Kernels in different
  containers that share a volume do not see each other's lock.
- **Constructor-time records.** A Kernel's constructor still writes `kernel.integrity_violation`,
  `kernel.anchor_rollback_accepted` or `kernel.integrity_key_ephemeral` without the lock (H2 tests
  C24/C25 rely on this). It happens only when integrity is already broken, a rollback is decided, or
  no key is given, but a reader opened beside a live owner in those states can still append.
- **Size-based stale check.** It catches appends, the split-brain mode, not a same-size rewrite.
- **Keyless Kernels** can no longer start on a root with existing logs (`stale_replay`: they
  authenticate nothing, so their committed size is 0). That is fail-closed behaviour; before this change they appended
  lines no keyed replay accepts.
- Not yet addressed: a lagging host anchor, killing a surviving old adapter before archive, and
  khedma.tn coverage in CI.

---

## Cross-platform root lock: flock(2) (follow-up)

The abstract-socket lock was Linux-only. It is replaced by **flock(2) `LOCK_EX|LOCK_NB` on
`<root>/.dvl/kernel.lock`**, held on one fd for as long as the Kernel owns the root, on Linux and macOS.
The `RootLock.acquire()`/`release()` API is unchanged, so `kernel.ts`, the stale-replay guard and the
recovery gating are untouched.

### Pre-implementation proof (standalone, stdlib Python, no DVL code)

| Platform | Second owner refused | SIGSTOP blocks | SIGKILL releases | Child does not retain (+ control) | Symlink alias |
|---|---|---|---|---|---|
| macOS 13.7.8 x86_64, Python 3.14.2 (run by the user on their Mac) | PASS | PASS | PASS | PASS | PASS |
| Linux x86_64 (this session) | PASS | PASS | PASS | PASS | PASS |

Also checked on Linux and rejected: an SQLite/POSIX `fcntl` lock is **silently lost** when the owner
process opens and closes the lock file through another fd. `flock` is not affected.

### Implementation

| Piece | What |
|---|---|
| `native/dvl_flock.c` + `binding.gyp` | The only native code: one N-API function, `tryLockExclusive(fd)` → `flock(fd, LOCK_EX\|LOCK_NB)`, which returns 0 or errno and retries on EINTR. Built by npm's default `node-gyp rebuild` on `npm ci`/`npm install` (no new dependency, lockfile unchanged) |
| `kernel/root-lock.ts` | JS opens the file `O_RDWR\|O_CREAT\|O_NOFOLLOW` (libuv adds `O_CLOEXEC` atomically). `EWOULDBLOCK` → `root_locked`. `ENOTSUP`/`EOPNOTSUPP`/`ENOLCK` → `root_lock_unsupported`. After locking, the name must still be the locked inode (`fstat` vs `lstat`), else `root_lock_failed`. Release closes the fd. The lock file is never deleted. A missing addon or another OS → `root_lock_unsupported` (fail closed, never unlocked) |

### Tests

C28 now runs against flock. Test 2's alias check acquires through a **symlinked root** (`root_locked`).
Test 4 SIGSTOPs the owner's **adapter child** so that it is provably alive at takeover, and the
takeover still succeeds.

| Check | Result |
|---|---|
| `npm test` | 28 files, **246/246**, three consecutive runs (Linux) |
| `npm run typecheck` | clean |
| `rm -rf build && npm ci` | addon built automatically |
| Falsify: lock fd deliberately passed to the adapter (extra stdio) | C28 test 4 fails (`root_locked`): retention is detectable |
| Falsify: flock result forced to 0 | C28 tests 2 and 3 fail |

### Not verified

- **The Node/addon path on macOS.** Only the Python proof ran on a Mac. Run on the Mac:
  `cd dvl-spike && npm ci && npx vitest run src/conformance/c28-h4-root-ownership.test.ts`.
  This needs the Xcode Command Line Tools for the build.
- **No macOS CI job.** Other suites have not been run on macOS, so adding one may surface unrelated
  failures.

### Limits (unchanged scope, not addressed)

- Replacing the lock file **after** acquisition (same-user unlink) is not detected; that needs a per-commit
  inode re-check. Only replacement during acquisition is refused.
- Network filesystems (NFS emulates flock with fcntl locks; SMB may lock locally only) and VM boundaries
  (e.g. Docker Desktop with the project mounted from the host) are not fenced.
- Constructor-time records, the size-only stale check and keyless Kernels stay as described above.
