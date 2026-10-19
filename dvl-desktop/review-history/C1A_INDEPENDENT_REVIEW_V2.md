# C1A_INDEPENDENT_REVIEW_V2.md — DVL C1a repair v2 re-review

Reviewer: Claude (Opus 5.5), the reviewer who issued the v1 FIX_REQUIRED
Date: 2026-10-16
Skill: `distributed-ai-systems-orchestration-architect`, loaded. Applied to session lifecycle, cancellation, generation fencing and helper ownership. The filesystem, confinement and protocol findings come from direct code review and execution.
Candidate: `DVL_C1A_REPAIR_V2.zip` → `dvl-desktop-C1a-repair-v2/`. Reference: Phase B repair v3 (GREEN / FROZEN).
No implementation or test file was modified. All execution happened in a separate copy.

---

## 1. Verdict

**PASS — scoped to C1a source, with one evidence condition before C1b starts.**

- All eleven v1 findings are **CLOSED** in source. Ten are backed by my own execution on a Landlock-capable Linux host; F1's alias resolution is backed by owner-reported Mac evidence.
- The new persistent native session holds up under adversarial probing:
  - descriptors stay stable across 520 mixed operations covering every error path;
  - framing violations fail closed;
  - the session cannot rebind its root or accept a new method;
  - replacing the root mid-session is refused;
  - rebinding A → B during a live search fences the result and leaves no helper process alive.
- The `sandbox_init_with_parameters` change removes SBPL source interpolation, which is the right fix for the backslash-root failure.
- No High or Medium defect remains. There are two new Low findings (N-1, N-2) and several Info items.

**What keeps this from being unconditional:** the change under review is the macOS confinement call itself. The supplied post-patch Mac evidence is only the tail of the repair-native suite, and that suite contains **no negative confinement assertion**: no outside read, write, moved directory, truncate or prefix sibling. The boundary probe that does assert these passed on the Mac only *before* the patch. Every successful post-patch operation implies the built-in `/etc/passwd` self-check passed, so "deny default" was in force. Write, moved-directory, truncate and prefix-sibling denial under the new profile are still **unproven on macOS**. See condition C-1.

This is not a freeze and not a full C1 PASS.

---

## 2. Artifact and source identity (executed)

| Check | Result |
| --- | --- |
| All 41 `SOURCE_SHA256.json` entries | 41/41 match; no unlisted files |
| `review-history/CLAUDE_C1A_REVIEW_V1_FIX_REQUIRED.md` | Byte-identical to the v1 report I issued (`8b86c3f9…`) |
| B app/test files (`main.js`, `preload.js`, `index.html`, `renderer.js`, `green-gate.cjs`, `native-secret-*.cjs`, `package-lock.json`) | Byte-identical to frozen B v3 |
| `package.json` vs B v3 | Only added `test:c1*` / `build:reader` scripts |
| Reader wiring into Electron, preload or renderer | None; C1a is still host-internal |
| `native/read-policy.h` after `build:reader` regeneration | Byte-identical to the shipped file (deterministic) |

---

## 3. F1–F11 closure table

Evidence classes:
- **[R]** source review
- **[X]** executed by me on this host
- **[M]** owner-reported Mac output
- **[S]** simulated helper (not OS evidence)

| # | v1 finding | Status | Evidence |
| --- | --- | --- | --- |
| **F1** High | Case-fold aliases of denied names | **CLOSED** | **[R]** `project-reader.c:82-88` `exact_entry()` requires a byte-exact stored `d_name` before `openat`. An alias that resolves but has a different stored spelling gives `EILSEQ` → `PATH_DENIED`. The deny check runs on the stored name. `walk()` (`:150-163`) re-binds name→inode after open (`ESTALE` on mismatch). The JS layer is no longer the enforcement point. **[M]** Pre-parameter-patch v2 Mac run: all six aliases *actually resolved* on APFS and were denied by direct-native and service tests. The parameter patch changed only `confine()`. **[X]** Suite passes here, but vacuously: ext4 resolves no alias. Residual: N-2. |
| **F2** Medium | Search blocked event loop ~3.3 s | **CLOSED** | **[R]** `read-support.cjs:53-78`: incremental code-point counting, bounded snippet window, `setImmediate` yields with deadline/cancel checks. **[X]** 1 MiB line, 200 matches: 3.6 ms / 24.2 ms (was ~3,250 ms); event-loop max 10.7 ms; cancellation observed mid-line. |
| **F3** Medium | Spawn per file + O(RLIMIT) close loop | **CLOSED** | **[R]** One session per job (`reader-session.cjs`). macOS uses `proc_pidinfo(PROC_PIDLISTFDS)` with re-verification (`project-reader.c:90-104`). **[X]** 500-file search: 272 ms, 1 helper, complete. 100 reads: 271 ms. Descriptor probe: fd 3 and fd 37 closed with soft limit lowered to 16. **[M]** 500 files 854 ms with 1 helper; 100 reads 2,151 ms (≈21 ms per sandboxed spawn). |
| **F4** Medium | Home/system/userData roots | **CLOSED** (residual: N-1) | **[R]** Shared table; host `rootAllowed()` (`read-support.cjs:24-32`) and native `root_allowed()` (`project-reader.c:69-77`) both use inode identity, so case/normalization path aliases are caught. `DVL_USER_DATA` is passed to native. **[X]** Home, `/`, `/etc`, `/usr`, custom userData and its ancestors/descendants are refused by both layers before sandbox setup. Gap: `~/.kube`, `~/.gnupg`, `~/.azure` are still accepted as roots (N-1). |
| **F5** Low | False "complete" search | **CLOSED** | **[X]** Excluded directories → `DIRECTORIES_EXCLUDED`. Newline/CR query → `INVALID_REQUEST`. Depth refusal, `DIRECTORY_CHANGED`, invalid names and timeout keep earlier matches and expose counts **[S]**. A real tmpfs mount inside the project → listing `ENTRIES_SKIPPED`, search `FILES_SKIPPED` **[X]**. Note: denied names are intentionally omitted without a count (Info I-4). |
| **F6** Low | Stuck helper wedges slots/close | **CLOSED** (simulated) | **[R]** `reader-session.cjs:49-60`: SIGKILL, bounded grace, then `unref` and abandon. The abandoned helper still counts against the 2-helper ceiling (`service.cjs:136`). `close()` is bounded and returns counts (`:215-220`). **[S][X]** Never-closing child test passes. No real uninterruptible-I/O hang was induced. |
| **F7** Low | Policy gaps/divergence | **CLOSED** | **[R]** `read-policy.json` → generated `read-policy.h` (ASCII-only table, validated at generation). New key types and names added. **[X]** Table-driven denial of every entry plus its uppercase form, in JS and in the production native entrypoint directly. Header generation is deterministic. |
| **F8** Low | Helper output unvalidated | **CLOSED** | **[R]** `validateNative()` (`read-support.cjs:33-50`): exact key sets, whitelisted errors/modes/kinds, numeric ranges, hex/length consistency, decimal identity strings. Session framing: one line per pending call; unsolicited or trailing bytes → kill. **[X]** Malformed cases and a raw `PRIVATE_SECRET` error code → `RUNTIME_FAILED` with no leak. |
| **F9** Low | Lone surrogate in snippets | **CLOSED** | **[R]** Surrogate-aligned slice bounds (`read-support.cjs:66-69`). **[X]** Emoji fixture: column 41, `isWellFormed() === true`. |
| **F10** Low | Landlock rights incomplete | **CLOSED** (Linux) | **[R]** ABI ≥ 3 required (fails closed below). `REFER`, `TRUNCATE` always handled; `IOCTL_DEV` at ABI ≥ 5 (`:133-136`). **[X]** ABI 7 host: probe `truncateDenied: true` plus the original three. Network is still not restricted; this is not claimed. |
| **F11** Info | Hardening bundle | **CLOSED** | **[R]** Checked `append()`/`hex()` formatter (`:47-52`). Type pre-check before `open` means a FIFO is never opened. `EXDEV` refusal. Per-operation fd closed by the wrapper (`:197-200`). Fresh `openat(".")` per walk gives independent directory offsets. **[X]** FIFO → `NOT_REGULAR_FILE` with no hang; cross-mount read → `PATH_DENIED`. **[M]** Root with Arabic, quotes, backslash and spaces reads successfully post-patch. **[X]** Prefix-sibling (`project A-evil`) outside read denied under Landlock. |

---

## 4. Persistent session and Seatbelt parameter review

### Persistent native session

| Property | Assessment |
| --- | --- |
| Root/sandbox immutability | The root and identity are fixed by the first frame. Later frames carry only `op`, relative-path hex and offset. A second `session` header, `write` or `exec` → `INVALID_REQUEST` and exit **[X]** |
| Framing bounds | Every frame line must end in newline within fixed buffers. Overlong op, overlong relhex, odd hex, trailing junk, negative offset, and a truncated frame then EOF all exit with `INVALID_REQUEST` **[X]**. A truncated frame *without* EOF blocks in `fgets`; the host job timer bounds this (`reader-session.cjs:15`). |
| Serialization | Host allows one pending call (`call()` rejects re-entry). Native is single-threaded. |
| Descriptor hygiene | 520 operations covering success, NOT_FOUND, POLICY, symlink, hard link, FIFO, oversize, wrong-type, traversal and `read .`: helper fd count constant at 4 (stdio + rootfd) **[X]** |
| Root replacement mid-session | Rename and replace the root during a live session → subsequent read/list return `PROJECT_UNAVAILABLE` (path `lstat` vs bound identity) **[X]** |
| Cancellation / fencing | Real child cancelled after spawn → `CANCELLED`, reaped **[X][M]**. Rebind A → B 60 ms into a 400-file live search → `STALE_CONTEXT`, 0 children, 0 live PIDs; B then searches cleanly **[X]** |
| Shutdown | Normal EOF exit on `finish()`; 100 ms then SIGKILL then bounded grace; `close()` returns `{0,0,0}` after real workloads **[X]** |
| Generation coupling | A session belongs to one job, and a job to one context. `invalidate()` aborts → kill. `native()` re-checks the resolver and root identity before every call (`service.cjs:133,140`) |

### `sandbox_init_with_parameters`

- **Injection:** resolved. The profile is a constant string; the root is passed as data through `(subpath (param "DVL_PROJECT_ROOT"))`. No SBPL is assembled from user data. Control bytes are still rejected, which is harmless.
- **Exact root confinement:** `subpath` is component-bounded and evaluated on the kernel path of the opened vnode. The root must equal `realpath(3)` output, so roots that differ in case or normalization fail closed (`PROJECT_UNAVAILABLE` or `PERMISSION_DENIED`) rather than widening access. Not independently verified on APFS by me.
- **API availability:** this is undocumented SPI declared by `extern` (`:127`). If it is absent at link time, the build fails (closed). If it is absent at runtime, dyld aborts the helper, which the host maps to `RUNTIME_FAILED`. That is still fail-closed but mislabelled (I-2). Chromium uses the same pattern, which supports but does not guarantee future availability.
- **Errors:** the sandbox error buffer is freed and never surfaced.
- **Post-patch macOS negative evidence:** absent (see verdict and C-1).

---

## 5. New findings

### N-1 — LOW — Root policy accepts home credential directories the policy table already treats as sensitive

**Location:** `read-policy.json:7` (`homeTrees`), consumed by `read-support.cjs:30` and `project-reader.c:74`.
**Reproduction [X]:** on this host, with `~/.kube` containing a planted config file, `rootAllowed(~/.kube)` returns true. The native `list` helper with root `~/.kube` succeeds and lists the file. Same for `~/.gnupg`, `~/.azure`, `~/.password-store`.
**Impact:** if the user opens one of these folders as a project, ordinary file names inside (`config`, `accessTokens.json`, `msal_token_cache.json`) are readable. In C1a this requires the user's own choice; it matters once agents or providers read through C1b.
**Smallest fix:** in `generate-policy.cjs`, derive protected home trees as `homeTrees ∪ {each dot-prefixed entry of deniedNames}` (`.ssh .aws .kube .gnupg .azure .docker .config .dvl …`), and emit it for both layers.
**Regression test:** for each derived entry, create `~/<name>` (temp HOME for JS, real passwd home for native, or a test-only `DVL_HOME` hook), and assert host `bind` and direct native both return `PROJECT_UNAVAILABLE`.

### N-2 — LOW / Info — Deny list matches stored bytes with ASCII lowercase only

**Location:** `project-reader.c:57-62` `denied()`, `service.cjs:22-25` `denyName()`.
**Reproduction [X]:** a file *stored* as `credentialſ.json` (U+017F) is readable through the service (`STORED_FOLD_SECRET` returned).
The layers also diverge on Kelvin sign: JS denies `srv.Key` (U+212A), native alone would not. JS stops it on the service path.
**Impact:** small. On case-insensitive APFS, a file stored under such a spelling is what a tool opening `credentials.json` would get, but only if the file was first created with the exotic spelling. Mainstream tools write ASCII names.
**Smallest fix:** in native `denied()`, fold U+017F → `s` and U+212A → `k` (and treat `ß` as `ss`) into an ASCII skeleton before matching. Alternatively, deny any component containing those code points. Mirror this in JS.
**Regression test:** stored `credentialſ.json`, `.ſsh/config`, `srv.Key`. Assert `POLICY_DENIED` via direct native and via the service, on both ext4 and APFS.

### Info

- **I-1 (evidence):** `c1-native-repair.cjs` has no negative confinement assertion, so a `confine()` regression on macOS would be caught only by the `/etc/passwd` self-check. Add one outside-read and one prefix-sibling assertion to this suite, or always run it after `c1-boundary.cjs` in the same captured log.
- **I-2:** if the private SPI is missing at runtime, the error is `RUNTIME_FAILED`. Resolving it with `dlsym` and returning `BOUNDARY_UNSUPPORTED` gives an honest diagnosis.
- **I-3:** `rootTrees` does not cover `/var`, `/run`, `/boot`, `/opt` (Linux) or `/private/var` (macOS) **[X]**. These are unusual project choices; consider adding them alongside N-1.
- **I-4:** search reports `complete: true` while silently omitting policy-denied files. That is correct for not revealing existence, but the C1b API contract must say "complete over permitted files".
- **I-5:** projects inside iCloud Drive (`~/Library/Mobile Documents/…`) are refused by the `Library` home tree. This fails closed but is a functional limitation to document. Whether iCloud-synced `~/Documents` canonicalizes there is **unverified**.
- **I-6:** `getpwuid()` runs before `sandbox_init` (`:72`). On macOS it may leave an opendirectoryd Mach connection in the confined process. This matters only for defense in depth against a compromised helper; unverified.
- **I-7:** the 10,002-entry exact-name bound is fail-closed: positions 10,010 and 10,499 → `PATH_DENIED` **[X]**. A 2,000-file search in a 10.5k-entry directory took 1.87 s (`SCAN_LIMIT`).
- **I-8:** the header comment at `project-reader.c:2` ("One request per short-lived process") is stale.

---

## 6. Tests executed and evidence limitations

**Environment:** Linux 6.18.44 x86_64, **Landlock ABI 7**, Node v22.22.0, cc 13.3.0, root. All fixtures were in a scratch temp directory; the build ran in a copy of the package.

| Command / probe | Result |
| --- | --- |
| Manifest verification (41 entries) | 41/41 match |
| `node scripts/build-reader.cjs` | PASS (`-Werror`); header deterministic |
| `node tests/green-gate.cjs` (frozen B) | **24/24 PASS** |
| `node tests/c1-unit.cjs` | **16/16 PASS** (support probe `NOT_FOUND`, i.e. backend operational) |
| `node tests/c1-repair.cjs` | **16/16 PASS** (includes simulated-helper tests) |
| `node tests/c1-boundary.cjs` | **17/17 PASS**: `READY landlock`, `{"externalDenied":true,"writeDenied":true,"movedDenied":true,"truncateDenied":true}`, prefix-sibling fixture |
| `node tests/c1-native-repair.cjs` | **10/10 PASS**; aliases do not resolve on ext4 (vacuous for F1) |
| `probes2/session*.cjs` | Framing fuzz, 520-op fd stability, root swap — all fail closed |
| `probes2/scale*.cjs` | 10,002-entry bound fail-closed; large-directory timings |
| `probes2/roots.cjs` | N-1, I-3 |
| `probes2/fence.cjs` | Live-search A → B fencing clean; N-2 reproduced |
| `probes2/mnt.cjs` (tmpfs mount in project) | Cross-device read/list/search refused |

**Owner-reported (not executed by me):**
- Pre-parameter-patch v2 Mac run: B 24/24, control 16/16, repair control 16/16, original native 17/17 (boundary probe with old string profile), F1 aliases resolved and denied, special-root read failed with `PERMISSION_DENIED`.
- Post-parameter-patch: repair-native 10/10, tail only.

**Not established:**
- Post-patch macOS denial of write, moved directory, truncate and prefix sibling.
- No macOS, Node or SDK version recorded.
- No hash attestation of the source compiled on the Mac.
- Real uninterruptible-I/O hang (F6 simulated only).
- Real user project locations: TCC-protected folders, iCloud Drive, external volumes, network shares.
- Electron runtime.
- Atomic snapshot semantics (correctly not claimed).
- Universal secret detection (correctly not claimed).

---

## 7. Decision: may C1b begin?

**Yes, once C-1 is met.** C-2 to C-5 are conditions on C1b itself.

- **C-1 (before starting C1b):** on the target Mac, with the patched source, run the source-hash check from `C1A_REPAIR_V2_STATUS.md` §4 and then `npm test && npm run test:c1`. Capture the **complete** output, including `READY seatbelt` and a boundary line where all four of `externalDenied`, `writeDenied`, `movedDenied` and `truncateDenied` are true. Record macOS, Node and Xcode CLT versions. If any value is false, C1b does not start and this verdict reverts to FIX_REQUIRED.
- **C-2 (in C1b, before any non-user requester such as an agent or provider):** fix N-1. N-2 and I-1 to I-3 are recommended in the same change.
- **C-3:** C1b constructs exactly one `ProjectReadService` per app and passes the real `app.getPath('userData')`. The 2-helper ceiling is per instance.
- **C-4:** the IPC protections listed in v1 §6 (sender/frame validation, schema validation, text-only rendering, per-renderer limits, helper outside asar with a hash check, no content logging). These are next-stage requirements, not current defects.
- **C-5:** surface `close()` counts and the "complete over permitted files" semantics (I-4) honestly in the UI and API contract.

C1a: **PASS (scoped)**. Not frozen. No full C1 PASS.
