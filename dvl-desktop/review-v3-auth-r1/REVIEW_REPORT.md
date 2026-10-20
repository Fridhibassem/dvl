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
