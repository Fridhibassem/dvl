# DVL C1b — Independent Review V1

Reviewer: Claude (independent reviewer; not the implementer). Date: 2026-10-20.
Status of C1b after this review: **FIX REQUIRED — NOT PASS, NOT frozen. Full C1 NOT accepted.**

---

## 1. Reviewed artifact identity

| Item | Value | How verified |
|---|---|---|
| Review bundle | `DVL_C1B_REVIEW_BUNDLE_2026-10-19.zip`, SHA256 `268f23d8…0491` | Computed here |
| Candidate | `DVL_C1B_CANDIDATE_V1.zip`, SHA256 `1c5f05b639e2cba2fe585d680ff3549ffbb63945498691e5f4db0acf99ed7db3` | Computed here; matches handoff |
| Source manifest | `SOURCE_SHA256.json`, 50/50 entries match | Recomputed here |
| Diff completeness | Reverse-applying `C1B_DIFF.patch` to the candidate reproduces **all 40 files of the original C1a manifest exactly** (40 match, 0 mismatch) | Executed here |
| Unlisted bytes | `bin/project-reader` (**Linux x86-64 ELF**) + `bin/reader-integrity.json` (`platform: linux`), plus `evidence/*` logs and `C1A_MAC_RETEST.log` | Inspected here (see F-7) |
| Electron pin | `package.json` and `package-lock.json` = `electron 44.7.2` (lockfile integrity hash present) | Read here; runtime version not printed in the Mac transcript |

Observation: C1a's `main.js` and `green-gate.cjs` are byte-identical to frozen B (`36bdacd0…`, `a1c599ef…`). **C1b is the first stage that modifies B's main/preload/renderer/index.html and the B gate harness.** That is expected for an integration stage, but it means "B 24/24" from now on is a statement about adapted code, not the frozen artifact (see F-5).

---

## 2. Verdict and scope

**Verdict: FIX REQUIRED (no security blocker found).**

- **Security / confinement relationships: no blocker found** in the reviewed scope. Sender/main-frame/URL checks, exact schemas, no renderer root/bind authority, generation fencing, cancellation ownership, quota admission, helper digest, text-only display, and absence of reader payload logging all hold in source review and in every test executed here.
- **Functional gate: not met.** Three substantiated issues on the real-project path must be fixed or explained before C1b PASS: search throughput on a realistic Next.js project (F-1), the unexplained and currently undiagnosable first-open TIMEOUT (F-2), and the page-level scroll defect (F-3).

Scope this verdict covers: the exact candidate above; source review of every runtime file; **reviewer execution on Linux x86-64 with real Landlock ABI 7** (not the target platform); headless Chromium layout with mocked IPC; plus owner-supplied Mac evidence, used as owner evidence. It does **not** cover packaged builds, Apple Silicon, TCC/iCloud locations, or any reviewer-executed Seatbelt run.

---

## 3. Evidence executed by this reviewer (labelled)

Host: Linux 6.18.44 x86-64, Node v22.22.0, cc 13.3.0, **Landlock ABI = 7** (the candidate author's host returned ENOSYS; this one does not).

| Run | Result | Evidence class |
|---|---|---|
| `build-reader.cjs` | exit 0 | Real compiler |
| `c1-boundary.cjs` | 17/17, `READY landlock`, all four denials `true` | **Real OS confinement (Linux Landlock)**, Node |
| `c1-native-repair.cjs` | 10/10; 100 reads 359 ms; 500-file search 417 ms, 1 helper | Real Landlock, Node |
| `c1-unit` / `c1-repair` | 16/16, 16/16 | Control / simulated protocol |
| `c1b-ipc` / `c1b-policy` / `c1b-renderer` | 13/13, 3/3, 6/6 | Simulated completion / pre-confinement / DOM mock |
| `green-gate.cjs` (C1b-adapted) | 24/24 | B logic with authenticated mocks |
| **Frozen B `green-gate.cjs` against C1b `main.js`** | **Fails immediately: `SENDER_DENIED`** | Expected: C1b authenticates B channels (F-5) |
| Reviewer probe: 9 B channels × {foreign webContents, non-main frame} | **18/18 denied** | Mock-level, executed here |
| Next.js-shaped synthetic project search (794 files) | See F-1 | Real Landlock, Node, **not Seatbelt** |
| Secret-name policy probe (list/read/search) | See §6 | Real Landlock, Node |
| Files-panel layout (25 entries + file read) | Page scrolls to 3450 px in a 720 px window | **Headless Chromium 1194 with mocked `window.dvl`**, not Electron |
| Reviewer prototype (§8) under all suites | All pass (16/16/17/10/13/3/6/24) | Linux only |

Not executed here: Electron runtime (no Electron binary/network), Seatbelt, packaged layout.

---

## 4. Findings

Severity scale: **High** = gate blocker affecting safety/integrity · **Medium** = must fix before C1b PASS · **Low** = fix in the same change or record · **Info** = record only.

### F-1 — Medium — Search throughput is dominated by full transfer of binary files and by `.next`; budget accounting hides it

**Observed (owner):** literal search on `khedma.tn` → 3 matches, 782 files scanned, `Partial: TIMEOUT`, 3 excluded dirs, 151 skipped.

**Reproduced here (synthetic, Linux Landlock):** a Next.js-shaped fixture (300 TSX sources, 30 migrations, 120 binary images, `tsconfig.tsbuildinfo`, and a `.next/` with chunks, server bundles, `.next/cache/.tsbuildinfo`, and webpack packs) returns **the same three matches** (`tsconfig.tsbuildinfo`, `next-env.d.ts`, `.next/cache/.tsbuildinfo`).

| Variant (same host, 3-run range) | Elapsed | Bytes moved over the pipe | `bytesScanned` reported |
|---|---|---|---|
| Candidate, with `.next` | **1645–2214 ms** | **34.3 MB** | 8.0 MB |
| Candidate, without `.next` | 618–643 ms | 10.4 MB | 1.3 MB |
| + native NUL early-reject (prototype) | 621 ms | 8.0 MB | 8.0 MB |
| + NUL early-reject + `.next` excluded | **167–221 ms** | 1.3 MB | 1.3 MB |

**Root cause (source):**
1. `project-reader.c` read path hex-encodes and ships **every** file up to 1 MiB, including binaries. The host then JSON-parses, regex-validates and hex-decodes it, and only then rejects it on a NUL byte (`textBytes` → `UNSUPPORTED_ENCODING`). In the synthetic run, 26 of the 34 MB moved were rejected binaries.
2. `searchExclusions` omits `.next`, so build output (chunks, server bundles, `.tsbuildinfo`) is scanned, which accounts for most of the files and two of the three matches.
3. The 20 MB `SCAN_LIMIT` only counts bytes of files that decoded successfully (`bytes += data.byteLength`). Bytes of rejected files are never charged, so the budget does not bound actual I/O, and the reported `bytesScanned` understates the work by about 4× here.

**Why 500 files took ~1 s but 782 timed out:** the F3 benchmark is 500 files of six bytes (`"marker"`) in one flat directory, which measures per-call overhead only. The real project's cost is bytes, mostly binary and build artefacts. Mac/Linux ratio on the identical tiny benchmark is 2.3–3.2× (951–1347 ms vs 417 ms). Applied to 1.6–2.2 s, that **predicts ~4–7 s on the target Mac, consistent with the observed 5 s TIMEOUT.** This is a quantitative explanation, not Mac-measured proof.

**Smallest coherent fix:**
- Native: after the existing post-read `fstat` check, `if(memchr(bytes,0,n))return fail("UNSUPPORTED_ENCODING");` (one line). Host semantics are unchanged because the host already rejects any NUL. Add `UNSUPPORTED_ENCODING` to `validateNative`'s error set.
- Policy (**owner decision**): add `.next` to `searchExclusions`. It remains listable and readable and stays counted in `excludedDirectories`. Optionally treat `*.tsbuildinfo` as a search-only exclusion with its own counter. Do not hide it silently.
- Accounting: charge `min(entry.size, 1 MiB)` for every attempted read against the scan budget, and report it as a separate `bytesRead` next to `bytesScanned`.
- **Do not** raise the 5 s budget.

**Regression to add:** a Next-shaped fixture (binaries + `.next` + one-line `.tsbuildinfo`) asserting complete-within-budget, exact skip counts per code, `excludedDirectories`, and that `bytesRead ≥ bytesScanned`. Keep the old 500-file test too.

### F-2 — Medium — First-open listing TIMEOUT: cause unestablished, and the code cannot currently tell the candidates apart

**Code facts:**
- In this code path, a `TIMEOUT` on a listing can only come from (a) the session timer, which fires when the helper produces no response within `job.deadline` (5 s after slot admission), or (b) `checkJob` seeing `Date.now() ≥ deadline`.
- I traced the startup sequence for logic races: `select(getLastProject())` → window navigation `resetDocument` → `did-finish-load` `select()` → push `applyState` → `list` → `showProject` pull → `cancelPending` → second `list`. These produce `STALE_CONTEXT`, `CANCELLED` or "Reader unavailable", **never `TIMEOUT`**. No code race explains the observation.
- Therefore the helper was blocked or starved for ~5 s on a 25-entry directory that normally lists in 37 ms.

**Why this matters beyond one occurrence:** the failing path is **restore at startup, with no Open dialog, of a project under `~/Desktop`**. The automated Electron test never exercises it (see F-4): it always starts from fresh state, uses a mocked dialog, and a `/var/folders` temp fixture.

**Ranked hypotheses (none established):**

| # | Hypothesis | Consistent with | Discriminating test |
|---|---|---|---|
| H1 | macOS privacy (TCC, Desktop folder) gate on the helper's first `open()`/`readdir` when Electron, not Terminal, is the responsible process; re-selecting via the Open panel (user intent) or a granted prompt unblocks it | Only the real `~/Desktop` project failed, only on dialog-less restore; fixed by Open-panel re-select; Terminal probe fast; later restart fine | TCC log for 16:34–16:36; Privacy → Files & Folders entry for Electron; controlled reproduction via `tccutil reset` (§7) |
| H2 | Cold I/O or iCloud "Desktop & Documents" materialization at startup, worsened by the GPU-process retry churn seen in every Electron start | First access slow, later fast | `sudo purge` then restart; iCloud setting; restart ×5 from a copy outside `~/Desktop` |
| H3 | Memory/CPU starvation on the 8 GB Intel Mac at Electron startup | Occurred minutes after a heavy multi-Electron qualification | Restart ×5 with Activity Monitor memory pressure noted |
| H4 | Wall-clock step (deadline uses `Date.now()`) | Rare | Not worth chasing; harden anyway (F-8) |

**Smallest coherent fix (diagnosability, not tolerance):** host-only numeric metadata on every reader `TIMEOUT`, with no path, query or content:
`reader.timeout {op, phase: 'before_spawn_event'|'before_first_byte'|'after_first_byte', spawnMs, firstByteMs, elapsedMs, startupMs}`. Use `child.once('spawn')` and the first `stdout` data event. This separates "stuck before/inside confinement or root open" (H1/H2) from "slow operation" (F-1-type). Keep the 5 s budget. **Do not weaken confinement.**

**Regression:** an actual-Electron test that pre-seeds `last_project_id`, launches without any dialog, and asserts the first list completes. Run it once with a normal temp fixture (automated) and once manually against a `~/Desktop` copy.

### F-3 — Medium (usability) — The whole page scrolls; header and sidebar leave the viewport; file text sits below the full list

**Reproduced here** (headless Chromium, real `index.html`/`files.js`, mocked IPC, 25 entries, 1100×720): document height **3450 px** in a 720 px viewport; `main` grows to 3450 px; the Files panel never scrolls internally (panel 1630 px = content). After scrolling, `.topbar` is at −2710 px and `aside` at −2730 px, which matches the owner's screenshots.

**Root cause:** grid items default to `min-height: auto`. `main` (rows `auto auto 1fr`) and `.workspace` (rows `1fr 1fr`) grow to their content, so `.panel { overflow: auto }` never engages and the document scrolls. `#fileEntries` and `#searchResults` are unbounded, and `#fileText`/`#fileTitle` come after them.

**Smallest coherent fix (CSS only plus one line; no redesign):** `.app { grid-template-rows: minmax(0,1fr) }`, `aside, main { min-height: 0 }`, `main { grid-template-rows: auto auto minmax(0,1fr); overflow: hidden }`, `.workspace { grid-template-rows: minmax(0,1fr) minmax(0,1fr) }`, `#fileEntries { max-height: 14em; overflow: auto }`, `#searchResults { max-height: 10em; overflow: auto }`. Place these **before** the existing `@media (max-width: 850px)` rule so narrow layouts still work. In `files.js`, after setting `fileText`: `el('fileTitle').scrollIntoView?.({block:'start'})`.

Verified here: document height equals the viewport at 1100×720 and 1440×900, the header stays at top 20 px, and file text lands at panel top (186 px) after a click. `c1b-renderer` stays 6/6.

Note: the Files panel is ~265 px tall in the 2×2 B10 layout. Giving it more space is a **layout decision for a later visual gate** (Design Room is visual-only), not a C1b fix.

**Regression:** an actual-Electron assertion that `document.scrollingElement.scrollHeight === innerHeight` after listing 200 entries and reading a file.

### F-4 — Low — Electron and perf tests miss the paths that failed in real use

- No actual-Electron test covers **startup restore without a dialog**, the exact F-2 path.
- All fixtures live in the OS temp dir. TCC-protected, iCloud, and external locations are untested (these are documented limits, but the gate now has a real failure there).
- The perf fixture (500 × 6-byte files) cannot detect F-1.
- No real-app paging, Stop-under-load, or switch-under-load (control and DOM tests only, as the handoff correctly states).
- No layout assertion (F-3).

**Fix:** add the regressions listed under F-1, F-2 and F-3. Nothing else.

### F-5 — Low — B gate is now an adapted harness, and the new B-channel authentication has no negative test

- The frozen B gate fails against C1b with `SENDER_DENIED` by design. The C1b gate changes **4 harness lines only**: an authenticated mock sender/frame, awaited async `before-quit`, and a DOM `textContent` setter. I diffed them; **all 24 assertions are unchanged** and nothing was weakened.
- But no suite asserts that a foreign webContents or non-main frame is **rejected** on the nine B channels. My probe shows 18/18 denials, so the behaviour is correct; it is just unguarded.
- **Fix:** add that probe as a test. In status docs, say "B assertions 24/24 under the C1b-authenticated harness", never "frozen B gate 24/24".

### F-6 — Low — Post-handler `STALE_CONTEXT` on B channels reports failure after the side effect committed

`handleIpc` throws `STALE_CONTEXT` if the document changed during the handler, but `upsertProject`, `setSecret` or `deleteSecret` have already committed. The only effect is a misleading error in a document that has been replaced anyway; no data is lost. **Record only**, or document it in the handler comment.

### F-7 — Low (hygiene) — The source candidate ships an unlisted prebuilt Linux helper

`bin/` is gitignored but present in the ZIP, with a Linux ELF and a `linux` integrity manifest that `SOURCE_SHA256.json` does not cover. It fails closed on the Mac (wrong platform → `HELPER_INTEGRITY_FAILED`; `qualify:c1b` rebuilds both files), so there is **no security impact**. It is still unreviewed executable bytes inside a review artifact. **Fix:** exclude `bin/` from candidate ZIPs.

### F-8 — Info — Deadlines use wall-clock `Date.now()`

`checkJob` and `job.deadline` use `Date.now()`, while the kill timer uses the monotonic clock. A forward clock step could yield a spurious `TIMEOUT`. This is not shown to be the F-2 cause. **Fix:** use `performance.now()` for deadlines (same change as F-2).

### F-9 — Info — Every project selection spawns two helpers; the first is cancelled

The push (`dvl:reader:state` → `applyState` → `list`) and the pull (`showProject` → `getReadContext` → `applyState` → `list`) both start a listing, and the second cancels the first via SIGKILL. This is correct but wasteful on an 8 GB machine at the busiest moment (startup). **Fix (optional):** skip the pull-triggered `list` if a push for the same generation is already pending or applied.

### F-10 — Info — A stale `destroyed` event could clear a newer binding

`resetDocument` does not check whether `sender` is the current window's webContents. On macOS close-then-activate, a late `destroyed` from the old webContents would null the new window's binding without republishing. Requests would then return `STALE_CONTEXT` until the project is re-selected. This is theoretical and was not observed. **Fix:** revoke that sender's owners always, but clear the binding only if `sender === getWindow()?.webContents` or no window exists.

### Positive confirmations (verified, not just read)

- N-1: the host `protectedHomeTrees` and the generated native `policy_homeTrees` are the same derived set (homeTrees ∪ dot-prefixed denied names, including `.password-store`). The native helper refuses independently (`c1b-policy` 3/3).
- N-2: the four code points are denied in every component, by host `denyName` and native `denied()` (UTF-8 byte forms), on request paths and on listed names.
- Exactly one `DesktopReader`/`ProjectReadService` per app, created once in `whenReady` and reused by `attach()` on window recreation. The helper env is `{DVL_USER_DATA}` only.
- Native diff vs C1a is exactly the N-2 check, the regenerated policy header and a comment. The confinement profile and Landlock/Seatbelt baseline are unchanged.

---

## 5. Answers to the owner's open items

| Item | Answer |
|---|---|
| First-open TIMEOUT root cause | **Not established.** Code races are excluded as a source of `TIMEOUT`; the helper was blocked or starved. Ranked hypotheses and discriminators in F-2 and §7. |
| 782 files hit 5 s while 500 took ~1 s | Explained (F-1): the benchmark is 6-byte files; the real cost is binary transfer (rejected only after hex round-trip) plus `.next`. `.next/**` and `*.tsbuildinfo` **are** searched today. |
| Frozen B files / native changed? | Frozen B **reference** untouched. In C1b, `tests/green-gate.cjs` differs from B and C1a by 4 harness lines with assertions intact; `native-secret-*.cjs` and `package-lock.json` are identical to B; `native/project-reader.c` differs from C1a only by N-2 and a comment. Reverse patch reproduces C1a 40/40. |
| Electron = 44.7.2? | Pinned in `package.json` and lockfile, and `npm ci` installs exactly that. Not printed at runtime in the transcript. One-liner in §7. |
| GPU-process error | Every Electron start in the transcript shows `GLDisplayEGL::Initialize failed` ×2 → `Exiting GPU process due to errors during initialization`, three GPU launches over ~3 s, then the run continues (Chromium falls back). **Cause not established**; it is not C1b code. It is relevant to F-2 because it adds startup load. Check whether frozen B shows the same lines (§7). |
| `.env`-class files hidden in real app | `.env`, `.env.*`, and nested `prisma/.env` are hidden from list, refused on read, and absent from search (**reviewer-executed, Linux Landlock**; the actual-Electron test asserts `.env` list/read only). **Not hidden:** `.envrc`, `.yarnrc.yml` (can hold `npmAuthToken`), `secrets.json`, `serviceAccountKey.json`, `*.p8`. Acceptable for user-only C1b per the documented "not universal secret detection" limit, but a **policy decision is required before any agent/provider requester (C-2 gate)**. |
| I-3 system-folder denial | **OPEN, recorded.** `rootTrees` still lacks `/var`, `/private/var`, `/opt`, `/run`, `/boot`; no change in C1b (consistent with the README's stated reason). |

---

## 6. Test strength assessment

- **Strong:** the native confinement suites (real Landlock here; Seatbelt on the owner's Mac, Node and Electron-embedded), IPC authentication and fencing logic, and the A→B and reload generation tests in actual Electron.
- **Moderate:** the B assertions under the adapted harness (correct, but mock-level); the DOM mock for the renderer (cannot see layout, as F-3 proves).
- **Weak / missing:** realistic-project performance, the startup-restore path, user-folder locations, layout, real-app paging and Stop under load, packaged layout.

Evidence classes are kept distinct throughout: the owner's Mac transcript is pasted Markdown, not raw log bytes.

---

## 7. Targeted Mac evidence requested (only what resolves F-2/F-1; no full re-run)

Run from the C1b folder (the one containing `package.json`):

1. **TCC log, do this first; logs age out.** Paste the output:
   `log show --start "2026-10-19 16:33:00" --end "2026-10-19 16:37:00" --predicate 'subsystem == "com.apple.TCC"' --style compact | grep -iE "desktop|electron|project-reader" | head -50`
2. A screenshot of System Settings → Privacy & Security → Files and Folders, showing whether "Electron" has a Desktop entry. Also note whether a permission prompt appeared at 16:35.
3. Is iCloud Drive "Desktop & Documents Folders" on? Then: `ls -ldO ~/Desktop/khedma.tn`
4. `node -p "require('electron/package.json').version"`
5. After the F-1/F-2 fix candidate exists (not before): restart ×5 with the `~/Desktop` project, then ×5 with a copy at `~/dvl-fixtures/khedma-copy` (copy without `node_modules`). Record any `reader.timeout` log lines (numeric only), and repeat the real-project search, noting elapsed time and `bytesRead`.
6. Optional, only if H1 is supported by item 1: `tccutil reset SystemPolicyDesktopFolder com.github.Electron`, then `npm start`. This tests whether the TIMEOUT reproduces deterministically.
7. Optional, GPU: start frozen B the same way and check for the same `GLDisplayEGL` lines. If present, the issue predates C1b.

---

## 8. Reviewer prototype (reference only, not a candidate)

`C1B_REVIEWER_PROTOTYPE_NOT_A_CANDIDATE.patch` (5 files, +17 lines) contains the native NUL early-reject, the `validateNative` error-set addition, `.next` in `searchExclusions` (owner decision), the scroll containment CSS, and `scrollIntoView`. All existing suites pass with it on Linux. **It is not reviewed as a candidate, not Mac-qualified, and must be re-implemented or adopted by the implementer under the normal manifest and qualification process.** It lacks the F-2 diagnostics, the F-1 accounting change, and the new regressions.

---

## 9. Next allowed action

1. The implementer produces **DVL_C1B_CANDIDATE_V2** containing only: F-1 (native NUL reject + accounting; `.next` if the owner approves), F-2 diagnostics plus monotonic deadlines (F-8), F-3 CSS/scroll, the F-4 and F-5 regressions, and F-7 hygiene. F-9 and F-10 are optional. No timeout increase, no confinement change, no UI redesign, no Arena/ABI2.
2. Before or in parallel: the owner supplies §7 items 1–4 (minutes, no rebuild).
3. Mac: `qualify:c1b` on V2, then the §7 item 5 manual run.
4. Re-review V2 against this report.

Not allowed: C1b freeze, full-C1 acceptance, packaged-release claims, or any worker/provider/agent requester. That last one is additionally gated on the §5 secret-name policy decision and C-2.

---

## STATE

Goal: close C1b's read-only desktop gate. Decisions: candidate V1 reviewed — no security blocker; FIX REQUIRED on real-project search throughput (F-1), undiagnosable first-open TIMEOUT (F-2), page scroll (F-3); B reference frozen and untouched; C1a scoped PASS unchanged; Arena unapproved. Open: §7 Mac evidence; V2 candidate; secret-name policy before agents; I-3; packaging. Next: owner answers §7 items 1–4 and decides on `.next`; implementer builds V2; Mac qualification; re-review.
