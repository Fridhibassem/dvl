# C1b V3 — repair candidate, not accepted/frozen

2026-10-20 Europe/Paris. New finding C1B-UNICODE-01 explicitly reopens C1a F1/N-2 privacy closure. Historical scoped PASS and earlier test evidence remain recorded; no silent closure. See the finding note, owner JSON, full C1a→V3 native C diff and SHA-256 identities in `review-v3/`.

## Final changes

- Eleven observed Unicode alias characters share one validated JSON source for host refusal and generated native UTF-8 table. Broad refusal of legitimate filenames is accepted as a recorded C1b limitation. No additional refusal of İ or U+1DF95 without resolving-alias evidence.
- Native list protocol requires bounded `hiddenByPolicy`; host fallback rejects policy names and separates them from encoding skips. List UI accumulates page counts; search aggregates only encountered entries. See exact semantics in the finding note.
- The repaired alias probe is part of `qualify:c1b`, not an optional manual check. It tests both alias directions, host/direct-native POLICY_DENIED, APFS identity and cleanup on the actual project filesystem. Unicode18 pinned data covers twelve default C+F non-ASCII→ASCII code points, plus separate İ diagnostic. Test logic includes explicit failure cases; Mac execution remains pending.
- New confined native tests cover stored-name omission, exact counters, paging, search and the eight disclosure spellings in isolated directories so APFS aliases cannot overwrite each other's fixtures. Actual Electron tests check root/search counters and restored paging UI accumulation.

## Local verification and limits

Warnings-as-errors native build PASS. 112 control checks PASS: B24, C1unit16, repair16, IPC14, policy3, DOM7, V2control8, Bauth18, V3control6. These include simulated child/protocol/DOM checks and direct pre-confinement policy tests; this is not 112 native security tests.

Original native suite attempted: stopped at OS boundary UNSUPPORTED. Repair native suite and V3 native suite attempted: failed first positive operation with BOUNDARY_UNSUPPORTED. No unsupported-host workaround. V3 Mac/native/APFS and actual Electron executions are pending; no full gate PASS claimed. Syntax checks of modified JS passed. Prior V2 owner Mac output is retained as historical Markdown, not raw-log bytes and not V3 qualification.

`tests/green-gate.cjs` is byte-identical V2. Automated companion verification compares all 24 frozen-B names and all 68 assertion calls (39 assertion-bearing suffix lines): zero differences; reversing only five approved harness/mock adaptations yields the frozen file byte-for-byte. V3 changes only two fake native response fixtures in `tests/c1-repair.cjs` to add the required protocol field; assertions remain unchanged.

## Remaining sequence

1. Fresh V3 source verification and B-harness proof; npm ci.
2. Complete qualify:c1b on the owner Mac with new alias JSON, retain the entire log and exit code. Original native17+repair10 remain coupled and run under Node and Electron embedded Node. V3 native3 also runs in both runtimes. Stop at any failure.
3. Check the actual app log path, prepare the restored real project if needed, then capture five separate normal launches with stage-timeout diagnostics. No Open/Refresh/Search during a measured run. Record visible results. Fresh process does not mean cold filesystem/TCC cache.
4. Send V3 source, this companion kit, full qualification log, alias JSON, all five capture folders/observations and old owner JSON to Claude for independent review. No automatic messaging.

Separate spawn/ready timeout and one cold-start auto-retry remain explicitly DEFERRED until data; the existing operation deadline is unchanged. Successful first-list latency is not instrumented. Timeout stage diagnostics exist only for TIMEOUT; capture process lifetime is not first-list latency. Packaged app needing Desktop TCC permission remains an OPEN future risk; Terminal-source evidence does not qualify packaged identity. Original real-project first-open TIMEOUT cause remains unproven. V2 synthetic performance does not prove it fixed.

Frozen B artifact remains untouched. V3 changes to its inherited package scripts are candidate changes, not a new B freeze. The nine-channel foreign-sender rejection is inherited V1/V2 hardening, not a new V3 B revision. Arena changes remain unapproved. No provider/worker/mutation authority, .dvl activation or full C1 acceptance.

## Reviewer request

Reassess and explicitly close or retain C1B-UNICODE-01 and the reopened F1/N-2 privacy issue, reviewing complete native C and generated-header diffs. Inspect the shared table, alias gate scope/failure behavior, aggregate-count existence disclosure, cursor/page accounting, mock-only baseline adaptations, original confinement invariants and target logs. Keep historical proof, current execution and untested limits distinct.
