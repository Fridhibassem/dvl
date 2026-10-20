#!/bin/zsh
# External capture only: no source edits, retries, timeout changes or permission changes.
# Arguments: NEW_SOURCE REAL_PROJECT EVIDENCE_DIRECTORY
if (( $# != 3 )); then
  print -u2 'Usage: zsh capture-qualification.zsh SOURCE PROJECT EVIDENCE_DIR'
  exit 1
fi
c1b_source="$1"
c1b_project="$2"
c1b_evidence="$3"
c1b_kit="${0:A:h}"
if [[ ! -d "$c1b_source" || ! -f "$c1b_source/package.json" || "$c1b_evidence" != /* ]]; then
  print -u2 'STOP: invalid source or non-absolute evidence directory.'
  exit 1
fi
if [[ ! -d "$c1b_evidence" ]]; then
  mkdir "$c1b_evidence" || exit 1
fi
for c1b_name in qualification.log unicode-aliases-v3.json SHA256SUMS.txt capture-status.txt; do
  if [[ -e "$c1b_evidence/$c1b_name" ]]; then
    print -u2 "STOP: refusing overwrite: $c1b_evidence/$c1b_name"
    exit 1
  fi
done
(
  cd "$c1b_source" || exit 1
  /usr/bin/sw_vers || exit 1
  /usr/bin/arch || exit 1
  /usr/bin/uname -m || exit 1
  node -p 'JSON.stringify({node:process.version,platform:process.platform,arch:process.arch})' || exit 1
  node scripts/verify-source.cjs || exit 1
  node "$c1b_kit/verify-b-harness.cjs" "$PWD" || exit 1
  node "$c1b_kit/run-auth-mutations.cjs" "$PWD" || exit 1
  DVL_ALIAS_PROJECT="$c1b_project" DVL_ALIAS_REPORT="$c1b_evidence/unicode-aliases-v3.json" npm run qualify:c1b
  c1b_exit=$?
  printf 'QUALIFICATION_EXIT=%s\n' "$c1b_exit"
  exit "$c1b_exit"
) 2>&1 | tee "$c1b_evidence/qualification.log"
c1b_capture_status=("${pipestatus[@]}")
# Both exact evidence files are hashed only AFTER capture has closed.
/usr/bin/shasum -a 256 "$c1b_evidence/qualification.log" "$c1b_evidence/unicode-aliases-v3.json" | tee "$c1b_evidence/SHA256SUMS.txt"
c1b_hash_status=("${pipestatus[@]}")
printf 'QUALIFICATION_PROCESS_EXIT=%s CAPTURE_EXIT=%s HASH_EXIT=%s HASH_CAPTURE_EXIT=%s\n' "${c1b_capture_status[1]}" "${c1b_capture_status[2]}" "${c1b_hash_status[1]}" "${c1b_hash_status[2]}" | tee "$c1b_evidence/capture-status.txt"
c1b_status_write=("${pipestatus[@]}")
if (( c1b_capture_status[1] != 0 || c1b_capture_status[2] != 0 || c1b_hash_status[1] != 0 || c1b_hash_status[2] != 0 || c1b_status_write[1] != 0 || c1b_status_write[2] != 0 )); then
  exit 1
fi
print 'CAPTURE_AND_HASHES_COMPLETE (candidate; review still required)'
