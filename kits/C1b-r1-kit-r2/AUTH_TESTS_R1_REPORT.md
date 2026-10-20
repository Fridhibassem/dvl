# R2 clarification — conditional equivalence and reproducible KIT runner

The three survivors !!win/!!sender/!!frame are accepted as equivalent ONLY under the CURRENT failure-closed implementation: existing dereference/equality behavior plus `catch { return false; }`. A changed catch or expression INVALIDATES this acceptance and requires reassessment; survivors are never counted as killed. This is a review dependency, not an unconditional property of those clauses.

For win and sender, dropping the corresponding guard on a null input reaches a null dereference caught as false. For frame, an ordinary missing frame already mismatches the existing non-null mainFrame; if frame and sender.mainFrame are both null, equality passes, frame.url dereferences null, and catch returns false. The new KIT's direct dependency controls deliberately exercise all three null-dereference paths and show a fail-open catch returns true. We do not inaccurately claim that every missing frame reaches the catch.

Source R1 is unchanged. There are19 differing source-relative files V3→R1 (6 modified,13 added): tests, package.json TEST SCRIPTS, manifest, status/README/change metadata and review evidence/history files. All production src/native/scripts, source verifier, lockfile, policy tables and green-gate bytes are unchanged. Complete old/new SHA-256 inventories are supplied separately from the candidate so they can include the source and KIT manifests without self-reference.

verify-source.cjs remains c0603dddec4395b7108fab474ad52749f9f5ab2af2b015b9b638e2c02609525d. It READS SOURCE_SHA256.json at runtime; it does not embed the manifest/digest. package-lock.json remains00a9f1a4e3eae31f105e62d200f32bae3fc6c91bc38f70cdaff6d30cace596ee.

Mandatory gate chain: qualify:c1b -> test:c1b:control -> node tests/c1b-b-auth.cjs, then source per-clause mutation utility and missing-target regression. Thus90 negative cases are part of qualification, not merely an author-host optional test. KIT R2's capture wrapper adds its external restore-verifying runner too, before the full npm gate.

Explicit null/closed/destroyed cases in source tests/c1b-b-auth.cjs:
- missing_window: setWindow(null) sets production mainWindow=null; production getWindow is () => mainWindow, so isTrusted receives null. All nine B handlers must reject SENDER_DENIED.
- closed_window: invokes the stored production BrowserWindow closed callback, asserts mainWindow===null, then requires SENDER_DENIED from each B handler.
- destroyed_sender: mock webContents.isDestroyed() returns true, and every B handler must reject SENDER_DENIED.
Each case checks no picker call or SQLite total_changes mutation, and fixtures restore window state. Real Electron/window destruction remains a separate pending runtime gate.

KIT files run-auth-mutations.cjs and auth-mutation-child.cjs are supplied. In baseline and every mutated child, beforeExit/exit cleanup restores the exact original function reference and asserts equality. The parent never changes its prototype and verifies every delivered source/KIT file before/after. It requires restoration markers and expected exits, so abnormal child termination cannot be reported as a passing reproduction. Actual Mac reproduction is still UNTESTED until the owner runs it. This KIT does not silently edit candidate tests or any delivered file.

# V3 auth-tests r1: coverage and decision

Decision: WAIT for this new test revision, then qualify it. The previously delivered V3 stays intact. Current owner-Mac evidence is static identity/harness PASS and npm ci only. No new target runtime/Electron/APFS result yet. This is a CANDIDATE, not accepted/frozen.

There are eight production isTrusted conjunction clauses. New normal suite has90 negatives (9 channels x10 scenarios) plus authenticated positive read/write controls. New cases cover navigated sender, mismatched owned frame URL, destroyed sender, missing/closed window and missing sender/frame/event, in addition to foreign identity cases. Real registered production handlers are called directly. No production function is stubbed for the normal run.

One clause is removed per fresh child process. Five behavior-changing removals FAIL the expanded suite with their expected witness. Three redundant presence guards survive because null dereferences/mismatches still result in false under try/catch; they are documented as equivalent, never called killed. An always-deny control also FAILS due to authenticated positive controls. It is impossible to truthfully show every redundant deletion causing a behavioral failure without changing production semantics or testing implementation text as behavior. No such refactor is made.

| Clause removed | Child exit | Result / witness |
| --- | --- | --- |
| !!win | 0 | equivalent presence guard; missing win leads to caught win.webContents dereference |
| !!sender | 0 | equivalent presence guard; missing sender leads to caught isDestroyed dereference |
| !sender.isDestroyed() | 1 | killed: destroyed_sender |
| sender === win.webContents | 1 | killed: foreign_sender |
| !!frame | 0 | equivalent presence guard; missing frame mismatches or caught frame.url dereference |
| frame === sender.mainFrame | 1 | killed: foreign_frame |
| frame.url === this.url | 1 | killed: frame_url_mismatch |
| sender.getURL() === this.url | 1 | killed: navigated_sender |

Scope: mock-level finite regression evidence, not all possible IPC attacks or an independent Electron security verdict. The three equivalence arguments assume real host identity objects and fixed URL strings, not arbitrary side-effectful JavaScript getters. The raw local logs are in source review-v3-auth-r1/. The expanded suite plus mutation and missing-target checks are mandatory in qualify:c1b through test:c1b:control.

Missing khedma.tn: fs.realpathSync(target) throws ENOENT before pairs/fixtures/PASS. The regression uses real filesystem operations and stubs only process.platform to exercise the darwin entry branch on Linux. Observed exit1, no alias PASS/report/fixtures. It is not an actual Mac probe. An existing empty target still causes the fixed pair suite to run on disposable sibling fixtures; empty project content is not zero probe cases.

The capture wrapper logs full sw_vers/arch/uname/runtime before tests. After tee closes, /usr/bin/shasum -a256 hashes BOTH qualification.log and unicode-aliases-v3.json. Hashes are saved in SHA256SUMS.txt and statuses in capture-status.txt. Missing report => HASH_EXIT nonzero => wrapper fails. Captured hashes provide byte identity, not independent review/authenticity. Wrapper zsh syntax and Linux failure/no-overwrite behavior are tested; actual Mac positive path remains UNTESTED.

All original V3 production src/native/scripts, source verifier, lockfile, B green-gate and policy tables are byte-identical; see UNCHANGED_PRODUCTION_AND_VERIFIERS.json. Only tests, their package command, documentation and source identity changed. The original V3 ZIPs and kit remain unchanged. The new kit pins the NEW source manifest; never run the old kit against this revision.

Reopened C1a F1/N-2 privacy finding C1B-UNICODE-01 remains pending independent reassessment. Broad eleven-character refusal, hiddenByPolicy semantics, OS confinement, unchanged deadlines, future packaged Desktop TCC risk, frozen B and unapproved Arena change remain as previously recorded. Five manual launches stay paused until complete captured target qualification is assessed.
