'use strict';
// Audit helper outside the V3 candidate. Read-only: never rewrites either gate.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const source = path.resolve(process.argv[2] || '.');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected-identities.json')));
const frozen = fs.readFileSync(path.join(__dirname, 'references/frozen-B-green-gate.cjs'), 'utf8');
const candidate = fs.readFileSync(path.join(source, 'tests/green-gate.cjs'), 'utf8');
assert.equal(digest(frozen), 'a1c599efc9859812486462c91102c0dbcc55583dd33e79c5e17c4f825e8f4d4c');
assert.equal(digest(candidate), expected.v3Gate);
assert.equal(digest(fs.readFileSync(path.join(source, 'SOURCE_SHA256.json'))), expected.v3SourceManifest);
const names = text => Array.from(text.matchAll(/await test\('((?:\\.|[^'\\])*)'/g), m => m[1]);
// Assertions can share a physical line with setup. Compare the entire suffix
// beginning at the first assert on each such line, including every later assert.
const assertionLines = text => text.split('\n').filter(line => /\bassert\./.test(line)).map(line => line.slice(line.indexOf('assert.')));
const physicalLines = text => text.split('\n').filter(line => /\bassert\./.test(line));
assert.equal(names(frozen).length, 24); assert.deepEqual(names(candidate), names(frozen));
assert.deepEqual(assertionLines(candidate), assertionLines(frozen));
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'approved-harness-adaptations.json')));
assert.equal(rules.length, 5);
let normalized = candidate;
for (const rule of rules) {
  assert.equal(normalized.split(rule.new).length, 2, 'Expected unique known harness change: ' + rule.purpose);
  normalized = normalized.replace(rule.new, rule.old);
}
assert.equal(normalized, frozen, 'An unapproved difference remains outside harness adaptations');
const raw = physicalLines(frozen), newer = physicalLines(candidate);
assert.equal(raw.length, newer.length);
const physicalPrefixDifferences = raw.filter((line, i) => line !== newer[i]).length;
assert.equal(physicalPrefixDifferences, 1); // awaited shutdown/setup prefix only
const report = {
  result: 'PASS', frozenGateSha256: digest(frozen), v3GateSha256: digest(candidate),
  testNames: names(frozen).length, testNameDifferences: 0,
  assertionBearingSuffixLines: assertionLines(frozen).length, assertionSuffixDifferences: 0,
  assertionCalls: (frozen.match(/\bassert\.[A-Za-z]+\(/g) || []).length,
  approvedHarnessChanges: rules.map(rule => rule.purpose),
  fullFileDifferencesAfterOnlyApprovedHarnessReversal: 0,
  normalizedSha256: digest(normalized),
  rawAssertionBearingPhysicalLineDifferences: physicalPrefixDifferences,
  physicalLineExplanation: 'One mixed setup/assertion line adds async/await and a mock before-quit event; its complete assertion suffix is byte-identical.',
  evidenceClass: 'Static automated source comparison, not frozen B runtime qualification'
};
console.log(JSON.stringify(report, null, 2));
