'use strict';
// Test-only process-local mutation. Never writes/imports a replacement source file.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { DesktopReader } = require('../src/main/desktop-reader.cjs');
const original = DesktopReader.prototype.isTrusted.toString();
const match = original.match(/return (!!win[\s\S]*?);/); assert.ok(match);
const clauses = match[1].split('&&').map(x => x.trim()); assert.equal(clauses.length, 8);
const mutation = process.argv[2];
let expression;
if (mutation === 'always-deny') expression = 'false';
else {
  const index = Number(mutation); assert.ok(Number.isInteger(index) && index >= 0 && index < clauses.length);
  expression = clauses.filter((_c, i) => i !== index).join(' && ');
}
const changed = original.replace(match[0], 'return ' + expression + ';');
DesktopReader.prototype.isTrusted = vm.runInNewContext('({' + changed + '}).isTrusted');
require('./c1b-b-auth.cjs');
