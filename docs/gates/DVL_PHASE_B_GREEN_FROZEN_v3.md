# DVL Code 😈 — PHASE B GREEN / FROZEN
Date: 2026-10-15
Checkpoint: Desktop Foundation / GREEN GATE B
Accepted source candidate: repair v3

## Decision
Phase B is GREEN / FROZEN for the tested local Electron desktop foundation. The agreed gate has sufficient evidence and no confirmed unresolved Phase B blocker. Preserve this exact source as the baseline. Phase C has NOT started and is not implemented by this checkpoint.

This document records an acceptance checkpoint. It does not create a Git tag, change the user's Mac files, make them read-only, or prove a packaged production release.

## Accepted candidate
- Mac folder: /Users/user/Desktop/dvl-spike-phase-1/dvl-desktop-B-gate-v3
- App: dvl-desktop 0.6.0; Electron exactly 44.7.2.
- Mac external Node: v26.8.1; npm 11.19.0.
- Observed crash report identifies macOS 13.7.8, Intel MacBookAir7,2.
- Archive: DVL_GREEN_GATE_B_REPAIR_v3.zip
- Archive SHA256: f77387a4bfc60fccb196bee0228c25f03abb76844c49046860489bb846367aff
- Mac source verification: user supplied SOURCE MATCH PASS for every SOURCE_SHA256.json entry.
- Previous dvl-desktop and dvl-desktop 2 folders remain backups; do not treat them as the accepted v3 baseline.
- Application state: ~/Library/Application Support/dvl-desktop/dvl.sqlite and logs/dvl.log. No real database reset or deletion was requested.

## Gate evidence
| Check | Accepted result and evidence |
| --- | --- |
| Clean install | Mac npm ci succeeded; 13 packages added, 14 audited, zero vulnerabilities reported at that time. No separate compilation/build script exists; this gate validates the source Electron launch, not a packaged installer. |
| Logic and integration boundaries | npm test: 24/24 passed on Linux Node v24.19.0 and Mac Node v26.8.1. Filesystem and SQLite are real; Electron, crypto and DOM are mocked in this suite. |
| Open real repository | Native picker opened khedma.tn in v2; v3 restored the registered real repository. Picker itself unchanged; v3 open-project IPC is also covered automatically. |
| Quit and restart | Normal v3 Command-Q and npm start restored same project and ID, with all four static panels and recent-project list. |
| Database state | db.integrity_ok before db.migration_state version 2; app.shutdown, db.wal_checkpoint, db.closed on quit. |
| Settings/secrets | Native two-process probe passed production preload/IPC with real safeStorage and temporary SQLite; setting and decryptable secret persisted across restart. Existing normal-app b8_test_secret showed Configured (verified). |
| Repository preservation | git status --short empty before original real-repo opening and after v3 restart/shutdown; production source contains no writes inside the selected repo. This is scoped evidence, not exhaustive ignored-file/Git-object certification. |
| Invalid database | Native temporary invalid-byte fixture showed DVL startup failed; user reported PASS after dismissing it. Parent assertions checked clean exit, retained bytes and app.startup_failed. Final output not pasted verbatim. |
| Directory replaced by file | Native temporary registry fixture returned null last project, unavailable recent, unchanged replacement bytes and project.restore_unavailable. Supplied output: NATIVE FILE REPLACEMENT PASS — fixture unchanged. |
| Source identity | SOURCE MATCH PASS on Mac; manifest also verified against the authoring snapshot. User-reported local verification, not hardware attestation. |
| Independent review | Gemini v3 static review: PASS, F-01–F-06 resolved, no open blockers, recommends freeze. Reviewer executed zero commands and relied on supplied native/automated evidence. |

## Real repository identity
Path: /Users/user/Desktop/khedma.tn
Project ID: proj_c3819cc7-c546-41a7-9070-cd78c075918a

Prior project retained:
/Users/user/Desktop/lifrOS
proj_9f1cc961-f2ab-42f9-a9f2-deec6dd8ca7d
lifrOS is not a Git repository; it is not the evidence for the real-repository requirement.

## Repairs accepted
- F-01: Main validates encryption round trip before replacing a secret. Persisted secret is decrypted inside Main; IPC returns status booleans only. No plaintext-reading IPC added.
- F-02: integrity check runs immediately after SQLite opens, before journal/schema/migration/legacy writes.
- F-03: coverage includes registered IPC, Recent Projects, legacy import/idempotency, second-instance/lock rejection and before-quit.
- F-04: renderer catches rejected actions and refreshes stale recent rows; Main records project-read failures.
- F-05: second-instance handler recreates a closed primary window when ready.
- F-06: registered paths replaced by symlinks become unavailable; setting inputs are validated.

## Diagnostic incident and GPU observations
One macOS crash report was supplied: Electron-2026-10-15-143825.ips, PID 9276, launched 14:36:56.8635 +0200, capture 14:38:06.6847 +0200. Exception EXC_BAD_INSTRUCTION / SIGILL. The top native frame is NSPersistentUIRequiresSecureCoding; AppKit reports secure state-restoration initialization ordering.

This timing matches the first diagnostic launcher, which incorrectly loaded the absolute electron npm launcher and failed before reaching DVL initialization. The corrected corrupt-DB probe began later, around 14:38:32. Attribution to the failed diagnostic process is a reasoned inference, not proven command-line attribution from the crash report. Do not label this an established GPU crash or SQLite corruption.

The user subsequently ran normal DVL for the requested two-minute observation, quit normally and reported PASS with no new crash dialog. This does not reproduce a normal-app blocker. Retain the incident in the evidence record; investigate if a normal-launch recurrence occurs. Gemini's v3 review bundle preceded this incident analysis, so its PASS must not be represented as an independent assessment of the crash report.

EGL/GLDisplayEGL initialization errors and GPU-process exits also appeared during probes. Probes passed and normal UI rendered. No GPU fix or full graphics stability certification is claimed.

## Independent review record
Received: Text lipit(20261015-125341).txt
Requested report name: DVL_B_INDEPENDENT_REVIEW_GEMINI_v3.md.
Verdict: PASS; recommends GREEN / FROZEN; owner retains authority.
F-01 through F-06: RESOLVED.
Informational observations: startup verification can prompt for Keychain access; graphics warnings require observation as future rendering features arrive.

The reviewer described the preload boundary as ready for Phase C. Acceptance here is narrower: review IPC sender validation, navigation/new windows, input bounds and untrusted-content handling before introducing those Phase C capabilities. Static-shell acceptance is not approval of future runtime security.

## Scope and limitations
- Chat, Files/Activity, Terminal and Preview are static placeholders.
- No provider/chat loop, terminal execution, filesystem editing, dev server or live-preview wiring.
- No new Kernel/harness/orchestrator guarantees are established by Desktop Phase B.
- No Windows/Linux native gate, production signing, installer, sandbox penetration, mid-transaction crash or power-loss certification.
- Path validation is point-in-time; it is not race-proof filesystem isolation.
- SQLite integrity is checked before application writes, but SQLite may perform internal recovery when opening state. Arbitrary damaged-database byte preservation is not promised.
- Clean audit output is time-specific, not a permanent security guarantee.
- Source changes after this checkpoint require focused revalidation and review proportionate to the change.

## Exact resume point
Phase B: GREEN / FROZEN at v3.
Phase C: NOT STARTED.
Next: consult the agreed step-by-step build plan and define the first Phase C acceptance test before implementing that step. Do not infer additional Phase C scope from this checkpoint.

## Source SHA256 manifest
```json
{
  "GREEN_GATE_B_REVIEW.md": "aa0b4af930b32186eaa5fcd38cf73048c468537480cf1ae293b6ee81b6eee4d1",
  "GREEN_GATE_B_REVIEW_PRE_V3.md": "3ee2ca36f19c6d8715c237118988a700bfa2778e1212108f4c187d1c6142afe2",
  "package-lock.json": "00a9f1a4e3eae31f105e62d200f32bae3fc6c91bc38f70cdaff6d30cace596ee",
  "package.json": "2bafb8ad106243fa9d4f73f28b76e6f01d322449bd2c825752f2d326c993638f",
  "src/main/main.js": "36bdacd06e5ba40c565abafa65517c5647daca13b4b45b799458ffc2a590beff",
  "src/preload/preload.js": "c65349d8dcc2f5ae2fb571a0dfdea70684f3afe5f7504c0599c14fbf252919e4",
  "src/renderer/index.html": "6b8c322059d427a6757b2862767431c327cf4da65c994b43dd2fc328c46d5bb3",
  "src/renderer/renderer.js": "e0af7f8112b4056ab719d5eb6a2af1c375da1a9da5e02c1b40839d5d38d6ba78",
  "tests/green-gate.cjs": "a1c599efc9859812486462c91102c0dbcc55583dd33e79c5e17c4f825e8f4d4c",
  "tests/native-secret-check.cjs": "ea0d45ba4ea721d6d99993de8190fd03809e6a875d7ef09e89b7db96e3ee7780",
  "tests/native-secret-child.cjs": "47d76c8eba52240821c146b34710420f3d9319cd21269a947e0683f8d92078d7"
}
```
