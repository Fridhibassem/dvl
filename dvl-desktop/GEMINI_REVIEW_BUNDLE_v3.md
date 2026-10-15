# DVL v3 — independent review source bundle
Review this exact candidate using the dvl-electron-foundation-review skill. Read the updated GREEN_GATE_B_REVIEW.md and every source/test file below. Review the F-01 through F-06 response. Report PASS / BLOCKED / INSUFFICIENT EVIDENCE with concrete findings and the smallest remaining checks. Do not modify source or implement Phase C. Never claim tests you did not execute. Native v3 Mac evidence is PENDING when this bundle was created. Treat the older report as history, not current acceptance. No source identity match with a future Mac installation is claimed yet.


## File: GREEN_GATE_B_REVIEW.md

````markdown
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

````

## File: GREEN_GATE_B_REVIEW_PRE_V3.md

````markdown
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

````

## File: SOURCE_SHA256.json

````json
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

````

## File: package-lock.json

````json
{
  "name": "dvl-desktop",
  "version": "0.6.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "dvl-desktop",
      "version": "0.6.0",
      "devDependencies": {
        "electron": "44.7.2"
      }
    },
    "node_modules/@electron-internal/extract-zip": {
      "version": "1.0.5",
      "resolved": "https://registry.npmjs.org/@electron-internal/extract-zip/-/extract-zip-1.0.5.tgz",
      "integrity": "sha512-+bqFCP98pLI0Tt0XQo1TmlXtwjWchISndDOxCkEcIuUgXWpBnLyRI+2DU+mesvnMMX6L1XDqYNA0lXNDHd/yiA==",
      "dev": true,
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=22.12.0"
      }
    },
    "node_modules/@electron/get": {
      "version": "5.1.0",
      "resolved": "https://registry.npmjs.org/@electron/get/-/get-5.1.0.tgz",
      "integrity": "sha512-3kSBtG8ObcTVfXanm5vVJ6UnBLEVmVsRk1M+vGqCuMBV+XLCbJYuWQful+yIy0GQDsSlK0kHEriEHn7SPk4EnA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "debug": "^4.1.1",
        "env-paths": "^3.0.0",
        "graceful-fs": "^4.2.11",
        "progress": "^2.0.3",
        "semver": "^7.6.3",
        "sumchecker": "^3.0.1"
      },
      "engines": {
        "node": ">=22.12.0"
      },
      "optionalDependencies": {
        "undici": "^7.24.4"
      }
    },
    "node_modules/@types/node": {
      "version": "24.19.2",
      "resolved": "https://registry.npmjs.org/@types/node/-/node-24.19.2.tgz",
      "integrity": "sha512-93d49wCWJkCyN87MxLpNN6KXPCwFw7bVUg79mGUV1OS40JGWwVCr8n61DXCSqz7CV6/VfPkb7xec7uP2M+QHWQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "undici-types": ">=7.24.0 <7.24.7"
      }
    },
    "node_modules/debug": {
      "version": "4.4.3",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
      "integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/electron": {
      "version": "44.7.2",
      "resolved": "https://registry.npmjs.org/electron/-/electron-44.7.2.tgz",
      "integrity": "sha512-u3Pbz0Hi1sSSwBMz2v8LiagsfUG4QURPUe/qphM+g4THKP8o4BYdnuboyhlLO8HIC/KfV5rvltyacbP4jEq9yw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@electron-internal/extract-zip": "^1.0.1",
        "@electron/get": "^5.0.0",
        "@types/node": "^24.9.0"
      },
      "bin": {
        "electron": "cli.js",
        "install-electron": "install.js"
      },
      "engines": {
        "node": ">= 22.12.0"
      }
    },
    "node_modules/env-paths": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/env-paths/-/env-paths-3.0.0.tgz",
      "integrity": "sha512-dtJUTepzMW3Lm/NPxRf3wP4642UWhjL2sQxc+ym2YMj1m/H2zDNQOlezafzkHwn6sMstjHTwG6iQQsctDW/b1A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^12.20.0 || ^14.13.1 || >=16.0.0"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/graceful-fs": {
      "version": "4.2.11",
      "resolved": "https://registry.npmjs.org/graceful-fs/-/graceful-fs-4.2.11.tgz",
      "integrity": "sha512-RbJ5/jmFcNNCcDV5o9eTnBLJ/HszWV0P73bc+Ff4nS/rJj+YaS6IGyiOL0VoBYX+l1Wrl3k63h/KrH+nhJ0XvQ==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/progress": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/progress/-/progress-2.0.3.tgz",
      "integrity": "sha512-7PiHtLll5LdnKIMw100I+8xJXR5gW2QwWYkT6iJva0bXitZKa/XMrSbdmg3r2Xnaidz9Qumd0VPaMrZlF9V9sA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/semver": {
      "version": "7.8.5",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.8.5.tgz",
      "integrity": "sha512-Y7/KDsb8LjooZpwaqGyulO6DQlksgCncchHGk+sZIY4SBvUocMBEFH5Ur1fI4dV+Jvl0w6cjvucaIi40puRioA==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/sumchecker": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/sumchecker/-/sumchecker-3.0.1.tgz",
      "integrity": "sha512-MvjXzkz/BOfyVDkG0oFOtBxHX2u3gKbMHIF/dXblZsgD3BWOFLmHovIpZY7BykJdAjcqRCBi1WYBNdEC9yI7vg==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "debug": "^4.1.0"
      },
      "engines": {
        "node": ">= 8.0"
      }
    },
    "node_modules/undici": {
      "version": "7.30.0",
      "resolved": "https://registry.npmjs.org/undici/-/undici-7.30.0.tgz",
      "integrity": "sha512-dkrQXeHSaoamnItlYbmzG0wFYrM0ZwDxCIg0A7aKjTyyhh9svRzCNFEzV+Vm05/yehjCzjDZ31KXfGEjYSztDQ==",
      "dev": true,
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">=20.18.1"
      }
    },
    "node_modules/undici-types": {
      "version": "7.24.6",
      "resolved": "https://registry.npmjs.org/undici-types/-/undici-types-7.24.6.tgz",
      "integrity": "sha512-WRNW+sJgj5OBN4/0JpHFqtqzhpbnV0GuB+OozA9gCL7a993SmU+1JBZCzLNxYsbMfIeDL+lTsphD5jN5N+n0zg==",
      "dev": true,
      "license": "MIT"
    }
  }
}

````

## File: package.json

````json
{
  "name": "dvl-desktop",
  "version": "0.6.0",
  "private": true,
  "main": "src/main/main.js",
  "scripts": {
    "start": "electron .",
    "test": "node tests/green-gate.cjs",
    "test:native-secret": "node tests/native-secret-check.cjs"
  },
  "devDependencies": {
    "electron": "44.7.2"
  }
}

````

## File: src/main/main.js

````javascript
const { app, BrowserWindow, dialog, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

let db = null;
let mainWindow = null;

let logFile = null;

function logsDirectory() {
  return path.join(app.getPath('userData'), 'logs');
}

function initLogger() {
  const dir = logsDirectory();
  fs.mkdirSync(dir, { recursive: true });
  logFile = path.join(dir, 'dvl.log');
}

function logEvent(level, event, data = {}) {
  try {
    if (!logFile) return;

    const record = {
      ts: new Date().toISOString(),
      level,
      event,
      ...data
    };

    fs.appendFileSync(logFile, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (_) {
    // Logging must never crash DVL.
  }
}


function databasePath() {
  return path.join(app.getPath('userData'), 'dvl.sqlite');
}

function legacyStateFilePath() {
  return path.join(app.getPath('userData'), 'desktop-state.json');
}

function isProjectDirectory(folderPath) {
  try {
    return fs.statSync(folderPath).isDirectory() && fs.realpathSync(folderPath) === folderPath;
  } catch (_) {
    return false;
  }
}

function canonicalProjectPath(folderPath) {
  const canonicalPath = fs.realpathSync(folderPath);
  if (!isProjectDirectory(canonicalPath)) {
    throw new Error('Project path must be an accessible directory');
  }
  return canonicalPath;
}

function makeProjectId() {
  return `proj_${crypto.randomUUID()}`;
}

function openDatabase() {
  const target = databasePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });

  db = new DatabaseSync(target);
  // Validate existing state before journal changes, schema migrations or legacy writes.
  checkDatabaseIntegrity();
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
  const currentVersion = row && row.version ? Number(row.version) : 0;
  logEvent('info', 'db.migration_state', { currentVersion });

  if (currentVersion < 1) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          project_id TEXT PRIMARY KEY,
          canonical_path TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_opened_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_state (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);

      db.prepare(
        'INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)'
      ).run(1, new Date().toISOString());

      db.exec('COMMIT;');
      logEvent('info', 'db.migration_applied', { version: 1 });
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  if (currentVersion < 2) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          name TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS secrets (
          name TEXT PRIMARY KEY,
          encrypted_value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      db.prepare(
        'INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)'
      ).run(2, new Date().toISOString());

      db.exec('COMMIT;');
      logEvent('info', 'db.migration_applied', { version: 2 });
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  migrateLegacyLastProject();
}

function migrateLegacyLastProject() {
  const marker = db
    .prepare("SELECT value FROM app_state WHERE key = 'legacy_state_migrated'")
    .get();

  if (marker && marker.value === '1') {
    return;
  }

  const legacyPath = legacyStateFilePath();

  try {
    if (fs.existsSync(legacyPath)) {
      const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));

      if (
        parsed &&
        typeof parsed.lastProjectPath === 'string' &&
        fs.existsSync(parsed.lastProjectPath)
      ) {
        const migrated = upsertProject(parsed.lastProjectPath);
        logEvent('info', 'project.legacy_state_migrated', {
          projectId: migrated.projectId,
          path: migrated.path
        });
      }
    }
  } catch (error) {
    logEvent('warn', 'project.legacy_state_migration_failed', {
      message: error.message
    });
  } finally {
    db.prepare(`
      INSERT INTO app_state(key, value)
      VALUES ('legacy_state_migrated', '1')
      ON CONFLICT(key) DO UPDATE SET value = '1'
    `).run();
  }
}

function upsertProject(folderPath) {
  const canonicalPath = canonicalProjectPath(folderPath);
  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT project_id AS projectId FROM projects WHERE canonical_path = ?')
    .get(canonicalPath);

  let projectId;

  if (existing) {
    projectId = existing.projectId;
    db.prepare(`
      UPDATE projects
      SET display_name = ?, last_opened_at = ?
      WHERE canonical_path = ?
    `).run(path.basename(canonicalPath) || canonicalPath, now, canonicalPath);
  } else {
    projectId = makeProjectId();
    db.prepare(`
      INSERT INTO projects(
        project_id,
        canonical_path,
        display_name,
        created_at,
        last_opened_at
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      projectId,
      canonicalPath,
      path.basename(canonicalPath) || canonicalPath,
      now,
      now
    );
  }

  db.prepare(`
    INSERT INTO app_state(key, value)
    VALUES ('last_project_id', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(projectId);

  const project = getProjectById(projectId);
  logEvent('info', 'project.opened', { projectId: project.projectId, path: project.path });
  return project;
}

function getProjectById(projectId) {
  if (!projectId) return null;

  const row = db.prepare(`
    SELECT
      project_id AS projectId,
      canonical_path AS path,
      display_name AS displayName,
      created_at AS createdAt,
      last_opened_at AS lastOpenedAt
    FROM projects
    WHERE project_id = ?
  `).get(projectId);

  if (!row) return null;

  return {
    ...row,
    available: isProjectDirectory(row.path)
  };
}

function getLastProject() {
  const state = db.prepare(
    "SELECT value FROM app_state WHERE key = 'last_project_id'"
  ).get();

  if (!state || !state.value) return null;

  const project = getProjectById(state.value);
  if (!project || !project.available) {
    logEvent('warn', 'project.restore_unavailable', { projectId: state.value });
    return null;
  }

  logEvent('info', 'project.restored', { projectId: project.projectId, path: project.path });
  return project;
}

function listRecentProjects() {
  const rows = db.prepare(`
    SELECT
      project_id AS projectId,
      canonical_path AS path,
      display_name AS displayName,
      created_at AS createdAt,
      last_opened_at AS lastOpenedAt
    FROM projects
    ORDER BY last_opened_at DESC
    LIMIT 10
  `).all();

  return rows.map((row) => ({
    ...row,
    available: isProjectDirectory(row.path)
  }));
}

function touchProject(projectId) {
  const project = getProjectById(projectId);
  if (!project || !project.available) {
    logEvent('warn', 'project.recent_unavailable', { projectId });
    return null;
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE projects
    SET last_opened_at = ?
    WHERE project_id = ?
  `).run(now, projectId);

  db.prepare(`
    INSERT INTO app_state(key, value)
    VALUES ('last_project_id', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(projectId);

  const selected = getProjectById(projectId);
  logEvent('info', 'project.recent_selected', { projectId: selected.projectId, path: selected.path });
  return selected;
}


function setSetting(name, value) {
  if (typeof name !== 'string' || !name.trim() || value === undefined) {
    throw new Error('Setting name and JSON value are required');
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Setting value must be JSON serializable');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO settings(name, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(name, serialized, now);

  logEvent('info', 'settings.updated', { name });
  return { saved: true };
}

function getSetting(name) {
  const row = db.prepare('SELECT value FROM settings WHERE name = ?').get(name);
  if (!row) return null;

  try {
    return JSON.parse(row.value);
  } catch (_) {
    return null;
  }
}

function ensureEncryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    const error = new Error('OS-backed encryption is not available');
    error.code = 'DVL_SECRET_ENCRYPTION_UNAVAILABLE';
    throw error;
  }
}

function setSecret(name, value) {
  ensureEncryptionAvailable();

  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Secret name is required');
  }

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Secret value is required');
  }

  const encrypted = safeStorage.encryptString(value).toString('base64');
  // Check the cipher round trip before replacing any previously stored secret.
  if (safeStorage.decryptString(Buffer.from(encrypted, 'base64')) !== value) {
    throw new Error('Secret encryption round trip failed');
  }
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO secrets(name, encrypted_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      encrypted_value = excluded.encrypted_value,
      updated_at = excluded.updated_at
  `).run(name, encrypted, now);

  logEvent('info', 'secret.saved', { name });
  return { configured: true };
}

function hasSecret(name) {
  const row = db.prepare('SELECT encrypted_value FROM secrets WHERE name = ?').get(name);
  if (!row) return { configured: false, decryptable: false };
  try {
    ensureEncryptionAvailable();
    const plaintext = safeStorage.decryptString(Buffer.from(row.encrypted_value, 'base64'));
    if (typeof plaintext !== 'string' || plaintext.length === 0) throw new Error('Empty secret');
    logEvent('info', 'secret.decrypt_verified', { name });
    return { configured: true, decryptable: true };
  } catch (_) {
    logEvent('warn', 'secret.decrypt_failed', { name });
    return { configured: true, decryptable: false };
  }
}

function deleteSecret(name) {
  const result = db.prepare('DELETE FROM secrets WHERE name = ?').run(name);
  logEvent('info', 'secret.deleted', { name, deleted: Number(result.changes) > 0 });
  return { configured: false, deleted: Number(result.changes) > 0 };
}


function checkDatabaseIntegrity() {
  const row = db.prepare('PRAGMA integrity_check;').get();
  const value = row ? Object.values(row)[0] : null;

  if (value !== 'ok') {
    logEvent('error', 'db.integrity_failed', { result: value });
    throw new Error(`SQLite integrity_check failed: ${value}`);
  }

  logEvent('info', 'db.integrity_ok');
}

function closeDatabase() {
  if (!db) return;

  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    logEvent('info', 'db.wal_checkpoint');
  } catch (error) {
    logEvent('warn', 'db.wal_checkpoint_failed', { message: error.message });
  }

  try {
    db.close();
    logEvent('info', 'db.closed');
  } catch (error) {
    logEvent('warn', 'db.close_failed', { message: error.message });
  } finally {
    db = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    title: 'DVL Code 😈',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

ipcMain.handle('dvl:get-last-project', async () => {
  try {
    return getLastProject();
  } catch (_) {
    logEvent('error', 'ipc.get_last_project_failed');
    throw new Error('Could not load project state');
  }
});

ipcMain.handle('dvl:list-recent-projects', async () => {
  try {
    return listRecentProjects();
  } catch (_) {
    logEvent('error', 'ipc.list_recent_projects_failed');
    throw new Error('Could not load project state');
  }
});

ipcMain.handle('dvl:open-recent-project', async (_event, projectId) => {
  try {
    return touchProject(projectId);
  } catch (_) {
    logEvent('error', 'ipc.open_recent_project_failed');
    throw new Error('Could not load project state');
  }
});

ipcMain.handle('dvl:open-project', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Open Project',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      logEvent('info', 'project.open_canceled');
      return { canceled: true, project: null };
    }

    const project = upsertProject(result.filePaths[0]);
    return { canceled: false, project };
  } catch (error) {
    logEvent('error', 'ipc.open_project_failed', { message: error.message });
    throw error;
  }
});


ipcMain.handle('dvl:set-setting', async (_event, name, value) => {
  try {
    return setSetting(name, value);
  } catch (error) {
    logEvent('error', 'ipc.set_setting_failed', { name, message: error.message });
    throw error;
  }
});

ipcMain.handle('dvl:get-setting', async (_event, name) => {
  try {
    return getSetting(name);
  } catch (error) {
    logEvent('error', 'ipc.get_setting_failed', { name, message: error.message });
    throw error;
  }
});

ipcMain.handle('dvl:set-secret', async (_event, name, value) => {
  try {
    return setSecret(name, value);
  } catch (error) {
    logEvent('error', 'ipc.set_secret_failed', { name, code: error.code || null, message: error.message });
    throw error;
  }
});

ipcMain.handle('dvl:has-secret', async (_event, name) => {
  try {
    return hasSecret(name);
  } catch (error) {
    logEvent('error', 'ipc.has_secret_failed', { name, message: error.message });
    throw error;
  }
});

ipcMain.handle('dvl:delete-secret', async (_event, name) => {
  try {
    return deleteSecret(name);
  } catch (error) {
    logEvent('error', 'ipc.delete_secret_failed', { name, message: error.message });
    throw error;
  }
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    logEvent('info', 'app.second_instance_blocked');

    if (!mainWindow && app.isReady()) {
      createWindow();
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    try {
      initLogger();
      logEvent('info', 'app.startup', {
        version: app.getVersion(),
        platform: process.platform
      });
      openDatabase();
      createWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    } catch (error) {
      logEvent('error', 'app.startup_failed', { message: error.message });
      closeDatabase();
      dialog.showErrorBox(
        'DVL startup failed',
        'DVL could not initialize its local state. No project has been opened. ' +
        'Do not delete your database. Check logs/dvl.log in the application data folder.'
      );
      app.quit();
    }
  });
}

app.on('before-quit', () => {
  logEvent('info', 'app.shutdown');
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

````

## File: src/preload/preload.js

````javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dvl', {
  openProject: () => ipcRenderer.invoke('dvl:open-project'),
  getLastProject: () => ipcRenderer.invoke('dvl:get-last-project'),
  listRecentProjects: () => ipcRenderer.invoke('dvl:list-recent-projects'),
  openRecentProject: (projectId) =>
    ipcRenderer.invoke('dvl:open-recent-project', projectId),
  setSetting: (name, value) => ipcRenderer.invoke('dvl:set-setting', name, value),
  getSetting: (name) => ipcRenderer.invoke('dvl:get-setting', name),
  setSecret: (name, value) => ipcRenderer.invoke('dvl:set-secret', name, value),
  hasSecret: (name) => ipcRenderer.invoke('dvl:has-secret', name),
  deleteSecret: (name) => ipcRenderer.invoke('dvl:delete-secret', name)
});

````

## File: src/renderer/index.html

````html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DVL Code 😈</title>
  <style>
    * { box-sizing: border-box; }

    body {
      margin: 0;
      height: 100vh;
      background: #111;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .app {
      display: grid;
      grid-template-columns: 230px 1fr;
      height: 100vh;
    }

    aside {
      border-right: 1px solid #292929;
      background: #151515;
      padding: 18px;
      overflow: auto;
    }

    .brand {
      font-weight: 700;
      font-size: 18px;
      margin-bottom: 18px;
    }

    .nav {
      display: grid;
      gap: 8px;
    }

    button {
      border: 1px solid #353535;
      background: #212121;
      color: #fff;
      border-radius: 8px;
      padding: 9px 11px;
      cursor: pointer;
    }

    .nav button {
      text-align: left;
      width: 100%;
    }

    .project-mini {
      margin-top: 18px;
      padding: 10px;
      border: 1px solid #2d2d2d;
      border-radius: 8px;
      background: #181818;
      font-size: 12px;
      color: #aaa;
      overflow-wrap: anywhere;
    }

    main {
      min-width: 0;
      display: grid;
      grid-template-rows: auto auto 1fr;
      gap: 14px;
      padding: 20px;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
    }

    .topbar h1 {
      margin: 0;
      font-size: 24px;
    }

    .stage {
      color: #999;
      font-size: 13px;
    }

    .active-project {
      border: 1px solid #2b2b2b;
      border-radius: 10px;
      padding: 12px;
      background: #171717;
    }

    #projectPath {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      overflow-wrap: anywhere;
    }

    #projectId {
      color: #777;
      margin-top: 5px;
      font-size: 12px;
    }

    .workspace {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 12px;
      min-height: 0;
    }

    .panel {
      min-height: 0;
      border: 1px solid #2d2d2d;
      border-radius: 12px;
      background: #171717;
      padding: 14px;
      overflow: auto;
    }

    .panel h2 {
      margin: 0 0 8px;
      font-size: 16px;
    }

    .placeholder {
      color: #777;
      font-size: 13px;
    }

    .recent-list {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }

    .recent-item {
      display: grid;
      gap: 5px;
      padding: 8px;
      border: 1px solid #2c2c2c;
      border-radius: 8px;
      background: #1b1b1b;
    }

    .recent-name {
      font-weight: 600;
    }

    .recent-path {
      color: #888;
      font-size: 11px;
      overflow-wrap: anywhere;
    }

    .secret-line {
      margin-top: 10px;
      color: #999;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="app">
    <aside>
      <div class="brand">DVL Code 😈</div>

      <div class="nav">
        <button id="openProject">Open Project</button>
        <button id="saveSetting">Save Test Setting</button>
        <button id="saveSecret">Store Test Secret</button>
        <button id="deleteSecret">Delete Test Secret</button>
      </div>

      <div id="appStatus" role="status" aria-live="polite"></div>

      <div class="project-mini">
        <div><strong>Recent Projects</strong></div>
        <div id="recentProjects" class="recent-list"></div>
        <div class="secret-line">
          Secret: <span id="secretStatus">Checking...</span>
        </div>
      </div>
    </aside>

    <main>
      <section class="topbar">
        <div>
          <h1>DVL Code 😈</h1>
          <div class="stage">Desktop Foundation — B10 Workspace Panels</div>
        </div>
      </section>

      <section class="active-project">
        <div id="projectPath">No project selected</div>
        <div id="projectId"></div>
      </section>

      <section class="workspace">
        <section class="panel" id="chatPanel">
          <h2>Chat</h2>
          <div class="placeholder">
            Static shell only. Real provider/chat loop comes later.
          </div>
        </section>

        <section class="panel" id="filesPanel">
          <h2>Files / Activity</h2>
          <div class="placeholder">
            Static shell only. Real filesystem/runtime activity comes in Phase C.
          </div>
        </section>

        <section class="panel" id="terminalPanel">
          <h2>Terminal</h2>
          <div class="placeholder">
            Static shell only. No command execution is wired yet.
          </div>
        </section>

        <section class="panel" id="previewPanel">
          <h2>Preview</h2>
          <div class="placeholder">
            Placeholder only. Dev-server and URL wiring comes in Phase C.
          </div>
        </section>
      </section>
    </main>
  </div>

  <script src="./renderer.js"></script>
</body>
</html>

````

## File: src/renderer/renderer.js

````javascript
const openButton = document.getElementById('openProject');
const projectPath = document.getElementById('projectPath');
const projectId = document.getElementById('projectId');
const recentProjects = document.getElementById('recentProjects');
const saveSettingButton = document.getElementById('saveSetting');
const saveSecretButton = document.getElementById('saveSecret');
const deleteSecretButton = document.getElementById('deleteSecret');
const secretStatus = document.getElementById('secretStatus');

function renderActiveProject(project) {
  if (!project) {
    projectPath.textContent = 'No project selected';
    projectId.textContent = '';
    return;
  }

  projectPath.textContent = project.path;
  projectId.textContent = project.projectId;
}

async function renderRecentProjects() {
  const projects = await window.dvl.listRecentProjects();
  recentProjects.innerHTML = '';

  if (!projects || projects.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'recent-path';
    empty.textContent = 'None yet';
    recentProjects.appendChild(empty);
    return;
  }

  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'recent-item';

    const name = document.createElement('div');
    name.className = 'recent-name';
    name.textContent = project.displayName;

    const path = document.createElement('div');
    path.className = 'recent-path';
    path.textContent = project.available ? project.path : `${project.path} (missing)`;

    row.appendChild(name);
    row.appendChild(path);

    if (project.available) {
      row.addEventListener('click', () => runUiAction(async () => {
        const selected = await window.dvl.openRecentProject(project.projectId);
        if (selected) {
          renderActiveProject(selected);
        } else {
          showUiError('Project unavailable.');
        }
        await renderRecentProjects();
      }));
    }

    recentProjects.appendChild(row);
  }
}

async function refreshSecretStatus() {
  const status = await window.dvl.hasSecret('b8_test_secret');
  secretStatus.textContent = !status.configured ? 'Not configured' :
    status.decryptable ? 'Configured (verified)' : 'Configured (unreadable)';
}

async function loadInitialState() {
  const lastProject = await window.dvl.getLastProject();
  renderActiveProject(lastProject);
  await renderRecentProjects();
  await refreshSecretStatus();
}

function showUiError(message) {
  document.getElementById('appStatus').textContent = message;
}

async function runUiAction(action) {
  showUiError('');
  try { await action(); } catch (_) {
    showUiError('Action failed. Check DVL logs.');
  }
}

openButton.addEventListener('click', () => runUiAction(async () => {
  const result = await window.dvl.openProject();

  if (!result || result.canceled || !result.project) {
    return;
  }

  renderActiveProject(result.project);
  await renderRecentProjects();
}));

saveSettingButton.addEventListener('click', () => runUiAction(async () => {
  await window.dvl.setSetting('b8_test_setting', {
    savedAt: new Date().toISOString()
  });
  saveSettingButton.textContent = 'Saved ✓';
}));

saveSecretButton.addEventListener('click', () => runUiAction(async () => {
  await window.dvl.setSecret('b8_test_secret', 'DVL_B8_SECRET_TEST_VALUE_2026');
  await refreshSecretStatus();
}));

deleteSecretButton.addEventListener('click', () => runUiAction(async () => {
  await window.dvl.deleteSecret('b8_test_secret');
  await refreshSecretStatus();
}));

runUiAction(loadInitialState);

````

## File: tests/green-gate.cjs

````javascript
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const source = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-gate-'));
const boots = [];
let passes = 0;
async function test(name, fn) { await fn(); passes++; console.log('PASS', name); }
function boot(userData, options = {}) {
  const handlers = new Map(), events = new Map(), windows = [];
  const state = { quit: false, errorShown: false, sql: [] };
  let start;
  class Window {
    constructor(config) { this.options = config; this.events = new Map(); this.minimized = false; windows.push(this); }
    on(name, fn) { this.events.set(name, fn); }
    loadFile() {}
    isMinimized() { return this.minimized; }
    restore() { this.minimized = false; this.restored = true; }
    focus() { this.focused = true; }
    close() { windows.splice(windows.indexOf(this), 1); this.events.get('closed')(); }
    static getAllWindows() { return windows; }
  }
  class TracedDatabase extends DatabaseSync {
    exec(sql) { state.sql.push(sql); return super.exec(sql); }
    prepare(sql) { state.sql.push(sql); return super.prepare(sql); }
  }
  const electron = {
    app: { getPath: () => userData, getVersion: () => '0.6.0', isReady: () => true,
      requestSingleInstanceLock: () => options.lock !== false, quit() { state.quit = true; },
      on: (name, fn) => events.set(name, fn), whenReady: () => ({ then: fn => { start = fn; } }) },
    BrowserWindow: Window, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showErrorBox: () => { state.errorShown = true; } },
    safeStorage: {
      isEncryptionAvailable: () => options.encryption !== false,
      encryptString: value => Buffer.from('MOCK_CIPHERTEXT:' + value),
      decryptString: bytes => {
        if (options.decryptFailure) throw new Error('mock decryption failed');
        const text = bytes.toString();
        if (!text.startsWith('MOCK_CIPHERTEXT:')) throw new Error('Invalid mock ciphertext');
        return options.mismatch ? 'wrong' : text.slice('MOCK_CIPHERTEXT:'.length);
      }
    }
  };
  const ctx = vm.createContext({ require: name => name === 'electron' ? electron : name === 'node:sqlite' ? { DatabaseSync: TracedDatabase } : require(name),
    __dirname: path.join(__dirname, '../src/main'), process, Buffer, console });
  vm.runInContext(source, ctx); if (start) start();
  const result = { ctx, handlers, events, windows, state, electron,
    invoke: (name, ...args) => handlers.get('dvl:' + name)({}, ...args) };
  boots.push(result); return result;
}
function inspect(data, fn) {
  const d = new DatabaseSync(path.join(data, 'dvl.sqlite'), { readOnly: true });
  try { return fn(d); } finally { d.close(); }
}
async function main() {
  const data = path.join(base, 'data'), project = path.join(base, 'project');
  fs.mkdirSync(project); fs.writeFileSync(path.join(project, 'notes.txt'), 'unchanged');
  const r = boot(data), c = r.ctx;
  await test('Schema and integrity before all schema/journal writes', () => {
    assert.match(r.state.sql[0], /integrity_check/);
    inspect(data, d => { assert.equal(d.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); assert.equal(d.prepare('SELECT count(*) n FROM schema_migrations').get().n, 2); });
  });
  await test('Mock picker IPC cancellation leaves last project empty', async () => {
    assert.equal((await r.invoke('open-project')).canceled, true); assert.equal(await r.invoke('get-last-project'), null);
  });
  r.electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] });
  const id = (await r.invoke('open-project')).project.projectId;
  await test('Open-project IPC and same canonical path reuse ID', async () => assert.equal((await r.invoke('open-project')).project.projectId, id));
  await test('Canonical alias reuses ID', () => { const alias = path.join(base, 'alias'); fs.symlinkSync(project, alias); assert.equal(c.upsertProject(alias).projectId, id); });
  await test('Settings IPC round trip and invalid inputs', async () => { await r.invoke('set-setting', 'test', { n: 1 }); assert.equal((await r.invoke('get-setting', 'test')).n, 1); await assert.rejects(r.invoke('set-setting', '', 1)); await assert.rejects(r.invoke('set-setting', 'test', undefined)); });
  await test('Secrets IPC verifies persisted ciphertext with status only', async () => {
    const result = await r.invoke('set-secret', 'test', 'fake-value'); assert.deepEqual(Object.keys(result), ['configured']);
    const status = await r.invoke('has-secret', 'test'); assert.equal(status.decryptable, true); assert.deepEqual(Object.keys(status).sort(), ['configured', 'decryptable']);
    inspect(data, d => { const row = d.prepare('SELECT encrypted_value FROM secrets WHERE name=?').get('test'); assert.notEqual(row.encrypted_value, 'fake-value'); assert.equal(r.electron.safeStorage.decryptString(Buffer.from(row.encrypted_value, 'base64')), 'fake-value'); });
  });
  await test('Recent IPC selects older project and persists selection', async () => {
    const other = path.join(base, 'other'); fs.mkdirSync(other); c.upsertProject(other);
    // Ensure deterministic ordering without relying on millisecond timing.
    const d = new DatabaseSync(path.join(data, 'dvl.sqlite')); d.prepare('UPDATE projects SET last_opened_at=? WHERE project_id=?').run('2000-01-01T00:00:00Z', id); d.close();
    assert.equal((await r.invoke('open-recent-project', id)).projectId, id);
    assert.equal((await r.invoke('list-recent-projects'))[0].projectId, id);
    assert.equal((await r.invoke('get-last-project')).projectId, id);
  });
  await test('Missing recent returns null and unavailable; restored folder keeps ID', async () => {
    fs.renameSync(project, project + '-away');
    assert.equal(await r.invoke('get-last-project'), null); assert.equal(await r.invoke('open-recent-project', id), null);
    assert.equal((await r.invoke('list-recent-projects')).find(p => p.projectId === id).available, false);
    fs.renameSync(project + '-away', project); assert.equal((await r.invoke('get-last-project')).projectId, id);
  });
  await test('BrowserWindow security flags', () => { const prefs = r.windows[0].options.webPreferences; assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.sandbox, true); });
  await test('Second instance restores minimized window; closed window recreated', () => {
    r.windows[0].minimized = true; r.events.get('second-instance')(); assert.equal(r.windows[0].restored, true); assert.equal(r.windows[0].focused, true);
    r.windows[0].close(); r.events.get('second-instance')(); assert.equal(r.windows.length, 1);
  });
  await test('Before-quit checkpoints and closes database', () => { r.events.get('before-quit')(); const logs = fs.readFileSync(path.join(data, 'logs/dvl.log'), 'utf8'); assert.match(logs, /app.shutdown/); assert.match(logs, /db.wal_checkpoint/); assert.match(logs, /db.closed/); assert.throws(() => c.getSetting('test')); });
  const reopened = boot(data);
  await test('Restart preserves project, setting and decryptable secret via IPC', async () => { assert.equal((await reopened.invoke('get-last-project')).projectId, id); assert.equal((await reopened.invoke('get-setting', 'test')).n, 1); assert.equal((await reopened.invoke('has-secret', 'test')).decryptable, true); });
  await test('Unreadable ciphertext returns boolean failure; row retained', async () => {
    reopened.electron.safeStorage.decryptString = () => { throw new Error('failure'); };
    const status = await reopened.invoke('has-secret', 'test'); assert.equal(status.configured, true); assert.equal(status.decryptable, false);
    inspect(data, d => assert.equal(d.prepare('SELECT count(*) n FROM secrets').get().n, 1));
  });
  reopened.ctx.closeDatabase();
  await test('Unavailable encryption and mismatched round trip reject without write', async () => {
    for (const options of [{ encryption: false }, { mismatch: true }, { decryptFailure: true }]) {
      const d = path.join(base, 'crypto-' + boots.length), b = boot(d, options);
      await assert.rejects(b.invoke('set-secret', 'key', 'fake'));
      inspect(d, sql => assert.equal(sql.prepare('SELECT count(*) n FROM secrets').get().n, 0));
    }
  });
  await test('Delete-secret IPC removes row and reports status only', async () => { const b = boot(path.join(base, 'delete')); await b.invoke('set-secret', 'test', 'fake'); assert.equal((await b.invoke('delete-secret', 'test')).deleted, true); assert.equal((await b.invoke('has-secret', 'test')).configured, false); });
  await test('Regular-file replacement not restored or registered', () => {
    const b = boot(data); fs.renameSync(project, project + '-away'); fs.writeFileSync(project, 'regular file');
    assert.equal(b.ctx.getLastProject(), null); assert.equal(b.ctx.listRecentProjects().find(p => p.projectId === id).available, false); assert.throws(() => b.ctx.upsertProject(project), /directory/);
    fs.unlinkSync(project); fs.renameSync(project + '-away', project); b.ctx.closeDatabase();
  });
  await test('Canonical path replaced by symlink cannot impersonate original project', () => {
    const b = boot(data), target = path.join(base, 'replacement'); fs.mkdirSync(target);
    fs.renameSync(project, project + '-away'); fs.symlinkSync(target, project);
    assert.equal(b.ctx.getLastProject(), null); assert.equal(b.ctx.touchProject(id), null);
    fs.unlinkSync(project); fs.renameSync(project + '-away', project); b.ctx.closeDatabase();
  });
  await test('Legacy import executes on boot and is idempotent across restart', () => {
    const legacy = path.join(base, 'legacy'); fs.mkdirSync(legacy); fs.writeFileSync(path.join(legacy, 'desktop-state.json'), JSON.stringify({ lastProjectPath: project }));
    const b = boot(legacy), imported = b.ctx.getLastProject().projectId; b.ctx.closeDatabase();
    const again = boot(legacy); assert.equal(again.ctx.getLastProject().projectId, imported);
    inspect(legacy, d => { assert.equal(d.prepare('SELECT count(*) n FROM projects').get().n, 1); assert.equal(d.prepare("SELECT value FROM app_state WHERE key='legacy_state_migrated'").get().value, '1'); });
  });
  await test('Legacy regular-file path is rejected safely', () => {
    const legacy = path.join(base, 'legacy-invalid'); fs.mkdirSync(legacy); const file = path.join(base, 'file'); fs.writeFileSync(file, 'x');
    fs.writeFileSync(path.join(legacy, 'desktop-state.json'), JSON.stringify({ lastProjectPath: file }));
    const b = boot(legacy); assert.equal(b.ctx.getLastProject(), null); assert.equal(b.state.quit, false); assert.equal(b.ctx.listRecentProjects().length, 0);
  });
  await test('Rejected single-instance lock never opens or changes database', () => {
    const blocked = path.join(base, 'blocked'); const b = boot(blocked, { lock: false }); assert.equal(b.state.quit, true); assert.equal(b.windows.length, 0); assert.equal(fs.existsSync(blocked), false);
  });
  await test('Corrupt database handled, retained and never migrated', () => {
    const corrupt = path.join(base, 'corrupt'); fs.mkdirSync(corrupt); const file = path.join(corrupt, 'dvl.sqlite'); fs.writeFileSync(file, 'not a sqlite database');
    const b = boot(corrupt); assert.equal(b.state.quit, true); assert.equal(b.state.errorShown, true); assert.equal(b.windows.length, 0); assert.equal(fs.readFileSync(file, 'utf8'), 'not a sqlite database'); assert.equal(b.state.sql.some(sql => /CREATE TABLE|INSERT INTO|UPDATE projects/.test(sql)), false);
  });
  await test('Project content unchanged; logs contain no test secret values', () => {
    assert.equal(fs.readFileSync(path.join(project, 'notes.txt'), 'utf8'), 'unchanged');
    for (const b of boots) { const log = b.ctx.logsDirectory(); if (fs.existsSync(path.join(log, 'dvl.log'))) assert.doesNotMatch(fs.readFileSync(path.join(log, 'dvl.log'), 'utf8'), /fake-value|MOCK_CIPHERTEXT/); }
  });
  await test('Failed round trip preserves existing ciphertext', async () => {
    const data = path.join(base, 'preserve'); const b = boot(data);
    await b.invoke('set-secret', 'test', 'previous');
    b.electron.safeStorage.decryptString = () => 'mismatch';
    await assert.rejects(b.invoke('set-secret', 'test', 'replacement'));
    inspect(data, d => assert.equal(Buffer.from(d.prepare('SELECT encrypted_value FROM secrets').get().encrypted_value, 'base64').toString(), 'MOCK_CIPHERTEXT:previous'));
  });
  await test('Renderer handles unreadable secret, IPC failure and stale recent', async () => {
    const elements = new Map();
    function element() { return { textContent: '', children: [], events: {}, appendChild(c) { this.children.push(c); }, addEventListener(n, f) { this.events[n] = f; }, set innerHTML(v) { this.children = []; } }; }
    for (const n of ['openProject', 'projectPath', 'projectId', 'recentProjects', 'saveSetting', 'saveSecret', 'deleteSecret', 'secretStatus', 'appStatus']) elements.set(n, element());
    let missing = false;
    const dvl = { getLastProject: async () => null, listRecentProjects: async () => [{ projectId: 'p', displayName: 'Project', path: '/fixture', available: !missing }], openRecentProject: async () => null, hasSecret: async () => ({ configured: true, decryptable: false }), setSecret: async () => { throw new Error('unavailable'); } };
    const ctx = vm.createContext({ document: { getElementById: n => elements.get(n), createElement: element }, window: { dvl } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8'), ctx);
    await ctx.loadInitialState(); assert.equal(elements.get('secretStatus').textContent, 'Configured (unreadable)');
    const row = elements.get('recentProjects').children[0]; missing = true; await row.events.click();
    assert.match(elements.get('recentProjects').children[0].children[1].textContent, /missing/);
    await elements.get('saveSecret').events.click(); assert.match(elements.get('appStatus').textContent, /Action failed/);
  });
  console.log('TOTAL CHECKS PASSED:', passes);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { for (const b of boots) b.ctx.closeDatabase(); fs.rmSync(base, { recursive: true, force: true }); });

````

## File: tests/native-secret-check.cjs

````javascript
// Run with Node: two actual Electron processes against disposable state only.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-native-secret-'));
async function run(phase) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [path.join(__dirname, 'native-secret-child.cjs'), data, phase], { env });
    let output = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 35000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { process.stderr.write(chunk); });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0 || !output.includes('NATIVE_SECRET_' + phase.toUpperCase() + '_PASS')) return reject(new Error('Electron ' + phase + ' probe failed (exit ' + code + ')'));
      console.log('PASS Native Electron secret ' + phase + ' through production preload and IPC'); resolve();
    });
  });
}
(async () => {
  try {
    await run('write'); await run('read');
    const db = new DatabaseSync(path.join(data, 'dvl.sqlite'), { readOnly: true });
    try {
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      const cipher = db.prepare("SELECT encrypted_value FROM secrets WHERE name='native_gate_probe'").get().encrypted_value;
      assert.ok(cipher.length); assert.notEqual(cipher, 'DVL_DISPOSABLE_NATIVE_PROBE');
      assert.equal(Buffer.from(cipher, 'base64').includes(Buffer.from('DVL_DISPOSABLE_NATIVE_PROBE')), false);
    } finally { db.close(); }
    const logs = fs.readFileSync(path.join(data, 'logs/dvl.log'), 'utf8');
    assert.doesNotMatch(logs, /DVL_DISPOSABLE_NATIVE_PROBE/);
    assert.ok((logs.match(/secret.decrypt_verified/g) || []).length >= 2);
    assert.equal((logs.match(/db.closed/g) || []).length, 2);
    console.log('PASS Native restart, clean shutdown, DB integrity and no secret in logs');
    console.log('NATIVE SECRET CHECK PASSED');
  } finally { fs.rmSync(data, { recursive: true, force: true }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

````

## File: tests/native-secret-child.cjs

````javascript
// Real Electron integration probe. Started only by native-secret-check.cjs.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const [data, phase] = process.argv.slice(2);
const tempRoot = fs.realpathSync(os.tmpdir());
if (!data || !['write', 'read'].includes(phase) || !fs.realpathSync(data).startsWith(tempRoot + path.sep)) {
  throw new Error('Probe requires an existing disposable directory inside the OS temp directory');
}
app.setPath('userData', data);
const timer = setTimeout(() => { console.error('Native secret probe timed out'); app.exit(1); }, 25000);
require('../src/main/main.js');
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    assert.ok(win, 'Production Main must create a real window');
    if (win.webContents.isLoadingMainFrame()) {
      await new Promise((resolve, reject) => {
        win.webContents.once('did-finish-load', resolve);
        win.webContents.once('did-fail-load', (_e, code) => reject(new Error('Load failed: ' + code)));
      });
    }
    if (phase === 'write') {
      const result = await win.webContents.executeJavaScript(`window.dvl.setSecret('native_gate_probe', 'DVL_DISPOSABLE_NATIVE_PROBE')`);
      assert.deepEqual(Object.keys(result), ['configured']);
      await win.webContents.executeJavaScript(`window.dvl.setSetting('native_gate_probe', {saved: true})`);
    }
    const status = await win.webContents.executeJavaScript(`window.dvl.hasSecret('native_gate_probe')`);
    assert.equal(status.configured, true); assert.equal(status.decryptable, true);
    assert.deepEqual(Object.keys(status).sort(), ['configured', 'decryptable']);
    const setting = await win.webContents.executeJavaScript(`window.dvl.getSetting('native_gate_probe')`);
    assert.equal(setting.saved, true);
    console.log('NATIVE_SECRET_' + phase.toUpperCase() + '_PASS');
    clearTimeout(timer); app.quit();
  } catch (error) {
    clearTimeout(timer); console.error('Native secret probe failed:', error.message); app.exit(1);
  }
});

````
