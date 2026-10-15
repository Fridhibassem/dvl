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
