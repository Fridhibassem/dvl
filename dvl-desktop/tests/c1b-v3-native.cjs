'use strict';
// Requires the real production helper and OS confinement. No fallback.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { ProjectReadService } = require('../src/main/project-read-service.cjs');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-v3-native-')));
const root = path.join(base, 'project'); fs.mkdirSync(root);
const secret = 'V3_POLICY_SECRET', needle = 'V3_VISIBLE_NEEDLE';
const names = [...'ßſẞKﬀﬁﬂﬃﬄﬅﬆ'].map((c, i) => 'ordinary_' + i + '_' + c + '.txt').concat(['.env']);
const exact = ['.conﬁg', 'kubeconﬁg', '.password-ﬅore', 'ordinary.tfﬅate', 'ordinary.keyﬅore', '.password-ﬆore', 'ordinary.tfﬆate', 'ordinary.keyﬆore'];
for (const name of names) fs.writeFileSync(path.join(root, name), secret);
fs.mkdirSync(path.join(root, 'cases'));
for (const [i, name] of exact.entries()) { const dir = path.join(root, 'cases', 'case' + i); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, name), secret); }
fs.mkdirSync(path.join(root, '.git')); fs.writeFileSync(path.join(root, '.git', 'descendant'), secret);
fs.mkdirSync(path.join(root, 'nested')); fs.writeFileSync(path.join(root, 'nested', '.env'), secret);
fs.mkdirSync(path.join(root, '.next')); fs.writeFileSync(path.join(root, '.next', '.env'), secret);
for (let i = 0; i < 201; i++) fs.writeFileSync(path.join(root, 'page' + String(i).padStart(3, '0') + '.txt'), needle);
const service = new ProjectReadService(id => ({ projectId: id, path: root, available: true }));
const ctx = service.bind('A'); let serial = 0, count = 0;
const request = (op, extra = {}) => service.request(op, { ...ctx, requestId: 'v3_' + ++serial, relativePath: '.', ...extra });
async function test(name, fn) { await fn(); count++; console.log('PASS', name); }
(async () => {
  await test('Real list pages omit every guarded stored name and count hidden entries once', async () => {
    let cursor, hidden = 0, entries = [], pages = 0;
    do {
      const out = await request('listDirectory', cursor ? { cursor } : {}); assert.equal(out.ok, true, JSON.stringify(out));
      assert.ok(['seatbelt', 'landlock'].includes(out.data.boundaryMode)); hidden += out.data.hiddenByPolicy; entries.push(...out.data.entries); cursor = out.data.nextCursor; pages++;
    } while (cursor);
    assert.equal(pages, 2); assert.equal(hidden, names.length + 1); assert.equal(entries.length, 204);
    assert.ok(entries.some(e => e.name === '.next')); assert.ok(entries.every(e => !names.includes(e.name) && e.name !== '.git'));
    const again = await request('listDirectory'); assert.equal(again.ok, true); assert.ok(again.data.hiddenByPolicy <= hidden);
  });
  await test('Search counts encountered entries, keeps excluded descendants out of total, and reveals no hidden bytes', async () => {
    const out = await request('searchText', { query: secret }); assert.equal(out.ok, true, JSON.stringify(out));
    assert.deepEqual(out.data.matches, []); assert.equal(out.data.hiddenByPolicy, names.length + 2 + exact.length);
    assert.equal(out.data.filesScanned, 201); assert.equal(out.data.excludedDirectories, 1); assert.deepEqual(out.data.skipped, {});
    assert.equal(out.data.partialReason, 'DIRECTORIES_EXCLUDED'); assert.doesNotMatch(JSON.stringify(out), /V3_POLICY_SECRET/);
  });
  await test('Policy-hidden count alone does not falsely mark permitted search partial', async () => {
    const out = await request('searchText', { relativePath: 'nested', query: 'absent' }); assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.data.hiddenByPolicy, 1); assert.equal(out.data.complete, true); assert.equal(out.data.partialReason, null);
    for (const name of names.concat(exact.map((name, i) => 'cases/case' + i + '/' + name))) {
      const read = await request('readTextFile', { relativePath: name }); assert.equal(read.error.code, 'POLICY_DENIED');
      assert.doesNotMatch(JSON.stringify(read), /V3_POLICY_SECRET/);
    }
  });
  console.log('C1B_V3_NATIVE_PASS', count, process.platform, process.arch);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  const counts = await service.close(); console.log('C1B_V3_NATIVE_CLOSE', JSON.stringify(counts)); if (Object.values(counts).some(Boolean)) process.exitCode = 1;
  fs.rmSync(base, { recursive: true, force: true });
});
