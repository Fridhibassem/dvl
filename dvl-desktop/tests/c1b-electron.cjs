'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-c1b-electron-'));
function run(script, { embeddedNode = false, marker, args = [] } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    if (embeddedNode) env.ELECTRON_RUN_AS_NODE = '1';
    const child = spawn(require('electron'), [path.join(__dirname, script), ...args], { env, shell: false });
    let output = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 90000);
    child.stdout.on('data', bytes => { output += bytes; process.stdout.write(bytes); });
    child.stderr.on('data', bytes => process.stderr.write(bytes));
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || !output.includes(marker)) reject(new Error(script + ' failed; exit ' + code)); else resolve();
    });
  });
}
(async () => {
  try {
    // Both native suites are coupled: repair-only is not confinement evidence.
    for (const [script, marker] of [['c1-boundary.cjs', 'C1a CHECKS PASSED: 17'], ['c1-native-repair.cjs', 'C1a REPAIR NATIVE CHECKS PASSED: 10'], ['c1b-policy.cjs', 'C1b POLICY CHECKS PASSED: 3'], ['c1b-v2-native.cjs', 'C1B_V2_NATIVE_PASS 3']]) {
      await run(script, { embeddedNode: true, marker });
    }
    console.log('PASS Native suites in Electron embedded Node (not UI tests)');
    await run('c1b-electron-child.cjs', { marker: 'C1B_ELECTRON_INTEGRATION_PASS', args: [base] });
    await run('c1b-electron-restore.cjs', { marker: 'C1B_ELECTRON_RESTORE_PASS 3', args: [base] });
    const logs = fs.readFileSync(path.join(base, 'state/logs/dvl.log'), 'utf8');
    const rows = logs.trim().split('\n').map(line => JSON.parse(line));
    const closes = rows.filter(row => row.event === 'reader.shutdown'); assert.equal(closes.length, 2);
    for (const close of closes) { assert.equal(close.pendingRequests, 0); assert.equal(close.abandonedHelpers, 0); assert.equal(close.liveHelpers, 0); }
    assert.ok(rows.some(row => row.event === 'db.closed'));
    console.log('C1B_ELECTRON_GATE_PASS (includes clean shutdown counts; independent review still required)');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
