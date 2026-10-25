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
