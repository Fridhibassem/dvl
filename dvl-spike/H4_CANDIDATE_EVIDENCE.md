# H4 authoritative candidate evidence

**Implementation evaluated:** `d92d0636334a4342b917331fa8bbc2d7e24b9b6a` on `codex/h4-candidate`.

**Verdict:** `READY_FOR_FINAL_H4_CLOSURE_DECISION` for the scoped Phase 1 spike. This evidence supports a final H4 closure decision; it does not itself declare H4 closed.

Both this document and `H4_CANDIDATE_TEST_RESULTS.json` describe the exact implementation above. They replace stale candidate counts and unsafe-native-launch statements. This regeneration changes only the two evidence artifacts. Implementation, tests, architecture and Frozen Contract are unchanged. The implementation Git tree is `2cb7865f085d917b548e95c4de59f36540769cdf`. The JSON includes source SHA-256 values, command arguments, timestamps, exit codes, every test name/status, selected-case exclusions and failure lists. Source drift was checked before and after every command.

## Physical host and execution

- macOS 13.7.8, build 22H730, x86_64; Node v24.9.0; Vitest 2.1.9.
- Evidence campaign: 2026-10-10T23:09:19.461854+00:00 through 2026-10-10T23:16:44.804832+00:00 (UTC).
- The provider processes actually run under `/usr/bin/sandbox-exec` on this macOS host. Physical Kernel SIGKILL/replay, flock ownership, process-group inspection/termination, HTTP service, SQLite and filesystem tests execute locally.
- C27 uses seven synthetic cases and seven tracked-file copies of `/Users/user/Desktop/khedma.tn` at `c08ac8154c2c31a4cc6291346ec7195beb825ae7`. The source checkout is checked for changes; ignored files, credentials and node_modules are not copied.
- Test-file concurrency is bounded to two workers. The focused campaign, isolated counterexample and two full suites run sequentially against the unchanged implementation SHA.

## Authoritative test results

| Run | Tests | Passed | Failed | Skipped/pending/todo |
|---|---:|---:|---:|---:|
| C27 | 14 | 14 | 0 | 0 |
| C28 | 5 | 5 | 0 | 0 |
| C29 | 11 | 11 | 0 | 0 |
| C30 | 23 | 23 | 0 | 0 |
| C31 | 29 | 29 | 0 | 0 |
| Full suite 1 (31 files) | 318 | 318 | 0 | 0 |
| Full suite 2 (31 files) | 318 | 318 | 0 | 0 |

C27–C31 combined: **82/82**, five files, 0 failures and 0 skipped/pending tests. Full-suite durations: 195.627 seconds and 192.739 seconds, measured around the CLI processes. Full suite 1: **318/318**; full suite 2: **318/318**. Every required test ran on macOS; Linux/Windows policy seams are included, but no Linux/Windows provider process is claimed.

Typecheck exit code: **0**. Initial `git diff --check` exit code: **0**. The regenerated artifact diff is checked again before the evidence-only commit.

The extra counterexample-only run executes **1 passed case**, with 0 failures and **28 deliberately deselected C31 cases** due to the name filter. Those cases all execute in the focused C31 run and both full suites; this exclusion is not unsupported-platform skip evidence. Detailed failures and exclusions are recorded in the JSON, including any nonzero command exit.

Reproduction from `dvl-spike`, after checking out the implementation SHA:

```sh
/usr/local/bin/node node_modules/typescript/bin/tsc --noEmit
git diff --check
DVL_H4_TARGET=/Users/user/Desktop/khedma.tn /usr/local/bin/node node_modules/vitest/vitest.mjs run src/conformance/c27-h4-kernel-crash-replay.test.ts src/conformance/c28-h4-root-ownership.test.ts src/conformance/c29-h4-recovery-process-fence.test.ts src/conformance/c30-h4-b4-durable-before-effect.test.ts src/conformance/c31-h4-provider-confinement.test.ts --no-cache --maxWorkers=2 --minWorkers=1
DVL_H4_TARGET=/Users/user/Desktop/khedma.tn /usr/local/bin/node node_modules/vitest/vitest.mjs run src/conformance/c31-h4-provider-confinement.test.ts --testNamePattern 'closure: former unconfined double-POST counterexample' --no-cache --maxWorkers=2 --minWorkers=1
DVL_H4_TARGET=/Users/user/Desktop/khedma.tn /usr/local/bin/node node_modules/vitest/vitest.mjs run --no-cache --maxWorkers=2 --minWorkers=1
DVL_H4_TARGET=/Users/user/Desktop/khedma.tn /usr/local/bin/node node_modules/vitest/vitest.mjs run --no-cache --maxWorkers=2 --minWorkers=1
```

The executed commands use JSON reporters and distinct output files; their exact argv appears in the JSON artifact. Native dependencies must already be built for this physical host; the local native addon's SHA-256 is recorded separately from tracked source.

## B1–B4 and enforced execution boundary

| Blocker | Evidence on this implementation |
|---|---|
| B1: crash/replay loses action identity | C27 physically crashes with an oversized/spooled `action.started`; structural authenticated `actionId` survives. Tampering the structural ID with the old MAC is refused. Deleting the payload body does not remove UNKNOWN or allow retry. |
| B2: stale/non-owner authority or lost uncertainty | C28 refuses both DONE and NOT_DONE reconciliation by a non-owner with `root_locked`, and both durable ledgers remain byte-identical. Explicit trusted reconciliation is durable; provider claims cannot resolve prepared outcomes. |
| B3: old executor may still mutate | C29 covers detached executor/descendant survival, late and same-size writes, kill/inspection/identity failure, quiescence and Windows policy refusal. C30 keeps B3 HOLD despite NOT_DONE when an old executor cannot be fenced. Stale authority is durably revoked, group termination is proved, workspaces become quiescent and a final fence record precedes retry. |
| B4: effect precedes durable identity | C30 exercises physical crash boundaries before PREPARED, after PREPARED/grant/STARTED, after effect before outcome, and after durable outcome, plus fsync/publication failures. C31 verifies launch refusal, native denial, scoped mock broker intent/authority binding, and fsync denial. |

`Kernel.spawnAdapter()` requires an enforced confinement configuration before executing provider code. The shipped mock automatically selects its host-owned configuration; a custom provider needs an explicit configuration. Both initial launch and replacement use this method. It selects only `confinedProviderLaunch(...).argv` and its fresh environment. **There is no raw `adapterCommand` fallback in this implementation.** Missing/unsupported confinement produces `HOLD_PROVIDER_CONFINEMENT_UNAVAILABLE` with `retryAllowed=false` before provider spawn. Capability declarations, prompts and `nativeEffectsAllowed:false` are not the enforcement boundary.

The macOS Seatbelt profile denies operations by default. It allows narrowly selected runtime/code reads, metadata reads, fork/exec and self-signalling. It provides no direct filesystem mutation, network socket, general Mach lookup, task-port, Apple-event or other general IPC authority. Descendants, shells and native tools inherit confinement, including a detached child and a nested sandbox that tries to relax restrictions. A fresh environment contains fixed public runtime settings and explicit `DVL_PUBLIC_*` configuration. HOME, NODE_OPTIONS, host environment secrets and raw effect credentials are not inherited. Host-selected code read paths must be trusted and contain no effect secrets; the provider cannot choose these paths. Credential file and allowed-code symlink escape attempts are tested.

The provider can propose an effect, while the trusted Kernel owns execution. The durable order is:

```text
kernel.action_prepared (authenticated, fsynced, host-published)
  -> kernel.action_execution_authorized
  -> kernel.action_execution_started
  -> sole Kernel broker invocation
  -> durable trusted outcome or UNKNOWN / explicit reconciliation
```

PREPARED contains action/run/attempt, actor, adapter instance, assignment and authority identities, action kind/target/parameters, semantic signature, operation identity, mutation/external classification and execution owner. Replay treats an unresolved prepared action as UNKNOWN even when no STARTED observation exists. Provider FINISHED observations cannot establish prepared-effect outcomes. NOT_DONE inspection does not bypass process fencing. Uninspectable outcomes remain `HOLD_RECOVERY_ACTION_UNKNOWN`, `retryAllowed=false`; unproved old execution remains `HOLD_RECOVERY_PROCESS_STILL_ALIVE`, `retryAllowed=false`.

Two implemented effect boundaries are in scope:

1. `Kernel.executeSpikeAction()` and `ExternalLedgerExecutor`: a validated logical ledger operation, host-owned operation identity, immutable intent and private host target. Confirmed outcomes can be reused for the same explicit logical operation; provider-native ownership/mode and fallback are refused. Native POST attempts remain denied while the broker executes exactly one recorded effect.
2. `Kernel.executeMockFilesystem()` and `planMockFilesystem()`: the mock's pre-opened private request/response pipes propose operations. The Kernel validates root ownership, live adapter/run/attempt assignment, termination/revocation and scope before mutation. Only live attempt workspace and own adapter artifact paths are writable through this tool. Writes, append, mkdir, rename and removal require durable PREPARED/grant/STARTED first; direct provider syscalls remain denied. Reads are separate and cannot use mutating flags. External paths, Kernel-log writes, aliases, wrong assignments and shell/network/DB/credential method requests are refused. No raw effect descriptor or credential is granted to the provider.

Read-only observation without an effect broker is positively tested under confinement. Kernel-owned event/evidence/diagnostic/transaction bookkeeping is trusted internal storage, not provider mutation authority. The test host can inject historical hostile bytes for independent integrity defenses. In C29 it deliberately seeds a historical unconfined executor to test recovery; that fixture is not a reachable unconfined launch through the current Kernel.

## Former unsafe native counterexample

Exact retained case: `C31 enforced provider confinement (actual Seatbelt) closure: former unconfined double-POST counterexample is blocked before launch with zero PREPARED and zero mutations`.

On `d92d0636334a4342b917331fa8bbc2d7e24b9b6a`, the attempted uncertified native launch is refused before any provider code executes. The disposable service is reachable from the trusted host, so zero effects are not attributed to an unavailable service. The host's POST recorder is asserted empty: **external mutation count = 0**. Durable adapter-spawn records = **0**; PREPARED records = **0**; refusal is `HOLD_PROVIDER_CONFINEMENT_UNAVAILABLE`, `retryAllowed=false`.

The isolated case passes and also passes within C31, full suite 1 and full suite 2. C31 separately covers filesystem writes, network POST, SQLite mutation, external API POST, raw credentials, native shell/tools, detached subprocess and nested-sandbox escapes. Additional default/native launch cases for all these attacks are refused before spawn. The current result replaces the earlier unsafe double-POST result. No launch guard was removed or other implementation mutation performed in this evidence campaign.

## Platform scope

| Platform | Provider runtime scope | Fail-closed behavior and evidence |
|---|---|---|
| macOS | **Verified provider confinement backend on the physical host/version above.** | Seatbelt is applied before provider code. Missing confinement is held before launch; required adversarial and crash tests physically run. Other macOS/runtime/storage configurations require qualification. |
| Linux | **Provider execution unsupported; no verified confinement backend.** | Confinement selection refuses with `HOLD_PROVIDER_CONFINEMENT_UNAVAILABLE`, `retryAllowed=false`; no native fallback. C31 tests this Linux policy through a platform parameter on macOS. Linux flock/process-fence code does not imply Linux provider runtime support. |
| Windows | **Provider execution unsupported; no verified confinement backend.** | Ordinary `Kernel.start()` fails earlier in `RootLock.acquire()` with `RootLockError.code=root_lock_unsupported`, before provider launch. The confinement selector independently refuses `win32` with `HOLD_PROVIDER_CONFINEMENT_UNAVAILABLE`, `retryAllowed=false` if reached. C29/C31 policy seams run on macOS, not Windows. |

## Durability scope

**Process-crash durability: tested.** The OS remains running while actual Kernel processes are SIGKILLed. A separate host process retains the integrity key and published commit heads. Event records are authenticated and committed with fsync before grant/effect. The ledger fsyncs its receipt and parent directory. C30 verifies no effect after PREPARED/grant/STARTED fsync failure or failed host publication; outcome fsync failure leaves ambiguity and explicit inspection resolves the existing effect without repetition. C31 verifies disabled/failed filesystem PREPARED fsync cannot execute the requested mutation.

**Power-loss durability: not proven.** No OS/power interruption, F_FULLFSYNC/controller/storage qualification, or power-loss qualification of event-log directory metadata, host keys and host commit-anchor persistence was performed. Successful fsync and a Kernel restart are not claimed as proof of power-loss recovery. This evidence makes no power-loss guarantee.

## Remaining scope and final decision readiness

No implementation defect was exposed by this campaign. All requested checks passed. No reachable unconfined provider mutation path was reproduced on this exact macOS candidate. Every exercised provider mutation route is either refused before execution or mediated by a durable Kernel action; no provider-native second execution lane was observed.

This is Phase 1 spike evidence for the shipped filesystem tool, disposable ledger executor and macOS enforcement. It does not certify arbitrary host-supplied executors, real provider integrations, remote DB/API broker settlement, malicious host configuration, network filesystems/VM lock boundaries, Linux/Windows runtimes, or power-loss durability. The host configuration, integrity key, commit publication and broker implementation are trusted. Additional operations need their own validated effect and authoritative inspection/revocation semantics; an absent remote result alone is not a NOT_DONE proof.

**READY_FOR_FINAL_H4_CLOSURE_DECISION.** Final H4 closure must use the stated platform/durability/operation scope. The Frozen Contract has not been modified.
