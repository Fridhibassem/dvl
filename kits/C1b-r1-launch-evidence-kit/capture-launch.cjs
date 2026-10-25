'use strict';
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const readline = require('node:readline/promises');
const { fs, path, hash, writeJSON, verifySource, runtimeIdentity, readLog, fileHash, bindFiles } = require('./common.cjs');
function verifyBound(directory) {
  for (const line of fs.readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8').trim().split('\n')) {
    const match = /^([a-f0-9]{64})  ([^/\\]+)$/.exec(line);
    if (!match || match[2] === '.' || match[2] === '..' || hash(fs.readFileSync(path.join(directory, match[2]))) !== match[1]) throw Error('Evidence hash mismatch: ' + directory);
  }
}
function analyze(before, after, stdout, stderr) {
  const appendOnly = before.summary.device === after.summary.device && before.summary.inode === after.summary.inode && after.bytes.length >= before.bytes.length && after.bytes.subarray(0, before.bytes.length).equals(before.bytes);
  const segment = appendOnly ? after.bytes.subarray(before.bytes.length) : after.bytes;
  const records = [], invalid = [];
  const lines = segment.toString('utf8').split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (!row || Array.isArray(row) || typeof row !== 'object' || typeof row.event !== 'string') throw Error('Invalid event record');
      records.push(row);
    } catch { invalid.push(line); }
  }
  const startups = records.filter(row => row.event === 'app.startup');
  const shutdowns = records.filter(row => row.event === 'reader.shutdown');
  const timeouts = records.filter(row => row.event === 'reader.timeout');
  const cleanReaderShutdown = shutdowns.length === 1 && ['pendingRequests', 'liveHelpers', 'abandonedHelpers'].every(key => shutdowns[0][key] === 0);
  const gpu = [];
  for (const [stream, text] of [['stdout', stdout], ['stderr', stderr]]) {
    text.split('\n').forEach((line, index) => {
      if (/EGL|GLDisplay|GPU process|gpu_process|gl_display|gl_initializer/i.test(line)) gpu.push({ stream, line: index + 1, text: line });
    });
  }
  const dbClosed = records.filter(row => row.event === 'db.closed').length === 1;
  return { appendOnly, segment, diagnostics: { startupRecords: startups.length, invalidLogRows: invalid.length,
    timeoutRecords: timeouts, readerShutdownRecords: shutdowns, cleanReaderShutdown, dbClosed,
    gpuConsoleMatches: gpu, gpuEglConsoleObserved: gpu.some(row => /EGL|GLDisplay/i.test(row.text)),
    gpuEglErrorsObserved: gpu.some(row => /EGL|GLDisplay/i.test(row.text) && /ERROR|failed/i.test(row.text)),
    literalReaderTimeoutInConsole: /Reader: TIMEOUT/.test(stdout + '\n' + stderr),
    captureAttributionValid: appendOnly && before.summary.endsWithNewline && after.summary.endsWithNewline && invalid.length === 0 && startups.length === 1,
    screenLimit: 'Console and reader.timeout diagnostics cannot prove the first visible UI status. Owner observation is recorded separately.',
    gpuLimit: 'Matches are in this real app process console, not a diagnosis or proof of renderer failure.' } };
}
async function observe() {
  const io = readline.createInterface({ input: process.stdin, output: process.stdout });
  async function choice(question, choices) {
    while (true) {
      const value = (await io.question(question + ' [' + choices.join('/') + ']: ')).trim().toUpperCase();
      if (choices.includes(value)) return value;
      console.log('Enter one of:', choices.join(', '));
    }
  }
  try {
    return { recordedAt: new Date().toISOString(), kind: 'owner observation after quit; not automated UI instrumentation',
      firstOpenReaderTimeout: await choice('Did FIRST OPEN show exactly Reader: TIMEOUT?', ['YES', 'NO', 'NOT_OBSERVED']),
      firstOpenStatus: await io.question('Exact first-open status seen (or NOT_OBSERVED): '),
      expectedRestoredProject: await choice('Expected restored project khedma.tn shown?', ['YES', 'NO', 'NOT_OBSERVED']),
      permissionPrompt: await choice('Any permission prompt?', ['YES', 'NO', 'NOT_OBSERVED']),
      reselectRefreshSearch: await choice('Did you reselect, Refresh or Search?', ['YES', 'NO']),
      notes: await io.question('Other observations / prompt details / approximate stopwatch time, or NONE: ') };
  } finally { io.close(); }
}
async function capture(output, run) {
  if (process.platform !== 'darwin' || !process.stdin.isTTY) throw Error('Interactive owner Mac terminal required');
  if (!/^[1-5]$/.test(String(run))) throw Error('Run must be 1..5');
  run = Number(run); output = fs.realpathSync(output);
  const preflight = path.join(output, 'preflight'); verifyBound(preflight);
  const baseline = JSON.parse(fs.readFileSync(path.join(preflight, 'runtime.json')));
  const source = verifySource(baseline.source), logFile = baseline.logFile;
  const directory = path.join(output, 'run-' + run);
  if (fs.existsSync(directory)) throw Error('Refusing existing run: ' + directory);
  const existingRuns = fs.readdirSync(output).filter(name => /^run-[1-5]$/.test(name));
  if (existingRuns.length !== run - 1 || existingRuns.some(name => Number(name.slice(4)) >= run)) throw Error('Runs must be captured sequentially, starting at 1');
  let expectedLog = baseline.baselineLog;
  let previousMetadataSha256 = null;
  if (run > 1) {
    const previous = path.join(output, 'run-' + (run - 1)); verifyBound(previous);
    const metadataBytes = fs.readFileSync(path.join(previous, 'metadata.json'));
    const metadata = JSON.parse(metadataBytes);
    if (!metadata.capturePassed) throw Error('Previous capture invalid: assess evidence before proceeding');
    previousMetadataSha256 = hash(metadataBytes); expectedLog = metadata.afterLog;
  }
  const runtime = await runtimeIdentity(source);
  if (JSON.stringify(runtime) !== JSON.stringify(baseline.runtime)) throw Error('Installed Electron or native reader changed since preflight');
  for (const cache of baseline.caches) if (await fileHash(cache.path) !== cache.sha256) throw Error('Electron cache ZIP changed since preflight');
  const before = readLog(logFile);
  const continuity = JSON.stringify(before.summary) === JSON.stringify(expectedLog);
  if (!continuity) {
    const failure = path.join(output, 'INTER_RUN_GAP-' + run + '-' + Date.now() + '.json');
    writeJSON(failure, { expectedLog, observedLog: before.summary, appLaunched: false, reason: 'Unattributed log change: no launch was started' });
    throw Error('Log changed outside captured launch; gap recorded in ' + failure);
  }
  fs.mkdirSync(directory);
  const startedAt = new Date().toISOString(), start = performance.now();
  writeJSON(path.join(directory, 'capture-start.json'), { run, startedAt, source, logFile, beforeLog: before.summary,
    preflightRuntimeSha256: hash(fs.readFileSync(path.join(preflight, 'runtime.json'))), previousMetadataSha256,
    executableSha256: runtime.executableSha256, electronDistTreeSha256: runtime.distribution.treeSha256,
    caches: baseline.caches.map(({ path, sha256 }) => ({ path, sha256 })),
    command: [runtime.executable, source], commandMeaning: 'Existing Electron executable with normal app entry (electron .), no test child, injected code, retry or extra Chromium flags.' });
  const stdoutFile = fs.openSync(path.join(directory, 'console-stdout.log'), 'wx');
  const stderrFile = fs.openSync(path.join(directory, 'console-stderr.log'), 'wx');
  let outcome = { code: null, signal: null, spawnError: null }, childPid = null;
  console.log('RUN', run, ': observe FIRST automatic restored-project open. Do not reselect, Refresh or Search.');
  console.log('Record exact Reader status; then quit the APP with Command-Q and answer the observation prompts here.');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    outcome = await new Promise(resolve => {
      const child = spawn(runtime.executable, [source], { cwd: source, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      childPid = child.pid ?? null; let spawnError = null;
      child.stdout.on('data', bytes => { fs.writeSync(stdoutFile, bytes); process.stdout.write(bytes); });
      child.stderr.on('data', bytes => { fs.writeSync(stderrFile, bytes); process.stderr.write(bytes); });
      child.once('error', error => { spawnError = error.message; });
      child.once('close', (code, signal) => resolve({ code, signal, spawnError }));
    });
  } finally { fs.closeSync(stdoutFile); fs.closeSync(stderrFile); }
  const processLifetimeMs = Math.round(performance.now() - start), after = readLog(logFile);
  const analysis = analyze(before, after, fs.readFileSync(path.join(directory, 'console-stdout.log'), 'utf8'), fs.readFileSync(path.join(directory, 'console-stderr.log'), 'utf8'));
  fs.writeFileSync(path.join(directory, analysis.appendOnly ? 'app-log.delta.jsonl' : 'app-log.after-UNATTRIBUTED.jsonl'), analysis.segment, { flag: 'wx' });
  writeJSON(path.join(directory, 'diagnostics.json'), analysis.diagnostics);
  let runtimeUnchangedAfter = false, identityCheckError = null;
  try {
    verifySource(source);
    runtimeUnchangedAfter = JSON.stringify(await runtimeIdentity(source)) === JSON.stringify(baseline.runtime);
    for (const cache of baseline.caches) if (await fileHash(cache.path) !== cache.sha256) runtimeUnchangedAfter = false;
  } catch (error) { identityCheckError = error.message; }
  const metadata = { run, startedAt, finishedAt: new Date().toISOString(), processLifetimeMs, childPid, outcome,
    beforeLog: before.summary, afterLog: after.summary,
    newLogBytes: analysis.appendOnly ? after.summary.bytes - before.summary.bytes : null,
    newLogLines: analysis.appendOnly ? after.summary.logicalLineCount - before.summary.logicalLineCount : null,
    byteRangeHalfOpen: analysis.appendOnly ? [before.summary.bytes, after.summary.bytes] : null,
    lineRangeInclusive: analysis.appendOnly && after.summary.logicalLineCount > before.summary.logicalLineCount ? [before.summary.logicalLineCount + 1, after.summary.logicalLineCount] : null,
    continuousWithPrevious: continuity, previousMetadataSha256, runtimeUnchangedAfter, identityCheckError,
    ...analysis.diagnostics, capturePassed: outcome.code === 0 && !outcome.spawnError && analysis.diagnostics.captureAttributionValid && analysis.diagnostics.cleanReaderShutdown && analysis.diagnostics.dbClosed && runtimeUnchangedAfter,
    status: 'candidate; capture validity is separate from functional manual verdict',
    timingLimit: 'Fresh app process, not cold OS/TCC caches. processLifetimeMs includes inspection and quit: not first-list latency. Successful stage timings are not instrumented.' };
  writeJSON(path.join(directory, 'metadata.json'), metadata);
  const observation = await observe();
  writeJSON(path.join(directory, 'observation.json'), observation);
  bindFiles(directory);
  console.log('LAUNCH_CAPTURE_COMPLETE', JSON.stringify({ run, capturePassed: metadata.capturePassed,
    beforeBytes: before.summary.bytes, afterBytes: after.summary.bytes, beforeLines: before.summary.logicalLineCount,
    afterLines: after.summary.logicalLineCount, firstOpenReaderTimeout: observation.firstOpenReaderTimeout,
    gpuEglErrorsObserved: analysis.diagnostics.gpuEglErrorsObserved, readerTimeoutRecords: analysis.diagnostics.timeoutRecords.length }));
  console.log('EVIDENCE_DIRECTORY', directory);
  if (!metadata.capturePassed) process.exitCode = 1;
  return metadata;
}
module.exports = { analyze, capture, verifyBound };
if (require.main === module) {
  const [output, run] = process.argv.slice(2);
  if (!output || !run) { console.error('Usage: node capture-launch.cjs EVIDENCE_DIR RUN_1_TO_5'); process.exitCode = 1; }
  else capture(output, run).catch(error => { console.error('CAPTURE_FAILED:', error.message); process.exitCode = 1; });
}
