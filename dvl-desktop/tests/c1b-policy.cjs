'use strict';
// Pre-confinement policy checks. Passing does not qualify the OS boundary.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { protectedHomeTrees, rootAllowed } = require('../src/main/read-support.cjs');
const { ProjectReadService, validPath } = require('../src/main/project-read-service.cjs');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-c1b-policy-')));
const helper = path.join(__dirname, '../bin/project-reader');
const service = new ProjectReadService(projectId => ({ projectId, path: base, available: true }));
let count = 0;
function raw(root, rel) {
  const st = fs.statSync(root, { bigint: true });
  const run = spawnSync(helper, { input: `read\n${Buffer.from(root).toString('hex')}\n${Buffer.from(rel).toString('hex')}\n0 ${st.dev} ${st.ino}\n`, encoding: 'utf8', timeout: 5000 });
  assert.equal(run.error, undefined); return JSON.parse(run.stdout);
}
async function test(name, fn) { await fn(); console.log('PASS', name); count++; }
(async () => {
  await test('N-1 all derived protected home entries are rejected by the host', () => {
    for (const tree of protectedHomeTrees) assert.equal(rootAllowed(path.join(os.homedir(), tree), path.join(base, 'userData')), false, tree);
    for (const name of ['.kube', '.gnupg', '.azure', '.password-store']) assert.ok(protectedHomeTrees.includes(name));
  });
  await test('N-1 native independently refuses protected credential roots before sandbox setup', () => {
    // No production HOME override. Create empty directories only when absent,
    // never write into an existing credential directory, remove only our own.
    const created = [];
    try {
      for (const tree of ['.kube', '.gnupg', '.azure', '.password-store']) {
        const p = path.join(os.userInfo().homedir, tree);
        try { fs.mkdirSync(p, { mode: 0o700 }); created.push(p); }
        catch (e) { if (e.code !== 'EEXIST') throw e; }
        const root = fs.realpathSync(p);
        assert.equal(raw(root, 'ordinary.txt').error, 'PROJECT_UNAVAILABLE', tree);
      }
    } finally { for (const p of created.reverse()) fs.rmdirSync(p); }
  });
  await test('N-2 stored long-s/Kelvin/sharp-s names are denied by host and direct native', async () => {
    const c = service.bind('A'); let n = 0;
    for (const name of ['credentialſ.json', 'srv.Key', '.ſsh', '.ßh', 'ẞ.txt']) {
      fs.writeFileSync(path.join(base, name), 'STORED_FOLD_SECRET');
      assert.throws(() => validPath(name, false), e => e.code === 'POLICY_DENIED');
      assert.equal(raw(base, name).error, 'POLICY_DENIED');
      const result = await service.request('readTextFile', { ...c, requestId: 'fold_' + ++n, relativePath: name });
      assert.equal(result.error.code, 'POLICY_DENIED'); assert.doesNotMatch(JSON.stringify(result), /STORED_FOLD_SECRET/);
    }
  });
  console.log('C1b POLICY CHECKS PASSED:', count, '(pre-confinement; not OS qualification)');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await service.close(); fs.rmSync(base, { recursive: true, force: true }); });
