const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
require('./generate-policy.cjs');
if (!['darwin', 'linux'].includes(process.platform)) throw new Error('BOUNDARY_UNSUPPORTED');
fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
const args = ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-Wno-misleading-indentation', path.join(root, 'native/project-reader.c'), '-o', path.join(root, 'bin/project-reader')];
if (process.platform === 'darwin') args.push('-Wno-deprecated-declarations', '-lsandbox');
const manifest = path.join(root, 'bin/reader-integrity.json');
fs.rmSync(manifest, { force: true });
const result = spawnSync('cc', args, { stdio: 'inherit', shell: false, timeout: 30000 });
if (result.error || result.status !== 0) { console.error('Native reader build failed; no fallback is enabled.'); process.exitCode = 1; }

if (!result.error && result.status === 0) {
  fs.writeFileSync(manifest, JSON.stringify({ platform: process.platform, arch: process.arch, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'bin/project-reader'))).digest('hex') }, null, 2) + '\n');
}
