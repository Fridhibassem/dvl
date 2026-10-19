'use strict';
const unicodePolicy = require('../../name-policy-unicode.json');
const seen = new Set();
const unicodeCharacters = Object.freeze(unicodePolicy.codePoints.map(value => {
  if (typeof value !== 'string' || !/^U\+[0-9A-F]{4,6}$/.test(value)) throw new Error('Invalid name policy');
  const n = parseInt(value.slice(2), 16);
  if (n <= 127 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff) || seen.has(n)) throw new Error('Invalid name policy');
  seen.add(n); return String.fromCodePoint(n);
}));
const hasGuardedCharacter = name => unicodeCharacters.some(c => name.includes(c));
module.exports = { unicodeCharacters, hasGuardedCharacter };
