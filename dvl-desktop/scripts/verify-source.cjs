'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'SOURCE_SHA256.json'), 'utf8'));
  let checked = 0;
  for (const [name, expected] of Object.entries(manifest)) {
    if (!name || path.isAbsolute(name) || name.split('/').some(p => p === '..' || p === '') || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid source manifest');
    const file = path.join(root, name), st = fs.lstatSync(file);
    if (!st.isFile() || st.isSymbolicLink() || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) throw new Error('SOURCE_MISMATCH: ' + name);
    checked++;
  }
  console.log('C1B SOURCE MATCH PASS:', checked, 'entries');
} catch (e) { console.error(e.message); process.exitCode = 1; }
