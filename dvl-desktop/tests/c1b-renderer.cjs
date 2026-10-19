'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const names = ['filesStatus', 'fileEntries', 'fileText', 'fileTitle', 'searchResults', 'directoryName', 'filesMore', 'filesRefresh', 'filesUp', 'filesSearch', 'filesQuery', 'filesStop', 'filesSearchForm'];
const elements = new Map();
function element() { return { _text: '', children: [], events: {}, hidden: false, disabled: false, value: '',
  get textContent() { return this._text; }, set textContent(t) { this._text = t; this.children = []; },
  set innerHTML(_v) { throw new Error('HTML rendering forbidden'); },
  appendChild(c) { this.children.push(c); }, addEventListener(n, f) { this.events[n] = f; } }; }
for (const n of names) elements.set(n, element());
const requests = [], cancels = []; let listener, state = { ok: true, context: { projectId: 'A', contextGeneration: 'ga' } };
const dvl = { onReaderState: cb => { listener = cb; }, getReadContext: async () => state, cancelRead: async r => { cancels.push(r); return { ok: true }; } };
for (const op of ['readTextFile', 'listDirectory', 'searchText']) dvl[op] = req => new Promise(resolve => requests.push({ op, req, finish: data => resolve({ ...req, ok: true, data }) }));
const window = { dvl };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/files.js'), 'utf8'), {
  window, document: { getElementById: n => elements.get(n), createElement: element }, crypto
});
const tick = () => new Promise(resolve => setImmediate(resolve));
let passed = 0;
async function test(name, fn) { await fn(); console.log('PASS', name); passed++; }
(async () => {
  await test('Initial project obtains main-chosen generation and lists permitted entries as text', async () => {
    await window.dvlFiles.showProject('A'); const list = requests.shift();
    assert.equal(list.op, 'listDirectory'); assert.equal(list.req.projectId, 'A');
    list.finish({ entries: [{ name: '<img src=x onerror=alert(1)>', relativePath: 'markup.txt', kind: 'file' }], complete: true, nextCursor: null }); await tick();
    assert.equal(elements.get('fileEntries').children[0].textContent, '<img src=x onerror=alert(1)>');
  });
  await test('Markup contents remain inert text', async () => {
    const done = elements.get('fileEntries').children[0].events.click(); const read = requests.shift();
    read.finish({ text: '<script>window.LEAK=true</script>', byteLength: 38 }); await done;
    assert.equal(elements.get('fileText').textContent, '<script>window.LEAK=true</script>'); assert.equal(window.LEAK, undefined);
  });
  await test('Project switch clears visible content and fences a late result', async () => {
    const done = elements.get('fileEntries').children[0].events.click(); const old = requests.shift();
    state = { ok: true, context: { projectId: 'B', contextGeneration: 'gb' } }; await window.dvlFiles.showProject('B');
    assert.equal(elements.get('fileText').textContent, ''); old.finish({ text: 'OLD_SECRET', byteLength: 10 }); await done;
    assert.equal(elements.get('fileText').textContent, ''); assert.ok(cancels.some(r => r.requestId === old.req.requestId));
    const list = requests.shift(); list.finish({ entries: [], complete: true, nextCursor: null }); await tick();
  });
  await test('Search reports partial reason and counts without dropping semantics', async () => {
    elements.get('filesQuery').value = 'needle'; elements.get('filesSearchForm').events.submit({ preventDefault() {} });
    const search = requests.shift(); search.finish({ matches: [{ relativePath: 'a.txt', line: 1, column: 1, snippet: '<b>needle</b>' }], filesScanned: 1, bytesScanned: 5, bytesRead: 10, elapsedMs: 12, complete: false, partialReason: 'DIRECTORIES_EXCLUDED', excludedDirectories: 1, skipped: { FILE_TOO_LARGE: 2 } }); await tick();
    assert.match(elements.get('filesStatus').textContent, /5 text bytes; 10 read-budget bytes \(estimate\); 12 ms/);
    assert.match(elements.get('filesStatus').textContent, /Partial: DIRECTORIES_EXCLUDED; excluded directories: 1; skipped: 2/);
    assert.match(elements.get('searchResults').children[0].textContent, /<b>needle<\/b>/);
  });
  await test('Stop fences late completion and invokes owned cancellation', async () => {
    elements.get('filesSearchForm').events.submit({ preventDefault() {} }); const pending = requests.shift();
    elements.get('filesStop').events.click(); pending.finish({ matches: [], filesScanned: 999, complete: true, skipped: {}, excludedDirectories: 0 }); await tick();
    assert.equal(elements.get('filesStatus').textContent, 'Stopped.'); assert.ok(cancels.some(r => r.requestId === pending.req.requestId));
  });
  await test('Shutdown shows exact pending/live/abandoned counts and disables reading', () => {
    listener({ ok: true, context: null, closing: true, shutdown: { pendingRequests: 2, liveHelpers: 1, abandonedHelpers: 1 } });
    assert.equal(elements.get('filesStatus').textContent, 'Shutdown: pending 2; live 1; abandoned 1.');
    assert.equal(elements.get('filesRefresh').disabled, true); assert.equal(elements.get('fileText').textContent, '');
  });
  console.log('C1b RENDERER CONTROL CHECKS PASSED:', passed, '(DOM simulation; not browser qualification)');
})().catch(e => { console.error(e); process.exitCode = 1; });
