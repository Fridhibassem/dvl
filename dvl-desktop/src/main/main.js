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

function canonicalProjectPath(folderPath) {
  return fs.realpathSync(folderPath);
}

function makeProjectId() {
  return `proj_${crypto.randomUUID()}`;
}

function openDatabase() {
  const target = databasePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });

  db = new DatabaseSync(target);
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
    available: fs.existsSync(row.path)
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
    available: fs.existsSync(row.path)
  }));
}

function touchProject(projectId) {
  const project = getProjectById(projectId);
  if (!project || !project.available) {
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
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO settings(name, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(name, JSON.stringify(value), now);

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
  const row = db.prepare('SELECT 1 AS present FROM secrets WHERE name = ?').get(name);
  return { configured: Boolean(row && row.present) };
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
  return getLastProject();
});

ipcMain.handle('dvl:list-recent-projects', async () => {
  return listRecentProjects();
});

ipcMain.handle('dvl:open-recent-project', async (_event, projectId) => {
  return touchProject(projectId);
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

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    initLogger();
    logEvent('info', 'app.startup', {
      version: app.getVersion(),
      platform: process.platform
    });

    openDatabase();
    checkDatabaseIntegrity();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  logEvent('info', 'app.shutdown');
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
