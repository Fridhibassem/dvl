'use strict';
// External reproducibility runner. Read-only source/KIT; child methods restored.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const source = fs.realpathSync(process.argv[2] || '');
const expected = require('./expected-identities.json');
assert.equal(digest(fs.readFileSync(path.join(source, 'SOURCE_SHA256.json'))), expected.v3SourceManifest, 'Requires the exact delivered R1 source');
function snapshot(root, manifestName, verify) {
  const table = JSON.parse(fs.readFileSync(path.join(root, manifestName))), snapshot = {};
  for (const [name, hash] of Object.entries(table)) {
    assert.ok(!path.isAbsolute(name) && !name.split('/').some(c => !c || c === '..'));
    const file = path.join(root, name), stat = fs.lstatSync(file); assert.ok(stat.isFile() && !stat.isSymbolicLink());
    snapshot[name] = digest(fs.readFileSync(file)); if (verify) assert.equal(snapshot[name], hash, name);
  }
  snapshot[manifestName] = digest(fs.readFileSync(path.join(root, manifestName))); return snapshot;
}
const sourceBefore = snapshot(source, 'SOURCE_SHA256.json', true);
// Read-only before/after identity for all currently delivered KIT files too.
const kitBefore = snapshot(__dirname, 'KIT_SHA256.json', true);
const { DesktopReader } = require(path.join(source, 'src/main/desktop-reader.cjs'));
const original = DesktopReader.prototype.isTrusted, method = original.toString();
assert.match(method, /catch\s*\{\s*return false;\s*\}/, 'Equivalent-survivor acceptance DEPENDS on this fail-closed catch; reassess after any change');
const match = method.match(/return (!!win[\s\S]*?);/), clauses = match[1].split('&&').map(c => c.trim());
assert.deepEqual(clauses, ['!!win', '!!sender', '!sender.isDestroyed()', 'sender === win.webContents', '!!frame', 'frame === sender.mainFrame', 'frame.url === this.url', 'sender.getURL() === this.url']);
function run(mutation) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'auth-mutation-child.cjs'), source, mutation], { encoding: 'utf8', timeout: 15000, maxBuffer: 1000000 });
  assert.equal(result.error, undefined); assert.equal(result.signal, null);
  const output = result.stdout + result.stderr;
  assert.ok(output.includes('KIT_ORIGINAL_IS_TRUSTED_RESTORED'), 'Child must explicitly restore original method: ' + output);
  return { exit: result.status, output };
}
try {
  const baseline = run('baseline'); assert.equal(baseline.exit, 0, baseline.output); assert.match(baseline.output, /C1B_B_AUTH_PASS 90/);
  console.log('KIT_AUTH_BASELINE_PASS 90');
  for (const [i, clause] of clauses.entries()) {
    const result = run(String(i)), equivalent = [0, 1, 4].includes(i);
    if (equivalent) { assert.equal(result.exit, 0, result.output); assert.match(result.output, /C1B_B_AUTH_PASS 90/); }
    else {
      const witness = { 2: 'destroyed_sender', 3: 'foreign_sender', 5: 'foreign_frame', 6: 'frame_url_mismatch', 7: 'navigated_sender' }[i];
      assert.equal(result.exit, 1, result.output); assert.ok(result.output.includes('Missing expected rejection: ' + witness + ':get-last-project'), result.output);
    }
    console.log('KIT_AUTH_CLAUSE_MUTATION', JSON.stringify({ clause, childExit: result.exit, outcome: equivalent ? 'EQUIVALENT_UNDER_CURRENT_FAIL_CLOSED_LOGIC' : 'KILLED', originalRestored: true }));
  }
  const deny = run('always-deny'); assert.equal(deny.exit, 1); assert.match(deny.output, /SENDER_DENIED/);
  // Demonstrate why the null-dereference fallback is a dependency. For frame,
  // a missing frame normally mismatches mainFrame first; use both null so the
  // frame-identity equality passes and frame.url actually reaches the catch.
  const url = 'file:///fixture/index.html';
  for (const i of [0, 1, 4]) {
    const sender = { isDestroyed: () => false, getURL: () => url, mainFrame: { url } };
    const win = { webContents: sender }, event = { sender, senderFrame: sender.mainFrame };
    const controller = { url, getWindow: () => i === 0 ? null : win };
    if (i === 1) delete event.sender;
    if (i === 4) { sender.mainFrame = null; event.senderFrame = null; }
    const expression = clauses.filter((_c, j) => j !== i).join(' && ');
    const dropped = method.replace(match[0], 'return ' + expression + ';');
    const safe = vm.runInNewContext('({' + dropped + '}).isTrusted');
    assert.equal(safe.call(controller, event), false);
    const failOpen = vm.runInNewContext('({' + dropped.replace(/catch\s*\{\s*return false;\s*\}/, 'catch { return true; }') + '}).isTrusted');
    assert.equal(failOpen.call(controller, event), true, 'Null-deref path must demonstrate catch dependency');
    console.log('KIT_CATCH_DEPENDENCY_CONTROL_PASS', clauses[i]);
  }
  console.log('KIT_AUTH_MUTATIONS_PASS 5 killed; 3 conditional equivalent survivors; all child originals restored; mock-level');
} finally {
  assert.strictEqual(DesktopReader.prototype.isTrusted, original, 'Parent method must never change');
  assert.deepEqual(snapshot(source, 'SOURCE_SHA256.json', true), sourceBefore, 'No delivered source file may change');
  assert.deepEqual(snapshot(__dirname, 'KIT_SHA256.json', true), kitBefore, 'No delivered KIT file may change');
  console.log('KIT_AND_SOURCE_FILES_UNCHANGED');
}
