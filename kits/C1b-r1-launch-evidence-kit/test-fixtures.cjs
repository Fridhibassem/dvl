'use strict';
// Local orchestration fixtures only. No real Electron, renderer, APFS or Mac qualification.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const kit = __dirname;
const common = require(path.join(kit, 'common.cjs'));
const { analyze } = require(path.join(kit, 'capture-launch.cjs'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dvl-launch-fixtures-'));
const source = path.join(temp, 'source'), log = path.join(temp, 'dvl.log'), zip = path.join(temp, 'cache.zip');
const dist = path.join(source, 'node_modules/electron/dist');
const exe = path.join(dist, 'Electron.app/Contents/MacOS/Electron');
const framework = path.join(dist, 'Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework');
const checks = [];
function pass(name) { checks.push(name); console.log('PASS', name); }
function write(file, bytes) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
function load(name, extra = {}) {
  const mockedCommon = { ...common, verifySource: value => fs.realpathSync(value), environment: () => ({ fixture: true }) };
  const module = { exports: {} };
  const mockProcess = { ...process, platform: 'darwin', stdin: { isTTY: true }, exitCode: 0, env: { ...process.env, TEST_LOG: log } };
  const mockRequire = name => {
    if (name === './common.cjs') return mockedCommon;
    if (name === 'node:readline/promises') return { createInterface: () => {
      const answers = ['YES', 'Reader: TIMEOUT', 'YES', 'NO', 'NO', 'Fixture only'];
      return { question: async () => answers.shift(), close() {} };
    } };
    return require(name);
  };
  vm.runInNewContext(fs.readFileSync(path.join(kit, name), 'utf8'), { module, exports: module.exports, require: mockRequire,
    process: mockProcess, console, __dirname: kit, ...extra }, { filename: name });
  return { ...module.exports, mockProcess };
}
function zipDist(target) {
  const script = 'import os,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_STORED) as z:\n for root,dirs,files in os.walk(sys.argv[2]):\n  for f in files:\n   p=os.path.join(root,f); z.write(p,os.path.relpath(p,sys.argv[2]))\n';
  const result = spawnSync('python3', ['-c', script, target, dist], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
(async () => {
  try {
    write(path.join(source, 'node_modules/electron/package.json'), JSON.stringify({ version: '44.7.2' }));
    write(path.join(source, 'node_modules/electron/path.txt'), 'Electron.app/Contents/MacOS/Electron\n');
    write(framework, 'disposable framework binary');
    write(path.join(source, 'bin/project-reader'), 'disposable native reader');
    write(path.join(source, 'bin/reader-integrity.json'), '{}');
    write(exe, '#!/usr/bin/env node\n' +
      'const fs=require("node:fs"); const rows=[{event:"app.startup"},{event:"reader.timeout",stage:"ready"},{event:"reader.shutdown",pendingRequests:0,liveHelpers:0,abandonedHelpers:0},{event:"db.closed"}];\n' +
      'fs.appendFileSync(process.env.TEST_LOG,rows.map(r=>JSON.stringify(r)).join("\\n")+"\\n");\n' +
      'console.log("fixture app stdout"); console.error("[ERROR] GLDisplayEGL::Initialize failed.");\n');
    fs.chmodSync(exe, 0o755);
    fs.symlinkSync('A', path.join(path.dirname(path.dirname(framework)), 'Current'));
    write(log, JSON.stringify({ event: 'old.baseline' }) + '\n');
    zipDist(zip);
    const identity = await common.runtimeIdentity(source);
    assert.equal(identity.distribution.entries.filter(row => row.type === 'symlink').length, 1);
    const archive = await common.cacheIdentity(zip, identity);
    assert.equal(archive.binaryComparisons.length, 2);
    pass('Real filesystem identity and ZIP hashing: executable/framework equality; symlink recorded without traversal');
    const wrongZip = path.join(temp, 'wrong.zip'); write(framework, 'wrong archive framework'); zipDist(wrongZip);
    write(framework, 'disposable framework binary');
    await assert.rejects(() => common.cacheIdentity(wrongZip, identity), /differs/);
    pass('Mismatched cache ZIP rejected');
    const { prepare } = load('prepare-launches.cjs');
    await assert.rejects(() => prepare(source, log, path.join(temp, 'no-cache'), []), /cache ZIP/);
    assert.equal(fs.existsSync(path.join(temp, 'no-cache')), false);
    pass('Missing cache fails before creating evidence; no zero-cache PASS');
    const output = path.join(temp, 'evidence');
    await prepare(source, log, output, [zip]);
    const baseline = common.readLog(log);
    assert.equal(baseline.summary.logicalLineCount, 1);
    const { capture } = load('capture-launch.cjs');
    for (let run = 1; run <= 5; run++) {
      const result = await capture(output, run);
      assert.equal(result.capturePassed, true);
      assert.equal(result.newLogLines, 4);
      assert.equal(result.beforeLog.logicalLineCount, 1 + (run - 1) * 4);
      assert.equal(result.afterLog.logicalLineCount, 1 + run * 4);
      assert.equal(result.gpuEglErrorsObserved, true);
      assert.equal(result.literalReaderTimeoutInConsole, false);
      const observed = JSON.parse(fs.readFileSync(path.join(output, 'run-' + run, 'observation.json')));
      assert.equal(observed.firstOpenReaderTimeout, 'YES');
    }
    const combined = Buffer.concat([baseline.bytes, ...[1, 2, 3, 4, 5].map(run => fs.readFileSync(path.join(output, 'run-' + run, 'app-log.delta.jsonl')))]);
    assert.deepEqual(combined, fs.readFileSync(log));
    pass('Five simulated captures: non-overlapping/exhaustive byte and line ranges, before/after hashes, exact reconstruction and chained evidence');
    pass('Owner first-open TIMEOUT retained separately from absent console literal; EGL errors detected in captured app stderr');
    await assert.rejects(() => capture(output, 5), /existing/);
    pass('Overwrite refused');
    const gapOut = path.join(temp, 'gap-evidence'); await prepare(source, log, gapOut, [zip]);
    fs.appendFileSync(log, '{"event":"outside.capture"}\n');
    await assert.rejects(() => capture(gapOut, 1), /outside captured launch/);
    assert.equal(fs.existsSync(path.join(gapOut, 'run-1')), false);
    assert.equal(fs.readdirSync(gapOut).some(name => name.startsWith('INTER_RUN_GAP-')), true);
    pass('Inter-run/baseline gap: diagnostic written and no app process started');
    const changedOut = path.join(temp, 'changed-evidence'); await prepare(source, log, changedOut, [zip]);
    write(framework, 'tampered installed framework');
    await assert.rejects(() => capture(changedOut, 1), /changed since preflight/);
    assert.equal(fs.existsSync(path.join(changedOut, 'run-1')), false);
    write(framework, 'disposable framework binary');
    pass('Changed installed runtime rejected before launch');
    const skippedOut = path.join(temp, 'skipped-evidence'); await prepare(source, log, skippedOut, [zip]);
    await assert.rejects(() => capture(skippedOut, 2), /sequentially/);
    pass('Skipped launch numbers refused');
    const { verifyBound } = require(path.join(kit, 'capture-launch.cjs'));
    fs.appendFileSync(path.join(output, 'run-5/observation.json'), ' ');
    assert.throws(() => verifyBound(path.join(output, 'run-5')), /hash mismatch/);
    pass('Edited owner observation invalidates evidence hashes');
    const snapshot = (bytes, device = '1', inode = '2') => ({ bytes: Buffer.from(bytes), summary: { device, inode, endsWithNewline: !bytes || bytes.endsWith('\n') } });
    const good = [{ event: 'app.startup' }, { event: 'reader.shutdown', pendingRequests: 0, liveHelpers: 0, abandonedHelpers: 0 }, { event: 'db.closed' }].map(row => JSON.stringify(row) + '\n').join('');
    assert.equal(analyze(snapshot(''), snapshot(good), '', '').diagnostics.captureAttributionValid, true);
    assert.equal(analyze(snapshot(''), snapshot(good, '1', '3'), '', '').diagnostics.captureAttributionValid, false);
    assert.equal(analyze(snapshot('before\n'), snapshot(good), '', '').diagnostics.captureAttributionValid, false);
    assert.equal(analyze(snapshot(''), snapshot(good + 'invalid\n'), '', '').diagnostics.captureAttributionValid, false);
    assert.equal(analyze(snapshot(''), snapshot(good + '\n'), '', '').diagnostics.captureAttributionValid, false);
    assert.equal(analyze(snapshot(''), snapshot(good + 'null\n'), '', '').diagnostics.captureAttributionValid, false);
    assert.equal(analyze(snapshot(''), snapshot(good.slice(0, -1)), '', '').diagnostics.captureAttributionValid, false);
    assert.equal(analyze(snapshot(''), snapshot(good + '{"event":"app.startup"}\n'), '', '').diagnostics.captureAttributionValid, false);
    assert.equal(analyze(snapshot(''), snapshot(good.replace('"liveHelpers":0', '"liveHelpers":1')), '', '').diagnostics.cleanReaderShutdown, false);
    assert.equal(analyze(snapshot(''), snapshot(good), '', '').diagnostics.gpuEglErrorsObserved, false);
    pass('Log replacement/truncation/invalid JSON/incomplete line/multiple startups/unclean helper counts fail; absence of EGL kept separate');
    const result = { result: 'PASS', checks, host: { platform: process.platform, arch: process.arch, node: process.version },
      scope: 'Disposable filesystem and fake executable fixtures, Mac entry checks simulated. Not real Electron, APFS, UI, owner Mac launches or candidate qualification.',
      candidateSourceChanged: false };
    console.log(JSON.stringify(result, null, 2));
    console.log('LOCAL_FIXTURE_CHECKS_PASS', checks.length);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
