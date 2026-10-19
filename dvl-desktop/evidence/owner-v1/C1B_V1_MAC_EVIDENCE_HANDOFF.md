# DVL C1b — Mac evidence and independent review handoff

Date: 2026-10-19. Owner: paqi.

## Start here

**Current state: C1b source candidate with an owner-executed passing Mac automated gate and limited manual UI evidence. Independent review is PENDING. C1b is NOT frozen. Full C1 is NOT accepted.**

This file updates the evidence available after the candidate was created. The candidate's older README/status correctly said Mac/Electron were untested at creation; that limitation has now been partly resolved by the owner's run below. No implementation fix was made in response to the subsequent manual observations.

## Exact source candidate

Included unchanged: `DVL_C1B_CANDIDATE_V1.zip`.

SHA256:

```text
1c5f05b639e2cba2fe585d680ff3549ffbb63945498691e5f4db0acf99ed7db3
```

Its inner folder is `dvl-desktop-C1b/`. The owner extracted it at:

```text
/Users/user/desktop/dvl-desktop-C1a-repair-v2/dvl-desktop-C1b
```

This is a separate candidate inside the outer C1a folder. Do not confuse it with the inner C1a source folder. The original C1a upload and frozen B reference were not edited by this implementation work.

The candidate contains the implementation, source manifest (50 entries), full diff, new/changed file index, host test evidence, original C1a v1 review including §6, C1a independent v2 review, and historical C1a Mac output. Read the source, not just the summaries.

## Owner-executed automated Mac qualification

The owner ran `npm ci`: 13 packages added, audit reported 0 vulnerabilities. This audit result is not a security certification.

Then:

```bash
set -o pipefail
npm run qualify:c1b 2>&1 | tee C1B_MAC_QUALIFICATION.log
printf 'QUALIFICATION_EXIT=%s\n' "$?"
```

Owner separately pasted `QUALIFICATION_EXIT=0` and the final Electron PASS lines. The complete output of `cat C1B_MAC_QUALIFICATION.log` was subsequently supplied as Markdown. Its bytes are included as `OWNER_PASTED_C1B_MAC_QUALIFICATION.md`; preserve that evidence class. This is a pasted transcript with Markdown escaping and extra blank lines, not the original raw `.log` bytes or a run by this assistant.

| Check | Observed owner output |
|---|---|
| Source identity | `C1B SOURCE MATCH PASS: 50 entries` |
| Native build | Completed; later suites ran |
| C1a control | 16/16 |
| C1a repair control | 16/16, with simulated cases explicitly labelled |
| C1a boundary, Node | 17/17, `darwin x64`, `READY seatbelt` |
| C1a repair native, Node | 10/10 |
| B regression | 24/24, using the documented authenticated mock harness |
| C1b IPC control | 13/13, simulated completion |
| C1b policy | 3/3, pre-confinement checks |
| C1b renderer control | 6/6, DOM simulation |
| Actual Electron secrets | Write/read/restart, integrity, clean shutdown, no test secret in logs: PASS |
| C1a boundary inside Electron embedded Node | 17/17, Seatbelt |
| C1a repair native inside Electron embedded Node | 10/10 |
| C1b policy inside Electron embedded Node | 3/3 |
| Actual production Electron window/preload/IPC/UI integration | `C1B_ELECTRON_INTEGRATION_PASS 8 darwin x64` |
| Shutdown check | `C1B_ELECTRON_GATE_PASS`, checking zero pending/live/abandoned counts and DB closure |

Both the Node and Electron-embedded native boundary outputs contained:

```json
{"externalDenied":true,"writeDenied":true,"movedDenied":true,"truncateDenied":true}
```

The actual UI integration covered narrow preload methods; native list/read/search via IPC; inert markup display; root/traversal/denied-file/schema rejection; regular-file/symlink project replacement; A→B generation fencing; reload with a fresh generation; unchanged fixture bytes; and absence of test query/content in logs.

Performance recorded in this run:

- Node: 100 reads 2928.69 ms; 500-file search 1347.48 ms, one helper.
- Electron embedded Node: 100 reads 2733.39 ms; 500-file search 951.23 ms, one helper.
- CPU matching: 5.89/28.94 ms; event-loop maximum 10.54 ms.

The log contains EGL/GPU initialization errors. The process reached all final PASS markers and the owner reported exit 0. Do not infer that these errors are universally harmless or identify their cause from this output.

Current direct diagnostic reported `darwin x64 v26.8.1`. macOS 13.7.8/build 22H730 and Apple clang 14.0.3 were recorded for the prior C1a run in the earlier handoff; they were not freshly queried in this qualification transcript.

## Manual real-project observations — retain both failures and successes

The assistant inspected owner-uploaded screenshots in chronological order. They are not included in this bundle; the observations below are screenshot-based, not an instrumented end-to-end trace.

1. **16:35:19 — initial TIMEOUT:** after `npm start`, the app showed the previously registered `/Users/user/Desktop/khedma.tn`. The Files panel displayed `Reader: TIMEOUT`. The window rendered. No root cause was established.
2. **Standalone Terminal diagnostic:** one `ProjectReadService` was used sequentially for a disposable temp folder and the actual project, printing metadata only. Results supplied by the owner:

   ```text
   RUNTIME darwin x64 v26.8.1
   SMALL_TEMP BOUND_MS 18
   SMALL_TEMP {"elapsedMs":71,"ok":true,"entries":1,"complete":true,"partialReason":null,"mode":"seatbelt"}
   KHEDMA BOUND_MS 7
   KHEDMA {"elapsedMs":37,"ok":true,"entries":25,"complete":true,"partialReason":null,"mode":"seatbelt"}
   CLOSE {"pendingRequests":0,"abandonedHelpers":0,"liveHelpers":0}
   ```

   This proves that particular Node/Terminal listing succeeded; it does not explain the earlier in-app timeout or establish identical macOS permission context.
3. **16:41:51 — reselect success:** following the instruction to use Open Project and select the same folder again, the screenshot showed populated Files and `Complete over permitted entries on this page.` No code was changed.
4. **Accidental shell paste:** the owner also showed pasted test-output text after a zsh prompt and `zsh: parse error near ')'`. That explains the shell parse error. No evidence ties it to the reader timeout; do not label the timeout user error.
5. **16:46:40 and 16:48:04 — real file read:** clicking `next-env.d.ts` yielded `Read 288 bytes`; after scrolling, the file title and expected source text were visible. This establishes that file's UI read/display in that run.
6. **16:50:45 — incomplete real-project search:** literal query `next/image-types/global` returned `3 matches; 782 files scanned. Partial: TIMEOUT; excluded directories: 3; skipped: 151.` This is a partial result, not full search success.
7. **16:55:32 — matches inspected:** the three displayed results were `tsconfig.tsbuildinfo:1:32027`, `next-env.d.ts:2:23`, and `.next/cache/.tsbuildinfo:1:34231`, each with the searched text in its snippet. The `next-env.d.ts` match agrees with the source text previously displayed. Build/cache artifacts were being scanned; their contribution to elapsed time is plausible but was not measured separately.
8. **16:57:09 — subsequent restore succeeded:** after the requested ⌘Q → `npm start` sequence, the screenshot showed the same project and a populated Files list with complete-page status, before a requested new Open Project action. This later restore did not reproduce the initial TIMEOUT. It does not establish the initial cause or prove a fix.

Manual Stop, manual project-switch-under-load and paging were not separately demonstrated in these screenshots. Related control/native/actual-Electron automated assertions exist; keep those evidence classes distinct.

## Findings/limits to assess independently

- Initial real-project listing TIMEOUT: one observed occurrence, later listings/reselection/restore succeeded. Cause unresolved. Decide what additional focused evidence is needed; do not increase the timeout or weaken confinement without a demonstrated reason.
- Real-project search ran out of the fixed time budget with preserved matches and explicit partial status. Assess performance and search scope; the source's exclusions currently do not omit `.next` or `*.tsbuildinfo`. Explain any policy change and maintain honest exclusion/partial counts.
- UI usability: file text and search matches are below the entire directory list; the owner repeatedly had to scroll substantially. Screenshots also show the full app header/sidebar scrolling out of view. Review scroll containment and result placement. This is an observed usability issue, not an assertion of data corruption or disclosure.
- Production packaging is still unqualified. This is a source candidate; native helper placement/hash enforcement for asar-unpacked is implemented, but no signed/packaged release was delivered or tested.
- Historical I-2, I-3, I-5, I-6 and I-7 limits remain as documented. Do not claim universal Unicode folding, universal secret detection, network confinement or atomic snapshot semantics.

## Prompt for the independent reviewer

You are the independent senior reviewer for DVL C1b, not its implementer. Review the complete current read-only desktop integration and its relationships across main process, preload, renderer, registry, reader service and native helper.

Read this file first. Verify the included candidate ZIP SHA256 and its source manifest, then read README_C1B_START_HERE.md, C1B_DIFF.patch, C1B_CHANGES.json, C1B_STATUS_AND_REVIEW_REQUEST.md, the actual source/tests, and the included owner transcript. Read the historical C1a v1 §6 and v2 C-2 to C-5 conditions. The candidate's earlier UNTESTED Mac wording predates the new owner evidence; do not mistake it for a fresh failure, and do not transfer an old PASS to new source.

Goal: qualify C1b's list/read/literal-search/cancel integration while preserving B state/secrets/restart behavior, native fail-closed confinement, generation/document isolation, bounded resources and honest results. C1b/full C1 are not frozen or accepted. Original B remains the frozen reference, C1a was scoped PASS, and Arena ABI2/seccomp changes remain unapproved. Do not activate workers/providers, project writes, shell execution, Kernel authority or a UI redesign beyond the present gate.

Review end-to-end rather than only checking the newly added functions. Trace every fix to the adjacent paths it can affect: startup/restore, project selection, reload/crash/window recreation, stale responses, cancellation, quota admission, helper integrity/spawn/close, app quit and database closure. Check exactly one production service instance with the actual userData path. Attack sender/main-frame/URL validation, payload schemas, cancellation ownership, no renderer root/bind authority, text-only display and absence of reader payload logging. Verify N-1 protected-home derivation and N-2 stored-spelling handling independently in host and native.

Execute appropriate tests where the environment supports them. Label your execution, owner evidence, simulated completions/DOM tests, pre-confinement tests, Electron embedded Node and actual app runtime separately. Unsupported confinement is a blocked qualification, not a PASS and not a reason to lower the baseline. The bundle contains no raw Mac log bytes, fresh OS/CLT query, packaged-release evidence or independently captured manual interaction trace.

Assess the initial unreproduced listing TIMEOUT, the partial search on the actual project and the scrolling usability issue explicitly. Request only targeted evidence that resolves a concrete uncertainty; avoid repeating the already captured full Mac run without a reason.

Return: exact reviewed artifact identity; verdict and its source/platform/evidence scope; concrete findings with severity, reproduction, affected relationships, smallest coherent fix and meaningful regression; assessment of test strength/limits; and the precise next allowed action. If a claimed problem is not established, say so. If no blocker is found, do not invent one. Never declare full C1 PASS, freeze, universal security or production readiness from these results.

## STATE

Goal: close C1b's read-only desktop gate step by step. Decisions: source candidate unchanged; B frozen reference retained; owner Mac automated gate passed; limited manual list/read/search and subsequent restore evidence collected. Open: independent review; unexplained initial listing timeout; real-project search performance; scroll usability; packaged qualification. Next: independently review this exact bundle and resolve substantiated findings before any C1b freeze or next-stage implementation.
