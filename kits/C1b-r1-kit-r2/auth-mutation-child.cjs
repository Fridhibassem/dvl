'use strict';
// Isolated child. Only the in-memory method changes; restore original reference.
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = process.argv[2], mutation = process.argv[3];
assert.ok(source && path.isAbsolute(source));
const { DesktopReader } = require(path.join(source, 'src/main/desktop-reader.cjs'));
const original = DesktopReader.prototype.isTrusted;
let restored = false;
function restore() {
  if (restored) return;
  DesktopReader.prototype.isTrusted = original;
  assert.strictEqual(DesktopReader.prototype.isTrusted, original);
  restored = true; process.stdout.write('KIT_ORIGINAL_IS_TRUSTED_RESTORED\n');
}
process.once('beforeExit', restore);
process.once('exit', restore); // also restore on an explicit synchronous exit
if (mutation !== 'baseline') {
  const method = original.toString(), match = method.match(/return (!!win[\s\S]*?);/);
  assert.ok(match); const clauses = match[1].split('&&').map(c => c.trim()); assert.equal(clauses.length, 8);
  let expression = 'false';
  if (mutation !== 'always-deny') {
    const index = Number(mutation); assert.ok(Number.isInteger(index) && index >= 0 && index < clauses.length);
    expression = clauses.filter((_c, i) => i !== index).join(' && ');
  }
  DesktopReader.prototype.isTrusted = vm.runInNewContext('({' + method.replace(match[0], 'return ' + expression + ';') + '}).isTrusted');
}
require(path.join(source, 'tests/c1b-b-auth.cjs'));
