# DVL C1b — Candidate V2 — 2026-10-20

**CANDIDATE ONLY. C1b NOT PASS, NOT FROZEN. Full C1 NOT accepted.**

## ابدأ من هنا

هذي نسخة V2 مستقلة، فيها إصلاحات تقرير `C1B_INDEPENDENT_REVIEW_V1.md`. فكّ الـZIP في مجلّد جديد؛ ما تكتبش فوق B أو C1a أو C1b V1. المجلّد الداخلي اسمو `dvl-desktop-C1b-v2`.

نجح البناء و105 اختبارات تحكّم/سياسة هنا. العزل الحقيقي غير متاح على هذا المضيف؛ Electron وSeatbelt والواجهة الجديدة **UNTESTED على هذه النسخة**. نجاح V1 على الماك محفوظ كدليل سابق فقط. السبب الأصلي لأول TIMEOUT مازال غير مثبت.

## Changes since V1

- Native helper refuses NUL-containing files after the existing post-read identity check, before hex serialization. Host UTF-8/NUL checks remain.
- `.next` is excluded from recursive search traversal and counted in `excludedDirectories`. It remains listable and directly readable. Existing `*.tsbuildinfo` policy is unchanged.
- Search charges attempted reads, including refusals, against the existing 20 MiB budget. `bytesScanned` counts decoded text; `bytesRead` is explicitly estimated budget accounting (`bytesReadIsEstimate: true`), based on listed size capped at 1 MiB, adjusted upward for successful larger reads. It is not an exact kernel I/O counter or a hard I/O bound against concurrent file growth. The UI labels it as an estimate and shows search elapsed time. The 5-second operation deadline is unchanged.
- Numeric/enum-only `reader.timeout` diagnostics distinguish no observed spawn, no observed stdout, and observed stdout; monotonic deadlines, cursor lifetimes and shutdown waits avoid wall-clock steps. Diagnostics do not identify TCC or prove any root cause.
- App/panel scrolling is contained; entries/results have bounded scroll regions; a completed read reveals its title/text region.
- Regression coverage: rejected-read budgeting; timeout phases/privacy; clock jumps; all nine B channels reject foreign senders/non-main frames; realistic 794-file Next-shaped tree; actual Electron second-process restore without a dialog and 200+1 paging/layout checks.
- A late event from an old window revokes its owners without clearing the new window binding (F-10). Duplicate push/pull listing (F-9) is recorded and unchanged.
- No prebuilt helper or `node_modules` ships in this ZIP. Build on the target Mac.

## First Mac step

Close DVL. Extract the ZIP separately, then open Terminal in `dvl-desktop-C1b-v2` (the directory containing `package.json`).

```bash
npm ci
```

After installation, run qualification from that same folder:

```bash
set -o pipefail
npm run qualify:c1b 2>&1 | tee C1B_V2_MAC_QUALIFICATION.log
printf 'QUALIFICATION_EXIT=%s\n' "$?"
```

Keep the complete output. The source manifest is checked before deterministic policy generation and native compilation. Unsupported confinement is a gate failure. `qualify:c1b` includes the original coupled confinement/repair suites, V2 native fixture, B assertions under the C1b-authenticated harness, control/policy regressions, real Electron secret/restart check, native suites in Electron embedded Node, the production UI test, and a second production Electron process restoring the persisted last project without a picker. Both app shutdowns must show zero pending/live/abandoned helpers.

Expected markers include `C1B_V2_CONTROL_PASS 8`, `C1B_B_AUTH_PASS 18`, `C1B_V2_NATIVE_PASS 3`, `C1B_ELECTRON_INTEGRATION_PASS 8`, `C1B_ELECTRON_RESTORE_PASS 3`, `C1B_ELECTRON_GATE_PASS`, and `QUALIFICATION_EXIT=0`. A marker alone is insufficient if an earlier suite failed.

## Manual target-Mac evidence after qualification

Run `npm start`. Restore the real Desktop project without reselecting it. Record the first listing result. Repeat five fresh launches with that location, and five with an owner-created copy outside Desktop (without `node_modules`); preserve any `reader.timeout` records. Do not reset privacy permissions or purge caches for this initial comparison.

Repeat the original literal query `next/image-types/global`; report elapsed time, `bytesRead` estimate, `bytesScanned`, matches, exclusions and skip reasons. Partial results remain partial: skipped binary files or excluded directories must not be relabelled complete. Check file-text visibility and fixed header/sidebar at the target window size. Manual Stop/switch under load remain additional evidence, distinct from control/DOM simulations.

Still unanswered: whether iCloud Desktop & Documents is enabled and whether a permission prompt appeared during the original failure. The supplied TCC excerpt shows Terminal attribution and an Accessibility warning, not a visible Desktop access refusal; it neither establishes nor excludes TCC as the cause.

## Evidence and review

Read `C1B_STATUS_AND_REVIEW_REQUEST.md`. V2 host logs are in `evidence/c1b-v2-host/`. `evidence/c1b-host/` and `evidence/owner-v1/` are explicitly V1 history. `review-history/c1b-v1/` retains the V1 manifest, README and diff. The reviewer's prototype remains reference material, not the candidate.

`C1B_V2_DIFF.patch` compares V1 to V2. `C1B_DIFF.patch` compares the original C1a source to the final V2 implementation. `C1B_CHANGES.json` records both source baselines and file hashes. `SOURCE_SHA256.json` covers every shipped regular file except itself; generated binaries, dependency directories and future run logs are not shipped.

## Boundaries

B repair v3 remains frozen as a separate reference. C1a remains scoped PASS, not frozen. V1 received FIX REQUIRED; V2 requires its own Mac qualification and independent re-review. This is source mode only: no packaged/signed release, Apple Silicon, TCC/iCloud/external/network location qualification is claimed. The Landlock ABI minimum and Seatbelt confinement profile are unchanged. Arena changes remain unapproved.

No workers/providers, AI execution, shell tools, project writes, `.dvl` activation, RootLock or Kernel authority are added. Reads are best-effort observations, not Project Truth or atomic snapshots. Name-based secret policy is not universal detection; agent/provider requesters remain gated on the policy decision in review C-2. Deferred system-root exclusions and the other C1a evidence limits remain open.

STATE -> Goal: close C1b read-only desktop gate | Decisions: V2 scoped repairs, `.next` search exclusion, B preserved | Open: target Mac qualification/manual evidence, original TIMEOUT cause, independent V2 review | Next: install dependencies in the separate V2 folder, then qualify this exact source.
