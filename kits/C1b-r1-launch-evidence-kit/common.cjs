'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const MANIFEST = '9e1183df128a8c96d45bf5b679ddc991becc204c16edc18aeb00191a03156d2a';
function verifySource(source) {
  source = fs.realpathSync(source);
  const bytes = fs.readFileSync(path.join(source, 'SOURCE_SHA256.json'));
  if (hash(bytes) !== MANIFEST) throw Error('Not the delivered R1 source manifest');
  for (const [name, digest] of Object.entries(JSON.parse(bytes))) {
    if (path.isAbsolute(name) || name.split('/').some(p => !p || p === '..')) throw Error('Unsafe manifest path');
    const file = path.join(source, name), st = fs.lstatSync(file);
    if (!st.isFile() || st.isSymbolicLink() || hash(fs.readFileSync(file)) !== digest) throw Error('Source mismatch: ' + name);
  }
  return source;
}
async function fileHash(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function tree(root) {
  const rows = [];
  async function walk(relative) {
    const file = path.join(root, relative), st = fs.lstatSync(file);
    if (st.isSymbolicLink()) rows.push({ path: relative, type: 'symlink', target: fs.readlinkSync(file) });
    else if (st.isDirectory()) {
      if (relative) rows.push({ path: relative, type: 'directory', mode: st.mode & 0o777 });
      for (const name of fs.readdirSync(file).sort()) await walk(relative ? relative + '/' + name : name);
    } else if (st.isFile()) rows.push({ path: relative, type: 'file', bytes: st.size, mode: st.mode & 0o777, sha256: await fileHash(file) });
    else throw Error('Unsupported distribution entry: ' + relative);
  }
  await walk('');
  return { entries: rows, treeSha256: hash(JSON.stringify(rows)) };
}
async function runtimeIdentity(source) {
  // Read path.txt directly: requiring electron could download a missing runtime.
  const packageRoot = path.join(source, 'node_modules/electron');
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json')));
  if (pkg.version !== '44.7.2') throw Error('Expected Electron 44.7.2');
  const relative = fs.readFileSync(path.join(packageRoot, 'path.txt'), 'utf8').trim();
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw Error('Unsafe Electron path.txt');
  const dist = fs.realpathSync(path.join(packageRoot, 'dist'));
  const executable = fs.realpathSync(path.join(dist, relative));
  if (!executable.startsWith(dist + path.sep)) throw Error('Electron executable escapes dist');
  const distribution = await tree(dist);
  const bin = path.join(source, 'bin/project-reader');
  return { version: pkg.version, dist, executable, executableSha256: await fileHash(executable), distribution,
    packageJsonSha256: await fileHash(path.join(packageRoot, 'package.json')),
    pathTxtSha256: await fileHash(path.join(packageRoot, 'path.txt')),
    nativeReaderSha256: await fileHash(bin), nativeReaderIntegritySha256: await fileHash(path.join(source, 'bin/reader-integrity.json')) };
}
function readLog(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd, { bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || BigInt(bytes.length) !== after.size) throw Error('Log changed while snapshotting; close other app instances');
    let newlines = 0;
    for (const byte of bytes) if (byte === 10) newlines++;
    const terminated = bytes.length === 0 || bytes[bytes.length - 1] === 10;
    return { bytes, summary: { bytes: bytes.length, newlineCount: newlines, logicalLineCount: newlines + (terminated ? 0 : 1),
      endsWithNewline: terminated, sha256: hash(bytes), device: String(after.dev), inode: String(after.ino) } };
  } finally { fs.closeSync(fd); }
}
function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, timeout: 15000 });
  if (result.error || result.status !== 0) throw Error('Failed: ' + command + ' ' + args.join(' '));
  return result.stdout.trim();
}
function environment() {
  return { node: process.version, platform: process.platform, arch: process.arch,
    swVers: commandOutput('/usr/bin/sw_vers', []), archCommand: commandOutput('/usr/bin/arch', []), unameMachine: commandOutput('/usr/bin/uname', ['-m']) };
}
function zipEntryHash(zip, entry) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/unzip', ['-p', zip, entry], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const digest = crypto.createHash('sha256'); let stderr = '', bytes = 0;
    child.stdout.on('data', chunk => { digest.update(chunk); bytes += chunk.length; });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve({ entry, bytes, sha256: digest.digest('hex') }) : reject(Error('ZIP read failed: ' + stderr)));
  });
}
async function cacheIdentity(zip, runtime) {
  zip = fs.realpathSync(zip);
  const names = commandOutput('/usr/bin/unzip', ['-Z1', zip]).split('\n');
  const relativeExecutable = path.relative(runtime.dist, runtime.executable).split(path.sep).join('/');
  const framework = runtime.distribution.entries.filter(r => r.type === 'file' && r.path.endsWith('/Electron Framework'));
  if (framework.length !== 1) throw Error('Expected exactly one real Electron Framework binary');
  const comparisons = [];
  for (const relative of [relativeExecutable, framework[0].path]) {
    if (names.filter(name => name === relative).length !== 1) throw Error('ZIP entry missing/ambiguous: ' + relative);
    const result = await zipEntryHash(zip, relative);
    const installed = runtime.distribution.entries.find(r => r.type === 'file' && r.path === relative);
    if (!installed || installed.sha256 !== result.sha256 || installed.bytes !== result.bytes) throw Error('Cached ZIP differs from installed binary: ' + relative);
    comparisons.push({ ...result, matchesInstalled: true });
  }
  return { path: zip, bytes: fs.statSync(zip).size, sha256: await fileHash(zip), binaryComparisons: comparisons,
    limit: 'Current cache archive: executable and Electron Framework match installed files. This is not retrospective proof of the download or vendor provenance.' };
}
function bindFiles(directory) {
  const rows = fs.readdirSync(directory).filter(name => name !== 'SHA256SUMS.txt').sort().map(name => {
    const file = path.join(directory, name);
    if (!fs.lstatSync(file).isFile()) throw Error('Unexpected nested capture entry');
    return hash(fs.readFileSync(file)) + '  ' + name;
  });
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), rows.join('\n') + '\n', { flag: 'wx' });
}
module.exports = { fs, path, hash, writeJSON, MANIFEST, verifySource, fileHash, tree, runtimeIdentity, readLog, environment, cacheIdentity, bindFiles };
