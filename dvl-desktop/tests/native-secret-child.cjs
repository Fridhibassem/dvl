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
