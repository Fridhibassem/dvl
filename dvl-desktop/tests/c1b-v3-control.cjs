'use strict';
// Protocol/accounting and probe gate logic; no Mac/APFS qualification claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateNative } = require('../src/main/read-support.cjs');
const { ProjectReadService, validPath } = require('../src/main/project-read-service.cjs');
const { DATA, buildPairs, gateFailures, selfTest } = require('../scripts/qualify-unicode-aliases.cjs');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-v3-control-')));
const service = new ProjectReadService(id => ({ projectId: id, path: base, available: true }));
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS', name); }
(async () => {
  await test('All eleven observed hazards refuse benign names too; unrelated Unicode remains usable', () => {
    for (const c of 'ßſẞKﬀﬁﬂﬃﬄﬅﬆ') assert.throws(() => validPath('ordinary_' + c + '.txt', false), e => e.code === 'POLICY_DENIED');
    for (const name of ['café.txt', 'مرحبا.txt', 'İ.txt', '𝾕.txt']) validPath(name, false);
  });
  await test('Native list requires bounded hidden count and rejects impossible accounting', () => {
    const good = { ok: true, mode: 'seatbelt', entries: [], offset: 3, more: false, limited: false, skipped: 1, hiddenByPolicy: 2, dev: '1', ino: '2', stamp: '1:0:1:0' };
    validateNative(good, 'list');
    for (const n of [undefined, null, -1, 0.5, '2', 10001, 3]) assert.throws(() => validateNative({ ...good, hiddenByPolicy: n }, 'list'), e => e.code === 'RUNTIME_FAILED');
    for (const entries of [undefined, null, {}, 'bad']) assert.throws(() => validateNative({ ...good, entries }, 'list'), e => e.code === 'RUNTIME_FAILED');
    const missing = { ...good }; delete missing.hiddenByPolicy; assert.throws(() => validateNative(missing, 'list'), e => e.code === 'RUNTIME_FAILED');
  });
  await test('Host listing defense counts policy names separately from invalid encodings', async () => {
    const native = service.native;
    service.native = async () => ({ entries: [
      { nameHex: Buffer.from('.conﬁg').toString('hex'), kind: 'file', size: 1 },
      { nameHex: 'ff', kind: 'file', size: 1 },
      { nameHex: Buffer.from('safe.txt').toString('hex'), kind: 'file', size: 1 }
    ], dev: '1', ino: '2', stamp: '1:0:1:0', hiddenByPolicy: 2, skipped: 1, more: false, limited: false, mode: 'seatbelt' });
    try {
      const out = await service.list(service.bind('A'), '.', null, {});
      assert.equal(out.hiddenByPolicy, 3); assert.equal(out.skipped, 2); assert.equal(out.nativeSkipped, 1);
      assert.deepEqual(out.entries.map(e => e.name), ['safe.txt']); assert.equal(out.partialReason, 'ENTRIES_SKIPPED');
    } finally { service.native = native; }
  });
  await test('Search aggregates encountered policy counts across pages and keeps exclusions/skips distinct', async () => {
    let page = 0;
    service.list = async () => ++page === 1 ? { entries: [{ name: '.next', kind: 'directory', relativePath: '.next' }], hiddenByPolicy: 2, skipped: 0, nextCursor: 'second' } : { entries: [], hiddenByPolicy: 3, skipped: 1, nativeSkipped: 1 };
    const out = await service.request('searchText', { ...service.bind('A'), requestId: 'count', relativePath: '.', query: 'needle' });
    assert.equal(out.ok, true); assert.equal(out.data.hiddenByPolicy, 5); assert.equal(out.data.excludedDirectories, 1);
    assert.deepEqual(out.data.skipped, { NATIVE_ENTRIES_SKIPPED: 1 }); assert.equal(out.data.partialReason, 'FILES_SKIPPED');
  });
  await test('Repaired probe preserves EILSEQ handling and generates all twelve default ASCII folds', () => {
    selfTest(); assert.equal(DATA.nonAsciiToAscii.length, 12);
    const pairs = buildPairs(require('../read-policy.json')); assert.equal(pairs.length, 79);
    for (const cp of ['U+FB01', 'U+FB05', 'U+FB06']) assert.ok(pairs.some(p => p.sensitive && p.codePoint === cp));
  });
  await test('Alias gate fails allowed/missing/incorrect native or host refusal and incomplete filesystem evidence', () => {
    const observation = { fixtureCreated: true, sameEntry: { resolves: true }, nativeReadUnicode: { ok: false, code: 'POLICY_DENIED' }, hostPolicyCode: 'POLICY_DENIED', direction: 'unicode-stored_ascii-request' };
    const report = { plannedPairs: 1, completedPairs: 1, lookupErrors: [], nativeProbeErrors: [], filesystem: { apfsReported: true }, results: [{ sensitive: true, codePoint: 'U+FB01', unicode: '.conﬁg', observations: [observation] }] };
    assert.deepEqual(gateFailures(report), []);
    for (const n of [{ ok: true }, undefined, { ok: false, code: 'PATH_DENIED' }, { ok: false, code: 'BOUNDARY_UNSUPPORTED' }]) {
      observation.nativeReadUnicode = n; assert.ok(gateFailures(report).length);
    }
    observation.nativeReadUnicode = { ok: false, code: 'POLICY_DENIED' }; observation.hostPolicyCode = 'ALLOWED'; assert.ok(gateFailures(report).length);
    observation.hostPolicyCode = 'POLICY_DENIED'; report.filesystem.apfsReported = false; assert.ok(gateFailures(report).includes('APFS_IDENTITY_UNCONFIRMED'));
    report.filesystem.apfsReported = true; report.completedPairs = 0; assert.ok(gateFailures(report).includes('INCOMPLETE_PROBE'));
  });
  console.log('C1B_V3_CONTROL_PASS', count, '(logic/simulated; no native OS qualification)');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await service.close(); fs.rmSync(base, { recursive: true, force: true }); });
