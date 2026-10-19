# DVL C1b — candidate v1, 2026-10-19

**Status: implementation candidate; NOT C1b PASS, NOT frozen, NOT full C1 acceptance.**

## ابدأ من هنا

هذي نسخة منفصلة لاختبار C1b: عرض الملفات، قراءة النصوص والبحث الحرفي داخل المشروع المختار. نسخة B المجمّدة ونسخة C1a الأصلية ما تبدّلوش. ما تخلطش المجلّد هذا مع النسخ القديمة.

نجحت هنا 78 check تحكّمية/سياسة، والبناء الأصلي نجح على Linux. اختبار العزل الحقيقي ما نجحش على هذا المضيف: Landlock رجع `ENOSYS`. تشغيل Electron واختبارات الماك للنسخة الجديدة **UNTESTED**. نتائج الماك السابقة تخص C1a، وما تنتقلش تلقائيًا إلى C1b.

الخطوة التالية: اختبار هذه النسخة على الماك ثم مراجعة مستقلة. ما نمرّوش للمرحلة التالية قبل الأدلة.

## Run on the target Mac

Use a new folder; keep B and the accepted-scope C1a copy intact. Close the app before qualification. Open Terminal in this folder (the one containing `package.json`).

```bash
npm ci
set -o pipefail
npm run qualify:c1b 2>&1 | tee C1B_MAC_QUALIFICATION.log
```

Record `sw_vers`, `node --version`, `xcode-select -p`, `cc --version`, and the shell exit status immediately after the qualification pipeline. The qualification command verifies source hashes before building the platform-specific helper. It requires strict native success; unsupported confinement fails the gate.

This includes:

1. Source verification and C1a Node/native suites, with the four negative confinement assertions and prefix sibling test.
2. B 24 regression assertions with an authenticated window/frame mock and awaited asynchronous shutdown.
3. C1b controller, root/name policy and DOM control tests.
4. Unchanged B real Electron secret/restart regression.
5. C1a native suites in Electron's embedded Node runtime, then a real production Electron window/preload/IPC/UI integration test, including regular-file and symlink replacement regressions and clean shutdown counts.

After successful qualification, inspect the real UI:

```bash
npm start
```

Open a disposable project under a normal local directory; check listing, Up, Refresh, paging, literal Search, file display, Stop, A→B switching and reload. File text must stay inert. Partial/skipped results must remain visible. Run on the exact target Mac, including the post-change native policy tests.

## Scope and implementation

- `src/main/desktop-reader.cjs`: one app-lifetime service; actual `app.getPath('userData')`; exact own-window/main-frame/file-URL checks; strict IPC schemas; no renderer bind/root API; four pending requests and 30 request admissions per one-second window; separate bounded context/cancel budgets; per-document/per-request ownership and late-response fencing.
- `src/main/main.js`: narrow reader lifecycle integration, selection hooks, validation before/after B IPC responses, navigation safeguards and bounded reader shutdown before database close. Cleanup counts go to the live UI and numeric shutdown log; nonzero counts also produce an explicit shutdown dialog.
- `src/preload/preload.js`: explicit read/context/cancel methods; state callbacks never receive the Electron event object.
- `src/renderer/files.js` and the existing Files panel: permitted listing with pagination, text-only file display, literal search, Stop, stale-response suppression and clearing on switch. Existing B controls remain.
- `ProjectReadService`: helper verification before every new session; the reviewed root-bound session, queue, timeouts, generation fencing and confinement baseline remain.
- Build creates a per-platform helper digest; missing/modified/wrong-platform helpers fail closed. Rebuild on the target platform before launching. Startup failure stays confined to Files so existing desktop state remains accessible.

## Review conditions

| Condition | Candidate treatment | Evidence remaining |
|---|---|---|
| C-1 | Prior C1a Mac gate retained as historical evidence | Changed C1b needs its own Mac qualification |
| C-2 / N-1 | Protected home entries derived from `homeTrees` union dot-prefixed denied names, in host and generated C; `.password-store` added | Host/direct-native pre-confinement regression passed here; run on Mac too |
| N-2 | Conservatively refuse U+017F, U+212A, U+00DF and U+1E9E in every component, in host and native | Stored-name regressions passed here; Mac checks remain |
| C-3 | Exactly one production `DesktopReader` / `ProjectReadService`, reused across window recreation | Actual Electron lifetime qualification pending |
| C-4 | Sender/frame/URL checks, exact payloads, text rendering, quotas, cancellation ownership, helper digest, no reader payload logging | Real Electron and packaged distribution checks pending |
| C-5 | Cleanup counts surfaced; completeness explicitly limited to permitted files; partial reasons/counts displayed | Real UI checks pending |

## Historical source and regression identity

Input: owner-uploaded `dvl-desktop-C1a-repair-v2.zip`. Its 40 listed source entries all matched before editing. The manifest itself accounts for the additional manifest file in the reviewer’s 41-file description. The original B manifest differs only in `package.json`, as expected from the C1a scripts additions. This check did not certify unlisted binary/log bytes.

`review-history/C1A_SOURCE_SHA256.json` preserves the original C1a manifest. `review-history/c1a/main.js` and `green-gate.cjs` preserve those original files. `review-history/C1A_INDEPENDENT_REVIEW_V2.md` is the retrieved review, not a new review of C1b. `C1A_MAC_RETEST.log` is the owner's uploaded prior run.

New-candidate B harness changes add realistic sender/frame state, await reader shutdown and implement DOM `textContent` clearing in the mock. The original 24 assertions remain. No B database schema, secret encryption behavior, dependency lockfile, native-secret test or security flags were changed. See `C1B_CHANGES.json` and `C1B_DIFF.patch` for the complete diff.

## Evidence and limits

See `C1B_STATUS_AND_REVIEW_REQUEST.md` and `evidence/c1b-host/`. Control results are not OS qualification. Policy tests refuse selected roots/names before confinement, so they do not prove filesystem isolation. Real Electron tests have syntax checks only here and are **UNTESTED at runtime**.

No workers, providers, AI execution, shell tools, project writing, `.dvl` activation, RootLock, Kernel authority or Arena ABI2/seccomp changes are introduced.

The four Unicode code points above are conservatively denied even in otherwise ordinary names. This is a deliberate compatibility restriction, not a general Unicode folding solution. Existing iCloud/Library/TCC/external/network-volume limitations remain unqualified. Reads are observations, not Project Truth or atomic snapshots; a name policy is not universal secret detection.

I-1 is covered by keeping boundary and repair suites coupled. I-2 (missing private macOS SPI diagnostics), I-3 (broader system-root exclusions), I-5/I-6/I-7 remain open/deferred as in the review. The stale persistent-session comment I-8 is corrected. No broad `/var`/`/private/var` prohibition is added without a policy decision about temporary/project locations.

## Packaged distribution boundary

This deliverable is a source candidate, not a signed or packaged desktop release. In packaged mode the controller resolves the helper only at `resources/app.asar.unpacked/bin/project-reader`; it never executes inside `app.asar`. Keep `bin/reader-integrity.json` in the application source/asar and place the platform/architecture-specific helper at that unpacked path with executable permissions. The release pipeline must explicitly unpack it and run the same checks against the installed app. No packaging tool or signed distribution was added or tested here. A local digest detects missing/changed helper bytes; it is not a defense against an attacker who can replace both code and manifest, nor an OS sandbox substitute.

Technical references: [Electron IPC sender validation](https://www.electronjs.org/docs/latest/tutorial/security/#17-validate-the-sender-of-all-ipc-messages), [webContents lifecycle and mainFrame](https://www.electronjs.org/docs/latest/api/web-contents).

## STATE

Goal: integrate the read-only project reader into desktop, one gate at a time. Decisions: B frozen baseline retained separately; C1a scoped PASS remains historical; C1b candidate implemented with N-1/N-2 changes; original ABI>=3/Seatbelt baseline unchanged; Arena excluded. Open: target Mac run, actual Electron runtime, packaging qualification and independent review. Next: run this candidate's qualification, inspect the UI, then review the exact source/diff/evidence. No later stage is authorized by these local control results.
