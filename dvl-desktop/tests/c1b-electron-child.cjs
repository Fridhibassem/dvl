'use strict';
// Actual production Electron window, preload, main IPC and native reader.
// Fixtures and state are disposable; no production testing hooks are enabled.
const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
console.log('ELECTRON_RUNTIME', process.versions.electron, 'NODE', process.versions.node, process.platform, process.arch);
const data = process.argv[2];
if (!data || !fs.realpathSync(data).startsWith(fs.realpathSync(os.tmpdir()) + path.sep)) throw new Error('Disposable OS temp directory required');
const project = path.join(data, 'fixture-project'), other = path.join(data, 'fixture-other');
fs.mkdirSync(project); fs.mkdirSync(other);
fs.writeFileSync(path.join(project, 'known.txt'), '<script>window.C1B_EXECUTED=true</script> C1B_QUERY_SENTINEL');
fs.writeFileSync(path.join(project, '.env'), 'C1B_HIDDEN_SECRET');
fs.mkdirSync(path.join(project, 'dist')); fs.writeFileSync(path.join(project, 'dist/ignored.txt'), 'C1B_QUERY_SENTINEL');
fs.writeFileSync(path.join(other, 'other.txt'), 'OTHER_PROJECT_CONTENT');
fs.mkdirSync(path.join(other, 'paging'));
for (let i = 0; i < 201; i++) fs.writeFileSync(path.join(other, 'paging', 'page' + String(i).padStart(3, '0') + '.txt'), 'PAGE_CONTENT_' + i + '\n' + 'line\n'.repeat(100));
const inventory = () => [fs.readFileSync(path.join(project, 'known.txt'), 'hex'), fs.readFileSync(path.join(project, '.env'), 'hex'), fs.readFileSync(path.join(other, 'other.txt'), 'hex')];
const before = inventory();
app.setPath('userData', path.join(data, 'state'));
let chosen = project;
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
const timer = setTimeout(() => { console.error('C1b Electron integration timed out'); app.exit(1); }, 45000);
require('../src/main/main.js');
app.whenReady().then(async () => {
  let passes = 0;
  const check = async (name, f) => { await f(); passes++; console.log('PASS', name); };
  try {
    const win = BrowserWindow.getAllWindows()[0]; assert.ok(win);
    if (win.webContents.isLoadingMainFrame()) await new Promise((resolve, reject) => {
      win.webContents.once('did-finish-load', resolve); win.webContents.once('did-fail-load', () => reject(new Error('Production page failed to load')));
    });
    const js = source => win.webContents.executeJavaScript(source);
    const opened = await js('window.dvl.openProject()');
    let context = (await js('window.dvl.getReadContext()')).context; assert.ok(context);
    const request = (extra = {}) => ({ ...context, requestId: require('node:crypto').randomUUID(), relativePath: 'known.txt', ...extra });
    const invoke = (op, r) => js(`window.dvl.${op}(${JSON.stringify(r)})`);
    await check('Real Electron preload has narrow methods and no renderer binding/root API', async () => {
      assert.equal(await js('typeof require'), 'undefined'); assert.equal(await js('typeof window.dvl.bind'), 'undefined');
      assert.equal(context.projectId, opened.project.projectId);
    });
    await check('Actual native list/read/search through production IPC', async () => {
      const list = await invoke('listDirectory', request({ relativePath: '.' })); assert.equal(list.ok, true, JSON.stringify(list));
      assert.ok(list.data.entries.some(e => e.name === 'known.txt')); assert.ok(!list.data.entries.some(e => e.name === '.env'));
      const read = await invoke('readTextFile', request()); assert.equal(read.ok, true, JSON.stringify(read)); assert.match(read.data.text, /C1B_QUERY_SENTINEL/);
      assert.ok(['seatbelt', 'landlock'].includes(read.data.boundaryMode));
      const search = await invoke('searchText', request({ relativePath: '.', query: 'C1B_QUERY_SENTINEL' }));
      assert.equal(search.ok, true, JSON.stringify(search)); assert.equal(search.data.complete, false); assert.equal(search.data.partialReason, 'DIRECTORIES_EXCLUDED'); assert.equal(search.data.excludedDirectories, 1);
    });
    await check('Live UI displays markup as text and does not execute it', async () => {
      await js(`window.dvlFiles.showProject(${JSON.stringify(context.projectId)})`);
      await js(`new Promise((resolve, reject) => {
        const start = Date.now(); const t = setInterval(() => {
          const b = Array.from(document.querySelectorAll('.file-entry')).find(b => b.textContent === 'known.txt');
          if (b) { clearInterval(t); b.click(); resolve(); }
          else if (Date.now() - start > 8000) { clearInterval(t); reject(new Error('No file entry')); }
        }, 20);
      })`);
      const text = await js(`new Promise((resolve, reject) => {
        const start = Date.now(); const t = setInterval(() => {
          const value = document.getElementById('fileText').textContent;
          if (value) { clearInterval(t); resolve(value); }
          else if (Date.now() - start > 8000) { clearInterval(t); reject(new Error('No file text')); }
        }, 20);
      })`);
      assert.match(text, /<script>/); assert.equal(await js('window.C1B_EXECUTED === undefined'), true);
    });
    await check('Production IPC refuses caller root, traversal, denied file and extra query keys', async () => {
      for (const r of [request({ root: other }), request({ relativePath: '../outside' }), request({ relativePath: '.env' }), request({ query: 'extra' })]) {
        const out = await invoke('readTextFile', r); assert.equal(out.ok, false); assert.doesNotMatch(JSON.stringify(out), /C1B_HIDDEN_SECRET/);
      }
    });
    await check('Native B regression: regular-file and symlink replacements cannot impersonate a registered project', async () => {
      for (const kind of ['file', 'symlink']) {
        fs.renameSync(project, project + '-away');
        try {
          if (kind === 'file') fs.writeFileSync(project, 'replacement'); else fs.symlinkSync(other, project);
          assert.equal(await js('window.dvl.getLastProject()'), null);
          const refused = await invoke('readTextFile', request());
          assert.equal(refused.ok, false); assert.doesNotMatch(JSON.stringify(refused), /OTHER_PROJECT_CONTENT/);
        } finally { fs.unlinkSync(project); fs.renameSync(project + '-away', project); }
        const restored = await js('window.dvl.openProject()'); assert.equal(restored.project.projectId, opened.project.projectId);
        context = (await js('window.dvl.getReadContext()')).context;
      }
    });
    await check('Project A -> B rejects old context; new context reads only B', async () => {
      chosen = other; await js('window.dvl.openProject()');
      const stale = await invoke('readTextFile', request()); assert.equal(stale.error.code, 'STALE_CONTEXT');
      const next = (await js('window.dvl.getReadContext()')).context;
      assert.notEqual(next.contextGeneration, context.contextGeneration);
      const out = await invoke('readTextFile', { ...next, requestId: 'other_read', relativePath: 'other.txt' });
      assert.equal(out.ok, true); assert.equal(out.data.text, 'OTHER_PROJECT_CONTENT');
    });
    await check('Reload obtains a fresh generation and clears previous visible bytes', async () => {
      const old = (await js('window.dvl.getReadContext()')).context;
      const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve)); win.webContents.reload(); await loaded;
      const fresh = (await js('window.dvl.getReadContext()')).context;
      assert.ok(fresh); assert.notEqual(fresh.contextGeneration, old.contextGeneration);
      const out = await invoke('readTextFile', { ...old, requestId: 'old_document', relativePath: 'other.txt' }); assert.equal(out.error.code, 'STALE_CONTEXT');
      assert.equal(await js("document.getElementById('fileText').textContent.includes('C1B_QUERY_SENTINEL')"), false);
    });
    await check('Fixture bytes unchanged, .dvl absent, no query/contents in logs', () => {
      assert.deepEqual(inventory(), before); assert.equal(fs.existsSync(path.join(project, '.dvl')), false);
      const logs = fs.readFileSync(path.join(data, 'state/logs/dvl.log'), 'utf8'); assert.doesNotMatch(logs, /C1B_QUERY_SENTINEL|C1B_HIDDEN_SECRET|OTHER_PROJECT_CONTENT|C1B_EXECUTED/);
    });
    console.log('C1B_ELECTRON_INTEGRATION_PASS', passes, process.platform, process.arch);
    clearTimeout(timer); app.quit();
  } catch (e) { clearTimeout(timer); console.error('C1b Electron integration failed:', e.message); app.exit(1); }
});
