# C1b R1: how to run the 5 manual launches (D-12 procedure)

Lead review 2026-10-25. Kit `DVL_C1B_R1_LAUNCH_EVIDENCE_KIT.zip`, SHA-256
`1a6cf5257bda56a1044b4276fb9b016a3036e018130a53070c5d08d3f0f7e043` (matches the
Oct 20 record). All 7 internal file hashes match `KIT_SHA256.json`. The kit is in
`kits/C1b-r1-launch-evidence-kit/` in the repo and on the Mac.

## What the kit reads and writes (inspected)

- **Reads:** the R1 install. It verifies `SOURCE_SHA256.json` = `9e1183df…`, the
  same as tag `desktop/C1b-v3-auth-r1`. It also reads the Electron cache under
  `~/Library/Caches/electron`, and the app log at
  `~/Library/Application Support/dvl-desktop/logs/dvl.log`.
- **Writes:** **only** the evidence folder you pass as an argument (`wx`: never
  overwrites; refuses an existing folder). Nothing is hard-coded to `dvl-dsktop`.
  The README's example paths are just examples.
- **discover.cjs:** read-only. **prepare-launches.cjs:** writes `preflight/` only and
  launches nothing. **capture-launch.cjs:** launches the installed app once per run
  and writes `run-N/` only.

So D-12 holds: the qualified app is run in place, and every new file goes to
`~/Desktop/DVL`.

## Step 1: discovery (read-only). Quit DVL first with Command-Q.

```sh
cd ~/Desktop/DVL && node kits/C1b-r1-launch-evidence-kit/discover.cjs "$HOME/Desktop/dvl-dsktop/dvl-desktop-C1b-v3-auth-repair1"
```

Send the whole output to the lead. Do not continue until it has been reviewed.

## Step 2: preflight. Discovery was reviewed OK on 2026-10-25; the cache path below comes from it.

```sh
cd ~/Desktop/DVL && node kits/C1b-r1-launch-evidence-kit/prepare-launches.cjs \
  "$HOME/Desktop/dvl-dsktop/dvl-desktop-C1b-v3-auth-repair1" \
  "$HOME/Library/Application Support/dvl-desktop/logs/dvl.log" \
  "$HOME/Desktop/DVL/evidence/c1b-r1-launches" \
  "$HOME/Library/Caches/electron/7ed8101149447a6570a56a1b5036746257e2802bff7ff7a7abab321697eb0305/electron-v44.7.2-darwin-x64.zip"
```

## Step 3: launch N (1 to 5, one at a time, each reviewed before the next)

```sh
cd ~/Desktop/DVL && node kits/C1b-r1-launch-evidence-kit/capture-launch.cjs "$HOME/Desktop/DVL/evidence/c1b-r1-launches" 1
```

During each run:
- Watch the **first automatic restore**. No reselect, no Refresh, no Search.
- Note whether exactly `Reader: TIMEOUT` appears.
- Quit the **app** with Command-Q, then answer the prompts.
- Never run DVL outside the capture between launches.
