# C1b V2 — implementation evidence and independent re-review request

Date: 2026-10-20 (Europe/Paris). **V2 candidate; NOT PASS; NOT frozen.**

## Exact baseline

V1 candidate ZIP SHA256: `1c5f05b639e2cba2fe585d680ff3549ffbb63945498691e5f4db0acf99ed7db3`. The independent V1 review is preserved at `review-history/C1B_INDEPENDENT_REVIEW_V1.md`: FIX REQUIRED, no security blocker found in its stated scope. V2 is not covered by that verdict or V1's Mac pass.

## Finding disposition

| Finding | V2 treatment | Remaining evidence |
|---|---|---|
| F-1 binary transfer / Next search / accounting | Native NUL rejection, exact native-error whitelist addition, `.next` search exclusion, estimated attempted-read budget charged on failure, successful-growth correction, visible elapsed/counters | Control budget tests pass; real native 794-file fixture and real-project Mac measurement required |
| F-2 unexplained first-open TIMEOUT | Deduplicated numeric/enum diagnostics wired to main logger; spawn event and first stdout timing; actual-Electron second-process restore test | Original cause unestablished. Target Desktop and outside-Desktop restarts required; diagnostics are not a causal fix |
| F-3 page scroll | Scoped CSS containment before existing media rule, bounded lists/results, reveal file title after read | DOM logic passes; actual-Electron geometry/paging test written but runtime UNTESTED here |
| F-4 missing regressions | Realistic native fixture and actual restored-state/layout/paging checks added | Execute on target; no claim of new actual-Electron Stop/switch-under-load coverage |
| F-5 B-channel negative tests | 18 denials across 9 production B handlers, foreign sender and non-main frame; no handler side effects | Mock-level test passes; B 24 assertions unchanged from V1 authenticated harness |
| F-6 committed mutation then stale delivery | Handler comment states commit is not rolled back and STALE_CONTEXT is not permission to retry | Recorded, behaviour unchanged |
| F-7 source ZIP prebuilt binary | No `bin/` or dependencies in deliverable; full shipped-file manifest | Target build required |
| F-8 wall-clock deadlines | Monotonic operation/session timers, cursors and close wait; forward-clock test | Control test passes |
| F-9 duplicate initial listing | Deferred, unchanged | Known waste; no claim of fixing original TIMEOUT |
| F-10 old-window event | Revoke old owners; only current/no-window event invalidates binding; targeted regression | Controller test passes |

## Executed V2 host evidence

Host and exact exits: `evidence/c1b-v2-host/environment.json`, `results.json` and individual logs. Linux 6.18.55 x86_64, Node v24.19.0, cc 13.3.0.

| Check | Observed V2 result | Class |
|---|---|---|
| strict native build | exit 0 | Real compiler; not sandbox execution |
| B assertions | 24/24 under the unchanged C1b-authenticated harness | Mock Electron, real disposable SQLite |
| C1a unit / repair | 16/16 + 16/16 | Controls / simulated sessions / pre-confinement |
| C1b IPC | 14/14 | Simulated completion/controller lifecycle |
| policy | 3/3 | Direct native pre-confinement refusal, not confinement |
| renderer | 6/6 | DOM simulation, not layout |
| V2 control | 8/8 | Simulated child timing, privacy, clock and budget checks |
| B channel negative auth | 18/18 | Production handlers, mocked frames |
| JS/CJS syntax | 27 files | Syntax only |
| real boundary suite | exit 1, OS boundary probe UNSUPPORTED | Host unavailable, NOT PASS |
| V2 native fixture | exit 1, helper returned BOUNDARY_UNSUPPORTED before binary-read assertion | Host unavailable, fixture runtime NOT qualified |
| Electron/native-secret/restore/layout | UNTESTED at runtime here; no local executable | Must execute on target Mac |

Total: **105 passing control/policy assertions**, not 105 security or real-app checks. No ABI threshold was lowered and no confinement bypass was added. The original native repair suite and 500-file benchmark remain byte-identical and coupled to the boundary suite in qualification. The lockfile, preload, B gate harness and native-secret tests are byte-identical to V1; the frozen B reference remains untouched.

## Counter semantics and limits

`bytesScanned` is decoded text length. `bytesRead` is estimated budget charged before each read: min(listed size, 1 MiB), including failed attempts, and increased to actual returned length for successful growth. `bytesReadIsEstimate` is always true. A refusal before opening can overcount; concurrent growth followed by native refusal can undercount actual I/O. It is not a byte-accurate native read meter or an immutable snapshot. The 20 MiB budget now bounds charged work, alongside the existing file count and 5-second operation limit. Native refusals avoid transferring NUL payloads; invalid non-NUL UTF-8 still reaches host validation.

`startupMs` is time from service construction to admitted job start, not complete process boot duration. `spawnMs` and `firstByteMs` are observed event delays from job admission; null means not observed. Phases classify observed progress only. `after_first_byte` can include earlier list results in a search session. No path, request ID, project ID, query or file content is included in timeout metadata. A diagnostic callback failure cannot change reader outcomes. Normal EOF cleanup retains its existing watchdog; failed cleanup is reported by shutdown counts, not presented as a new causal explanation of the original listing timeout.

The Next-shaped fixture has 794 files: 300 TSX sources, 30 migrations, 120 NUL-containing image fixtures, two root metadata files and 342 `.next` build/cache files. Expected traversal visits 452 files, skips exactly 120 with UNSUPPORTED_ENCODING, excludes one directory, and returns two root matches. It must finish without TIMEOUT or SCAN_LIMIT. `complete` remains false with FILES_SKIPPED, rather than concealing intentional skips/exclusions. It logs aggregate performance only.

The second Electron process validates previously persisted `last_project_id` before importing production main, forbids any Open dialog, waits for the automatic first list, pages 200+1 files, reads a file, and checks page height/header/title visibility at desktop sizes. It does not emulate or claim to reproduce Desktop/TCC privacy behaviour.

## Owner evidence added since review

See `evidence/owner-v1/TARGETED_MAC_EVIDENCE_2026-10-20.md`: filtered TCC excerpt, folder flags, installed Electron version. No Desktop denial is visible in the supplied excerpt. These observations do not establish the original timeout cause. iCloud setting and permission-prompt history remain unanswered. V1's complete owner-pasted qualification and manual history are retained separately; none qualifies V2.

## Independent reviewer prompt

Independently review this exact V2 candidate against the preserved C1b V1 review. Verify SOURCE_SHA256.json, C1B_V2_DIFF.patch (V1→V2), C1B_DIFF.patch (C1a→V2) and C1B_CHANGES.json. Source review must trace relationships: selection/startup restore → binding → push/pull UI; navigation/crash/window replacement → ownership revocation; native error shape → host decoding → search budget/partial semantics; timeout timer/checkJob → metadata → logger; quit → helper counts → DB close. Check each repair's adjacent regressions, not only its isolated assertion.

Validate F-1 accounting as explicitly estimated, including failed reads, file growth and the distinction from actual I/O; verify `.next` remains listable/readable and exclusions/skips remain visible. Review the native refusal's position after post-read identity checks, with unchanged confinement baseline. Try forged metadata/native payloads, malformed requests, stale owners and old-window events. Review the new actual-Electron restore and geometry assertions for false positives, preserving the original tests.

Execute appropriate tests where supported. Keep Linux/Seatbelt, simulations, compiler checks, actual Electron, embedded Node, owner-pasted evidence and UNTESTED paths distinct. Return concrete reproducible findings with severity, affected relationships, smallest coherent fix and targeted regression. The original TIMEOUT is unresolved, not proven user error, TCC or fixed by V2; use the new Mac evidence to judge it. Do not demand broad unrelated platform reruns, fabricate blockers, lower confinement, introduce Arena/ABI2, redesign the UI or activate later-stage workers/providers. No C1b freeze, full C1 acceptance or packaged-release claim without the applicable evidence.
