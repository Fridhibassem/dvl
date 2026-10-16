'use strict';
// Service control/policy tests. A few use test-only fake executables to force
// cancellation/timeout/protocol failures. These do NOT qualify OS confinement.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { ProjectReadService, validPath, denyName } = require('../src/main/project-read-service.cjs');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-c1-unit-')));
const roots = { A: path.join(base, 'a'), B: path.join(base, 'b') };
for (const p of Object.values(roots)) fs.mkdirSync(p);
const services = []; let count = 0, passed = 0;
function service(options) { const s = new ProjectReadService(id => roots[id] ? { projectId: id, path: roots[id], available: true } : null, options); services.push(s); return s; }
function req(s, ctx, overrides = {}, op = 'readTextFile') { return s.request(op, { ...ctx, requestId: 'r' + (++count), relativePath: 'hello.txt', ...overrides }); }
function fake(name, code) { const p = path.join(base, name); fs.writeFileSync(p, `#!${process.execPath}\n${code}\n`); fs.chmodSync(p, 0o700); return p; }
async function test(name, f) { await f(); passed++; console.log('PASS', name); }
async function main() {
  await test('Path grammar rejects escapes and accepts Unicode/spaces without normalization', () => {
    for (const p of ['', '/a', '../a', 'a/../b', 'a//b', 'a/./b', 'C:/a', 'a\\b', 'a\0b']) assert.throws(() => validPath(p, false), e => ['PATH_DENIED', 'INVALID_REQUEST'].includes(e.code));
    for (const p of ['space عربي.txt', 'é.ts', 'a/b.ts']) validPath(p, false);
    validPath('.', true); assert.throws(() => validPath('.', false)); assert.throws(() => validPath('\ud800', false));
  });
  await test('Sensitive policy consistent for case and nested paths', () => {
    for (const p of ['.ENV', '.env.example', '.git', '.ssh', 'cert.PEM', '.npmrc', 'credentials.json', 'id_rsa.pub']) { assert.equal(denyName(p), true); assert.throws(() => validPath('x/' + p, false), e => e.code === 'POLICY_DENIED'); }
    assert.equal(denyName('environment.ts'), false);
  });
  const missing = service({ binary: path.join(base, 'missing') }), ctx = missing.bind('A');
  await test('No native binary means BOUNDARY_UNSUPPORTED with no fallback', async () => assert.equal((await req(missing, ctx)).error.code, 'BOUNDARY_UNSUPPORTED'));
  await test('Unknown request keys and caller root rejected before backend', async () => assert.equal((await req(missing, ctx, { root: roots.B })).error.code, 'INVALID_REQUEST'));
  await test('Request IDs cannot be reused in one generation', async () => {
    await req(missing, ctx, { requestId: 'same' }); assert.equal((await req(missing, ctx, { requestId: 'same' })).error.code, 'INVALID_REQUEST');
  });
  await test('A → B → A produces a fresh generation and fences old requests', async () => {
    missing.bind('B'); const again = missing.bind('A'); assert.notEqual(again.contextGeneration, ctx.contextGeneration); assert.equal((await req(missing, ctx)).error.code, 'STALE_CONTEXT');
  });
  await test('Root replaced by directory invalidates generation', async () => {
    const c = missing.bind('A'); fs.renameSync(roots.A, roots.A + '-old'); fs.mkdirSync(roots.A);
    assert.equal((await req(missing, c)).error.code, 'PROJECT_UNAVAILABLE'); fs.rmdirSync(roots.A); fs.renameSync(roots.A + '-old', roots.A);
  });
  await test('Native malformed protocol becomes RUNTIME_FAILED without stdout leakage', async () => {
    const s = service({ binary: fake('malformed', 'console.log("PRIVATE_DATA_NOT_JSON")') });
    const r = await req(s, s.bind('A')); assert.equal(r.error.code, 'RUNTIME_FAILED'); assert.doesNotMatch(JSON.stringify(r), /PRIVATE_DATA/);
  });
  await test('Cancellation waits for helper close and releases active slot', async () => {
    const s = service({ binary: fake('slow-cancel', 'setInterval(()=>{},1000)') }), c = s.bind('A');
    const p = req(s, c, { requestId: 'cancel' }); assert.equal(s.cancel(c, 'cancel').acknowledged, true); assert.equal((await p).error.code, 'CANCELLED'); assert.equal(s.active, 0);
  });
  await test('Hard timeout terminates helper with bounded error', async () => {
    const s = service({ binary: fake('slow-timeout', 'setInterval(()=>{},1000)'), timeoutMs: 50 }); const r = await req(s, s.bind('A')); assert.equal(r.error.code, 'TIMEOUT'); assert.equal(s.active, 0);
  });
  await test('Two running and eight queued; overload BUSY; switch fences every pending request', async () => {
    const s = service({ binary: fake('slow-queue', 'setInterval(()=>{},1000)') }), c = s.bind('A');
    const pending = Array.from({ length: 10 }, () => req(s, c)); assert.equal(s.active, 2); assert.equal(s.queue.length, 8);
    assert.equal((await req(s, c)).error.code, 'BUSY'); s.bind('B');
    for (const r of await Promise.all(pending)) assert.equal(r.error.code, 'STALE_CONTEXT'); assert.equal(s.queue.length, 0); assert.equal(s.active, 0);
  });
  await test('Invalid cursor cannot reach filesystem helper', async () => {
    const s = service({ binary: path.join(base, 'missing') }); const r = await req(s, s.bind('A'), { relativePath: '.', cursor: 'unissued' }, 'listDirectory'); assert.equal(r.error.code, 'INVALID_CURSOR');
  });
  await test('No project writes or .dvl activation from service refusal paths', () => {
    for (const p of Object.values(roots)) assert.deepEqual(fs.readdirSync(p), []);
  });
  await test('Production native binary enforces malformed-input/policy failures', () => {
    const bin = path.join(__dirname, '../bin/project-reader');
    let r = spawnSync(bin, { input: 'bad\n00\n00\n0\n', encoding: 'utf8' }); assert.equal(JSON.parse(r.stdout).error, 'INVALID_REQUEST');
    const st = fs.statSync(roots.A, { bigint: true });
    r = spawnSync(bin, { input: `read\n${Buffer.from(roots.A).toString('hex')}\n${Buffer.from('.env').toString('hex')}\n0 ${st.dev} ${st.ino}\n`, encoding: 'utf8' }); assert.equal(JSON.parse(r.stdout).error, 'POLICY_DENIED');
  });
  await test('Runtime support is reported honestly and unsupported native reader fails closed', async () => {
    const s = service(), c = s.bind('A'); const r = await req(s, c);
    // hello.txt is absent: supported backend gives NOT_FOUND, unsupported denies.
    assert.equal(r.ok, false); assert.ok(['NOT_FOUND', 'BOUNDARY_UNSUPPORTED'].includes(r.error.code)); console.log('NATIVE SUPPORT PROBE:', r.error.code);
  });
  await test('Close drains all tracked children/requests', async () => {
    const s = service({ binary: fake('slow-close', 'setInterval(()=>{},1000)') }), c = s.bind('A'); const p = req(s, c); await s.close(); assert.equal((await p).ok, false); assert.equal(s.jobs.size, 0); assert.equal(s.active, 0);
  });
  console.log('C1a CONTROL CHECKS PASSED:', passed, '(not OS-confinement qualification)');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { for (const s of services) await s.close(); fs.rmSync(base, { recursive: true, force: true }); });
