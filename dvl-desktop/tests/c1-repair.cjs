'use strict';
// Control/policy/CPU tests. Simulated helpers are explicitly NOT OS evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { ProjectReadService, denyName } = require('../src/main/project-read-service.cjs');
const { policy, rootAllowed, validateNative, matchText } = require('../src/main/read-support.cjs');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-c1-repair-'))), project = path.join(base, 'project'); fs.mkdirSync(project);
const services = []; let passed = 0, n = 0;
const failure = code => Object.assign(new Error(code), { code });
const delay = ms => new Promise(r => setTimeout(r, ms));
async function test(name, f) { await f(); passed++; console.log('PASS', name); }
function service(options = {}, root = project) { const s = new ProjectReadService(id => ({ projectId: id, path: root, available: true }), options); services.push(s); return s; }
function req(s, ctx, operation = 'readTextFile', extra = {}) { return s.request(operation, { ...ctx, requestId: 'fix_' + (++n), relativePath: '.', ...extra }); }
function direct(rel, root = project, env = {}) {
  const st = fs.statSync(root, { bigint: true });
  const r = spawnSync(path.join(__dirname, '../bin/project-reader'), { env, input: `read\n${Buffer.from(root).toString('hex')}\n${Buffer.from(rel).toString('hex')}\n0 ${st.dev} ${st.ino}\n`, encoding: 'utf8', timeout: 5000 });
  assert.equal(r.error, undefined); return JSON.parse(r.stdout);
}
function fake(name, code) { const f = path.join(base, name); fs.writeFileSync(f, `#!${process.execPath}\n${code}`); fs.chmodSync(f, 0o700); return f; }
const entry = (name, kind = 'file') => ({ name, relativePath: name, kind, size: 5 });
function simulated(list) {
  const s = service(); s.list = list;
  s.read = async () => ({ text: 'hello', byteLength: 5 }); return s;
}
async function main() {
  await test('F7 single policy table denies every name/prefix/extension in JS AND production native entrypoint', () => {
    const samples = [...policy.deniedNames, ...policy.deniedPrefixes.map(x => x + 'example'), ...policy.deniedExtensions.map(x => 'sample' + x)];
    for (const name of samples) for (const p of [name, name.toUpperCase()]) { assert.equal(denyName(p), true); assert.equal(direct(p).error, 'POLICY_DENIED', p); }
  });
  await test('F3 close inherited descriptors including fd above lowered soft limit', () => {
    const bin = path.join(base, 'fd-probe'); const args = ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-Wno-misleading-indentation', path.join(__dirname, 'descriptor-probe.c'), '-o', bin];
    if (process.platform === 'darwin') args.push('-Wno-deprecated-declarations', '-lsandbox');
    const build = spawnSync('cc', args, { encoding: 'utf8' }); assert.equal(build.status, 0, build.stderr);
    const fd = fs.openSync(path.join(__dirname, '../package.json'), 'r');
    try {
      const stdio = Array(38).fill('ignore'); stdio[0] = 'ignore'; stdio[1] = 'pipe'; stdio[2] = 'pipe'; stdio[3] = fd; stdio[37] = fd;
      const r = spawnSync(bin, [], { stdio, encoding: 'utf8', timeout: 5000 }); assert.equal(r.status, 0, r.stderr); const out = JSON.parse(r.stdout);
      assert.equal(out.fd3Closed, true); assert.equal(out.fd37Closed, true); console.log('FD PROBE', JSON.stringify(out));
    } finally { fs.closeSync(fd); }
  });
  await test('F4 JS and native reject home/ancestors/system roots before sandbox', () => {
    for (const root of [fs.realpathSync(os.homedir()), '/', '/etc', ...(process.platform === 'darwin' ? ['/Users', '/private', '/System'] : ['/usr'])]) {
      assert.equal(rootAllowed(fs.realpathSync(root)), false, root); assert.throws(() => service({}, fs.realpathSync(root)).bind('A'), e => e.code === 'PROJECT_UNAVAILABLE'); assert.equal(direct('missing', fs.realpathSync(root)).error, 'PROJECT_UNAVAILABLE');
    }
    assert.ok(service().bind('A').contextGeneration);
  });
  await test('F4 custom userData root, ancestors and descendants rejected by host and native', () => {
    const state = path.join(base, 'state'), data = path.join(state, 'userData'), child = path.join(data, 'nested'); fs.mkdirSync(child, { recursive: true });
    for (const root of [base, state, data, child]) {
      assert.throws(() => service({ userDataPath: data }, root).bind('A'), e => e.code === 'PROJECT_UNAVAILABLE'); assert.equal(direct('missing', root, { DVL_USER_DATA: data }).error, 'PROJECT_UNAVAILABLE');
    }
  });
  await test('F8 strict native protocol validates error/mode/kind/size/identity/offset/hex and unknown fields', () => {
    const read = { ok: true, mode: 'landlock', hex: '61', bytes: 1, dev: '1', ino: '2' };
    const list = { ok: true, mode: 'landlock', entries: [{ nameHex: '61', kind: 'file', size: 1 }], offset: 1, more: false, limited: false, skipped: 0, hiddenByPolicy: 0, dev: '1', ino: '2', stamp: '1:0:1:0' };
    validateNative(read, 'read'); validateNative(list, 'list');
    for (const value of [{ ...read, bytes: 2 }, { ...read, mode: 'unsafe' }, { ...read, ino: 'x' }, { ...read, dev: '18446744073709551616' }, { ...read, surprise: 1 }, { ok: false, error: 'PRIVATE_CONTENT' }]) assert.throws(() => validateNative(value, 'read'), e => e.code === 'RUNTIME_FAILED');
    for (const value of [{ ...list, offset: -1 }, { ...list, more: 1 }, { ...list, entries: [{ nameHex: '61', kind: 'script', size: 1 }] }, { ...list, entries: [{ nameHex: '61', kind: 'file', size: -1 }] }]) assert.throws(() => validateNative(value, 'list'), e => e.code === 'RUNTIME_FAILED');
  });
  await test('F2 one-MiB line, 200 start/end matches: bounded CPU and event-loop delay', async () => {
    const meter = monitorEventLoopDelay({ resolution: 10 }); meter.enable(); await delay(15);
    for (const text of ['N'.repeat(200) + 'x'.repeat(1048376), 'x'.repeat(1048376) + 'N'.repeat(200)]) {
      const matches = []; const start = performance.now(); assert.equal(await matchText(text, 'N', 'fixture', matches, () => {}), 'MATCH_LIMIT'); const ms = performance.now() - start;
      assert.equal(matches.length, 200); assert.ok(ms < 200, 'CPU regression: ' + ms); console.log('MATCH CPU MS', ms.toFixed(2));
    }
    await delay(15); meter.disable(); assert.ok(meter.max / 1e6 < 100, 'event loop max ms: ' + meter.max / 1e6); console.log('EVENT LOOP MAX MS', (meter.max / 1e6).toFixed(2));
  });
  await test('F2 matching cooperatively observes cancellation during a long line', async () => {
    let cancelled = false; setImmediate(() => { cancelled = true; });
    await assert.rejects(matchText('x'.repeat(1048376) + 'N', 'N', 'fixture', [], () => { if (cancelled) throw failure('CANCELLED'); }), e => e.code === 'CANCELLED');
  });
  await test('F9 snippets stay well-formed and Unicode columns remain correct', async () => {
    const matches = []; await matchText('😈' + 'x'.repeat(39) + 'NEEDLE', 'NEEDLE', 'fixture', matches, () => {});
    assert.equal(matches[0].column, 41); assert.equal(matches[0].snippet.isWellFormed(), true); assert.ok(Array.from(matches[0].snippet).length <= 240);
  });
  await test('F5 excluded directories are counted and search reports partial', async () => {
    const s = simulated(async () => ({ entries: [entry('build', 'directory'), entry('top')], skipped: 0 }));
    const r = await req(s, s.bind('A'), 'searchText', { query: 'hello' }); assert.equal(r.ok, true); assert.equal(r.data.excludedDirectories, 1); assert.equal(r.data.complete, false); assert.equal(r.data.partialReason, 'DIRECTORIES_EXCLUDED'); assert.equal(r.data.matches.length, 1);
  });
  await test('F5 newline/CR query rejected instead of reporting a false no-match', async () => {
    const s = service(); const c = s.bind('A'); for (const query of ['foo\nbar', 'foo\rbar']) assert.equal((await req(s, c, 'searchText', { query })).error.code, 'INVALID_REQUEST');
  });
  await test('F5 invalid listing names and directory failures retain earlier matches and expose skip counts', async () => {
    const s = simulated(async (_ctx, rel) => { if (rel !== '.') throw failure('DIRECTORY_CHANGED'); return { entries: [entry('top'), entry('bad', 'directory')], skipped: 2 }; });
    const r = await req(s, s.bind('A'), 'searchText', { query: 'hello' }); assert.equal(r.data.matches.length, 1); assert.equal(r.data.complete, false); assert.equal(r.data.skipped.INVALID_NAMES, 2); assert.equal(r.data.skipped.DIRECTORY_CHANGED, 1);
  });
  await test('F5 path-depth refusal preserves completed search evidence', async () => {
    const deep = Array(65).fill('d').join('/');
    const s = simulated(async () => ({ entries: [entry('top'), { ...entry('deep', 'directory'), relativePath: deep }], skipped: 0 }));
    const r = await req(s, s.bind('A'), 'searchText', { query: 'hello' }); assert.equal(r.data.matches.length, 1); assert.equal(r.data.complete, false); assert.equal(r.data.skipped.PATH_DENIED, 1);
  });
  await test('F5 time budget returns explicit partial results rather than false completion', async () => {
    const s = simulated(async () => ({ entries: [entry('first'), entry('second')], skipped: 0 }));
    s.read = async (_ctx, rel) => { if (rel === 'second') throw failure('TIMEOUT'); return { text: 'hello', byteLength: 5 }; };
    const r = await req(s, s.bind('A'), 'searchText', { query: 'hello' }); assert.equal(r.data.matches.length, 1); assert.equal(r.data.partialReason, 'TIMEOUT'); assert.equal(r.data.complete, false);
  });
  await test('F6 helpers ignoring SIGKILL cannot wedge requests/shutdown or exceed global helper ceiling', async () => {
    const children = [];
    function stuck() { const c = new EventEmitter(); c.stdin = new EventEmitter(); c.stdin.write = c.stdin.end = c.stdin.destroy = () => {}; c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.stdout.destroy = c.stderr.destroy = () => {}; c.kill = () => true; c.unref = () => {}; children.push(c); return c; }
    const s = service({ spawn: stuck, timeoutMs: 15, killGraceMs: 20 }), c = s.bind('A');
    const results = await Promise.all([req(s, c, 'readTextFile', { relativePath: 'a' }), req(s, c, 'readTextFile', { relativePath: 'b' })]);
    for (const r of results) assert.equal(r.error.code, 'TIMEOUT'); assert.equal(s.abandoned.size, 2); assert.equal(s.children.size, 2);
    assert.equal((await req(s, c, 'readTextFile', { relativePath: 'c' })).error.code, 'BUSY'); assert.equal(children.length, 2);
    const start = performance.now(); const closed = await s.close(); assert.ok(performance.now() - start < 150); assert.equal(closed.abandonedHelpers, 2);
    for (const child of children) child.emit('close', null, 'SIGKILL'); assert.equal(s.children.size, 0); assert.equal(s.abandoned.size, 0);
  });
  await test('F3 one root-bound process serves every list/read within a search (simulated protocol)', async () => {
    const bin = fake('simulated-session', `const readline=require('node:readline');let header=[],parts=[];const rl=readline.createInterface({input:process.stdin});rl.on('line',line=>{if(header.length<4){header.push(line);return;}parts.push(line);if(parts.length!==3)return;const [op]=parts;parts=[];const out=op==='list'?{ok:true,mode:'landlock',entries:['a','b','c'].map(n=>({nameHex:Buffer.from(n).toString('hex'),kind:'file',size:5})),offset:3,more:false,limited:false,skipped:0,hiddenByPolicy:0,dev:'1',ino:'2',stamp:'1:0:1:0'}:{ok:true,mode:'landlock',hex:Buffer.from('hello').toString('hex'),bytes:5,dev:'1',ino:'2'};console.log(JSON.stringify(out));});`);
    let spawns = 0; const s = service({ binary: bin, spawn: (...a) => { spawns++; return spawn(...a); } });
    const r = await req(s, s.bind('A'), 'searchText', { query: 'hello' }); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.data.matches.length, 3); assert.equal(spawns, 1); assert.equal(s.children.size, 0);
  });
  await test('F8 malformed session response fails closed without raw error text', async () => {
    const s = service({ binary: fake('bad-output', `process.stdin.once('data',()=>console.log(JSON.stringify({ok:false,error:'PRIVATE_SECRET'})));`) });
    const r = await req(s, s.bind('A'), 'readTextFile', { relativePath: 'a' }); assert.equal(r.error.code, 'RUNTIME_FAILED'); assert.doesNotMatch(JSON.stringify(r), /PRIVATE_SECRET/);
  });
  console.log('C1a REPAIR CONTROL CHECKS PASSED:', passed, '(simulated protocol tests are not native security evidence)');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { for (const s of services) await s.close(); fs.rmSync(base, { recursive: true, force: true }); });
