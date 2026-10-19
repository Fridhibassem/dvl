# DVL C1b v1 — implementation and review request

Date: 2026-10-19. Status: CANDIDATE / MAC AND ELECTRON RUNTIME UNTESTED / INDEPENDENT REVIEW PENDING.

## Goal

Expose the reviewed read-only project reader to the desktop's own main frame, preserving project selection, local state and secret handling while denying root injection and stale/cross-document disclosure. Scope is C1b only.

## Executed on this host

Linux 6.18.55 x86_64; Node v24.19.0; cc (Ubuntu 13.3.0-6ubuntu2~24.04) 13.3.0. Exact command results are in `evidence/c1b-host/results.json` and individual logs, including numeric exit codes.

| Command | Observed result | Evidence class |
|---|---|---|
| `node scripts/build-reader.cjs` | exit 0, strict compilation and deterministic policy generation | Real compiler/build |
| `node tests/green-gate.cjs` | 24/24 | B logic with authenticated Electron mocks |
| `node tests/c1-unit.cjs` | 16/16; support probe BOUNDARY_UNSUPPORTED | Control, not confinement |
| `node tests/c1-repair.cjs` | 16/16 | Real pre-confinement checks plus simulated session cases |
| `node tests/c1b-ipc.cjs` | 13/13 | Controller with simulated request completion |
| `node tests/c1b-policy.cjs` | 3/3 | Host and direct production native pre-confinement refusal |
| `node tests/c1b-renderer.cjs` | 6/6 | DOM simulation, not browser rendering |
| `node --check` on changed/new JS and CJS | exit 0 | Syntax only |

Total: 78 checks. They do **not** qualify native confinement or Electron.

Earlier executed attempt: `node tests/c1-boundary.cjs` failed with `OS boundary probe failed: UNSUPPORTED` (exit 1). A separate ABI probe returned `result=-1 errno=38 (Function not implemented)`. No ABI threshold was lowered. Native isolation is BLOCKED on this host.

Attempted dependency install in the candidate: `npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000`, exit 1, HTTP 403 for `undici-types-7.24.6.tgz` from the npm registry. That is an environment/dependency-download failure, not Electron runtime evidence. An earlier install attempt from the scratch root had no lockfile and failed with EUSAGE; it changed no source and was retried from the candidate folder. There is no local Electron executable or Chromium browser for runtime/visual qualification here.

## Verification still required

1. Run `npm ci` and `npm run qualify:c1b` on the target Mac; retain complete stdout/stderr, numeric pipeline exit status, source verification, environment and all four native denial booleans.
2. Real app list/read/search/Stop/switch/reload; confirm no stale content, actual text-only markup display, paging and explicit partial outcomes.
3. Source review of lifecycle relationships, not just individual fixes: project restore/selection → bind, navigation/crash → revoke, new document → new generation, before-quit → bounded close → counts → DB checkpoint/close.
4. Verify source identity and helper hash behavior on the installed/package layout before claiming packaged support. Source mode and unpacked-path enforcement are implemented; packaged distribution is not delivered.
5. Independent review of the exact candidate and new tests. Do not transfer C1a's verdict to these changes.

## Review targets

- Confirm one production service instance per app even after closing/recreating a window. Native/live/abandoned helpers remain app-budgeted.
- Try foreign webContents, child/navigated/detached frames, forged URLs and frame reuse after same-URL reload. Try completing an old request after project switch, crash and close.
- Try malformed payloads, caller root, wrong project/generation, duplicate IDs, queue/rate exhaustion, stealing cancellation and rapid reloads. Verify failures contain only bounded codes.
- Recheck N-1 derived host/native policy, N-2 stored spelling restrictions and legitimate Unicode compatibility. No `DVL_HOME` production override was added. The policy regression temporarily creates missing empty credential directories and removes only directories it created; it never writes into existing credential directories.
- Attack startup and pre-spawn helper verification, packaged placement, missing helper/manifest, symlink helper, wrong architecture and tampered bytes. Note documented local-attacker/TOCTOU limits; this is not code signing.
- Recheck text rendering and stale UI responses using actual Electron. Native suites run in Electron embedded Node in addition to the real app integration tests; those evidence classes must remain distinct.
- Validate close counts remain honest under stuck-helper simulation and real workloads; verify no reader paths/queries/content are logged. Legacy B project-selection path logs are unchanged and are not reader payload logs.
- Review the minimal B harness changes in the diff. Do not weaken an assertion merely to get a green count.

## Independent reviewer prompt

Review this DVL C1b candidate independently. Read README_C1B_START_HERE.md, the full source diff, the C1a v1 §6 and v2 C-2 to C-5 conditions, and actual evidence. C1a was PASS scoped and C-1 was met on the owner's Mac; C1b has new source and is not accepted. Preserve the frozen B reference and original Landlock ABI>=3/Seatbelt requirements. No Arena remediation is approved. Check security and behavior across modules/lifecycles, including regressions from each fix. Execute appropriate tests where possible; label simulations, unsupported environments, unexecuted tests and owner evidence separately. Return concrete reproducible findings with severity, affected relationships, smallest coherent correction and targeted regression. Do not rewrite architecture or activate later-stage workers/providers. If you find no blocker, state exactly which source/platform/evidence scope your verdict covers. Never infer full C1 PASS or freeze from control tests.
