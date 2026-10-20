'use strict';
// Real production B handlers/isTrusted; mock Electron identities + disposable SQLite.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-b-auth-')));
const handlers = new Map(), events = new Map(), windows = [];
let ready, dialogs = 0;
class Window {
  constructor() {
    const url = pathToFileURL(path.join(__dirname, '../src/renderer/index.html')).href;
    this.events = new Map(); this.pageURL = url; this.destroyed = false;
    this.webContents = { mainFrame: { url }, getURL: () => this.pageURL, isDestroyed: () => this.destroyed, on() {}, send() {}, setWindowOpenHandler() {} }; windows.push(this);
  }
  on(name, fn) { this.events.set(name, fn); } loadFile() {} static getAllWindows() { return windows; }
}
const electron = {
  app: { getPath: () => base, getVersion: () => '0.6.0', isReady: () => true, requestSingleInstanceLock: () => true,
    quit() {}, on: (name, fn) => events.set(name, fn), whenReady: () => ({ then: fn => { ready = fn; } }) },
  BrowserWindow: Window, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
  dialog: { showOpenDialog: async () => { dialogs++; return { canceled: true }; }, showErrorBox() {} },
  safeStorage: { isEncryptionAvailable: () => false }
};
const context = vm.createContext({ require: name => name === 'electron' ? electron : require(name), __dirname: path.join(__dirname, '../src/main'), process, Buffer, console });
function setWindow(value) {
  // Trusted fixture control of the registry, never a production IPC capability.
  context.__authFixtureWindow = value;
  vm.runInContext('mainWindow = __authFixtureWindow', context); delete context.__authFixtureWindow;
}
(async () => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8'), context); ready();
  const win = windows[0], sender = win.webContents, frame = sender.mainFrame, url = sender.getURL();
  const owned = () => ({ sender, senderFrame: frame });
  // Positive controls prevent an always-reject implementation passing vacuously.
  assert.equal(await handlers.get('dvl:get-setting')(owned(), 'positive-only'), null);
  await handlers.get('dvl:set-setting')(owned(), 'positive-only', 7);
  assert.equal(context.getSetting('positive-only'), 7);
  const calls = new Map([
    ['get-last-project', []], ['list-recent-projects', []], ['open-recent-project', ['missing']], ['open-project', []],
    ['set-setting', ['probe', 1]], ['get-setting', ['probe']], ['set-secret', ['probe', 'PRIVATE_VALUE']], ['has-secret', ['probe']], ['delete-secret', ['probe']]
  ]);
  const cases = [
    ['foreign_sender', () => ({ sender: { ...sender }, senderFrame: frame })],
    ['foreign_frame', () => ({ sender, senderFrame: { url } })],
    ['navigated_sender', () => { win.pageURL = 'https://untrusted.invalid/'; return owned(); }],
    ['frame_url_mismatch', () => { frame.url = 'https://untrusted.invalid/'; return owned(); }],
    ['destroyed_sender', () => { win.destroyed = true; return owned(); }],
    ['missing_window', () => { setWindow(null); return owned(); }],
    ['closed_window', () => { win.events.get('closed')(); assert.equal(vm.runInContext('mainWindow', context), null); return owned(); }],
    ['missing_sender', () => ({ senderFrame: frame })],
    ['missing_frame', () => ({ sender })],
    ['missing_event', () => undefined]
  ];
  let count = 0;
  const totalChanges = () => vm.runInContext("Number(db.prepare('SELECT total_changes() AS n').get().n)", context);
  const beforeChanges = totalChanges();
  for (const [scenario, makeEvent] of cases) {
    for (const [name, args] of calls) {
      try {
        const event = makeEvent();
        await assert.rejects(() => handlers.get('dvl:' + name)(event, ...args), /SENDER_DENIED/, scenario + ':' + name);
        assert.equal(totalChanges(), beforeChanges, scenario + ': unexpected database mutation');
        assert.equal(dialogs, 0); assert.equal(context.getSetting('probe'), null);
        assert.equal(context.listRecentProjects().length, 0); assert.equal(context.hasSecret('probe').configured, false);
        count++;
      } finally { setWindow(win); win.pageURL = url; frame.url = url; win.destroyed = false; }
    }
    console.log('AUTH_SCENARIO_PASS', scenario, calls.size);
  }
  console.log('C1B_B_AUTH_PASS', count, '(9 B channels x 10 negative scenarios; authenticated read/write controls; mock-level)');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { context.closeDatabase(); fs.rmSync(base, { recursive: true, force: true }); });
