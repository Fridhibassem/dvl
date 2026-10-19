# C1b V3 — one step at a time

Keep V2 and earlier evidence. Extract the two ZIPs into Desktop as NEW folders `dvl-desktop-C1b-v3` and `DVL_C1B_V3_PRE_MAC_KIT`. Do not paste terminal output, prompt prefixes or Markdown fence marks as commands. Stop after each step, send its result, and stop at any failure. Do not run the five manual launches until qualification passes.

## 1. Source and B-harness proof

```bash
cd "$HOME/Desktop/dvl-desktop-C1b-v3" && node scripts/verify-source.cjs && node "$HOME/Desktop/DVL_C1B_V3_PRE_MAC_KIT/verify-b-harness.cjs" "$PWD"
```

The verifier checks 24 names/68 assertion calls, zero assertion suffix differences, and whole-file equivalence after only the five known harness adaptations. It is static evidence, not frozen-B runtime qualification. Full native C1a→V3 diff and generated-header diff are in candidate `review-v3/` and kit `references/`.

## 2. Install

```bash
npm ci
```

## 3. Create a NEW evidence directory

```bash
mkdir "$HOME/Desktop/C1B_V3_MAC_EVIDENCE"
```

If this already exists, STOP: choose a new evidence directory with assistance; never overwrite an earlier run.

## 4. Complete Mac qualification (zsh)

Quit the DVL app first. These commands assume the real project still is `$HOME/Desktop/khedma.tn`. The alias gate creates/removes disposable sibling fixtures on that device, never reads or writes target contents. It requires APFS identity from diskutil and a new report path; it records macOS/Darwin versions and each pair. If permissions/filesystem identification/probe fails, retain the error, do not grant broad privileges or bypass it.

```bash
DVL_ALIAS_PROJECT="$HOME/Desktop/khedma.tn" DVL_ALIAS_REPORT="$HOME/Desktop/C1B_V3_MAC_EVIDENCE/unicode-aliases-v3.json" npm run qualify:c1b 2>&1 | tee "$HOME/Desktop/C1B_V3_MAC_EVIDENCE/qualification.log"
qualification_exit=${pipestatus[1]}
printf 'QUALIFICATION_EXIT=%s\n' "$qualification_exit" | tee -a "$HOME/Desktop/C1B_V3_MAC_EVIDENCE/qualification.log"
```

Expected: all preceding gates plus `UNICODE_ALIAS_GATE_PASS []`, and QUALIFICATION_EXIT=0. Original native17+repair10 remain coupled in Node and Electron embedded Node; V3 native3 is added in both. A successful earlier V2 run does not substitute. Fresh Mac evidence and independent review are required.

The repaired probe preserves EILSEQ as not-applicable creation; a resolving sensitive alias must be POLICY_DENIED by both host and direct native. If a formerly unsupported character begins resolving on another macOS version, the gate fails until reviewed. Pinned single-code-point data is not all Unicode/APFS equivalences.

## 5. Confirm actual app log

Only after the full gate passes:

```bash
/bin/ls -l "$HOME/Library/Application Support/dvl-desktop/logs/dvl.log"
```

This path was previously expected, not verified. If missing, STOP; do not create an empty log to satisfy capture. Confirm real userData/log location first. Test temporary logs do not qualify as the normal app log.

## 6. Prepare real-project restoration, if needed

Normal `npm start`, select khedma.tn once, wait for completion, then Command-Q. Record any first-open TIMEOUT/permission prompt and any reselect; do not hide failures. This setup launch is outside the five measured launches. Do not reset TCC, purge caches, change timeouts or disable confinement. Full preparation procedure is conditional on the observed app state.

## 7. Five fresh-process manual restored-project launches

No DVL instance should already be running. For EACH launch: let automatic restoration/listing run; do not Open, reselect, Refresh or Search. Record the exact visible status/project and any permission prompt, then Command-Q. Wait for CAPTURE_SAVED and review result before continuing. If timeout occurs, preserve it and send the result before any retry/reselect. Do not silently rerun into an existing folder.

Run 1:

```bash
node "$HOME/Desktop/DVL_C1B_V3_PRE_MAC_KIT/capture-v3-launch.cjs" "$HOME/Desktop/dvl-desktop-C1b-v3" "$HOME/Library/Application Support/dvl-desktop/logs/dvl.log" "$HOME/Desktop/C1B_V3_MAC_EVIDENCE/manual-launches" 1
```

After Command-Q, open and fill the generated observation file before the next run:

```bash
open -e "$HOME/Desktop/C1B_V3_MAC_EVIDENCE/manual-launches/run-1/observation.txt"
```

Repeat the capture command separately with final argument 2, then 3, then 4, then 5, and fill the corresponding run-N/observation.txt each time. Keep app/environment conditions recorded; any changes must be explicit. Fresh process does not mean cold filesystem or permission cache.

Each run saves stdout/stderr, app-log delta, reader-timeouts.json, start/finish metadata, exact startup/shutdown counts and owner observations. Capture does not overwrite. It fails if log attribution is invalid or shutdown is not clean. The capture utility is inherited/adapted from the logic-tested V2 utility; actual owner-Mac execution remains untested until run1.

Stage timing diagnostics are recorded only when TIMEOUT occurs: phase/spawnMs/firstByteMs/elapsedMs/startupMs. Zero timeout rows does not measure successful spawn/ready/first-list latency. processLifetimeMs includes manual inspection and quit; never report it as first-list latency. No automatic retry or separate ready timeout was added. Optional owner stopwatch measurements must be labelled approximate.

## 8. Full independent-review bundle after five runs

Include candidate V3 ZIP, this kit ZIP, complete C1B_V3_MAC_EVIDENCE directory with qualification log/alias JSON/five capture folders, original C1B_UNICODE_ALIAS_PROBE_REPAIR1.json and the prior C1a/C1b review documents as historical context. Source already retains the original JSON and prior owner-pasted V2 qualification Markdown.

Review explicitly reopens C1a F1/N-2 privacy closure via new finding C1B-UNICODE-01. Broad refusal and aggregate existence counts need explicit review. B remains frozen, C1a not frozen, C1b not accepted/frozen, Arena change unapproved. Packaged Desktop TCC permission is still an open future risk. Do not infer the original TIMEOUT cause from TCC attribution or GPU warnings.
