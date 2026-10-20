# C1b V3 auth-tests r1 — CANDIDATE, target qualification pending

This is an explicit test revision of original V3. It changes tests/c1b-b-auth.cjs, adds three test utilities, and appends mutation/missing-target tests to test:c1b:control. The new manifest and ZIP must be checked separately. No production src/native/scripts or lockfile bytes changed. Prior C1a→V3 native diffs remain the exact applicable native diff; this revision adds no native change.

## Auth coverage and mutation result

Production isTrusted contains EIGHT conjunction clauses, not seven. New B-auth scenarios cover foreign sender, foreign frame, navigated sender URL, mismatched owned frame URL, destroyed sender, missing window, production closed-window callback, missing sender, missing frame and missing event. Each scenario runs all nine real registered B handlers: 90 negative cases. It checks SENDER_DENIED before side effects, unchanged SQLite total_changes, no picker call and no probe setting/project/secret effects. Positive authenticated get/set controls reject an always-deny implementation.

The mutation utility removes each clause independently in a fresh Node process, compiles only an in-memory method, and runs the full B-auth suite. It verifies source bytes are unchanged afterward. Five mutations MUST fail with their expected witness scenario. Three presence guards survive with the same fail-closed behavior: without !!win, accessing win.webContents throws and catch returns false; without !!sender, sender.isDestroyed throws and catch returns false; without !!frame, frame mismatch returns false or frame.url throws and catch returns false. Real Electron identity objects/URL strings are assumed; adversarial JS getters are not an IPC caller capability. We do NOT claim all eight mutations are killed. Tests cannot truthfully distinguish behavior-equivalent guard removal. Independent review must assess this explanation; no production refactoring was made just to increase mutation counts.

Local normal/expanded/mutation/missing-target checks passed. These remain mock/logic/policy evidence. Native tests failed closed as unsupported on the same authoring host in V3; no new Mac/actual Electron results yet. Do not call this complete end-to-end auth proof.

## Missing target and captured evidence

The alias probe's main resolves source then target with realpathSync before it creates pairs/fixtures or reports success. A missing target throws ENOENT, the CLI catches it and sets exitCode=1. A regression test exercises the darwin entry branch with only process.platform stubbed in a separate child and real filesystem operations: missing target exits1, no ALIAS_RESOLUTION/PASS/report/fixtures. It is not Mac execution and not a mock of fs.realpathSync.

The new companion capture wrapper logs sw_vers, arch, uname, Node runtime, static proof and the complete qualification command. After tee has closed, it always invokes /usr/bin/shasum -a 256 on qualification.log and unicode-aliases-v3.json, writes SHA256SUMS.txt, and records separate qualification/capture/hash/write statuses in capture-status.txt. If the report is absent, hashing fails and no overall success is claimed. Hashes bind exact evidence bytes; they do not establish independent review or artifact authenticity by themselves. Wrapper positive-path Mac execution is still UNTESTED; syntax and Linux failure path are tested separately.

## Inherited review state remains open

C1B-UNICODE-01 explicitly reopens C1a F1/N-2 privacy closure; V3 proposes the eleven-character broad refusal and encountered hiddenByPolicy counts. See review-v3/C1B_UNICODE_01_REOPENED.md, original owner JSON and full project-reader.c.C1a-to-V3.patch. Historical C1a scoped PASS is preserved, not silently rewritten. B repair v3 frozen; C1a not frozen; C1b not accepted/frozen; no full C1 PASS. Arena change unapproved. Packaged Desktop TCC risk OPEN. Separate spawn/ready timeout and retry remain deferred; successful first-list latency remains uninstrumented. Five manual launches remain paused until target qualification is captured and assessed, then full bundle goes to Claude.
