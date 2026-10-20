'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { DesktopReader } = require('../src/main/desktop-reader.cjs');
const expected = ['!!win', '!!sender', '!sender.isDestroyed()', 'sender === win.webContents', '!!frame', 'frame === sender.mainFrame', 'frame.url === this.url', 'sender.getURL() === this.url'];
const clauses = DesktopReader.prototype.isTrusted.toString().match(/return (!!win[\s\S]*?);/)[1].split('&&').map(c => c.trim());
assert.deepEqual(clauses, expected, 'Review the clause inventory if production authentication changes');
const source = path.join(__dirname, '../src/main/desktop-reader.cjs'), before = fs.readFileSync(source);
const rows = [];
function run(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: 1000000 });
  assert.equal(r.error, undefined); return { exit: r.status, signal: r.signal, output: r.stdout + r.stderr };
}
const baseline = run('c1b-b-auth.cjs'); assert.equal(baseline.exit, 0, baseline.output); assert.match(baseline.output, /C1B_B_AUTH_PASS 90/);
for (const [i, clause] of clauses.entries()) {
  const result = run('c1b-auth-mutation-child.cjs', [String(i)]), redundant = [0, 1, 4].includes(i);
  if (redundant) { assert.equal(result.exit, 0, result.output); assert.match(result.output, /C1B_B_AUTH_PASS 90/); }
  else {
    const witness = { 2: 'destroyed_sender', 3: 'foreign_sender', 5: 'foreign_frame', 6: 'frame_url_mismatch', 7: 'navigated_sender' }[i];
    assert.equal(result.exit, 1, result.output);
    assert.ok(result.output.includes('Missing expected rejection: ' + witness + ':get-last-project'), result.output);
  }
  const row = { clause, childExit: result.exit, outcome: redundant ? 'EQUIVALENT_GUARD_UNDER_FAIL_CLOSED_CATCH' : 'KILLED_BY_NEGATIVE_TEST', diagnostic: redundant ? null : result.output.split('\n').find(line => line.includes('AssertionError')) || result.output.split('\n')[0] };
  rows.push(row); console.log('AUTH_CLAUSE_MUTATION', JSON.stringify(row));
}
const deny = run('c1b-auth-mutation-child.cjs', ['always-deny']); assert.equal(deny.exit, 1); assert.match(deny.output, /SENDER_DENIED/);
assert.deepEqual(fs.readFileSync(source), before, 'Mutation must not edit the delivered production bytes');
console.log('C1B_AUTH_MUTATIONS_PASS', JSON.stringify({ clauses: 8, killed: 5, equivalentPresenceGuards: 3, alwaysDenyControlKilled: true, scope: 'mock-level; equivalent survivors are reported, not counted as killed' }));
