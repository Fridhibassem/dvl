# DVL Code — GREEN GATE B review and repair candidate
Date: 2026-10-15
Status: NOT FROZEN — patched candidate requires Mac regression and independent review.

## Reviewed input
DVL_GREEN_GATE_B_REVIEW_v1.zip
SHA256: bdd950cd53a58f42f687c3ea133ea8acf62fa240215d3b907c236c2c537f8e9a
DVL app 0.6.0; Electron exactly 44.7.2 in package.json and lockfile.
No changes to user databases or the physical Mac were performed by this local review.

## Physical Mac evidence supplied in this conversation
- npm ci completed on the prior Electron version; targeted Electron upgrade subsequently reported 0 vulnerabilities.
- Electron binary reports 44.7.2; no unreviewed installation scripts.
- Startup, normal quit and restart restore lifrOS and project ID proj_9f1cc961-f2ab-42f9-a9f2-deec6dd8ca7d.
- SQLite integrity ok; migrations 1,2; same-folder reopening did not duplicate registry entries.
- Settings persisted: b8_test_setting savedAt 2026-10-15T10:08:49.666Z.
- Secret row exists, encrypted_length 48; Configured UI persists. This alone does NOT prove decryption succeeds.
- SIGKILL test on observed PID 5644 followed by startup at 10:31:41Z: integrity ok, stable identity and panels restored. This was an idle-process crash test, not a mid-transaction/power-loss test.
- Second-instance block event at 10:33:42Z; user observed one window.
- lifrOS file fingerprint before/after is identical: 8 files; f81d8d3e6df08f6ea79b34b5d4e2d1bcc9aeabc57e48d937f7e35ae2107cd65f.
- Missing-project fallback: project.restore_unavailable at 10:56:30Z; restored test folder retains ID proj_bd42af82-d73c-4438-8ffe-929c6c8546a0.
- Recent Projects selection returns to lifrOS with original ID.
- Earlier Open Project complaints resolved after activating the window and using the native folder picker; no confirmed button defect was reproduced.

## Findings reproduced against original code
B-GATE-01: Project availability uses existsSync only. Replace the saved directory with a regular file: getLastProject still returns it as available. Fix: statSync().isDirectory() with errors treated as unavailable; reject non-directory registration.
B-GATE-02: Startup initialization throws without a catch on whenReady's promise. Invalid SQLite bytes throw 'file is not a database'; there is no app-specific error UI or controlled shutdown. Fix: catch initialization failures, record app.startup_failed when logging is available, close database, show a native error dialog and quit. Do not delete or reset the database.

## Candidate changes
- src/main/main.js: directory validation; startup error handling.
- package.json: npm test command only; Electron remains pinned to 44.7.2.
- tests/green-gate.cjs: temporary-directory test harness, loads actual Main source through a VM and real node:sqlite. Electron APIs and encryption are mocks. Original source files are not rewritten by the tests.
- Renderer, preload, schema, project ID format and safeStorage boundary unchanged.

## Validation
Local runtime: Linux, Node v24.19.0. npm test: 13/13 passed.
Checks cover schema/integrity, stable IDs, canonical aliases, settings, missing/restored folders, project content, secret status/delete with mock encryption, BrowserWindow security options, restart persistence, unavailable encryption, file replacement rejection and corrupt-database controlled failure with retained bytes.
Syntax check of modified Main source passed.
These are focused logic checks, not a native Electron UI test, native sandbox proof, or macOS Keychain test.

## Installation and next gate
This ZIP is a complete source candidate with package.json, package-lock.json, src, tests and this report. Extract to a separate review folder. Keep the existing application folder and backups. Do not replace anything in Application Support or delete its SQLite files.
From the extracted candidate folder run npm ci and npm test, then npm start, with the old DVL app fully quit.
Recheck native folder picker, normal startup/quit, same project identity, settings/secrets status and panels on the Mac. Confirm startup error dialog and directory validation with disposable state/fixtures; do not corrupt the real database.
Do not declare GREEN/FROZEN until native regression and independent review accept the exact candidate. Additional remaining evidence: real safeStorage decrypt round trip without returning plaintext to Renderer; clean installation on final lockfile; the handoff's real Git repository opener scenario (lifrOS was found not to be a Git repository). Desktop Phase B is not Kernel/agent recovery and does not authorize Phase C.

## Scope notes for later runtime work
Before remote/untrusted content is introduced, validate privileged IPC senders, constrain navigation and new windows, and review input limits. The current local static shell does not establish those future runtime boundaries.
