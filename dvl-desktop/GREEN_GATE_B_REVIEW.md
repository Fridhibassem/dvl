# DVL GREEN GATE B — repair v3
Date: 2026-10-15
Status: NOT FROZEN. Implementation and automated logic checks complete; Mac and independent verification pending.

## Review response
Input: Gemini static independent review supplied as Text lipit(20261015-121208).txt. Reviewer executed zero commands. Findings were checked against actual code.

- F-01: Main verifies encrypt/decrypt equality before replacing a secret. hasSecret now decrypts the stored SQLite value in Main and returns configured/decryptable booleans only. Renderer displays Configured (verified) or Configured (unreadable). Failed decryption retains ciphertext and logs status without the exception or plaintext. No plaintext-reading IPC was added.
- F-02: PRAGMA integrity_check runs immediately after opening SQLite, before journal changes, schema/migration writes or legacy state import. Completely invalid bytes are retained; startup error handling remains in place. This does not promise no SQLite-internal crash recovery or universal byte preservation for arbitrary damaged databases.
- F-03: Tests now exercise registered IPC handlers, Recent Projects selection/missing state, legacy import/idempotency/rejected file path, second-instance focus/window recreation/lock rejection, and before-quit checkpoint/close. This is additional evidence, not proof the prior uncovered code was broken.
- F-04: Renderer handles rejected actions with an accessible generic status message; unavailable recent rows refresh. Main logs failures for project-read IPC and unavailable recent selections.
- F-05: A second instance recreates a closed primary window once the app is ready.
- F-06: Restored registered paths must still be canonical directories, so a replaced symlink is unavailable. Setting names/JSON-serializable values are validated. This is point-in-time validation, not runtime filesystem isolation or a race-proof identity boundary.

## Validation actually executed here
Linux; Node v24.19.0.
- npm test: 24/24 passed (real filesystem and node:sqlite; Electron, OS encryption and DOM mocked).
- Syntax checks passed for Main, Renderer and native probe scripts.
- Electron is pinned at 44.7.2; lockfile dependency versions unchanged. No new dependencies.
- Native Electron/Keychain check NOT executed here. No new npm ci/audit or Mac run is claimed.

## New native secret probe
After npm ci, run npm run test:native-secret with the normal DVL fully quit.
The Node parent creates disposable state under os.tmpdir, launches two real Electron processes using the production Main/preload/renderer and IPC, writes a synthetic secret and setting, quits normally, starts again, and checks decryptable status, settings persistence, DB integrity, checkpoint/close logs and absence of the synthetic plaintext from logs. Probe state is deleted afterward. It never points to normal DVL Application Support state. Electron/Keychain permission prompts may appear: report failure rather than bypassing protection. A failed or interrupted native probe is NOT a PASS.
This verifies native encryption through production code using a test entry point; it does not validate every existing user's Keychain item. Normal app startup must also show Configured (verified) for the existing saved test secret if available.

## Remaining gate
1. Exact v3 Mac snapshot: clean install, 24 automated checks, native secret probe and normal startup/quit/restart with the real repo.
2. Native corrupt-database dialog and regular-file replacement using disposable state only. Do not damage/reset the actual database.
3. Match Mac file SHA256 values to SOURCE_SHA256.json before independent re-review of this exact v3 candidate.
4. Record evidence and resolve confirmed blockers; only then decide GREEN/FROZEN. No Phase C authorized.

## Prior evidence retained separately
v2 Mac: clean install and 13 tests, native picker, clean restart, same lifrOS and khedma.tn project IDs, db.integrity_ok, clean git status before/after khedma.tn. Prior idle SIGKILL, missing folder and second-instance evidence predates v2/v3 changes. None is claimed rerun on v3.
The previous repair report is included as GREEN_GATE_B_REVIEW_PRE_V3.md for chronology only.
