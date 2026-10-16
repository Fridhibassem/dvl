# C1A_INDEPENDENT_REVIEW.md — DVL C1a host-internal read backend

Reviewer: Claude (Opus 5.5), independent of the C1a author
Date: 2026-10-16
Lens: `distributed-ai-systems-orchestration-architect` skill was loaded (it is a role description, not a checklist); applied to authority boundaries, isolation, lifecycle, cancellation and failure handling.
Scope: C1a only — `native/project-reader.c`, `src/main/project-read-service.cjs`, build script, `tests/c1-unit.cjs`, `tests/c1-boundary.cjs`, `tests/boundary-probe.c`. Reference: Phase B repair v3 (GREEN / FROZEN). No implementation file was modified.

---

## 1. Verdict

**FIX_REQUIRED** (scoped to C1a and to the proposed next step, C1b IPC/UI wiring).

The OS-confinement core is sound in design and I independently reproduced it on the Linux/Landlock branch. But one C1a guarantee that the evidence documents present as established — *"Denied targets blocked across read/list/search"* — is **not established on the default macOS filesystem**: both policy layers forward Unicode case-fold aliases of denied names (`.ſsh/config`, `id_rſa`, `.awſ/credentialſ`) to `openat`, and case-insensitive APFS resolves such aliases to the real files. Seatbelt does not help here because the target is inside the root. This is the exact class of disclosure the policy exists to stop, and it becomes reachable the moment any less-trusted requester (renderer, agent, provider) can supply a `relativePath`.

Passing totals (B 24/24, control 16/16, native 17/17) are consistent with this defect: no test exercises an alias, and every "denied target" test is rejected by the JS layer before native code runs.

**Proceeding to C1b is not justified yet.** Required before C1b: F1 fixed and regression-tested on the target Mac; F2 fixed (it blocks the Electron main thread once wired); F4 root-policy decision enforced. Not a C1 PASS, not a freeze.

---

## 2. Artifact identification (done before review)

| Artifact | Role | How identified |
| --- | --- | --- |
| `DVL_GREEN_GATE_B_REPAIR_v3.zip` → `dvl-desktop-B-gate-v3/` | **Frozen reference** | Unzipped; own `SOURCE_SHA256.json` (11 entries) |
| Project docs `dvl-desktop-C1-candidate/` | **Implementation under review** | `SOURCE_SHA256.json` (23 entries); not present in any uploaded zip |
| `DVL_GREEN_GATE_B_REVIEW_v1`, `DVL_GREEN_GATE_B_REPAIR_v2`, `DVL_B_FINAL_REVIEW_v1`, `B10-workspace-panels-v1`, `dvl-spike-phase-1 2.zip`, `dvl_flock.{o,node}` | Historical / unrelated to C1a | Not used for any C1a conclusion |
| `GREEN_GATE_B_REVIEW*.md`, `GEMINI_REVIEW_BUNDLE_v3.md` inside the C1 candidate | Historical B evidence | Explicitly not treated as C1a review |

Source identity results (executed, §4):
- All 7 reviewed C1a files recreated from the project and hashed: **7/7 match** the candidate manifest, including `native/project-reader.c` = `3206e4e6…a383a05` (also the repaired hash cited in the Mac evidence).
- B application files in C1a (`main.js`, `preload.js`, `index.html`, `renderer.js`, `green-gate.cjs`, `native-secret-*.cjs`, `package-lock.json`): **byte-identical** to frozen B v3.
- `package.json` differs from B v3 only by four added `scripts` entries. No B source references the reader → **C1a is not exposed via Electron IPC/UI** (confirmed, not assumed).

---

## 3. Findings (ordered by severity)

### F1 — HIGH — Sensitive-name policy bypass via Unicode case-fold aliases on case-insensitive filesystems

**Location**
- `src/main/project-read-service.cjs:19-22` `denyName()` — uses `String.prototype.toLowerCase()`, which is not case folding.
- `src/main/project-read-service.cjs:23-31` `validPath()` — applies `denyName` to request components only.
- `native/project-reader.c:46-54` `denied()` — ASCII `tolower` only; `:56-62` `valid()`; `:87-91` `walk()` opens the requested bytes as-is.

**Failure scenario.** Project on default macOS APFS (case-insensitive, normalization-insensitive). Requester sends `readTextFile` with `relativePath: ".awſ/credentialſ"` (U+017F LATIN SMALL LETTER LONG S). `toLowerCase('ſ')` is `ſ`, so neither layer matches `.aws` / `credentials`. `openat` forwards the bytes; APFS case-folds `ſ`→`s` and resolves the real `.aws/credentials`. It is inside the root (Seatbelt allows), regular, `nlink==1` → contents returned. Same for `.ſsh/config`, `id_rſa`, `credentialſ.json`, and (under full case folding) `.ßh/…` (`ß`→`ss`). The native layer also misses U+212A KELVIN SIGN variants (`srv.Key`, `.Kube/…`); JS happens to catch those.

**Evidence (executed here).** Probe `alias.cjs` against the production JS policy and the production native binary:

```
".ssh/config"        JS: POLICY_DENIED  native: POLICY_DENIED
".ſsh/config"        JS: ALLOWED        native: NOT_FOUND   (reached openat)
"id_rſa"             JS: ALLOWED        native: NOT_FOUND
".awſ/credentialſ"   JS: ALLOWED        native: NOT_FOUND
".ßh/config"         JS: ALLOWED        native: NOT_FOUND
"srv.Key"            JS: POLICY_DENIED  native: NOT_FOUND   (native layer alone would pass it)
```

`NOT_FOUND` on this case-sensitive ext4 host proves the policy let the path through to the filesystem. I could **not** reproduce the final APFS resolution here (kernel lacks `CONFIG_UNICODE`; no Mac access). The APFS behavior is a high-confidence, standards-based expectation (Unicode case folding maps U+017F→`s`), **not an observed result**. Treat it as must-confirm on the target Mac; if APFS unexpectedly refuses the alias, downgrade to Medium (native/JS policy divergence remains).

**What is unaffected.** Directory listing and search filter on-disk `d_name` bytes, which are the canonical names, so `list`/`search` do not surface denied entries. The bypass is the direct `relativePath` (read, list of an aliased directory, search rooted at an aliased directory).

**Impact.** Disclosure of exactly the credentials the policy enumerates, on the default platform. Not exploitable through any exposed surface in C1a (host-internal), but it invalidates a guarantee that C1b and future agents/providers would rely on.

**Smallest fix.** Bind the policy check to the **on-disk** name, not the requested spelling, in native code (the layer that actually opens):
- In `walk()`, after each successful `openat`, obtain the component's stored name and apply `denied()` to it. On macOS: `fgetattrlist(nf, ATTR_CMN_NAME)` (returns the on-disk name); fallback: scan the parent with `readdir` and require a byte-exact `d_name` match, else fail `PATH_DENIED`.
- Optionally (defense in depth) in JS: reject any component whose NFKC + full case fold differs from its `toLowerCase()` and matches a denied name. Do not rely on JS alone; it cannot replicate filesystem folding.

**Regression test (target Mac, APFS case-insensitive).** Fixture files `.aws/credentials`, `.ssh/config`, `id_rsa` containing `SECRET_SENTINEL`. For each of `read`, `list`, `search` and each alias (`.awſ/credentialſ`, `.ſsh/config`, `id_rſa`, `.AWS/CREDENTIALS`, NFD/NFC variants), assert `POLICY_DENIED` or `PATH_DENIED` and that no response contains `SECRET_SENTINEL`. Add a native-only variant that calls the production binary directly (bypassing JS) to prove the native layer stands alone.

---

### F2 — MEDIUM — Search can block the host event loop for seconds (unbounded per-match work)

**Location.** `src/main/project-read-service.cjs:211-212`:
```js
const column  = Array.from(lines[i].slice(0, at)).length + 1;                 // O(at) per match
const snippet = Array.from(lines[i].slice(Math.max(0, at - 40))).slice(0, 240) // O(len - at) per match
```
The deadline (`checkJob`) is only consulted per directory page (`:186`) and before each helper spawn (`:126`), never inside the matching loop.

**Failure scenario.** A single 1 MB minified line with ≥200 matches (common in bundles under a non-excluded directory, or any file a requester points search at). Each match materializes an array of ~1M code points twice.

**Evidence (executed here).** Wrapping the service's own `native/read/list` from a probe: native+read+list = ~45 ms; **total search = ~3.3 s, i.e. ~3.25 s synchronous matching**, independently reproduced as ~3.27 s for the bare loop. (An earlier event-loop meter reported no stall; I traced that to a measurement artifact — the meter was disabled in the continuation that ran immediately after the block — and discarded it.)

**Impact.** C1a host is planned to be the Electron main process. A 3 s main-thread stall freezes every window and IPC; repeated requests compound. The per-request 5 s deadline does not bound it.

**Smallest fix.** Compute column incrementally (count code points from the previous match position only) and build the snippet from a bounded slice: `lines[i].slice(Math.max(0, at - 40), at + query.length + 480)` before `Array.from`. Add `checkJob(job)` every N lines/matches. Longer-term, move matching into the helper or a worker.

**Regression test.** 1 MB single-line file, 200 matches at the end and at the start; assert search completes in < 200 ms (generous) and that `monitorEventLoopDelay` max < 100 ms, sampled **after** yielding one macrotask.

---

### F3 — MEDIUM — Search throughput: one sandboxed helper per file plus an O(RLIMIT_NOFILE) close loop under one 5 s deadline; macOS cost unmeasured

**Location.** `native/project-reader.c:97` (`for(rlim_t fd=3;fd<lim.rlim_cur;fd++)close((int)fd);`), `service.cjs:42` (`timeoutMs` 5000 for the whole search), `:201` (one `read()` → one spawn per file).

**Assessment of the repaired descriptor loop.** Correctness: closes every fd in `[3, rlim_cur)`, fails closed on infinite/unrepresentable limits, runs before confinement and before reading stdin — correct for the threat (Seatbelt does not revoke already-open descriptors). It cannot close fds `≥ rlim_cur`, which exist only if a parent lowered its limit after opening them; not the case for Node/Electron. Cost: Node raises the soft limit at startup (binary search up to 2^20; macOS clamps to `kern.maxfilesperproc`, commonly ~10^5 or more), and the child inherits it. That means up to ~10^5 `close()` syscalls per helper, per file. **Estimate, not measured.**

**Evidence (executed here, Linux only).** 1,500 small files: search returned `TIMEOUT` after 1,320 files in 5.0 s (~3.8 ms/spawn) — and Linux uses one `close_range` call, not the loop. macOS adds `sandbox_init` (profile compile) and the loop per spawn, so the advertised 2,000-file `SCAN_LIMIT` is likely unreachable; search will usually return `partialReason: TIMEOUT`. Results are honestly labeled partial, so this is a functional/availability defect, not a disclosure.

**Smallest fix.** On macOS enumerate open fds with `proc_pidinfo(getpid(), PROC_PIDLISTFDS, …)` and close only those ≥3 (fail closed if the call fails). Then measure and record per-spawn latency on the target Mac; set search budgets from data.

**Regression test.** Mac: print the child's `rlim_cur`; time 100 sequential `read`s; assert a 500-file search completes without `TIMEOUT`. Native probe variant: spawn the production helper with inherited fds 3..N pointing outside the root and assert (via a test-only build that `fcntl(F_GETFD)`s after the close step) that all return `EBADF`.

---

### F4 — MEDIUM (C1b blocker; LOW within C1a) — Root policy permits home, `/Users`, `/private`, parents of `userData`

**Location.** `native/project-reader.c:108` rejects only `/`, `/etc`, `/private/etc`. B v3 `main.js:48-59,191,494-504` registers any canonical directory chosen in the dialog. The resolver is "trusted", but it imposes no root policy.

**Failure scenario.** User opens `~` (or `~/Library`) as a project. The reader then exposes `~/Library/Application Support/dvl-desktop/dvl.sqlite`, `desktop-state.json` and logs (DVL's own state), `~/.config/gh/hosts.yml`, `~/.docker/config.json`, browser profile databases, shell history — none matched by the name policy. The `/etc/passwd` self-check rejects `/private` only by accident.

**Impact.** Current: low (host-internal, user-chosen). After C1b, with agent/provider requesters: disclosure of DVL's own state and user credentials outside any reasonable project.

**Smallest fix.** Enforce a root policy in the service (and mirror it natively): reject `$HOME` itself and its ancestors, `/Users`, `/private`, `/System`, `/Volumes` roots, and any root that equals or contains `app.getPath('userData')`. Return `PROJECT_UNAVAILABLE`.

**Regression test.** `bind()` with resolver paths `$HOME`, `dirname(userData)`, `/private`, `/Users` → `PROJECT_UNAVAILABLE`; a normal subfolder of `$HOME` binds.

---

### F5 — LOW — Search completeness misreported in several cases

**Location.** `service.cjs:193` (excluded names), `:169` (list `skipped` ignored by search), `:202` (codes treated as skippable), `:185-188` (list errors propagate).

**Evidence (executed here).**
- `build/x.txt` containing `NEEDLE`, search from `.`: `matches: 0, complete: true`. `node_modules|vendor|dist|build|coverage` are silently skipped yet reported complete.
- Query `"foo\nbar"` against a file containing that text: `ok: true, matches: 0, complete: true`. Queries containing `\n` can never match (lines are split first) but are accepted.
- A tree deeper than 64 components: **whole search fails** `PATH_DENIED`; the valid top-level match is discarded. Same for any `DIRECTORY_CHANGED`, `BUSY` (64-cursor cap shared with UI paging) or `RUNTIME_FAILED` from one listing.
- Names skipped by `validPath` in listings (`:`/`\` in filename, invalid UTF-8) are not counted in search `skipped`.

**Fix.** Report `excludedDirectories` and set `complete:false` when any were skipped; reject `\n` in queries (or match over full text); treat per-directory list failures as `skip(code)` with partial result; add `page.skipped` to search skip counts.

**Regression test.** One case per bullet asserting `complete:false` with a specific `partialReason`/skip count, and that earlier matches survive.

---

### F6 — LOW — Stuck helper can wedge both slots and make `close()` unbounded

**Location.** `service.cjs:131` (`stop` sends SIGKILL once), slot release only on `close` event; `:229-232` `close()` loops `while (this.jobs.size)` with no ceiling.

**Scenario.** Project on a hung network mount (SMB/NFS). Helper blocks in uninterruptible I/O; SIGKILL stays pending; `close` never fires. Two such helpers hold both slots permanently; further requests queue then `BUSY`; app quit hangs in `close()`.

**Fix.** After SIGKILL + grace (e.g., 2 s), settle the job with `TIMEOUT`, `unref()` the child, track it in a capped "abandoned" count that still counts against a global helper ceiling; give `close()` a bounded wait that reports abandoned helpers.

**Regression test.** Inject a fake `spawn` whose child never emits `close`; assert the request settles, `close()` returns within the bound, and the abandoned counter caps new spawns.

---

### F7 — LOW — Name policy coverage inconsistent with its own intent

**Location.** `project-reader.c:46-54`, `service.cjs:19-22`. Covers `id_rsa*`, `id_ed25519*` but not `id_ecdsa*`, `id_dsa*`; misses `.git-credentials` (plaintext tokens), `.docker`, `.pgpass`, `.vault-token`, `kubeconfig`, `*.tfstate`, `.htpasswd`, `*.keystore`/`*.jks`.
The docs correctly state naming is not universal secret detection; this is about obvious gaps before agents get read access.
**Fix.** Extend both lists identically; generate both from one source table. **Test.** Table-driven denial test run against both JS and the native binary.

### F8 — LOW — Helper output not schema-validated

**Location.** `service.cjs:144` passes any helper `error` string through as the error code; `:170` passes `kind`, `size`, `offset`, `mode`, `dev`, `ino` unchecked. A malfunctioning or compromised helper (still confined to the root) can inject arbitrary error codes or kinds.
**Fix.** Whitelist error codes; validate `kind ∈ {file, directory}`, integer ranges, `mode ∈ {seatbelt, landlock}`. **Test.** Fake helper emitting each malformed field → `RUNTIME_FAILED`.

### F9 — LOW — Snippets can contain ill-formed UTF-16

**Location.** `service.cjs:212`. `slice(at - 40)` can split a surrogate pair.
**Evidence (executed).** `'😈' + 'x'×39 + 'NEEDLE'` → snippet begins with lone `U+DE08`, `isWellFormed() === false`.
**Fix.** Slice on code-point boundaries (adjust start if it lands on a low surrogate). **Test.** That fixture; assert `snippet.isWellFormed()`.

### F10 — LOW — Linux Landlock branch incomplete (not claimed qualified)

**Location.** `project-reader.c:73-77`. No ABI query; handled set omits `REFER` (v2), `TRUNCATE` (v3), `IOCTL_DEV` (v5). `truncate(2)` outside the root is therefore not restricted; Landlock does not restrict network. No current code path calls these, so this only matters if the helper is compromised.
**Fix.** Query ABI, handle every known right for that ABI, fail closed below a minimum ABI. **Test.** Probe asserts `truncate()` on an outside writable file fails `EACCES`.

### F11 — INFO — Hardening notes (no current exploit)

- `project-reader.c:120,127,134`: `used += snprintf(...)` pattern would overflow on truncation (`sizeof output - used` underflows). Current bounds make it unreachable (max list output ≈ 420 KB; max read ≈ 2.10 MB < 2.10 MB+4 KB buffer). Clamp `used` after each call.
- Direct `read` of a FIFO opens its read end (`O_NONBLOCK`) before `S_ISREG` is checked, which can wake a blocked writer. `fstatat(…, AT_SYMLINK_NOFOLLOW)` on the final component first narrows this.
- Search crosses mount points (`st_dev` changes) without restriction; consider `-xdev` semantics.
- Seatbelt string escaping (`:66-68`) is correct by inspection (`"` and `\` escaped, control bytes rejected, `subpath` is literal), but untested with quote, backslash or non-ASCII roots (see §5).
- Status doc says read-runtime tests need Node ≥24; they passed here on Node 22.22.0.

---

## 4. Files inspected and commands actually executed

**Inspected:** C1a `C1A_INDEPENDENT_REVIEW_REQUEST.md`, `C1A_STATUS_AND_MAC_TESTS.md`, `C1A_MAC_EVIDENCE_2026-10-16.md`, `SOURCE_SHA256.json`, `package.json`, `native/project-reader.c`, `src/main/project-read-service.cjs`, `scripts/build-reader.cjs`, `tests/c1-unit.cjs`, `tests/c1-boundary.cjs`, `tests/boundary-probe.c`. Frozen B v3: `SOURCE_SHA256.json`, `package.json`, `src/main/main.js` (registry/root handling), hashes of all B app/test files.

**Executed (Linux 6.18.44 x86_64, Landlock ABI 7, Node v22.22.0, cc 13.3.0, root; all fixtures in a scratch temp dir):**

| Command | Result |
| --- | --- |
| `sha256sum` on 7 recreated C1a files | 7/7 match candidate manifest |
| `sha256sum` on B v3 files vs C1a manifest | All B app/test files identical; `package.json` scripts-only diff |
| `node scripts/build-reader.cjs` | Build OK (`-Werror`) |
| `node tests/c1-unit.cjs` | **16/16 PASS**, support probe `NOT_FOUND` |
| `node tests/c1-boundary.cjs` | **17/17 PASS**, `READY landlock`, `{"externalDenied":true,"writeDenied":true,"movedDenied":true}` |
| `probes/alias.cjs` | F1 policy bypass confirmed at policy layer |
| `probes/perf*.cjs`, `where.cjs` | F2 ~3.25 s sync matching; F3 1,500-file search `TIMEOUT` at 1,320; F5 completeness cases |
| `probes/misc.cjs` | Deep-tree search abort (F5); native wrong-inode → `PROJECT_UNAVAILABLE` (works); lone surrogate (F9) |
| `probes/fd.cjs` | Inherited fds 3,4 closed before confinement on Linux (`close_range` path) |
| `mount -t tmpfs -o casefold=…` | **Failed**: kernel lacks `CONFIG_UNICODE`; APFS-equivalent resolution not reproducible here |

Not executed: anything on macOS; B regression `npm test` (requires Electron dependency tree; B source is byte-identical to frozen v3, so I relied on that identity rather than re-running).

---

## 5. Evidence assessment

**User-supplied (Mac, not executed by me):** B 24/24 (run *before* the native-only repair; B source unchanged since, which I confirmed by hash), C1a control 16/16, native 17/17 on darwin x64, probe `READY seatbelt` with all three denials true. Node/compiler/OS versions not reported. No hash attestation of the source actually compiled on the Mac — the user applied the repair locally to the original zip; I can only confirm the project candidate equals the manifest.

**Independent (executed by me):** the same suites pass on the Linux/Landlock branch, which the author could not run (ENOSYS). This is new evidence for Linux, **not** for Seatbelt.

### Established (to the stated degree)
- No Electron/IPC/UI exposure; B application source unchanged from frozen v3.
- Requests cannot carry a root; root bound to resolver + `(dev, ino)` at host and helper (helper check verified by my probe).
- Lexical traversal, absolute, backslash, drive, NUL, `.`/`..` rejection.
- `O_NOFOLLOW` component walk refuses symlinks (parent and leaf); hard links (`nlink≠1`) and non-regular files refused on read and hidden in listings.
- OS confinement mandatory with fail-closed refusal; on Linux, outside read, in-root write and moved-directory read are kernel-denied (my run); on macOS, same per user-supplied run.
- Inherited descriptors closed before confinement (Linux verified; macOS loop correct by inspection).
- Bounded output, read size, list page/entry limits, queue (2+8), request-id set, cursor single-use; A→B→A generation fencing; helper killed and reaped on cancel/timeout in the fake-helper tests.
- No writes and no `.dvl` creation in the fixture.

### Not established / unproven
- **Sensitive-name policy on case-insensitive APFS (F1)** — expected to fail.
- Any guarantee for real project locations: all runs used `$TMPDIR`. Untested: `~/Documents`/`~/Desktop` (TCC), iCloud Drive, external/HFS+ volumes, firmlink paths, roots with non-ASCII, `"` or `\`.
- Seatbelt `subpath` boundary vs a prefix sibling (`project A` vs `project A-evil`).
- In-flight native cancellation and fencing: the real-helper tests at `c1-boundary.cjs:110-111,142` cancel or rebind synchronously before the first `await`, so the job aborts **before** any helper is spawned. Only fake helpers exercise kill-mid-flight.
- Native root identity check: `c1-boundary.cjs:116` is caught by the host `current()` check first; the helper-side check is untested by the suite (I verified it separately).
- `c1-boundary.cjs:82` "Denied targets blocked" exercises only the JS layer (all paths rejected before native). Only `.env` is tested natively (`c1-unit`).
- `c1-unit.cjs:70` accepts `NOT_FOUND` or `BOUNDARY_UNSUPPORTED`, so it passes whether or not confinement works (correctly labeled non-security, but it is not evidence of anything).
- Race behavior beyond the single moved-directory schedule; growing files under load; permission-denied paths; macOS performance (F3); stuck-helper behavior (F6).
- Atomic snapshot semantics — correctly **not** claimed by the author; reads are authorization-at-open with post-checks.

---

## 6. Readiness for C1b (validated IPC + Files UI)

**Not justified until:** F1 fixed with the native-level regression passing on the target Mac; F2 fixed; F4 root policy enforced. F3 measured on the Mac (fix if search is routinely `TIMEOUT`). F5–F10 may be scheduled, but F5 should land before search results are shown as "complete" in the UI.

**Protections C1b must add (next-stage requirements, not current defects):**
1. IPC sender validation: accept only the main frame of the app's own `webContents`, check `event.senderFrame.url` against the packaged origin; reject subframes and navigated frames.
2. Renderer may never choose a root; it may only reference a `projectId` known to the registry; `bind` stays main-process-initiated and returns the generation.
3. Schema-validate every IPC payload against the exact key sets already enforced in `request()`; catch and code-map the exceptions `cancel()` and `bind()` currently throw.
4. Render file contents and snippets as text only (no `innerHTML`); CSP unchanged from B.
5. Per-renderer rate limits on top of the 2+8 queue; per-request-id ownership so one renderer cannot cancel another's jobs.
6. Ship the helper outside `app.asar` (asar-unpacked), verify its hash at startup, fail closed if missing or modified.
7. Never log paths, queries or contents (the current service already avoids this; keep it under IPC logging).
8. Rerun B native regressions plus the C1a native suite inside Electron (not plain Node) on the target Mac before any C1 acceptance.

Full C1 PASS / freeze: **not declared.** C1a: **FIX_REQUIRED**.
