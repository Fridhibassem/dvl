'use strict';
// External developer probe. Only disposable sibling fixtures are written.
// Production V2 source, selected project contents and privacy settings are not edited.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const DATA = {"sourceUrl":"https://www.unicode.org/Public/18.0.0/ucd/CaseFolding.txt","sourceHeader":"# CaseFolding-18.0.0.txt","webLineCoverage":{"observed":1702,"total":1702},"algorithm":"Unicode default full case folding (C+F; S/T excluded)","asciiInputMappings":26,"nonAsciiToAscii":[{"codePoint":"U+00DF","character":"ß","mapping":"ss","status":"F"},{"codePoint":"U+017F","character":"ſ","mapping":"s","status":"C"},{"codePoint":"U+1E9E","character":"ẞ","mapping":"ss","status":"F"},{"codePoint":"U+212A","character":"K","mapping":"k","status":"C"},{"codePoint":"U+FB00","character":"ﬀ","mapping":"ff","status":"F"},{"codePoint":"U+FB01","character":"ﬁ","mapping":"fi","status":"F"},{"codePoint":"U+FB02","character":"ﬂ","mapping":"fl","status":"F"},{"codePoint":"U+FB03","character":"ﬃ","mapping":"ffi","status":"F"},{"codePoint":"U+FB04","character":"ﬄ","mapping":"ffl","status":"F"},{"codePoint":"U+FB05","character":"ﬅ","mapping":"st","status":"F"},{"codePoint":"U+FB06","character":"ﬆ","mapping":"st","status":"F"},{"codePoint":"U+1DF95","character":"𝾕","mapping":"ss","status":"F"}],"turkicOnlyASCII":[{"codePoint":"U+0130","character":"İ","mapping":"i","status":"T"}],"scope":"All non-ASCII single code points in this pinned data whose default full fold consists entirely of ASCII. Not compatibility normalization, confusable detection, or proof of APFS equivalence.","retrievedLineCoverage":1702};
const EXPECTED_V2_MANIFEST = '1fe5d5b6ec03b209d01771d4ed31d6c08d0b7263e3bf7e17328619dae80c9e09';
const existingFour = new Set(['U+00DF', 'U+017F', 'U+1E9E', 'U+212A']);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function buildPairs(policy) {
  const templates = [...new Set([...policy.deniedNames, ...policy.deniedPrefixes.map(p => p + 'probe'), ...policy.deniedExtensions.map(p => 'ordinary' + p)])];
  assert.ok(templates.every(s => /^[\x20-\x7e]+$/.test(s) && !/[\\/:\0]/.test(s)));
  const pairs = [];
  for (const mapping of [...DATA.nonAsciiToAscii, ...DATA.turkicOnlyASCII]) {
    const kind = mapping.status === 'T' ? 'turkic-only' : 'default-full';
    pairs.push({ ...mapping, kind, sensitive: false, ascii: 'probe_' + mapping.mapping + '_end.txt', unicode: 'probe_' + mapping.character + '_end.txt' });
    for (const ascii of templates) {
      for (let i = ascii.indexOf(mapping.mapping); i >= 0; i = ascii.indexOf(mapping.mapping, i + 1)) {
        pairs.push({ ...mapping, kind, sensitive: true, ascii, unicode: ascii.slice(0, i) + mapping.character + ascii.slice(i + mapping.mapping.length) });
      }
    }
  }
  return pairs.filter((p, i, all) => all.findIndex(q => q.kind === p.kind && q.sensitive === p.sensitive && q.ascii === p.ascii && q.unicode === p.unicode) === i);
}
function lookup(file, expected) {
  try { const st = fs.statSync(file, { bigint: true }); return { resolves: st.dev === expected.dev && st.ino === expected.ino, exists: true, error: null }; }
  catch (e) { if (e.code === 'ENOENT') return { resolves: false, exists: false, error: null }; return { resolves: null, exists: null, error: e.code || 'STAT_FAILED' }; }
}
function nativeRead(helper, root, rel, validateNative) {
  const st = fs.statSync(root, { bigint: true });
  const r = spawnSync(helper, [], { shell: false, env: {}, encoding: 'utf8', timeout: 7000, maxBuffer: 10000,
    input: `read\n${Buffer.from(root).toString('hex')}\n${Buffer.from(rel).toString('hex')}\n0 ${st.dev} ${st.ino}\n` });
  if (r.error) return { ok: false, probeError: r.error.code || 'SPAWN_FAILED' };
  try {
    const out = validateNative(JSON.parse(r.stdout), 'read');
    return out.ok ? { ok: true, mode: out.mode, fixtureBytesMatched: Buffer.from(out.hex, 'hex').toString() === 'DVL_DISPOSABLE_FOLD_FIXTURE' } : { ok: false, code: out.error };
  } catch { return { ok: false, probeError: 'INVALID_NATIVE_RESPONSE', exitCode: r.status }; }
}
function filesystemInfo(root) {
  const statfs = fs.statfsSync(root), r = spawnSync('/usr/sbin/diskutil', ['info', '-plist', root], { encoding: 'utf8', timeout: 5000, shell: false });
  const plist = r.status === 0 ? r.stdout : '';
  const fields = Object.fromEntries(Array.from(plist.matchAll(/<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g), m => [m[1], m[2]]).filter(([key]) => /^(FilesystemType|FilesystemName|FileSystemPersonality)$/.test(key)));
  return { statfsType: String(statfs.type), diskutilFields: fields, diskutilSucceeded: r.status === 0, apfsReported: Object.values(fields).some(s => /apfs/i.test(s)) };
}
function verifySource(source) {
  assert.equal(digest(fs.readFileSync(path.join(source, 'SOURCE_SHA256.json'))), EXPECTED_V2_MANIFEST, 'Expected the retained V2 source manifest');
  for (const [name, hash] of Object.entries(JSON.parse(fs.readFileSync(path.join(source, 'SOURCE_SHA256.json'))))) {
    assert.ok(!path.isAbsolute(name) && !name.split('/').some(p => p === '..' || !p));
    const p = path.join(source, name); assert.ok(fs.lstatSync(p).isFile() && !fs.lstatSync(p).isSymbolicLink());
    assert.equal(digest(fs.readFileSync(p)), hash, 'Source mismatch: ' + name);
  }
}
function selfTest() {
  assert.equal(DATA.nonAsciiToAscii.length, 12); assert.equal(DATA.asciiInputMappings, 26);
  assert.equal(new Set(DATA.nonAsciiToAscii.map(x => x.codePoint)).size, 12);
  for (const row of DATA.nonAsciiToAscii) { assert.ok(['C', 'F'].includes(row.status)); assert.match(row.mapping, /^[\x00-\x7f]+$/); assert.ok(row.character.codePointAt(0) > 127); }
  const pairs = buildPairs({ deniedNames: ['.config', '.password-store', 'credentials.json'], deniedPrefixes: ['id_rsa'], deniedExtensions: ['.tfstate'] });
  assert.ok(pairs.some(p => p.ascii === '.config' && p.unicode === '.conﬁg'));
  assert.ok(pairs.some(p => p.ascii === 'ordinary.tfstate' && p.unicode === 'ordinary.tfﬆate'));
  assert.ok(pairs.some(p => p.codePoint === 'U+1DF95' && p.sensitive));
  assert.ok(pairs.some(p => p.codePoint === 'U+0130' && p.kind === 'turkic-only'));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-fold-selftest-'));
  try {
    const p = path.join(base, 'entry'); fs.writeFileSync(p, 'test'); const st = fs.statSync(p, { bigint: true });
    assert.equal(lookup(p, st).resolves, true); assert.equal(lookup(path.join(base, 'missing'), st).resolves, false);
    const q = path.join(base, 'different'); fs.writeFileSync(q, 'test'); assert.equal(lookup(q, st).resolves, false);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
  console.log('UNICODE_PROBE_LOGIC_SELFTEST_PASS (data/pair generation/inode identity only; no Mac/APFS/native claim)');
}
function main(source, target, output) {
  if (process.platform !== 'darwin') throw new Error('Actual alias probe requires the target Mac; --self-test is logic-only');
  source = fs.realpathSync(source); target = fs.realpathSync(target); output = path.resolve(output);
  assert.ok(fs.statSync(target).isDirectory(), 'Target project must be a directory');
  if (fs.existsSync(output)) throw new Error('Refusing to overwrite an existing report: ' + output);
  assert.ok(!output.startsWith(target + path.sep) && !output.startsWith(source + path.sep), 'Save evidence outside project/source');
  verifySource(source);
  const { verifyHelper } = require(path.join(source, 'src/main/desktop-reader.cjs'));
  const { validateNative } = require(path.join(source, 'src/main/read-support.cjs'));
  const helper = path.join(source, 'bin/project-reader');
  assert.equal(verifyHelper(helper, path.join(source, 'bin/reader-integrity.json')), true, 'Rebuild/qualify V2 first; helper integrity failed');
  const policy = JSON.parse(fs.readFileSync(path.join(source, 'read-policy.json'))), pairs = buildPairs(policy);
  const base = fs.realpathSync(fs.mkdtempSync(path.join(path.dirname(target), 'DVL_DISPOSABLE_UNICODE_PROBE_')));
  const report = { startedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, node: process.version,
    osRelease: os.release(), targetProject: target, sourceManifestSha256: EXPECTED_V2_MANIFEST,
    caseFoldingData: DATA, scope: 'Single-code-point default full fold to ASCII, plus a separate Turkic-only diagnostic. Not all Unicode/APFS equivalences.', results: [] };
  try {
    const targetStat = fs.statSync(target, { bigint: true }), fixtureStat = fs.statSync(base, { bigint: true });
    assert.equal(fixtureStat.dev, targetStat.dev, 'Fixture must be on target project filesystem');
    report.sameDeviceAsProject = true; report.filesystem = filesystemInfo(base);
    const caseDir = path.join(base, 'case-sensitivity'); fs.mkdirSync(caseDir); const caseFile = path.join(caseDir, 'ASCII_CASE_PROBE'); fs.writeFileSync(caseFile, 'case', { flag: 'wx' });
    report.asciiCaseAlias = lookup(path.join(caseDir, 'ascii_case_probe'), fs.statSync(caseFile, { bigint: true }));
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i], row = { ...pair, currentlyBroadRejected: existingFour.has(pair.codePoint), observations: [] };
      for (const direction of ['ascii-stored_unicode-request', 'unicode-stored_ascii-request']) {
        const dir = path.join(base, 'pair-' + i + '-' + (direction.startsWith('ascii') ? 'a' : 'u')); fs.mkdirSync(dir);
        const stored = direction.startsWith('ascii') ? pair.ascii : pair.unicode, requested = direction.startsWith('ascii') ? pair.unicode : pair.ascii;
        const file = path.join(dir, stored); fs.writeFileSync(file, 'DVL_DISPOSABLE_FOLD_FIXTURE', { flag: 'wx' });
        const observedNames = fs.readdirSync(dir); assert.equal(observedNames.length, 1);
        const observation = { direction, sameEntry: lookup(path.join(dir, requested), fs.statSync(file, { bigint: true })),
          observedStoredNameHex: Buffer.from(observedNames[0]).toString('hex') };
        if (direction.startsWith('unicode') && pair.sensitive) observation.v2NativeReadStoredUnicode = nativeRead(helper, base, path.relative(base, file).split(path.sep).join('/'), validateNative);
        row.observations.push(observation);
      }
      report.results.push(row);
      console.log('ALIAS_RESOLUTION', pair.codePoint, JSON.stringify(pair.unicode), 'sensitive=' + pair.sensitive, row.observations.map(o => o.sameEntry.resolves).join('/'));
    }
    report.additionalSensitiveAliasCharacters = [...new Set(report.results.filter(r => r.sensitive && !r.currentlyBroadRejected && r.observations.some(o => o.sameEntry.resolves === true)).map(r => r.codePoint))];
    report.genericOnlyAdditionalAliases = [...new Set(report.results.filter(r => !r.sensitive && !r.currentlyBroadRejected && r.observations.some(o => o.sameEntry.resolves === true)).map(r => r.codePoint))].filter(cp => !report.additionalSensitiveAliasCharacters.includes(cp));
    report.nativeReadsAllowedForResolvingSensitiveAliases = report.results.filter(r => r.sensitive && r.observations.some(o => o.sameEntry.resolves === true) && r.observations.some(o => o.v2NativeReadStoredUnicode?.ok === true)).map(r => ({ codePoint: r.codePoint, ascii: r.ascii, unicode: r.unicode }));
    report.lookupErrors = report.results.flatMap(r => r.observations.filter(o => o.sameEntry.error).map(o => ({ codePoint: r.codePoint, direction: o.direction, error: o.sameEntry.error })));
    report.nativeProbeErrors = report.results.flatMap(r => r.observations.filter(o => {
      const n = o.v2NativeReadStoredUnicode;
      return n && (n.probeError || (!n.ok && !['POLICY_DENIED', 'PATH_DENIED'].includes(n.code)));
    }).map(o => ({ codePoint: r.codePoint, error: o.v2NativeReadStoredUnicode.probeError || o.v2NativeReadStoredUnicode.code })));
    report.result = report.lookupErrors.length || report.nativeProbeErrors.length ? 'INCOMPLETE_PROBE' : 'OBSERVATIONS_COMPLETE_NOT_A_SECURITY_PASS';
  } finally {
    try { fs.rmSync(base, { recursive: true, force: true }); report.fixturesRemoved = true; }
    catch (e) { report.fixturesRemoved = false; report.cleanupError = e.code || 'CLEANUP_FAILED'; }
    report.finishedAt = new Date().toISOString(); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  console.log('UNICODE_ALIAS_REPORT', output);
  console.log('ADDITIONAL_SENSITIVE_ALIASES', JSON.stringify(report.additionalSensitiveAliasCharacters));
  console.log('V2_ALLOWED_SENSITIVE_ALIAS_READS', JSON.stringify(report.nativeReadsAllowedForResolvingSensitiveAliases));
  if (report.result === 'INCOMPLETE_PROBE' || !report.fixturesRemoved) process.exitCode = 1;
}
if (process.argv[2] === '--self-test') selfTest();
else if (process.argv.length !== 5) { console.error('Usage: node probe-unicode-aliases.cjs V2_SOURCE TARGET_PROJECT OUTPUT_JSON'); process.exitCode = 1; }
else { try { main(...process.argv.slice(2)); } catch (e) { console.error('PROBE_FAILED:', e.message); process.exitCode = 1; } }
