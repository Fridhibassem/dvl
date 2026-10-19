'use strict';
// Real OS confinement required. Unsupported hosts FAIL; no insecure fallback.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { ProjectReadService } = require('../src/main/project-read-service.cjs');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-c1b-v2-native-')));
const root = path.join(base, 'project'); fs.mkdirSync(root);
let expectedTextBytes = 0, pipeBytes = 0, spawns = 0, serial = 0, count = 0;
function write(rel, text, charge = false) {
  const target = path.join(root, rel); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text);
  if (charge) expectedTextBytes += Buffer.byteLength(text);
}
const marker = 'C1B_V2_LITERAL_NEEDLE';
for (let i = 0; i < 300; i++) write('src/Component' + i + '.tsx', 'export const value = ' + i + ';\n' + '// source padding\n'.repeat(48), true);
for (let i = 0; i < 30; i++) write('migrations/' + i + '.sql', 'SELECT 1;\n'.repeat(32), true);
for (let i = 0; i < 120; i++) write('public/image' + i + '.png', Buffer.alloc(65536, 0));
write('next-env.d.ts', '/// ' + marker + '\n', true);
write('tsconfig.tsbuildinfo', '{"cache":"' + 'x'.repeat(400000) + marker + '"}', true);
for (let i = 0; i < 340; i++) write('.next/chunks/' + i + '.js', '// generated\n'.repeat(1024));
write('.next/cache/.tsbuildinfo', marker); write('.next/cache/webpack.pack', Buffer.alloc(1048576));
const service = new ProjectReadService(projectId => ({ projectId, path: root, available: true }), {
  spawn: (...args) => { spawns++; const child = spawn(...args); child.stdout.on('data', chunk => { pipeBytes += chunk.length; }); return child; }
});
const context = service.bind('A');
const request = (op, relativePath, extra = {}) => service.request(op, { ...context, requestId: 'fixture_' + ++serial, relativePath, ...extra });
async function test(name, f) { await f(); count++; console.log('PASS', name); }
(async () => {
  await test('Binary NUL refusal happens inside the confined helper before hex transfer', () => {
    const st = fs.statSync(root, { bigint: true });
    const result = spawnSync(path.join(__dirname, '../bin/project-reader'), {
      input: `read\n${Buffer.from(root).toString('hex')}\n${Buffer.from('public/image0.png').toString('hex')}\n0 ${st.dev} ${st.ino}\n`,
      encoding: 'utf8', timeout: 5000, maxBuffer: 4096
    });
    assert.equal(result.error, undefined); assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { ok: false, error: 'UNSUPPORTED_ENCODING' }); assert.ok(Buffer.byteLength(result.stdout) < 128);
  });
  await test('Next-shaped 794-file tree finishes its permitted search within the unchanged budget', async () => {
    const start = performance.now(), beforeSpawns = spawns, beforePipe = pipeBytes;
    const out = await request('searchText', '.', { query: marker }); assert.equal(out.ok, true, JSON.stringify(out));
    const d = out.data; assert.equal(d.partialReason, 'FILES_SKIPPED'); assert.equal(d.complete, false);
    assert.equal(d.filesScanned, 452); assert.deepEqual(d.skipped, { UNSUPPORTED_ENCODING: 120 }); assert.equal(d.excludedDirectories, 1);
    assert.deepEqual(d.matches.map(m => m.relativePath).sort(), ['next-env.d.ts', 'tsconfig.tsbuildinfo']);
    assert.equal(d.bytesScanned, expectedTextBytes); assert.equal(d.bytesRead, expectedTextBytes + 120 * 65536);
    assert.equal(d.bytesReadIsEstimate, true); assert.ok(d.bytesRead >= d.bytesScanned); assert.equal(spawns - beforeSpawns, 1);
    assert.ok(pipeBytes - beforePipe < expectedTextBytes * 2 + 200000, 'Binary hex must not dominate pipe traffic');
    console.log('C1B_NEXT_FIXTURE', JSON.stringify({ elapsedMs: Math.round(performance.now() - start), pipeBytes: pipeBytes - beforePipe,
      bytesScanned: d.bytesScanned, bytesRead: d.bytesRead, filesScanned: d.filesScanned, excludedDirectories: d.excludedDirectories, skipped: d.skipped, mode: process.platform }));
  });
  await test('.next remains listable and directly readable; only search traversal excludes it', async () => {
    const list = await request('listDirectory', '.'); assert.equal(list.ok, true, JSON.stringify(list));
    assert.ok(list.data.entries.some(e => e.name === '.next'));
    const read = await request('readTextFile', '.next/cache/.tsbuildinfo'); assert.equal(read.ok, true, JSON.stringify(read)); assert.equal(read.data.text, marker);
  });
  console.log('C1B_V2_NATIVE_PASS', count, process.platform, process.arch);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  const counts = await service.close(); console.log('C1B_V2_NATIVE_CLOSE', JSON.stringify(counts));
  if (Object.values(counts).some(Boolean)) process.exitCode = 1;
  fs.rmSync(base, { recursive: true, force: true });
});
