'use strict';
// Strict native qualification: unsupported confinement is a failure, never SKIP/PASS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { ProjectReadService } = require('../src/main/project-read-service.cjs');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-c1-native-repair-')));
const root = path.join(base, 'project'), other = path.join(base, 'other'); fs.mkdirSync(root); fs.mkdirSync(other);
const services = []; let passed = 0, n = 0;
async function test(name, f) { await f(); passed++; console.log('PASS', name); }
function service(options = {}, p = root) { const s = new ProjectReadService(id => ({ projectId: id, path: id === 'B' ? other : p, available: true }), options); services.push(s); return s; }
function req(s, c, op, rel, extra = {}) { return s.request(op, { ...c, requestId: 'native_' + (++n), relativePath: rel, ...extra }); }
function raw(op, rel, p = root, wrongIdentity = false) {
  const st = fs.statSync(p, { bigint: true });
  const r = spawnSync(path.join(__dirname, '../bin/project-reader'), { input: `${op}\n${Buffer.from(p).toString('hex')}\n${Buffer.from(rel).toString('hex')}\n0 ${st.dev} ${wrongIdentity ? 0 : st.ino}\n`, encoding: 'utf8', timeout: 5000, maxBuffer: 2 * 1024 * 1024 + 4096 });
  assert.equal(r.error, undefined); return JSON.parse(r.stdout);
}
async function main() {
  fs.writeFileSync(path.join(root, 'known.txt'), 'hello'); fs.writeFileSync(path.join(other, 'known.txt'), 'OTHER_PROJECT');
  const s = service(), ctx = s.bind('A');
  await test('Native sandbox operational; repaired service reads actual fixture bytes', async () => {
    const r = await req(s, ctx, 'readTextFile', 'known.txt'); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.data.text, 'hello'); console.log('REPAIRED NATIVE MODE', r.data.boundaryMode);
  });
  await test('F1 direct native AND service deny actual sensitive-name aliases before content disclosure', async () => {
    for (const dir of ['.ssh', '.aws']) fs.mkdirSync(path.join(root, dir));
    for (const p of ['.ssh/config', '.aws/credentials', 'id_rsa', 'srv.key']) fs.writeFileSync(path.join(root, p), 'SECRET_SENTINEL');
    const aliases = ['.ſsh/config', '.awſ/credentialſ', 'id_rſa', '.ßh/config', '.AWS/CREDENTIALS', 'srv.Key'];
    for (const rel of aliases) {
      const resolves = fs.existsSync(path.join(root, rel)); console.log('ALIAS RESOLUTION', JSON.stringify(rel), resolves);
      for (const op of ['read', 'list']) {
        const r = raw(op, rel); assert.equal(r.ok, false, JSON.stringify(r)); assert.ok((resolves ? ['POLICY_DENIED', 'PATH_DENIED', 'PERMISSION_DENIED'] : ['POLICY_DENIED', 'PATH_DENIED', 'PERMISSION_DENIED', 'NOT_FOUND']).includes(r.error)); assert.doesNotMatch(JSON.stringify(r), /SECRET_SENTINEL/);
      }
      for (const op of ['readTextFile', 'listDirectory', 'searchText']) {
        const r = await req(s, ctx, op, rel, op === 'searchText' ? { query: 'SECRET' } : {}); assert.doesNotMatch(JSON.stringify(r), /SECRET_SENTINEL/);
        if (r.ok) { assert.equal(op, 'searchText'); assert.equal(r.data.complete, false); assert.equal(r.data.matches.length, 0); }
        else assert.ok(['POLICY_DENIED', 'PATH_DENIED', 'PERMISSION_DENIED', 'NOT_FOUND'].includes(r.error.code), JSON.stringify(r));
      }
    }
    assert.equal(raw('read', '.ssh/config').error, 'POLICY_DENIED');
  });
  await test('F1 exact stored Unicode spelling works; normalization aliases fail closed or are exact', async () => {
    fs.writeFileSync(path.join(root, 'café.txt'), 'UNICODE_OK');
    const stored = fs.readdirSync(root).find(n => n.normalize('NFC') === 'café.txt'); assert.ok(stored);
    assert.equal((await req(s, ctx, 'readTextFile', stored)).data.text, 'UNICODE_OK');
    for (const rel of ['café.txt'.normalize('NFC'), 'café.txt'.normalize('NFD')]) {
      const r = raw('read', rel); if (rel !== stored) assert.equal(r.ok, false); else assert.equal(Buffer.from(r.hex, 'hex').toString(), 'UNICODE_OK');
    }
  });
  await test('Native helper independently rejects wrong root inode (bypasses host check)', () => assert.equal(raw('read', 'known.txt', root, true).error, 'PROJECT_UNAVAILABLE'));
  await test('Persistent native protocol cannot rebind root or introduce a new method', () => {
    const st = fs.statSync(root, { bigint: true });
    for (const method of ['session', 'exec']) {
      const input = `session\n${Buffer.from(root).toString('hex')}\n2e\n0 ${st.dev} ${st.ino}\n${method}\n${Buffer.from(other).toString('hex')}\n0\n`;
      const result = spawnSync(path.join(__dirname, '../bin/project-reader'), { input, encoding: 'utf8', timeout: 5000 }); assert.equal(JSON.parse(result.stdout).error, 'INVALID_REQUEST');
    }
  });
  await test('F11 root quoting/escaping: spaces, quotes, backslash and Arabic', async () => {
    const p = path.join(base, 'رؤية "quote" \\ space'); fs.mkdirSync(p); fs.writeFileSync(path.join(p, 'known.txt'), 'ESCAPED_ROOT_OK');
    const special = service({}, p); const r = await req(special, special.bind('A'), 'readTextFile', 'known.txt'); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.data.text, 'ESCAPED_ROOT_OK');
  });
  await test('Real child cancellation AFTER spawn returns no content and reaps child', async () => {
    let notify; const started = new Promise(r => { notify = r; });
    const cancel = service({ spawn: (...args) => { const child = spawn(...args); child.once('spawn', () => notify(child)); return child; } }); const c = cancel.bind('A');
    const requestId = 'inflight_cancel'; const pending = cancel.request('readTextFile', { ...c, requestId, relativePath: 'known.txt' });
    await started; assert.equal(cancel.cancel(c, requestId).acknowledged, true); const result = await pending; assert.equal(result.ok, false); assert.equal(result.error.code, 'CANCELLED'); assert.equal(cancel.children.size, 0);
  });
  await test('Real child A → B switch AFTER spawn fences old response', async () => {
    let notify; const started = new Promise(r => { notify = r; });
    const switching = service({ spawn: (...args) => { const child = spawn(...args); child.once('spawn', () => notify()); return child; } }); const c = switching.bind('A');
    const pending = req(switching, c, 'readTextFile', 'known.txt'); await started; const b = switching.bind('B'); const result = await pending;
    assert.equal(result.ok, false); assert.equal(result.error.code, 'STALE_CONTEXT'); assert.equal(switching.children.size, 0);
    assert.equal((await req(switching, b, 'readTextFile', 'known.txt')).data.text, 'OTHER_PROJECT');
  });
  await test('F3 100 sequential reads record target latency without leaking helpers', async () => {
    const begin = performance.now(); for (let i = 0; i < 100; i++) assert.equal((await req(s, ctx, 'readTextFile', 'known.txt')).ok, true);
    console.log('100 READS MS', (performance.now() - begin).toFixed(2)); assert.equal(s.children.size, 0);
  });
  await test('F3 persistent sandbox: complete 500-file search in the unchanged 5-second budget', async () => {
    const dir = path.join(root, 'benchmark'); fs.mkdirSync(dir); for (let i = 0; i < 500; i++) fs.writeFileSync(path.join(dir, 'file-' + i), 'marker');
    let spawns = 0; const search = service({ spawn: (...args) => { spawns++; return spawn(...args); } }); const begin = performance.now();
    const r = await req(search, search.bind('A'), 'searchText', 'benchmark', { query: 'ABSENT' }); const elapsed = performance.now() - begin;
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.data.complete, true, JSON.stringify(r)); assert.equal(r.data.filesScanned, 500); assert.equal(r.data.matches.length, 0); assert.equal(spawns, 1);
    console.log('500 FILE SEARCH MS', elapsed.toFixed(2), 'HELPERS', spawns); assert.equal(search.children.size, 0);
  });
  console.log('C1a REPAIR NATIVE CHECKS PASSED:', passed, process.platform, process.arch);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { for (const s of services) await s.close(); fs.rmSync(base, { recursive: true, force: true }); });
