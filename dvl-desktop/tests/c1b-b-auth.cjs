'use strict';
// Production B handlers, authenticated mock frames, real disposable SQLite.
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
    this.webContents = { mainFrame: { url }, getURL: () => url, isDestroyed: () => false, on() {}, send() {}, setWindowOpenHandler() {} }; windows.push(this);
  }
  on() {} loadFile() {} static getAllWindows() { return windows; }
}
const electron = {
  app: { getPath: () => base, getVersion: () => '0.6.0', isReady: () => true, requestSingleInstanceLock: () => true,
    quit() {}, on: (name, fn) => events.set(name, fn), whenReady: () => ({ then: fn => { ready = fn; } }) },
  BrowserWindow: Window, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
  dialog: { showOpenDialog: async () => { dialogs++; return { canceled: true }; }, showErrorBox() {} },
  safeStorage: { isEncryptionAvailable: () => false }
};
const context = vm.createContext({ require: name => name === 'electron' ? electron : require(name), __dirname: path.join(__dirname, '../src/main'), process, Buffer, console });
(async () => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8'), context); ready();
  const sender = windows[0].webContents;
  const calls = new Map([
    ['get-last-project', []], ['list-recent-projects', []], ['open-recent-project', ['missing']], ['open-project', []],
    ['set-setting', ['probe', 1]], ['get-setting', ['probe']], ['set-secret', ['probe', 'PRIVATE_VALUE']], ['has-secret', ['probe']], ['delete-secret', ['probe']]
  ]);
  let count = 0;
  for (const [name, args] of calls) for (const event of [
    { sender: { ...sender }, senderFrame: sender.mainFrame },
    { sender, senderFrame: { url: sender.getURL() } }
  ]) {
    await assert.rejects(handlers.get('dvl:' + name)(event, ...args), /SENDER_DENIED/); count++;
  }
  assert.equal(dialogs, 0); assert.equal(context.getSetting('probe'), null);
  assert.equal(context.listRecentProjects().length, 0); assert.equal(context.hasSecret('probe').configured, false);
  console.log('C1B_B_AUTH_PASS', count, '(9 B channels x foreign sender/non-main frame; mock-level)');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { context.closeDatabase(); fs.rmSync(base, { recursive: true, force: true }); });
