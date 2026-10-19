'use strict';
// Second real Electron process: previous process pre-seeded last_project_id
// through production IPC. No picker/legacy import or manual refresh is allowed.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const base = process.argv[2];
if (!base || !fs.realpathSync(base).startsWith(fs.realpathSync(os.tmpdir()) + path.sep)) throw new Error('Disposable OS temp directory required');
const state = path.join(base, 'state'), project = path.join(base, 'fixture-other');
const db = new DatabaseSync(path.join(state, 'dvl.sqlite'), { readOnly: true });
const last = db.prepare("SELECT value FROM app_state WHERE key='last_project_id'").get();
assert.ok(last?.value);
assert.equal(db.prepare('SELECT canonical_path FROM projects WHERE project_id=?').get(last.value).canonical_path, fs.realpathSync(project)); db.close();
app.setPath('userData', state);
let dialogs = 0;
dialog.showOpenDialog = async () => { dialogs++; throw new Error('Restore must not open a picker'); };
const timer = setTimeout(() => { console.error('C1b restore/layout test timed out'); app.exit(1); }, 45000);
require('../src/main/main.js');
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0]; assert.ok(win);
    if (win.webContents.isLoadingMainFrame()) await new Promise((resolve, reject) => {
      win.webContents.once('did-finish-load', resolve); win.webContents.once('did-fail-load', () => reject(new Error('Production page failed to load')));
    });
    const js = source => win.webContents.executeJavaScript(source);
    const wait = expression => js(`new Promise((resolve, reject) => {
      const start = performance.now(); const timer = setInterval(() => {
        if (${expression}) { clearInterval(timer); resolve(); }
        else if (performance.now() - start > 12000) { clearInterval(timer); reject(new Error('UI condition timed out')); }
      }, 20);
    })`);
    await wait("Array.from(document.querySelectorAll('.file-entry')).some(b => b.textContent === 'other.txt') && document.getElementById('filesStatus').textContent.startsWith('Complete')");
    assert.equal(dialogs, 0); assert.equal(await js("document.getElementById('projectId').textContent"), last.value);
    console.log('PASS Startup restore automatically lists the persisted project without a dialog');

    await js("Array.from(document.querySelectorAll('.file-entry')).find(b => b.textContent === '▸ paging').click()");
    await wait("document.querySelectorAll('.file-entry').length === 200 && !document.getElementById('filesMore').hidden");
    const geometry = () => js(`({ height: innerHeight, documentHeight: document.scrollingElement.scrollHeight,
      headerTop: document.querySelector('.topbar').getBoundingClientRect().top,
      entriesHeight: document.getElementById('fileEntries').clientHeight, entriesContent: document.getElementById('fileEntries').scrollHeight })`);
    for (const [width, height] of [[1100, 720], [1440, 900]]) {
      win.setSize(width, height);
      await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const box = await geometry(); assert.ok(box.documentHeight <= box.height + 1, JSON.stringify(box));
      assert.ok(box.headerTop >= 0); assert.ok(box.entriesContent > box.entriesHeight);
    }
    await js("document.getElementById('filesMore').click()");
    await wait("document.querySelectorAll('.file-entry').length === 201 && document.getElementById('filesMore').hidden");
    assert.match(await js("document.getElementById('filesStatus').textContent"), /hidden by policy: 1 \(entries encountered\)/);
    await js("Array.from(document.querySelectorAll('.file-entry')).find(b => b.textContent === 'page000.txt').click()");
    await wait("document.getElementById('fileText').textContent.startsWith('PAGE_CONTENT_0')");
    const box = await geometry(); assert.ok(box.documentHeight <= box.height + 1, JSON.stringify(box)); assert.ok(box.headerTop >= 0);
    const visible = await js(`(() => { const title = document.getElementById('fileTitle').getBoundingClientRect();
      const panel = document.getElementById('fileTitle').closest('.panel').getBoundingClientRect();
      return title.top >= panel.top && title.bottom <= panel.bottom; })()`);
    assert.equal(visible, true);
    console.log('PASS Actual app pages 200+1 entries, contains scrolling and reveals file text');

    const logs = fs.readFileSync(path.join(state, 'logs/dvl.log'), 'utf8');
    assert.doesNotMatch(logs, /PAGE_CONTENT_|OTHER_PROJECT_CONTENT|C1B_QUERY_SENTINEL/); assert.equal(dialogs, 0);
    assert.equal(fs.existsSync(path.join(project, '.dvl')), false);
    console.log('PASS Restore/layout path keeps project read-only and content out of logs');
    console.log('C1B_ELECTRON_RESTORE_PASS 3', process.versions.electron, process.platform, process.arch);
    clearTimeout(timer); app.quit();
  } catch (e) { clearTimeout(timer); console.error('C1b restore/layout failed:', e.message); app.exit(1); }
});
