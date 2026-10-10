# H4 B4 spike evidence — keep H4 open

The mediated external-ledger experiment now persists action identity/intent before its sole trusted executor can run. This is a tested spike protocol, **not a universal B4 fix**. An unrestricted provider can still bypass the protocol and mutate directly. The negative-control regression deliberately demonstrates that remaining failure. H4 and B4 remain open. No Frozen Contract source or shared contract types were changed by this experiment.

## A. Exact root cause

`Kernel.sendRunStart()` historically dispatches a task with transaction-workspace access; the mock provider executes native operations after emitting `action.started`. `Emitter.emit()` awaits stdout backpressure, not a Kernel durable acknowledgement. Transport drain and ingestion are separate loops. An executor can therefore complete a mutation while the Kernel has not yet committed any action observation.

If the Kernel is SIGKILLed in that interval, replay reconstructs an interrupted run with no UNKNOWN action. B3 kills/fences the old process group and proves workspace quiescence, but cannot determine whether an earlier external effect occurred. The old retry guard then permits redispatch. This is an execution-authorization defect; another retry inference cannot close it.

The retained reproduction uses a disposable ledger outside the temporary project. At the crash boundary it contains an external-effect entry while there are zero durable `action.requested` or PREPARED records. After restart/B3 fencing, attempt 2 adds a second unmediated entry. The test provider advertises `dvl_tools`: the declaration itself provides no execution confinement.

## B. Proposed transition and implemented experiment

```text
untrusted ACTION_REQUESTED proposal
  -> validated/bound Kernel ACTION_PREPARED (durable; certainty UNKNOWN)
  -> Kernel execution authority committed (one execution owner)
  -> Kernel ACTION_STARTED committed (certainty still UNKNOWN)
  -> trusted executor applies effect
  -> Kernel durable outcome (CONFIRMED), or explicit trusted reconciliation
```

The minimum correct protocol also needs an **enforced effect capability boundary**. An executor must have no effective tool, filesystem, network, credential, or provider-native authority for the operation until DVL grants it. PREPARED plus an advisory notification is insufficient.

The implemented local experiment selects Kernel-owned execution. The provider proposes an action through the existing `action.requested` envelope using a spike-only payload. The Kernel holds the actual external-ledger path/capability. It does not send effect authority to the provider; an existing `adapter.ping` envelope carries only the post-outcome notification. These payloads are experimental `h4-b4/1` material, not additions to the Frozen Contract.

PREPARED contains `actionId`, `runId`, `attempt`, `actorId`, Kernel-derived `assignmentId`, `adapterInstanceId`, Kernel-issued `authorityId`, canonical `semanticSignature`, host-defined `effectOperationId`, `kind`, logical `target`, parameters, `stateMutating`, `external`, and `executionOwner`.

The host/executor defines logical operation identity. The Kernel does not infer that arbitrary equal command strings are interchangeable. For this ledger service, one append is defined per logical run and canonical entry. Reuse requires durable Kernel-confirmed/reconciled DONE for that operation **and** matching semantic signature. A conflicting signature preserves uncertainty and receives no grant. The ledger additionally checks its own durable receipt; that defense does not replace PREPARED or allow an UNKNOWN action to execute.

## C. Durable-before-effect invariant

For the mediated lane, the sole `spikeEffectExecutor.execute()` call occurs only after PREPARED, authorization, and STARTED appends all successfully complete. The profile requires `fsync:true`, a host integrity key, and host commit publication. Every stage checks current run/attempt/adapter binding and root ownership before execution. Intent snapshots are normalized, bounded, immutable, and fully inline; action identity cannot disappear through payload spooling.

PREPARED reconstructs as UNKNOWN even when no STARTED observation exists. An action remains UNKNOWN if outcome persistence fails. Adapter `action.finished` observations cannot resolve a prepared effect. Explicit inspection uses the trusted executor's external state after B3 fencing. Uninspectable state returns UNKNOWN; absence is NOT_DONE only under the executor's operation/fencing semantics. A remote executor would need equivalent proof that no outstanding accepted request can still apply later; a provider status claim or instantaneous absence check is not sufficient.

The experiment commits STARTED before invoking the executor, which is stronger than merely relying on PREPARED. Consequently, effect-before-durable-STARTED is unreachable on this lane. Crash after effect but before durable outcome remains a real ambiguity and is tested.

For double execution, this lane has exactly one owner: Kernel. `gated_native` dispatch and provider-native ownership requests are rejected. Duplicate proposals cannot invoke the effect twice. Restarting a run with prepared history without its mediated executor is refused; there is no native fallback. A Kernel-owned asynchronous executor must also finish/relinquish authority before shutdown releases the root lock; on timeout the lock stays held, preventing another Kernel from reconciling/retrying while that executor may still mutate.

This invariant is **not established for unrestricted providers or legacy native execution**, which remain available outside the opted-in spike profile.

## D. Crash-boundary regressions

All physical crash cases SIGKILL a separate Kernel host, preserve host-held commit heads, and reconstruct using a fresh Kernel. The ledger is outside the project/transaction workspace.

| Boundary | Mediated result |
|---|---|
| Before PREPARED durable | No grant and no ledger effect; after B3 fencing, retry creates the first effect. |
| After PREPARED, before grant | PREPARED replays as UNKNOWN; retry blocked until trusted NOT_DONE inspection. |
| After grant, before STARTED | Same UNKNOWN hold; no effect. |
| After STARTED, before effect | Same UNKNOWN hold; no effect. |
| After effect, before durable outcome | One ledger entry, no confirmed outcome; retry blocked. DONE inspection resolves it, and continuation does not append again. |
| After durable outcome | Confirmed recovery; continuation reuses the same host-defined operation without another effect invocation. |
| Old adapter survives / kill fails | B3 HOLD persists even after explicit NOT_DONE; no attempt/archive/retry mutation. |

Additional regressions cover failed PREPARED/authorization/STARTED fsync, failed host publication, lost outcome fsync plus explicit tail recovery, corrupt external state, duplicate action requests/operation keys, conflicting intent semantics, a forged provider FINISHED claim, native-owner rejection, removal of the mediated profile, and an asynchronous Kernel executor retaining root ownership during shutdown.

The negative-control case reproduces the original duplicate external mutation with a lying, unrestricted planning provider. It passes because it asserts the counterexample, **not** because it proves the universal invariant.

## E. Results

Validation on macOS, 10 October 2026:

| Suite | Result |
|---|---:|
| TypeScript `tsc --noEmit` | PASS |
| C27 — synthetic and tracked-file copy of real khedma.tn | 14/14 PASS |
| C28 — root ownership | 5/5 PASS |
| C29 — B3 process fencing | 11/11 PASS |
| C30 — new B4 experiment and counterevidence | 23/23 PASS |
| Requested suites total | 53/53 PASS |

Command (from `dvl-spike`):

```sh
node node_modules/typescript/bin/tsc --noEmit
DVL_H4_TARGET=/Users/user/Desktop/khedma.tn node node_modules/vitest/vitest.mjs run src/conformance/c27-h4-kernel-crash-replay.test.ts src/conformance/c28-h4-root-ownership.test.ts src/conformance/c29-h4-recovery-process-fence.test.ts src/conformance/c30-h4-b4-durable-before-effect.test.ts --no-cache
```

C29 exercises Linux/Windows failure policy through its OS seam; this run does not claim physical execution on those operating systems. Physical B4 process/crash cases are macOS evidence. The broader full suite was not rerun for B4.

## F. Remaining path and closure requirement

**Yes, external mutation without a durable DVL action is still possible.** The provider process is not confined to the mediated executor. Legacy mock-provider `write_file`/`write_raw` operations still execute natively. More decisively, the B4 provider's negative-control direct write succeeds before its action proposal becomes durable, despite declaring `dvl_tools` and receiving `nativeEffectsAllowed:false`.

Closing B4 requires enforcing the capability boundary on every effect channel: disable/intercept native tools, keep effect credentials in the trusted executor, restrict direct filesystem/network effects, and fail closed where that confinement cannot be established. If provider-native execution is later supported, its grant must be consumed by a trusted gate/proxy bound to PREPARED identity, authority epoch, and semantic intent; the provider's own claim that it honored the gate is not evidence.

The next closure test must turn the retained bypass reproduction into an inability-to-mutate assertion. Until that is true, the correct decision remains **H4_DO_NOT_CLOSE**.
