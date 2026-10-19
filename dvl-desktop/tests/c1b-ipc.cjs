'use strict';
// Controller tests use real policy/binding and a simulated request completion.
// These assertions are NOT native confinement or Electron runtime evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { DesktopReader, verifyHelper } = require('../src/main/desktop-reader.cjs');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-c1b-ipc-')));
const project = path.join(base, 'project'), other = path.join(base, 'other');
fs.mkdirSync(project); fs.mkdirSync(other);
const controllers = []; let count = 0, number = 0;
async function test(name, fn) { await fn(); console.log('PASS', name); count++; }
function setup() {
  const handlers = new Map(), logs = [], sender = new EventEmitter();
  let url;
  Object.assign(sender, { mainFrame: {}, getURL: () => url, isDestroyed: () => false, send: (channel, state) => { sender.lastState = state; }, setWindowOpenHandler: fn => { sender.open = fn; } });
  let win = { webContents: sender };
  const c = new DesktopReader({ app: { isPackaged: false, getPath: () => path.join(base, 'userData') }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    getWindow: () => win, resolveProject: projectId => ({ projectId, path: projectId === 'A' ? project : other, available: true }), logEvent: (...args) => logs.push(args) });
  controllers.push(c); url = c.url; sender.mainFrame.url = url; c.attach(win); c.select({ projectId: 'A' });
  const event = { sender, senderFrame: sender.mainFrame };
  return { c, sender, event, logs, replaceWindow: next => { win = next; c.attach(next); }, setURL: value => { url = value; },
    invoke: (name, ...args) => handlers.get('dvl:reader:' + name)(event, ...args), handlers };
}
function req(c, extra = {}) { return { ...c.binding, requestId: 'ipc_' + ++number, relativePath: 'known.txt', ...extra }; }
function immediate(c) { c.service.request = async (_op, r) => ({ ...r, ok: true, data: { text: 'INERT_CONTENT' } }); }
async function main() {
  await test('Helper is outside asar and matches platform, architecture and startup digest', () => {
    const { c } = setup(); assert.equal(c.integrityError, null);
    assert.equal(c.service.userDataPath, path.join(base, 'userData')); assert.equal(verifyHelper(c.binary, c.manifest), true);
    const helper = path.join(base, 'helper'), manifest = path.join(base, 'manifest');
    fs.copyFileSync(c.binary, helper); fs.chmodSync(helper, 0o700); fs.copyFileSync(c.manifest, manifest);
    assert.equal(verifyHelper(helper, manifest), true); fs.appendFileSync(helper, 'modified'); assert.equal(verifyHelper(helper, manifest), false);
    fs.rmSync(helper); assert.equal(verifyHelper(helper, manifest), false);
    assert.equal(verifyHelper('/app.asar/bin/project-reader', manifest), false);
    const m = JSON.parse(fs.readFileSync(c.manifest)); m.arch = 'wrong'; fs.writeFileSync(manifest, JSON.stringify(m)); assert.equal(verifyHelper(c.binary, manifest), false);
  });
  await test('Reject foreign webContents, child frames, wrong origin and detached frames', async () => {
    const { c, event, sender, setURL } = setup(); immediate(c);
    for (const e of [{}, { ...event, sender: { ...sender } }, { ...event, senderFrame: { url: c.url } }, { ...event, senderFrame: null }]) {
      assert.equal((await c.request(e, 'readTextFile', [req(c)])).error.code, 'SENDER_DENIED');
    }
    sender.mainFrame.url = c.url + '?fake'; assert.equal(c.isTrusted(event), false);
    sender.mainFrame.url = c.url; setURL('https://example.invalid/'); assert.equal(c.isTrusted(event), false);
  });
  await test('Own main frame receives bounded context without root or rebinding capability', async () => {
    const x = setup(); const status = await x.invoke('context');
    assert.equal(status.context.projectId, 'A'); assert.deepEqual(Object.keys(status.context).sort(), ['contextGeneration', 'projectId']);
    assert.match(status.completeness, /permitted files/);
    assert.equal((await x.invoke('context', {})).error.code, 'INVALID_REQUEST');
    assert.equal(x.handlers.has('dvl:reader:bind'), false);
  });
  await test('Exact IPC schemas reject root injection, missing/unknown keys, bad query and extra args', async () => {
    const { c, invoke } = setup(); immediate(c);
    for (const extra of [{ root: other }, { relativePath: '../outside' }, { relativePath: '/outside' }, { contextGeneration: undefined }, { requestId: '' }, { relativePath: '.env' }]) {
      assert.equal((await invoke('readTextFile', req(c, extra))).ok, false);
    }
    assert.equal((await invoke('searchText', req(c, { relativePath: '.', query: 'a\nb' }))).error.code, 'INVALID_REQUEST');
    assert.equal((await invoke('readTextFile', req(c), 'extra')).error.code, 'INVALID_REQUEST');
    assert.equal((await invoke('readTextFile', null)).error.code, 'INVALID_REQUEST');
    assert.equal((await invoke('cancel', { ...c.binding, requestId: 'x', root: other })).error.code, 'INVALID_REQUEST');
  });
  await test('Wrong generation/project cannot reach the service', async () => {
    const { c, invoke } = setup(); c.service.request = () => { throw new Error('must not run'); };
    assert.equal((await invoke('readTextFile', req(c, { projectId: 'B' }))).error.code, 'STALE_CONTEXT');
    assert.equal((await invoke('readTextFile', req(c, { contextGeneration: 'old' }))).error.code, 'STALE_CONTEXT');
  });
  await test('Exception mapping never reveals exception text or helper payload', async () => {
    const { c, invoke } = setup(); c.service.request = async () => { throw Object.assign(new Error('PRIVATE_SECRET /private/path'), { code: 'PRIVATE_SECRET' }); };
    const result = await invoke('readTextFile', req(c)); assert.equal(result.error.code, 'RUNTIME_FAILED'); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SECRET|private\/path/);
  });
  await test('Per-renderer pending ceiling and duplicate ownership do not overwrite a request', async () => {
    const { c, invoke } = setup(); const finish = []; c.service.request = (_op, r) => new Promise(resolve => finish.push(() => resolve({ ...r, ok: true, data: {} })));
    const request = req(c), first = invoke('readTextFile', request);
    assert.equal((await invoke('readTextFile', request)).error.code, 'INVALID_REQUEST');
    const rest = Array.from({ length: 3 }, () => invoke('readTextFile', req(c)));
    assert.equal((await invoke('readTextFile', req(c))).error.code, 'BUSY');
    finish.forEach(f => f()); await Promise.all([first, ...rest]); assert.equal(c.owners.size, 0);
  });
  await test('A -> B fences an in-flight completion even when backend ignored cancellation', async () => {
    const { c, invoke } = setup(); let finish;
    c.service.request = (_op, r) => new Promise(resolve => { finish = () => resolve({ ...r, ok: true, data: { text: 'OLD_PROJECT' } }); });
    const result = invoke('readTextFile', req(c)); c.select({ projectId: 'B' }); finish();
    const out = await result; assert.equal(out.error.code, 'STALE_CONTEXT'); assert.doesNotMatch(JSON.stringify(out), /OLD_PROJECT/);
  });
  await test('Reload same URL fences old document, preserves rate budget and rebinds fresh generation', async () => {
    const { c, sender, invoke } = setup(); let finish; const old = c.binding;
    c.service.request = (_op, r) => new Promise(resolve => { finish = () => resolve({ ...r, ok: true, data: { text: 'OLD_DOCUMENT' } }); });
    const result = invoke('readTextFile', req(c)); sender.emit('did-start-navigation', {}, c.url, false, true);
    finish(); assert.equal((await result).error.code, 'STALE_CONTEXT');
    sender.emit('did-finish-load'); assert.notEqual(c.binding.contextGeneration, old.contextGeneration);
    immediate(c); let busy = false;
    for (let i = 0; i < 35; i++) { const r = await invoke('readTextFile', req(c)); busy ||= r.error?.code === 'BUSY'; }
    assert.equal(busy, true);
  });
  await test('Cancellation requires exact sender/frame/context ownership and code-maps throws', async () => {
    const { c, invoke, event } = setup(); let finish;
    c.service.request = (_op, r) => new Promise(resolve => { finish = () => resolve({ ...r, ok: true, data: {} }); });
    const request = req(c), result = invoke('readTextFile', request);
    const cancel = { ...c.binding, requestId: request.requestId };
    let called = 0; c.service.cancel = () => { called++; return { acknowledged: true }; };
    assert.equal(c.cancel({ ...event, senderFrame: { url: c.url } }, [cancel]).error.code, 'SENDER_DENIED');
    assert.equal((await invoke('cancel', { ...cancel, contextGeneration: 'old' })).acknowledged, false);
    assert.equal((await invoke('cancel', cancel)).acknowledged, true); assert.equal(called, 1);
    c.service.cancel = () => { throw Object.assign(new Error('sensitive'), { code: 'STALE_CONTEXT' }); };
    assert.equal((await invoke('cancel', cancel)).error.code, 'STALE_CONTEXT'); finish(); await result;
  });
  await test('Navigation/webviews/popups are blocked and renderer loss revokes binding', () => {
    const { c, sender } = setup(); let blocked = 0;
    sender.emit('will-navigate', { preventDefault: () => blocked++ }); sender.emit('will-attach-webview', { preventDefault: () => blocked++ });
    assert.equal(blocked, 2); assert.equal(sender.open().action, 'deny');
    sender.emit('render-process-gone'); assert.equal(c.binding, null); assert.equal(c.service.context, null);
  });
  await test('Old-window destruction cannot clear a newer window binding', () => {
    const x = setup(), newer = new EventEmitter();
    Object.assign(newer, { mainFrame: { url: x.c.url }, getURL: () => x.c.url, isDestroyed: () => false, send() {}, setWindowOpenHandler() {} });
    x.replaceWindow({ webContents: newer }); x.c.select({ projectId: 'B' });
    const binding = x.c.binding, epoch = x.c.documentEpoch;
    x.sender.emit('destroyed');
    assert.equal(x.c.binding, binding); assert.equal(x.c.documentEpoch, epoch); assert.equal(x.c.service.context.projectId, 'B');
    newer.emit('destroyed'); assert.equal(x.c.binding, null);
  });
  await test('Helper modification after startup is refused before spawning', async () => {
    const { c } = setup(); const local = path.join(base, 'modified-helper'); fs.copyFileSync(c.binary, local); fs.chmodSync(local, 0o700); fs.appendFileSync(local, 'modified');
    c.service.binary = local; c.service.verifyBinary = () => verifyHelper(local, c.manifest);
    let spawns = 0; c.service.spawn = () => { spawns++; throw new Error('must not run'); };
    const result = await c.service.request('readTextFile', req(c)); assert.equal(result.error.code, 'HELPER_INTEGRITY_FAILED'); assert.equal(spawns, 0);
  });
  await test('Close is idempotent, rejects reads and surfaces exact cleanup counts without content logs', async () => {
    const { c, sender, logs, invoke } = setup(); const expected = { pendingRequests: 1, abandonedHelpers: 1, liveHelpers: 1 };
    let closes = 0; c.service.close = async () => { closes++; return expected; };
    assert.deepEqual(await c.close(), expected); assert.deepEqual(await c.close(), expected); assert.equal(closes, 1);
    assert.deepEqual(sender.lastState.shutdown, expected); assert.deepEqual(logs[0], ['info', 'reader.shutdown', expected]);
    assert.equal((await invoke('readTextFile', { projectId: 'A', contextGeneration: 'old', requestId: 'x', relativePath: 'a' })).error.code, 'STALE_CONTEXT');
    assert.doesNotMatch(JSON.stringify(logs), /INERT_CONTENT|known.txt|query/);
  });
  console.log('C1b IPC CONTROL CHECKS PASSED:', count, '(simulated completion; not native/Electron qualification)');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  for (const c of controllers) await c.close(); fs.rmSync(base, { recursive: true, force: true });
});
