const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const p = require('../read-policy.json');
const { unicodeCharacters } = require('../src/main/name-policy.cjs');
let result = '/* Generated from read-policy.json and name-policy-unicode.json; do not hand-edit. */\n';
const table = { ...p, homeTrees: [...new Set([...p.homeTrees, ...p.deniedNames.filter(n => n.startsWith('.'))])].sort() };
for (const [key, values] of Object.entries(table)) {
  if (key === 'searchExclusions') continue;
  if (!Array.isArray(values) || values.some(s => typeof s !== 'string' || !/^[\x20-\x7e]+$/.test(s))) throw new Error('Invalid policy table');
  result += `static const char *policy_${key}[]={${values.map(s => JSON.stringify(s)).join(',')},NULL};\n`;
}
result += `static const char *policy_deniedUnicodeUtf8[]={${unicodeCharacters.map(s => '"' + [...Buffer.from(s)].map(b => '\\x' + b.toString(16).padStart(2, '0')).join('') + '"').join(',')},NULL};\n`;
fs.writeFileSync(path.join(root, 'native/read-policy.h'), result);
