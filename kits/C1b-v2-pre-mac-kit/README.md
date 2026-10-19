# C1b V2 — pre-Mac proof and five manual restored launches

Date: 2026-10-20. **V2 identity retained. Separate startup/ready timeout, auto-retry and an automated five-launch latency benchmark remain deferred until data.** No candidate source was edited to create this kit.

Delivered V2 ZIP SHA256:

`17f7026185633726c248b3baaac8d1b16ca14cc1284ce8dfd237a47a332989dd`

## A. Automated proof against frozen B

Executed here: `node verify-b-harness.cjs /absolute/path/to/dvl-desktop-C1b-v2`. Result is saved in `green-gate-comparison-result.json`.

- 24 test names: **zero differences**.
- 68 assertion calls, on 39 assertion-bearing suffix lines: **zero differences**. The entire suffix from the first `assert.` on each physical line is compared, including any later assertions on that line.
- Reverse exactly five approved harness adaptations (one import + four harness/mock edits): the **entire file becomes byte-identical to frozen B**, SHA256 `a1c599efc9859812486462c91102c0dbcc55583dd33e79c5e17c4f825e8f4d4c`.
- V2 gate SHA256: `f951f0faf6f8a65828aa0a9ef401ceb80a1b0a2cac7eb7a8dd14d8116913dd4f`.

Precision: one raw physical line containing assertions also contains the shutdown invocation; its prefix changes to async/await and a mock preventDefault event. Thus a literal comparison of whole assertion-bearing physical lines has **one prefix-only difference**, not zero. Every assertion expression and the entire assertion suffix are unchanged. We do not hide that difference by claiming zero whole-line changes.

Approved adaptations, fully listed in `approved-harness-adaptations.json` and `green-gate-vs-frozen-B.patch`:

1. Import pathToFileURL for the authenticated frame mock.
2. Give the Window mock its own webContents/mainFrame/file URL and lifecycle stubs.
3. Supply that sender/frame when the harness invokes main IPC.
4. Await asynchronous before-quit and pass its preventDefault event mock.
5. Make the DOM mock clear children when textContent is assigned.

The frozen reference is included verbatim in `references/frozen-B-green-gate.cjs`. The verifier pins its known SHA256, pins the delivered V2 gate and source-manifest identities, compares the names/assertions and reverses only the approved harness changes. It never rewrites either gate. This is source-comparison evidence, not execution of frozen B unchanged against the C1b runtime. The separate frozen B artifact remains unchanged.

## B. Complete native C diff versus reviewed C1a repair v2

The original C1a `project-reader.c` and generated header were rehashed against the original C1a source manifest before comparison. Full C-file patch: `project-reader-vs-reviewed-C1a.patch`. There are exactly three C-file hunks:

1. Correct the header comment from one-request-per-process to the already-existing persistent immutable-root session. No runtime change in that hunk.
2. In denied(), refuse names containing UTF-8 encodings of U+017F, U+212A, U+00DF or U+1E9E (N-2 compatibility restriction, introduced by C1b V1).
3. After the existing post-read fstat/unchanged/nlink test and before hex serialization, add:

```c
if(memchr(bytes,0,n))return fail("UNSUPPORTED_ENCODING");
```

This NUL-refusal line is the only additional C-file change from C1b V1 to V2. Host native-error validation now admits the exact UNSUPPORTED_ENCODING error; host UTF-8/NUL checks remain.

The generated header is also a native build input, so its full two-hunk diff is included separately as `read-policy-header-vs-reviewed-C1a.patch`: add `.password-store` to denied names, and derive protected home trees from homeTrees plus dot-prefixed denied names (C1b V1/N-1). The Landlock minimum/profile, Seatbelt profile, inherited-fd confinement and 1 MiB file cap have no C-file changes in these diffs. No Arena change is present.

| Native build input | Reviewed C1a SHA256 | Delivered V2 SHA256 |
|---|---|---|
| `native/project-reader.c` | `a9705e7d024616eae7b96529285ecdb7a5d36f428d8cc5129877658c8072a3f8` | `d5c7b8a6c1899660440057c98cd0977d6815d8d0c255cc6e72d88b7eb366a878` |
| `native/read-policy.h` | `07ffc0b67f60016e4983f9ca45c27fac05d392396cce1abaf97c1cdf0a055da6` | `0eee7bc85ae1712fa0370caf98e0101e61ea2d38594891743ed41ae1d90248d0` |

## C. Mac commands — same V2, separate evidence kit

Place the extracted `dvl-desktop-C1b-v2` and this kit's `DVL_C1B_V2_PRE_MAC_KIT` folders on Desktop. If you choose another location, change only those two folder variables below. Close all DVL app windows/processes normally before starting.

These Mac/Electron commands remain **UNTESTED here on macOS**. The proof command was executed successfully here; the capture utility has syntax and simulated-child/log checks (`capture-host-check.json`), not actual Mac qualification.

```bash
DVL_V2_SOURCE="$HOME/Desktop/dvl-desktop-C1b-v2"
DVL_V2_KIT="$HOME/Desktop/DVL_C1B_V2_PRE_MAC_KIT"
DVL_V2_EVIDENCE="$HOME/Desktop/C1B_V2_MAC_EVIDENCE_$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DVL_V2_EVIDENCE"
cd "$DVL_V2_SOURCE"
set -o pipefail
node "$DVL_V2_KIT/verify-b-harness.cjs" "$DVL_V2_SOURCE" | tee "$DVL_V2_EVIDENCE/B_HARNESS_PROOF.json"
```

Expected: JSON `result: PASS`, 24 names, 68 assertion calls, zero name/assertion-suffix differences and zero full-file differences after reversing the approved harness adaptations. If this command fails, stop; do not run a different candidate silently.

Install, then run qualification. Stop on any nonzero exit and retain the complete output.

```bash
npm ci 2>&1 | tee "$DVL_V2_EVIDENCE/NPM_CI.log"
printf 'NPM_CI_EXIT=%s\n' "$?"
```

```bash
sw_vers > "$DVL_V2_EVIDENCE/MAC_ENVIRONMENT.txt"
node --version >> "$DVL_V2_EVIDENCE/MAC_ENVIRONMENT.txt"
cc --version >> "$DVL_V2_EVIDENCE/MAC_ENVIRONMENT.txt"
npm run qualify:c1b 2>&1 | tee "$DVL_V2_EVIDENCE/C1B_V2_MAC_QUALIFICATION.log"
DVL_V2_QUALIFICATION_EXIT=$?
printf 'QUALIFICATION_EXIT=%s\n' "$DVL_V2_QUALIFICATION_EXIT" | tee "$DVL_V2_EVIDENCE/QUALIFICATION_EXIT.txt"
```

Expected `QUALIFICATION_EXIT=0`, including the original native boundary/repair tests, V2 native fixture, B regression/auth checks, actual Electron integration and restore/layout test, and zero helper cleanup counts. A matching final marker cannot override an earlier failed suite. Do not repeat all suites without a failure/change that justifies it.

## D. Five manual restored-project launches, each captured separately

These are five **fresh app processes with persisted project state**. They are not guaranteed cold-cache, freshly reset TCC or reboot tests. No permission reset, purge, startup retry or longer operation timeout is introduced.

Preparation:

- Keep the real Desktop project as the selected/last project. Existing source-mode userData is reused. If no project has ever been selected in that state, use one preparation launch (`npm start`), select the intended project once and quit with Command-Q; record that this warm-up occurred. It is outside the five restored launches. Do not quietly relabel an empty-project launch as a successful restore.
- Confirm the actual source-mode DVL application log. The default path below is a **candidate path**, based on package name `dvl-desktop`; the capture helper checks it exists before launching. If absent, stop and identify the actual app.getPath('userData') log path instead of creating an empty file. Do not substitute qualification fixtures' temporary logs.
- Close any other DVL instance so no second process writes the same app log.

```bash
DVL_V2_LOG="$HOME/Library/Application Support/dvl-desktop/logs/dvl.log"
node -e 'const fs=require("node:fs"); const p=process.argv[1]; if(!fs.statSync(p).isFile()) process.exit(1); console.log("EXISTING_APP_LOG",p)' "$DVL_V2_LOG"
```

Execute each command below separately. For **each run**: let the app restore its project automatically; observe the first visible listing/status; do not use Open Project, Refresh, Search or manual retry; then quit the **app** with Command-Q and wait for `CAPTURE_SAVED` in Terminal. Fill that run's `observation.txt` before starting the next run. If a capture fails attribution or helper cleanup, stop and send that evidence before continuing.

```bash
node "$DVL_V2_KIT/capture-v2-launch.cjs" "$DVL_V2_SOURCE" "$DVL_V2_LOG" "$DVL_V2_EVIDENCE/restored-launches" 1
```

```bash
node "$DVL_V2_KIT/capture-v2-launch.cjs" "$DVL_V2_SOURCE" "$DVL_V2_LOG" "$DVL_V2_EVIDENCE/restored-launches" 2
```

```bash
node "$DVL_V2_KIT/capture-v2-launch.cjs" "$DVL_V2_SOURCE" "$DVL_V2_LOG" "$DVL_V2_EVIDENCE/restored-launches" 3
```

```bash
node "$DVL_V2_KIT/capture-v2-launch.cjs" "$DVL_V2_SOURCE" "$DVL_V2_LOG" "$DVL_V2_EVIDENCE/restored-launches" 4
```

```bash
node "$DVL_V2_KIT/capture-v2-launch.cjs" "$DVL_V2_SOURCE" "$DVL_V2_LOG" "$DVL_V2_EVIDENCE/restored-launches" 5
```

Each run directory saves:

- `console-stdout.log` and `console-stderr.log` from normal `npm start`.
- `capture-start.json`: initial app-log offset/hash, command and source location.
- `app-log.delta.jsonl`: only bytes appended during that launch interval. Log replacement/truncation is flagged and saved as unattributed instead of claiming clean per-run evidence.
- `reader-timeouts.json`: every new `reader.timeout` record, including `op`, `phase`, `spawnMs`, `firstByteMs`, `elapsedMs`, `startupMs` and the original timestamp; an explicit empty list is saved if none occurred.
- `metadata.json`: child exit/signal, startup record count, log-attribution checks, shutdown/DB-close status, and process lifetime clearly labelled as **not first-list latency**.
- `observation.txt`: owner records COMPLETE/PARTIAL/TIMEOUT/OTHER, exact visible status, correct restored project, prompts and any deviation.

The utility refuses to overwrite an earlier run, verifies all 94 V2 source hashes before launch, does not truncate the app log or change source, and executes `npm start` in the candidate directory. Its capture result is not a functional PASS. It adds a recording parent process; this is source-mode observation from Terminal, not packaged-app evidence.

**Important limit:** V2 emits stage timings only on TIMEOUT. A successful launch has no successful-spawn/ready timing record to save. `count: 0` means no timeout diagnostic was recorded, not zero latency. First stdout is not a native READY acknowledgement. No exact first-list latency is claimed by this procedure; any manual stopwatch observation must be labelled approximate. This preserves the accepted deferral of points 1–2.

After five completed attempts, compress the entire `C1B_V2_MAC_EVIDENCE_*` folder using Finder and send it together with the filled observations. Keep partial/failing runs too. Repeat a separate five-run batch outside Desktop only if the Desktop results justify that comparison; do not change location mid-batch.

## State

Goal: close C1b gate with actual source and Mac evidence. Decisions: exact V2 retained, test/assertion integrity proven, full native diffs supplied, no retry/timeout redesign. Open: V2 target-Mac qualification, manual stage diagnostics, original TIMEOUT cause, packaged Desktop/TCC risk, independent re-review. Next: run the proof and qualification on the exact V2, then the five captured manual restores. No C1b freeze or full-C1 acceptance follows from this kit.
