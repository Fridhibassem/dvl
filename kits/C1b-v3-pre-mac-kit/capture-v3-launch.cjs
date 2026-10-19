'use strict';
// External capture utility: runs the candidate's normal npm start command.
// No injected renderer code, startup retries, permission changes or source edits.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { spawn } = require('node:child_process');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function capture({ source, logFile, output, run }) {
  source = fs.realpathSync(source); logFile = path.resolve(logFile); output = path.resolve(output);
  if (!/^[1-5]$/.test(String(run))) throw new Error('Run must be 1, 2, 3, 4 or 5');
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected-identities.json')));
  if (hash(fs.readFileSync(path.join(source, 'SOURCE_SHA256.json'))) !== expected.v3SourceManifest) throw new Error('Not the delivered V3 source manifest');
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'SOURCE_SHA256.json')));
  for (const [name, digest] of Object.entries(manifest)) {
    if (path.isAbsolute(name) || name.split('/').some(p => p === '..' || !p)) throw new Error('Invalid manifest path');
    const target = path.join(source, name), st = fs.lstatSync(target);
    if (!st.isFile() || st.isSymbolicLink() || hash(fs.readFileSync(target)) !== digest) throw new Error('Source mismatch: ' + name);
  }
  const directory = path.join(output, 'run-' + run);
  if (fs.existsSync(directory)) throw new Error('Capture already exists; refusing overwrite: ' + directory);
  // Check before launch. The owner must confirm this is the actual app log.
  const before = fs.readFileSync(logFile), beforeStat = fs.statSync(logFile, { bigint: true });
  fs.mkdirSync(directory, { recursive: true });
  const stdoutFile = fs.openSync(path.join(directory, 'console-stdout.log'), 'wx');
  const stderrFile = fs.openSync(path.join(directory, 'console-stderr.log'), 'wx');
  const startedAt = new Date().toISOString(), start = performance.now();
  fs.writeFileSync(path.join(directory, 'capture-start.json'), JSON.stringify({ startedAt, source, logFile,
    run: Number(run), command: 'npm start', initialLogBytes: before.length, initialLogSha256: hash(before),
    note: 'Fresh app process, not a claim of cold filesystem/TCC caches. First-list and success-stage timings are not instrumented.' }, null, 2) + '\n');
  console.log('Run', run, ': inspect the automatic restored listing. Do not reselect, Refresh or Search. Record the visible result, then quit the APP with Command-Q.');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  let outcome;
  try {
    outcome = await new Promise((resolve, reject) => {
      const child = spawn('npm', ['start'], { cwd: source, env, shell: false, stdio: ['inherit', 'pipe', 'pipe'] });
      child.stdout.on('data', chunk => { fs.writeSync(stdoutFile, chunk); process.stdout.write(chunk); });
      child.stderr.on('data', chunk => { fs.writeSync(stderrFile, chunk); process.stderr.write(chunk); });
      child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
    });
  } finally { fs.closeSync(stdoutFile); fs.closeSync(stderrFile); }
  const elapsedMs = Math.round(performance.now() - start), after = fs.readFileSync(logFile);
  const afterStat = fs.statSync(logFile, { bigint: true });
  const appendOnly = beforeStat.dev === afterStat.dev && beforeStat.ino === afterStat.ino && after.length >= before.length && after.subarray(0, before.length).equals(before);
  const segment = appendOnly ? after.subarray(before.length) : after;
  fs.writeFileSync(path.join(directory, appendOnly ? 'app-log.delta.jsonl' : 'app-log.after-UNATTRIBUTED.jsonl'), segment);
  const records = [], invalid = [];
  for (const line of segment.toString('utf8').split('\n').filter(Boolean)) {
    try { records.push(JSON.parse(line)); } catch { invalid.push(line); }
  }
  const timeouts = records.filter(row => row.event === 'reader.timeout');
  fs.writeFileSync(path.join(directory, 'reader-timeouts.json'), JSON.stringify({
    attribution: appendOnly ? 'new log rows during this launch interval; verify single startup below' : 'UNATTRIBUTED: log replaced/truncated',
    count: timeouts.length, stages: timeouts,
    absenceMeaning: 'Zero rows means no timeout diagnostic was recorded, NOT zero latency or measured successful spawn/ready timings.'
  }, null, 2) + '\n');
  const startups = records.filter(row => row.event === 'app.startup'), shutdowns = records.filter(row => row.event === 'reader.shutdown');
  const cleanReaderShutdown = shutdowns.length === 1 && ['pendingRequests', 'liveHelpers', 'abandonedHelpers'].every(k => shutdowns[0][k] === 0);
  const metadata = { run: Number(run), startedAt, finishedAt: new Date().toISOString(), processLifetimeMs: elapsedMs,
    outcome, logAppendOnly: appendOnly, invalidLogRows: invalid.length, startupRecords: startups.length,
    timeoutRecords: timeouts.length, readerShutdownRecords: shutdowns.length, cleanReaderShutdown,
    dbClosed: records.some(row => row.event === 'db.closed'),
    captureAttributionValid: appendOnly && invalid.length === 0 && startups.length === 1,
    node: process.version, platform: process.platform, arch: process.arch,
    listingVerdict: 'OWNER MUST RECORD in observation.txt; capture success is not a functional PASS',
    latencyLimit: 'processLifetimeMs includes manual inspection and shutdown; it is NOT first-list latency.' };
  fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'observation.txt'), [
    'OWNER TO FILL:', 'First visible listing: COMPLETE / PARTIAL / TIMEOUT / OTHER',
    'Exact visible status:', 'Expected restored project shown: YES / NO',
    'Permission prompt: YES / NO (describe)', 'Did you reselect/refresh/search? NO expected; explain if YES',
    'Any manual stopwatch timing is approximate and must be labelled separately.', ''
  ].join('\n'));
  console.log('CAPTURE_SAVED', directory, JSON.stringify({ timeoutRecords: timeouts.length, attributionValid: metadata.captureAttributionValid, cleanReaderShutdown }));
  if (outcome.code !== 0 || !metadata.captureAttributionValid || !cleanReaderShutdown || !metadata.dbClosed) process.exitCode = 1;
  return metadata;
}
module.exports = { capture };
if (require.main === module) {
  const [source, logFile, output, run] = process.argv.slice(2);
  if (!source || !logFile || !output || !run) {
    console.error('Usage: node capture-v3-launch.cjs SOURCE_DIR ACTUAL_DVL_LOG EVIDENCE_DIR RUN_1_TO_5'); process.exitCode = 1;
  } else capture({ source, logFile, output, run }).catch(e => { console.error('CAPTURE_FAILED:', e.message); process.exitCode = 1; });
}
