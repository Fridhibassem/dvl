const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const p = require('../read-policy.json');
let result = '/* Generated from read-policy.json; do not hand-edit. */\n';
for (const [key, values] of Object.entries(p)) {
  if (key === 'searchExclusions') continue;
  if (!Array.isArray(values) || values.some(s => typeof s !== 'string' || !/^[\x20-\x7e]+$/.test(s))) throw new Error('Invalid policy table');
  result += `static const char *policy_${key}[]={${values.map(s => JSON.stringify(s)).join(',')},NULL};\n`;
}
fs.writeFileSync(path.join(root, 'native/read-policy.h'), result);
