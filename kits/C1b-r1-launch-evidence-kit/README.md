# C1b R1 — supplemental launch evidence

R1 remains **candidate**. Automated owner Mac qualification PASS was independently reviewed by Claude. Manual launches remain **0/5** until captured. This kit changes neither delivered R1 source nor KIT R2. Do not rerun npm ci, rebuild, update Electron, clear caches or launch the app before recording its current identity.

## Identity and scope

Accepted source ZIP SHA-256: `5701ab7c622697ba8a052536dbbf2e8fea69eb02c284b088c06613bf519b6df5`.
Accepted KIT R2 ZIP SHA-256: `241fddcf9d8a3d9716eedd573debc65286ffce1a1b7c73c74aff9b3510d63435`.
R1 SOURCE_SHA256.json SHA-256: `9e1183df128a8c96d45bf5b679ddc991becc204c16edc18aeb00191a03156d2a`.

The qualification log contains `Downloading Electron binary...` at line 269, during test:native-secret. That test invokes require('electron') and actual Electron processes; its source contains no download/print implementation. The message alone does not establish whether bytes came from network or cache, or prove which bytes ran then. This kit records **the installed runtime and current cache now**, before launch 1, and checks their identity before and after each manual launch. It is not a retrospective runtime hash or a vendor provenance verification.

The preflight hashes the actual executable, every regular file under node_modules/electron/dist, the native reader executable and its integrity record, and each explicitly supplied cache ZIP. It records directory modes and symlink targets without following bundle symlinks. The `treeSha256` is SHA-256 of UTF-8 `JSON.stringify(entries)` in deterministic depth-first sorted-name order, including file modes, sizes and SHA-256 values. It is a manifest digest, not a claim that a directory itself has a conventional SHA-256. ZIP executable and Electron Framework bytes must match the corresponding installed binaries. No ZIP is downloaded, extracted to disk or executed.

## Step 1 — read-only discovery

Quit any running normal DVL app with Command-Q first. Extract this ZIP under `/Users/user/desktop/dvl-dsktop`, keeping its top-level folder. Then run only:

```sh
cd "/Users/user/desktop/dvl-dsktop" &&
node "DVL_C1B_R1_LAUNCH_EVIDENCE_KIT/discover.cjs" "$PWD/dvl-desktop-C1b-v3-auth-repair1"
```

Return its output before continuing. Discovery reads the installed binary, searches named Electron cache locations (and explicitly configured cache roots), and checks the expected normal app log path. A missing cache/log or incomplete search is reported; it must not be counted as success. Paths found are candidates, not proof of archive identity. If no cache remains, record that fact and assess it before any redownload; do not silently substitute an archive from another install.

## Step 2 — preflight, after actual paths are confirmed

Use the exact cache ZIP path(s) returned by discovery. This example contains an intentional placeholder; do not paste it unchanged:

```sh
cd "/Users/user/desktop/dvl-dsktop" &&
node "DVL_C1B_R1_LAUNCH_EVIDENCE_KIT/prepare-launches.cjs" \
  "$PWD/dvl-desktop-C1b-v3-auth-repair1" \
  "$HOME/Library/Application Support/dvl-desktop/logs/dvl.log" \
  "$PWD/C1B_V3_R1_MANUAL_LAUNCH_EVIDENCE" \
  "/ACTUAL/CACHE/PATH/electron-v44.7.2-darwin-x64.zip"
```

It refuses an existing output folder and writes `preflight/runtime.json`, the pre-existing app log baseline, and SHA256SUMS.txt. Send the output. It launches no Electron process. If the expected app log does not exist, locate the actual userData log first; do not run a setup launch and call the next process launch 1.

## Step 3 — launch 1, only after preflight review

```sh
cd "/Users/user/desktop/dvl-dsktop" &&
node "DVL_C1B_R1_LAUNCH_EVIDENCE_KIT/capture-launch.cjs" \
  "$PWD/C1B_V3_R1_MANUAL_LAUNCH_EVIDENCE" 1
```

The capture runs the **already installed Electron executable with the normal R1 app directory**, equivalent to the package's `electron .` entry. It bypasses the npm/Electron JavaScript launcher so it cannot silently download a replacement. No test app, injected renderer code, startup retry or Chromium flags are used. ELECTRON_RUN_AS_NODE is removed, as in the qualification tests. Other inherited environment settings are unchanged.

Observe the FIRST automatically restored project open. Do not reselect the project, Refresh or Search. Record whether exactly `Reader: TIMEOUT` appears, including if it later changes; record the final first-open status too. Confirm khedma.tn is restored and note permission prompts. Quit the **app** with Command-Q, not the Terminal. Then answer the terminal's observation prompts. YES/NO/NOT_OBSERVED preserves uncertainty. A screenshot can supplement this observation if captured; do not infer the UI verdict from console silence.

The capture records the actual app PID and separate stdout/stderr, extracts EGL/GPU lines with their stream and line number, records all `reader.timeout` rows, and saves an owner first-open observation separately. EGL errors here belong to the normal app process launch, not an automated test child. Their presence does not by itself diagnose the cause of a reader failure.

After each run, send its terminal summary plus `run-N/metadata.json`, `diagnostics.json`, `observation.json`, and console logs (or the whole run directory). Verify the bound files from that directory:

```sh
/usr/bin/shasum -a 256 -c SHA256SUMS.txt
```

Wait for review of each result before the next launch. For runs 2..5, use the same capture command with only the final number changed. Do not run all five as a loop or launch DVL outside the capture between them.

## Log attribution and limits

Each run stores before/after byte sizes, logical line counts, newline counts, inode/device and full SHA-256. It writes only the newly appended bytes to app-log.delta.jsonl and records byte range `[before, after)` and inclusive full-log line range. Every line must end in newline; truncation, replacement, malformed JSON, zero/multiple app.startup events or unclean reader/database shutdown invalidates capture. Before launch N, the log must exactly match launch N-1's end (or the preflight baseline for launch 1). Any intervening change produces an INTER_RUN_GAP diagnostic and **starts no app**. Thus successful runs neither overlap nor silently absorb inter-run lines. Old baseline rows are historical/unassigned, not assigned to launch 1. Another concurrent process or external log editor cannot be forensically excluded; keep all other DVL instances closed. Any detected attribution failure must be reviewed, not relabelled PASS.

All completed per-run files, including the owner observation, are hash-bound by that run's SHA256SUMS.txt. The next run checks the previous files' hashes and chains its metadata hash. Never edit a captured observation afterwards; record a separately dated correction and hash it separately. Preflight and per-run evidence are external to the immutable candidate.

No retry, timeout change, cache clearing or packaged Desktop TCC permission grant is introduced. Successful stage timings/first-list latency are not instrumented. Process lifetime includes human inspection and quitting; it is **not first-list latency**. An optional stopwatch result must be explicitly labelled approximate. These are five fresh app processes, not proof of cold filesystem/TCC caches. Desktop TCC for a future packaged identity remains an open risk. Capture validity, owner functional observations and independent acceptance are separate decisions. R1 remains candidate pending all five observations and full bundle review.

## Verification status of this supplemental utility

See LOCAL_CHECKS.json for local fixture results. They exercise capture/attribution/identity failures using a disposable fake Electron executable and simulated Mac entry checks. They are **not owner Mac manual launches or UI qualification**. The new capture's real Mac behavior is unverified until the owner runs it. No candidate production file was edited.

The optional `node test-fixtures.cjs` reproduces these fixture checks (requires python3 and /usr/bin/unzip). It uses a temporary fake app only, removes its temporary files and leaves the delivered kit/source unchanged. Its output must never be mixed with manual launch evidence. This is not a prerequisite command for the owner before discovery.
