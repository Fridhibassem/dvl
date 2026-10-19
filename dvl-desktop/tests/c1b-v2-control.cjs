'use strict';
// Simulated child protocol / accounting tests. No OS confinement claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { ProjectReadService } = require('../src/main/project-read-service.cjs');
const { validateNative } = require('../src/main/read-support.cjs');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-c1b-v2-control-')));
const root = path.join(base, 'project'); fs.mkdirSync(root);
const services = []; let count = 0, serial = 0;
const failure = code => Object.assign(new Error(code), { code });
async function test(name, f) { await f(); count++; console.log('PASS', name); }
function service(options = {}) {
  const s = new ProjectReadService(projectId => ({ projectId, path: root, available: true }), options);
  services.push(s); return s;
}
const request = (s, op, more = {}) => s.request(op, { ...s.bind('A'), requestId: 'v2_' + ++serial, relativePath: op === 'readTextFile' ? 'private-content.txt' : '.', ...more });
function fakeChild(phase, complete = false) {
  return () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.unref = () => {};
    let closed = false;
    child.kill = () => { if (!closed) { closed = true; queueMicrotask(() => child.emit('close', null, 'SIGKILL')); } };
    child.stdin.on('finish', () => { if (complete) child.kill(); });
    queueMicrotask(() => {
      if (phase !== 'before_spawn_event') child.emit('spawn');
      if (phase === 'after_first_byte') child.stdout.write(complete ? JSON.stringify({ ok: true, mode: 'seatbelt', hex: '6f6b', bytes: 2, dev: '1', ino: '1' }) + '\n' : '{');
    });
    return child;
  };
}
(async () => {
  for (const phase of ['before_spawn_event', 'before_first_byte', 'after_first_byte']) {
    await test('Timeout reports once with enum/numeric metadata: ' + phase, async () => {
      const logs = [], s = service({ spawn: fakeChild(phase), timeoutMs: 40, killGraceMs: 40, onTimeout: data => logs.push(data) });
      const out = await request(s, 'readTextFile'); assert.equal(out.error.code, 'TIMEOUT'); assert.equal(logs.length, 1);
      const row = logs[0]; assert.deepEqual(Object.keys(row).sort(), ['elapsedMs', 'firstByteMs', 'op', 'phase', 'spawnMs', 'startupMs']);
      assert.equal(row.phase, phase); assert.equal(row.op, 'readTextFile');
      assert.ok(row.elapsedMs >= 0); assert.ok(row.startupMs >= 0);
      assert.equal(row.spawnMs === null, phase === 'before_spawn_event');
      assert.equal(row.firstByteMs === null, phase !== 'after_first_byte');
      if (row.firstByteMs !== null) assert.ok(row.firstByteMs >= row.spawnMs);
      assert.doesNotMatch(JSON.stringify(logs), /private-content|project|query|root/);
      assert.equal(s.children.size, 0); assert.deepEqual(await s.close(), { pendingRequests: 0, liveHelpers: 0, abandonedHelpers: 0 });
    });
  }
  await test('Timeout logging failure cannot change TIMEOUT or leak helper bytes', async () => {
    const s = service({ spawn: fakeChild('after_first_byte'), timeoutMs: 30, killGraceMs: 30, onTimeout: () => { throw new Error('PRIVATE'); } });
    const out = await request(s, 'readTextFile'); assert.equal(out.error.code, 'TIMEOUT'); assert.doesNotMatch(JSON.stringify(out), /PRIVATE|private-content/);
  });
  await test('Forward wall-clock jump does not expire monotonic read deadline', async () => {
    const s = service({ spawn: fakeChild('after_first_byte', true) }), old = Date.now;
    try { Date.now = () => old() + 3600000; const out = await request(s, 'readTextFile'); assert.equal(out.ok, true, JSON.stringify(out)); assert.equal(out.data.text, 'ok'); }
    finally { Date.now = old; }
  });
  await test('Rejected binary reads consume the scan budget and preserve skip codes', async () => {
    const s = service(); let reads = 0;
    s.list = async () => ({ entries: Array.from({ length: 21 }, (_, i) => ({ name: 'asset' + i, relativePath: 'asset' + i, kind: 'file', size: 1048576 })), skipped: 0, nativeSkipped: 0 });
    s.read = async () => { reads++; throw failure('UNSUPPORTED_ENCODING'); };
    const out = await request(s, 'searchText', { query: 'ABSENT' }); assert.equal(out.ok, true);
    assert.equal(reads, 20); assert.equal(out.data.filesScanned, 20); assert.equal(out.data.bytesRead, 20 * 1048576); assert.equal(out.data.bytesScanned, 0);
    assert.equal(out.data.bytesReadIsEstimate, true); assert.deepEqual(out.data.skipped, { UNSUPPORTED_ENCODING: 20 }); assert.equal(out.data.partialReason, 'SCAN_LIMIT');
  });
  await test('Successful file growth is charged; decoded bytes never exceed charged bytes', async () => {
    const s = service(); s.list = async () => ({ entries: [{ name: 'a', relativePath: 'a', kind: 'file', size: 1 }], skipped: 0, nativeSkipped: 0 });
    s.read = async () => ({ text: 'hello', byteLength: 5 });
    const out = await request(s, 'searchText', { query: 'hello' }); assert.equal(out.ok, true); assert.equal(out.data.bytesRead, 5); assert.equal(out.data.bytesScanned, 5); assert.equal(out.data.complete, true);
  });
  await test('Native protocol accepts only the exact UNSUPPORTED_ENCODING error shape', () => {
    assert.equal(validateNative({ ok: false, error: 'UNSUPPORTED_ENCODING' }, 'read').error, 'UNSUPPORTED_ENCODING');
    assert.throws(() => validateNative({ ok: false, error: 'UNSUPPORTED_ENCODING', hex: 'secret' }, 'read'), /RUNTIME_FAILED/);
  });
  console.log('C1B_V2_CONTROL_PASS', count, '(simulated children/accounting; not OS confinement)');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  for (const s of services) await s.close(); fs.rmSync(base, { recursive: true, force: true });
});
