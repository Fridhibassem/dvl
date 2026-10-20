'use strict';
// Exercise the darwin-only entry branch with the REAL filesystem on this host.
// Only process.platform is stubbed in a child; no Mac/APFS security claim.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-missing-alias-target-'));
try {
  const preload = path.join(base, 'darwin-branch.cjs'), report = path.join(base, 'must-not-exist.json');
  fs.writeFileSync(preload, "Object.defineProperty(process, 'platform', { value: 'darwin' });\n");
  const run = spawnSync(process.execPath, ['--require', preload, path.join(__dirname, '../scripts/qualify-unicode-aliases.cjs')], {
    env: { ...process.env, DVL_ALIAS_PROJECT: path.join(base, 'ABSENT_PROJECT'), DVL_ALIAS_REPORT: report }, encoding: 'utf8', timeout: 10000
  });
  assert.equal(run.error, undefined); assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /UNICODE_ALIAS_GATE_FAILED:.*ENOENT/);
  assert.doesNotMatch(run.stdout, /ALIAS_RESOLUTION|UNICODE_ALIAS_GATE_PASS/);
  assert.equal(fs.existsSync(report), false); assert.deepEqual(fs.readdirSync(base), ['darwin-branch.cjs']);
  console.log('C1B_ALIAS_MISSING_TARGET_PASS exit=1 ENOENT; zero aliases checked is a failure, no PASS/report/fixtures (platform-branch stub; real filesystem)');
} finally { fs.rmSync(base, { recursive: true, force: true }); }
