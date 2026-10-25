'use strict';
const os = require('node:os');
const { fs, path, verifySource, fileHash, readLog } = require('./common.cjs');
async function discover(source) {
  source = verifySource(source);
  const packageRoot = path.join(source, 'node_modules/electron');
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json')));
  const executable = fs.realpathSync(path.join(packageRoot, 'dist', fs.readFileSync(path.join(packageRoot, 'path.txt'), 'utf8').trim()));
  const roots = [...new Set([
    path.join(os.homedir(), 'Library/Caches/electron'), path.join(os.homedir(), '.cache/electron'),
    process.env.ELECTRON_CACHE, process.env.electron_config_cache, process.env.npm_config_electron_cache,
    process.env.XDG_CACHE_HOME && path.join(process.env.XDG_CACHE_HOME, 'electron')
  ].filter(Boolean).map(value => path.resolve(value)))];
  const matches = [], scannedRoots = [], errors = []; let entries = 0;
  function walk(directory, depth = 0) {
    if (depth > 12 || ++entries > 10000) throw Error('Cache discovery limit reached; pass an explicit ZIP path to preflight');
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) walk(file, depth + 1);
      else if (item.isFile() && item.name === 'electron-v44.7.2-darwin-x64.zip') matches.push(file);
    }
  }
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    scannedRoots.push(root);
    try { walk(root); } catch (error) { errors.push({ root, error: error.message }); }
  }
  const logFile = path.join(os.homedir(), 'Library/Application Support/dvl-desktop/logs/dvl.log');
  const log = fs.existsSync(logFile) ? { path: fs.realpathSync(logFile), ...readLog(logFile).summary } : null;
  console.log(JSON.stringify({ action: 'Read-only discovery; no Electron require, download or app launch', source,
    electronVersion: pkg.version, executable, executableSha256: await fileHash(executable),
    cacheDiscovery: { scannedRoots, matchingZips: matches, errors, note: 'Candidate paths only; preflight verifies hashes and compares ZIP binaries with installed files.' },
    expectedAppLog: logFile, existingAppLog: log,
    next: 'Return this output before preflight or launch 1. If cache or log is missing, locate it; do not silently skip.' }, null, 2));
  if (!matches.length || !log || errors.length) process.exitCode = 1;
}
if (require.main === module) {
  const [source] = process.argv.slice(2);
  if (!source) { console.error('Usage: node discover.cjs R1_SOURCE_DIR'); process.exitCode = 1; }
  else discover(source).catch(error => { console.error('DISCOVERY_FAILED:', error.message); process.exitCode = 1; });
}
