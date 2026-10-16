'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const policy = require('../../read-policy.json');
const failure = code => Object.assign(new Error(code), { code });
const errors = new Set(['INVALID_REQUEST', 'PATH_DENIED', 'POLICY_DENIED', 'PROJECT_UNAVAILABLE', 'BOUNDARY_UNSUPPORTED', 'NOT_FOUND', 'PERMISSION_DENIED', 'SYMLINK_DENIED', 'HARDLINK_DENIED', 'NOT_REGULAR_FILE', 'FILE_TOO_LARGE', 'FILE_CHANGED', 'DIRECTORY_CHANGED', 'RUNTIME_FAILED']);
function within(a, b) { const rel = path.relative(a, b); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); }
function canonical(p) {
  p = path.resolve(p);
  try { return fs.realpathSync(p); } catch {
    const parent = path.dirname(p); return parent === p ? p : path.join(canonical(parent), path.basename(p));
  }
}
function ancestor(a, b) {
  if (within(a, b)) return true;
  // Filesystem identity handles case/normalization aliases in existing paths.
  let st; try { st = fs.statSync(a, { bigint: true }); } catch { return false; }
  for (let p = b, n = 0; n < 256; n++, p = path.dirname(p)) {
    try { const other = fs.statSync(p, { bigint: true }); if (st.dev === other.dev && st.ino === other.ino) return true; } catch {}
    if (path.dirname(p) === p) break;
  } return false;
}
function rootAllowed(root, userDataPath) {
  const home = canonical(os.homedir());
  if (policy.rootExact.some(x => canonical(x) === root || (fs.existsSync(x) && ancestor(root, canonical(x)) && ancestor(canonical(x), root)))) return false;
  if (policy.rootTrees.some(x => ancestor(canonical(x), root))) return false;
  if (ancestor(root, home)) return false;
  const userData = canonical(userDataPath || path.join(home, process.platform === 'darwin' ? 'Library/Application Support/dvl-desktop' : '.config/dvl-desktop'));
  const protectedTrees = [...policy.homeTrees.map(p => canonical(path.join(home, p))), userData];
  return !protectedTrees.some(p => ancestor(root, p) || ancestor(p, root));
}
function validateNative(out, op) {
  const bad = () => { throw failure('RUNTIME_FAILED'); };
  if (!out || typeof out !== 'object' || Array.isArray(out) || typeof out.ok !== 'boolean') bad();
  const keys = out.ok ? (op === 'read' ? ['ok', 'mode', 'hex', 'bytes', 'dev', 'ino'] : ['ok', 'mode', 'entries', 'offset', 'more', 'limited', 'skipped', 'dev', 'ino', 'stamp']) : ['ok', 'error'];
  if (Object.keys(out).length !== keys.length || Object.keys(out).some(k => !keys.includes(k))) bad();
  if (!out.ok) { if (!errors.has(out.error)) bad(); return out; }
  if (!['seatbelt', 'landlock'].includes(out.mode)) bad();
  for (const key of ['dev', 'ino']) if (typeof out[key] !== 'string' || !/^\d{1,20}$/.test(out[key]) || BigInt(out[key]) > 18446744073709551615n) bad();
  if (op === 'read') {
    if (!Number.isInteger(out.bytes) || out.bytes < 0 || out.bytes > 1048576 || typeof out.hex !== 'string' || out.hex.length !== out.bytes * 2 || /[^0-9a-f]/.test(out.hex)) bad();
  } else {
    if (!Number.isInteger(out.offset) || out.offset < 0 || out.offset > 10000 || !Number.isInteger(out.skipped) || out.skipped < 0 || out.skipped > 10000 || typeof out.more !== 'boolean' || typeof out.limited !== 'boolean' || typeof out.stamp !== 'string' || !/^\d{1,20}:\d{1,9}:\d{1,20}:\d{1,9}$/.test(out.stamp)) bad();
    if (!Array.isArray(out.entries) || out.entries.length > 200) bad();
    for (const e of out.entries) {
      if (!e || Object.keys(e).length !== 3 || Object.keys(e).some(k => !['nameHex', 'kind', 'size'].includes(k)) || !['file', 'directory'].includes(e.kind) || !Number.isSafeInteger(e.size) || e.size < 0 || typeof e.nameHex !== 'string' || !e.nameHex.length || e.nameHex.length > 8192 || e.nameHex.length % 2 || /[^0-9a-f]/.test(e.nameHex)) bad();
    }
  } return out;
}
const yieldLoop = () => new Promise(resolve => setImmediate(resolve));
// Linear code-point counting, bounded snippet allocation, cooperative CPU chunks.
async function matchText(text, query, relativePath, matches, check) {
  let lineStart = 0, lineNumber = 1, work = 0;
  while (lineStart <= text.length) {
    if (++work % 256 === 0) { await yieldLoop(); check(); }
    let end = text.indexOf('\n', lineStart); if (end < 0) end = text.length;
    const line = text.slice(lineStart, end);
    let searchFrom = 0, counted = 0, column = 1, at;
    while ((at = line.indexOf(query, searchFrom)) >= 0) {
      for (; counted < at; counted++) {
        const c = line.charCodeAt(counted); if (c >= 0xd800 && c <= 0xdbff && counted + 1 < at) counted++;
        column++;
        if (++work % 16384 === 0) { await yieldLoop(); check(); }
      }
      let start = Math.max(0, at - 40), stop = Math.min(line.length, at + query.length + 480);
      if (start > 0 && line.charCodeAt(start) >= 0xdc00 && line.charCodeAt(start) <= 0xdfff) start--;
      if (stop < line.length && line.charCodeAt(stop) >= 0xdc00 && line.charCodeAt(stop) <= 0xdfff) stop++;
      const snippet = Array.from(line.slice(start, stop)).slice(0, 240).join('');
      matches.push({ relativePath, line: lineNumber, column, snippet });
      if (matches.length >= 200) return 'MATCH_LIMIT';
      searchFrom = at + query.length;
      if (++work % 16 === 0) { await yieldLoop(); check(); }
    }
    if (end === text.length) break;
    lineStart = end + 1; lineNumber++;
  } check(); return null;
}
module.exports = { policy, rootAllowed, validateNative, matchText, yieldLoop };
