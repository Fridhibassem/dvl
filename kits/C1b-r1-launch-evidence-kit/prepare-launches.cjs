'use strict';
const { fs, path, hash, writeJSON, verifySource, runtimeIdentity, readLog, environment, cacheIdentity, bindFiles } = require('./common.cjs');
async function prepare(source, logFile, output, zips) {
  if (process.platform !== 'darwin') throw Error('Owner Mac required');
  source = verifySource(source); logFile = fs.realpathSync(logFile); output = path.resolve(output);
  if (fs.existsSync(output)) throw Error('Refusing existing evidence directory: ' + output);
  if (!zips.length) throw Error('Pass the actual Electron cache ZIP path(s); missing cache must not silently pass');
  const before = readLog(logFile);
  if (!before.summary.endsWithNewline) throw Error('Existing app log ends in a partial line');
  const runtime = await runtimeIdentity(source), caches = [];
  for (const zip of zips) caches.push(await cacheIdentity(zip, runtime));
  const after = readLog(logFile);
  if (JSON.stringify(before.summary) !== JSON.stringify(after.summary)) throw Error('App log changed during preflight; close app and try a fresh evidence directory');
  const snapshot = { capturedAt: new Date().toISOString(), source, logFile, environment: environment(), runtime, caches,
    baselineLog: before.summary, status: 'candidate; automated Mac qualification PASS; manual launches 0/5',
    scope: 'Identity measured now, not a retrospective hash from the qualification run. No app process was launched by preflight.' };
  fs.mkdirSync(path.join(output, 'preflight'), { recursive: true });
  writeJSON(path.join(output, 'preflight/runtime.json'), snapshot);
  fs.writeFileSync(path.join(output, 'preflight/app-log.baseline.jsonl'), before.bytes, { flag: 'wx' });
  bindFiles(path.join(output, 'preflight'));
  console.log('PREFLIGHT_SAVED', output);
  console.log('ELECTRON_EXECUTABLE_SHA256', runtime.executableSha256);
  console.log('ELECTRON_DIST_TREE_SHA256', runtime.distribution.treeSha256);
  for (const cache of caches) console.log('ELECTRON_CACHE_ZIP_SHA256', cache.sha256, cache.path);
  console.log('BASELINE_LOG', JSON.stringify(before.summary));
}
module.exports = { prepare };
if (require.main === module) {
  const [source, logFile, output, ...zips] = process.argv.slice(2);
  if (!source || !logFile || !output) { console.error('Usage: node prepare-launches.cjs SOURCE ACTUAL_DVL_LOG NEW_EVIDENCE_DIR CACHE_ZIP [CACHE_ZIP...]'); process.exitCode = 1; }
  else prepare(source, logFile, output, zips).catch(error => { console.error('PREFLIGHT_FAILED:', error.message); process.exitCode = 1; });
}
