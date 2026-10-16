'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { ProjectReadService } = require('../src/main/project-read-service.cjs');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-c1-'));
const root = fs.realpathSync(base), a = path.join(root, 'project A'), b = path.join(root, 'project B');
fs.mkdirSync(a); fs.mkdirSync(b);
const services = []; let n = 0, passed = 0;
const observed = [];
function service(options) {
  const s = new ProjectReadService(id => ({ projectId: id, path: id === 'A' ? a : b, available: ['A', 'B'].includes(id) }), options);
  services.push(s); return s;
}
function invoke(s, ctx, op, rel, extra = {}) { return s.request(op, { ...ctx, requestId: 'req_' + (++n), relativePath: rel, ...extra }); }
async function ok(s, ctx, op, rel, extra) { const r = await invoke(s, ctx, op, rel, extra); assert.equal(r.ok, true, JSON.stringify(r)); observed.push(r); return r.data; }
async function error(s, ctx, op, rel, expected, extra) { const r = await invoke(s, ctx, op, rel, extra); assert.equal(r.ok, false, JSON.stringify(r)); assert.ok(expected.includes(r.error.code), JSON.stringify(r)); }
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }
function snapshot(p) {
  const result = {};
  function visit(dir, rel = '') {
    for (const name of fs.readdirSync(dir)) {
      const r = path.join(rel, name), f = path.join(dir, name), st = fs.lstatSync(f);
      result[r] = st.isSymbolicLink() ? 'link:' + fs.readlinkSync(f) : st.isDirectory() ? 'dir' : st.isFile() ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'special';
      if (st.isDirectory()) visit(f, r);
    }
  } visit(p); return result;
}
async function boundaryProbe() {
  const bin = path.join(root, 'boundary-probe');
  const args = ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-Wno-misleading-indentation', path.join(__dirname, 'boundary-probe.c'), '-o', bin];
  if (process.platform === 'darwin') args.push('-Wno-deprecated-declarations', '-lsandbox');
  const build = spawnSync('cc', args, { encoding: 'utf8' }); assert.equal(build.status, 0, build.stderr);
  const moving = path.join(a, 'moving'), away = path.join(root, 'moved-outside');
  fs.mkdirSync(moving); fs.mkdirSync(a + '-evil'); const external = path.join(a + '-evil', 'external-sentinel.txt'); fs.writeFileSync(external, 'EXTERNAL_SENTINEL');
  const result = await new Promise((resolve, reject) => {
    const child = spawn(bin, [a, external, 'injected.txt'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', done = false; const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('probe timed out')); }, 5000);
    child.stdout.on('data', data => {
      output += data;
      if (!done && output.includes('READY ')) {
        done = true; fs.renameSync(moving, away); fs.writeFileSync(path.join(away, 'injected.txt'), 'EXTERNAL_SENTINEL'); child.stdin.end('x');
      }
    });
    child.on('error', reject); child.on('close', code => { clearTimeout(timeout); if (code !== 0) reject(new Error('OS boundary probe failed: ' + output)); else resolve(output); });
  });
  console.log(result.trim());
  const resultObject = JSON.parse(result.trim().split('\n').at(-1));
  assert.deepEqual(resultObject, { externalDenied: true, writeDenied: true, movedDenied: true, truncateDenied: true });
  assert.equal(fs.existsSync(path.join(a, 'write-must-not-exist')), false);
  fs.renameSync(away, moving); fs.rmSync(moving, { recursive: true });
}
async function main() {
  fs.writeFileSync(path.join(a, 'hello.txt'), 'hello world\nمرحبا 😈 hello\n');
  fs.writeFileSync(path.join(a, 'space عربي.txt'), '<script>alert(1)</script>');
  fs.writeFileSync(path.join(b, 'hello.txt'), 'OTHER_PROJECT');
  fs.mkdirSync(path.join(a, '.git')); fs.writeFileSync(path.join(a, '.git', 'config'), 'HIDDEN_GIT');
  fs.writeFileSync(path.join(a, '.env'), 'SECRET_SENTINEL'); fs.writeFileSync(path.join(a, '.env.example'), 'SECRET_SENTINEL');
  fs.writeFileSync(path.join(a, 'cert.PEM'), 'SECRET_SENTINEL');
  fs.writeFileSync(path.join(a, 'binary'), Buffer.from([0, 255])); fs.writeFileSync(path.join(a, 'invalid'), Buffer.from([255]));
  fs.writeFileSync(path.join(a, 'huge'), Buffer.alloc(1048577, 65));
  fs.symlinkSync(b, path.join(a, 'escape')); fs.symlinkSync(path.join(a, 'hello.txt'), path.join(a, 'internal-link'));
  fs.writeFileSync(path.join(b, 'hard-source'), 'HARDLINK_SENTINEL');
  fs.linkSync(path.join(b, 'hard-source'), path.join(a, 'hard-link'));
  assert.equal(spawnSync('mkfifo', [path.join(a, 'pipe')]).status, 0);
  const initial = snapshot(a), s = service(), ctx = s.bind('A');
  await test('Mandatory OS boundary blocks direct outside read, write, and moved-directory injection', boundaryProbe);
  await test('Real directory list hides denied targets, links and non-regular files', async () => {
    const r = await ok(s, ctx, 'listDirectory', '.'); assert.ok(r.entries.some(x => x.name === 'hello.txt')); assert.ok(['landlock', 'seatbelt'].includes(r.boundaryMode));
    assert.equal(r.entries.some(x => ['.env', '.git', '.env.example', 'cert.PEM', 'escape', 'hard-link', 'pipe'].includes(x.name)), false);
  });
  await test('Read UTF-8 Unicode path, exact contents/hash and inert markup bytes', async () => {
    const d = await ok(s, ctx, 'readTextFile', 'space عربي.txt'); assert.equal(d.text, '<script>alert(1)</script>');
    assert.equal(d.sha256, crypto.createHash('sha256').update(d.text).digest('hex')); assert.equal(d.byteLength, Buffer.byteLength(d.text));
  });
  await test('Traversal, empty, absolute, backslash, drive and NUL rejected', async () => {
    for (const p of ['../project B/hello.txt', '/etc/passwd', '', 'a//b', 'a/./b', 'C:/a', '\\a', 'a\0b', '..']) await error(s, ctx, 'readTextFile', p, ['PATH_DENIED']);
  });
  await test('Denied targets blocked across read/list/search', async () => {
    for (const p of ['.env', '.env.example', '.git', '.git/config', 'cert.PEM', 'x/.ssh/key', 'id_rsa.pub']) for (const op of ['readTextFile', 'listDirectory', 'searchText']) await error(s, ctx, op, p, ['POLICY_DENIED'], op === 'searchText' ? { query: 'SECRET' } : {});
  });
  await test('Symlink parent, internal symlink, hard link and FIFO cannot disclose bytes', async () => {
    await error(s, ctx, 'readTextFile', 'escape/hello.txt', ['PATH_DENIED', 'SYMLINK_DENIED']);
    await error(s, ctx, 'readTextFile', 'internal-link', ['SYMLINK_DENIED']);
    await error(s, ctx, 'readTextFile', 'hard-link', ['HARDLINK_DENIED']);
    await error(s, ctx, 'readTextFile', 'pipe', ['NOT_REGULAR_FILE']);
  });
  await test('Binary, invalid encoding, oversized and missing files return bounded errors', async () => {
    for (const p of ['binary', 'invalid']) await error(s, ctx, 'readTextFile', p, ['UNSUPPORTED_ENCODING']);
    await error(s, ctx, 'readTextFile', 'huge', ['FILE_TOO_LARGE']); await error(s, ctx, 'readTextFile', 'missing', ['NOT_FOUND']);
  });
  await test('Literal search correct 1-based Unicode column and explicit skipped files', async () => {
    const r = await ok(s, ctx, 'searchText', '.', { query: 'hello' }); assert.equal(r.matches.length, 2);
    assert.equal(r.matches.find(x => x.line === 2).column, 9); assert.equal(r.complete, false); assert.equal(r.partialReason, 'FILES_SKIPPED');
    assert.doesNotMatch(JSON.stringify(r), /SECRET_SENTINEL|OTHER_PROJECT|HIDDEN_GIT/);
  });
  await test('Regex characters treated literally; empty/oversize query rejected', async () => {
    const r = await ok(s, ctx, 'searchText', '.', { query: '.*' }); assert.equal(r.matches.length, 0);
    for (const query of ['', 'a'.repeat(257)]) await error(s, ctx, 'searchText', '.', ['INVALID_REQUEST'], { query });
  });
  await test('Unknown keys, caller-supplied root, duplicate IDs and bad project rejected', async () => {
    await error(s, ctx, 'readTextFile', 'hello.txt', ['INVALID_REQUEST'], { root: b });
    const req = { ...ctx, requestId: 'duplicate', relativePath: 'hello.txt' }; assert.equal((await s.request('readTextFile', req)).ok, true); assert.equal((await s.request('readTextFile', req)).error.code, 'INVALID_REQUEST');
    await error(s, { ...ctx, projectId: 'B' }, 'readTextFile', 'hello.txt', ['STALE_CONTEXT']);
  });
  await test('Cancellation and A → B → A fence pending and old-generation results', async () => {
    const req = { ...ctx, requestId: 'cancel_me', relativePath: 'hello.txt' }; const p = s.request('readTextFile', req); assert.equal(s.cancel(ctx, req.requestId).acknowledged, true); assert.equal((await p).error.code, 'CANCELLED');
    const pending = invoke(s, ctx, 'searchText', '.', { query: 'hello' }); const cb = s.bind('B'); assert.equal((await pending).error.code, 'STALE_CONTEXT');
    assert.equal((await ok(s, cb, 'readTextFile', 'hello.txt')).text, 'OTHER_PROJECT'); const ca = s.bind('A'); assert.notEqual(ca.contextGeneration, ctx.contextGeneration);
    await error(s, ctx, 'readTextFile', 'hello.txt', ['STALE_CONTEXT']);
  });
  const fresh = s.bind('A');
  await test('Root identity replacement invalidates capability', async () => {
    fs.renameSync(a, a + '-old'); fs.mkdirSync(a); fs.writeFileSync(path.join(a, 'hello.txt'), 'IMPOSTOR');
    await error(s, fresh, 'readTextFile', 'hello.txt', ['PROJECT_UNAVAILABLE']);
    fs.rmSync(a, { recursive: true }); fs.renameSync(a + '-old', a);
  });
  const current = s.bind('A');
  await test('Pagination bounded to 200, cursor single-use, directory changes reject cursor', async () => {
    fs.mkdirSync(path.join(a, 'many')); for (let i = 0; i < 205; i++) fs.writeFileSync(path.join(a, 'many', 'f' + i), 'x');
    const first = await ok(s, current, 'listDirectory', 'many'); assert.equal(first.entries.length, 200); assert.equal(first.complete, false);
    const second = await ok(s, current, 'listDirectory', 'many', { cursor: first.nextCursor }); assert.equal(second.entries.length, 5); assert.equal(second.complete, true);
    await error(s, current, 'listDirectory', 'many', ['INVALID_CURSOR'], { cursor: first.nextCursor });
    const again = await ok(s, current, 'listDirectory', 'many'); fs.writeFileSync(path.join(a, 'many', 'added'), 'x');
    // Directory stamps must include subsecond metadata (verified separately).
    const changed = await invoke(s, current, 'listDirectory', 'many', { cursor: again.nextCursor });
    assert.equal(changed.ok, false); assert.equal(changed.error.code, 'DIRECTORY_CHANGED');
    fs.rmSync(path.join(a, 'many'), { recursive: true });
  });
  await test('Result limit caps matches and labels partial', async () => {
    fs.mkdirSync(path.join(a, 'matches')); fs.writeFileSync(path.join(a, 'matches', 'data'), 'x\n'.repeat(250));
    const r = await ok(s, current, 'searchText', 'matches', { query: 'x' }); assert.equal(r.matches.length, 200); assert.equal(r.partialReason, 'MATCH_LIMIT'); fs.rmSync(path.join(a, 'matches'), { recursive: true });
  });
  await test('Unavailable backend fails closed, no path-only fallback', async () => { const missing = service({ binary: path.join(root, 'not-built') }); await error(missing, missing.bind('A'), 'readTextFile', 'hello.txt', ['BOUNDARY_UNSUPPORTED']); });
  await test('File inventory including .git/hidden/ignored bytes unchanged; .dvl absent', async () => {
    assert.deepEqual(snapshot(a), initial); assert.equal(fs.existsSync(path.join(a, '.dvl')), false); assert.doesNotMatch(JSON.stringify(observed), /SECRET_SENTINEL|EXTERNAL_SENTINEL/);
  });
  await test('Close cancels pending requests and leaves no tracked helper', async () => {
    const pending = invoke(s, current, 'readTextFile', 'hello.txt'); await s.close(); assert.equal((await pending).ok, false); assert.equal(s.jobs.size, 0); assert.equal(s.active, 0);
  });
  console.log('C1a CHECKS PASSED:', passed, 'platform:', process.platform, process.arch);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { for (const s of services) await s.close(); fs.rmSync(base, { recursive: true, force: true }); });
