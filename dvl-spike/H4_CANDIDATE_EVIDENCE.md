# H4 candidate evidence — H4_DO_NOT_CLOSE

This is spike evidence. The Frozen Contract is unchanged. The confined macOS ledger profile has a tested durable effect boundary; the broader Kernel still admits an unconfined native launch. A retained regression demonstrates duplicate external mutation through that path. Green regression results do not imply H4 closure.

## A. Combined source state

One candidate branch: `codex/h4-candidate`, based on `0a54fd7c6ff813d877b130ee1eabf863c7c5c16d`.

Commit `108b80049d6f93034157c30dab8485b796589d01` consolidated the existing B1–B4 changes:

- B1: authenticated structural `StoredEvent.actionId` survives oversized payload spooling; replay restores the corresponding uncertainty.
- B2: lifecycle abort/interruption preserves effect uncertainty; retry is blocked until explicit durable host reconciliation, which cannot be supplied through provider frames.
- B3: durable PID/PGID/platform/process-birth information; stale authority revocation; verified group termination and content-based workspace quiescence before retry. Inspection/kill/identity failures and unsupported process fencing produce HOLD.
- B4: complete immutable PREPARED intent and identities, durable grant/STARTED before the sole host effect invocation, replay UNKNOWN, durable trusted outcome or explicit inspection, no provider-native fallback on prepared runs.

The subsequent confinement commit on this same branch contains the enforcement, C31, updated C30, and authoritative result artifact. Its final commit ID is returned with the review. No parallel branch is an authoritative baseline. Unrelated `.DS_Store` files are excluded.

## B/C. Authoritative baseline and full suite

The final results and source SHA-256 manifest are recorded in `H4_CANDIDATE_TEST_RESULTS.json`. The counts below must agree with that artifact.

| Suite | Final tests |
|---|---:|
| C27 | 14 (7 synthetic + 7 tracked-file copies of real khedma.tn) |
| C28 | 5 |
| C29 | 11 |
| C30 | 23 |
| C27–C30 | 53 |
| C31 | 15 (14 confinement/control assertions + 1 retained unsafe counterexample) |
| C27–C31 | 68 |
| Full conformance suite | 304 in 31 files |

Final full-suite status: **304/304 PASS, 31/31 files PASS, zero skipped/pending tests**. One passing case deliberately asserts the still-unsafe legacy counterexample. TypeScript typecheck and `git diff --check` pass.

Count reconciliation: the earlier 259-test B3 run used synthetic C27 only and had no C30. Enabling the real-project C27 copy adds 7; adding C30 adds 23: 289. C31 adds 15: 304. The intermediate 303 count had 14 C31 tests before the explicit legacy counterexample was retained. These are different source/fixture configurations, not competing final baselines.

The first combined baseline run used default file concurrency: 288/289 passed, with C09's 1-second adapter duration test expiring during startup under load. No timer behavior or assertion was relaxed. The bounded run subsequently passed 303/303; the final 304-test run uses the same bounded configuration.

Reproduction, from `dvl-spike`:

```sh
/usr/local/bin/node node_modules/typescript/bin/tsc --noEmit
DVL_H4_TARGET=/Users/user/Desktop/khedma.tn /usr/local/bin/node node_modules/vitest/vitest.mjs run --no-cache --maxWorkers=2 --minWorkers=1 --reporter=json --outputFile=/tmp/h4-candidate-final-full.json
```

Physical evidence is macOS 13.7.8 (22H730), Node 24.9.0, Vitest 2.1.9. C29's Linux/Windows recovery policy and C31's unsupported-platform refusal are exercised through explicit platform seams. This is not physical Linux/Windows execution evidence. C30 requires the verified macOS confinement backend; other platforms cannot execute this mediated profile.

## D. Exact enforced boundary

`src/kernel/provider-confinement.ts` generates a host-owned Seatbelt profile and launches `/usr/bin/sandbox-exec -p PROFILE EXECUTABLE ...` before any provider code executes. Sandbox failure terminates the launch; there is no unconfined fallback for a mediated profile. The Kernel refuses a mediated launch without this boundary. An accepted `dvl_tools` provider also requires the durable broker.

The profile denies operations by default. It grants process fork/exec, self-signalling, sysctl reads, filesystem metadata reads, narrowly selected OS/runtime reads, and host-selected trusted code reads. It grants **no filesystem write, network socket, general Mach lookup, task-port, Apple-event, or IPC operation**. Project/state directories cannot be supplied as code read roots. Provider stdin/stdout/stderr are protocol/diagnostic pipes; effect descriptors and credential handles are not inherited.

Filesystem effects, including workspace writes, append, rename and unlink, are denied. Direct TCP/HTTP and external API requests are denied, including loopback to the disposable service. Opening/mutating the disposable SQLite DB is denied. Shells and native CLI tools inherit Seatbelt. A detached Node child in a fresh process group inherits it too; nesting an allow-default sandbox cannot relax it.

The confined child receives a fresh fixed environment plus explicitly named `DVL_PUBLIC_*` inputs. It does not inherit `process.env`, `adapterEnv`, HOME, NODE_OPTIONS, or raw effect tokens. Credential files outside the trusted runtime read set are unreadable, including a symlink from an allowed code directory to a credential file. Reading the host environment through `ps` does not reveal the token. Runtime code read roots are host-trusted assets and must contain no secrets; this is a host configuration trust requirement, not a provider-selected permission.

The provider remains unable to mutate directly even after PREPARED. It proposes an intent. Only the trusted Kernel-owned broker receives the scoped prepared identity and invokes the effect after PREPARED, authority and STARTED commits. No grant/credential is sent to the provider. The Kernel's actual invocation is in `Kernel.executeSpikeAction()`; its checks bind run, attempt, assignment, adapter instance, authority ID, operation identity, intent signature and root ownership. The ledger broker permits only its named append operation and target. Duplicate proposals reuse only a durable trusted outcome for the host-defined operation; native execution has no second lane.

## E. Negative and crash tests

C31 performs actual operations, then checks external state rather than trusting provider reports. The HTTP service is reachable from the host; SQLite has a real initial row; the secret and existing files are readable/writable by the host. Failures are therefore boundary denials, not absent test resources.

| Required case | Evidence |
|---|---|
| 1. Direct filesystem write | EPERM for external/project writes, append, rename, unlink; original bytes remain unchanged. |
| 2. Direct network POST | EPERM; disposable service receives zero mutation requests. |
| 3. DB/API mutation | Node SQLite insertion denied; host query sees only baseline row. API POST denied, zero requests. |
| 4. Raw credentials | Environment absent, secret read and alias read denied, host process environment unavailable. |
| 5. Native shell/tools | Shell redirection, curl POST and sqlite3 INSERT cannot change any target. |
| 6. Spawned child | Actual detached Node child gets EPERM for filesystem/network mutation; nested sandbox relaxation fails. |
| 7. Before durable PREPARED | All direct attacks above occur with zero PREPARED/grants; C30's original ledger bypass is denied before its proposal is persisted and remains denied on retry. |
| 8. Crash after PREPARED before effect | Physical Kernel SIGKILL at PREPARED/authorization/STARTED; no effect; UNKNOWN, retry held until explicit trusted NOT_DONE inspection. |
| 9. Crash after effect before outcome | One external ledger entry; physical SIGKILL; UNKNOWN/retry hold; trusted DONE inspection avoids another execution. |
| 10. Surviving old executor | C29 detached survival, late/same-size writes and kill failures; C30 live old planner with kill denied remains B3 HOLD even after NOT_DONE. |

Also tested: exactly one broker effect despite denied direct POST, missing confinement, missing broker, forbidden environment overrides, unsupported confinement backends, provider FINISHED forgery, native mode/owner rejection, duplicate proposals and inconsistent operation semantics.

An uninspectable ledger retains UNKNOWN, reports `HOLD_RECOVERY_ACTION_UNKNOWN`, and has `retryAllowed=false`. Process-fence failure reports `HOLD_RECOVERY_PROCESS_STILL_ALIVE`, independently of outcome resolution. Missing/unsupported confinement reports `HOLD_PROVIDER_CONFINEMENT_UNAVAILABLE`, with `retryAllowed=false`. Explicit inspection cannot bypass B3.

## F. Fsync and durability scope

The mediated profile requires `fsync:true`, a host integrity key and host commit publication. `EventStore.durableAppend()` writes the complete authenticated record, calls `fs.fsyncSync(fd)`, performs integrity checks, and publishes the host boundary before the Kernel proceeds to the next action stage. The ledger executor fsyncs its appended receipt and parent directory.

C30 injects failures at PREPARED, authorization and STARTED fsync: zero effects. Failed PREPARED host publication grants no execution. Failed outcome fsync preserves UNKNOWN through explicit tail recovery; inspection resolves the already applied effect without duplication. Physical SIGKILL tests demonstrate committed records surviving a **process crash** with the OS still running.

**OS/power-loss durability is not established.** No power interruption, F_FULLFSYNC/controller flush qualification, storage fault campaign, or host-anchor power-loss recovery test was performed. Successful fsync plus process restart is not evidence of all those guarantees. Event log creation/directory metadata and host anchor persistence also need that durability audit. The tests' host commit heads survive in a separate parent test process, not a simulated host power failure.

## G. Remaining effect paths

The universal invariant still has a concrete counterexample. `Kernel.spawnAdapter()` only selects the Seatbelt launcher when `providerConfinement` is supplied. Without a spike broker/confinement, it can still select raw `adapterCommand`, inherit the host environment, and admit `gated_native` capabilities. Such a process retains filesystem/network/credential/native-shell/descendant authority before any PREPARED record, including at process startup before describe/dispatch.

C31 retains an actual disposable HTTP-ledger reproduction: an unconfined native provider receives run.start, POSTs `/ledger`, reports run.failed, and leaves zero durable action records. After Kernel shutdown and authenticated reconstruction, B3 establishes the old process is gone. `retryRun()` sees no UNKNOWN actions and dispatches attempt 2, which POSTs again. There are two external mutations and still zero PREPARED or UNKNOWN records. This reproduces even across clean shutdown, without needing a crash. The assertion passes because it preserves the failure evidence.

Existing native implementations also bypass the durable boundary: `mock-provider.ts`'s `write_file` emits a STARTED observation then writes without a durable Kernel grant; `write_raw` writes without any action observation. The default `src/spike.ts` launches the native mock without the confined broker profile. For legacy actions, provider FINISHED observations still set effect certainty CONFIRMED; the prepared lane explicitly ignores those claims for outcome resolution.

No provider escape was observed in the enforced macOS external-ledger profile. This does not certify arbitrary trusted executor implementations, test hooks, real remote DB/API brokers, or provider integrations. Host validation/identity hooks must be pure; remote accepted requests need proven revocation/settlement and authoritative inspection. An instantaneous NOT_DONE/absence observation or provider claim cannot prove no delayed external mutation. Unsupported/uninspectable operations must remain UNKNOWN/HOLD rather than acquiring a speculative retry path.

## H/I. Closure decisions

**B4 cannot honestly close for the implementation as a whole.** The confined macOS ledger lane passes the requested attacks and crash boundaries, but the reachable native/default launch still defeats the durable-before-effect invariant. Closure requires enforcing the boundary before executable provider code on every supported production launch, or disabling the uncertified lanes, and qualifying any additional broker/OS backend.

**H4_DO_NOT_CLOSE.** No new retry heuristic was added. The remaining blocker is execution authority outside the durable boundary. The Frozen Contract was not modified.
