# H2 Adapter / Kernel Spool Isolation Report

Scope: H2 only — adapter/Kernel spool isolation. Base `main` at `f376652` (H1 merged). Work branch
`claude/h2-adapter-spool-isolation`. No H1/H3/H4 work, no architecture redesign, no Stable
Contract change.

> **Guarantee corrections:**
> - **Second re-review:** statements in §4, §7 and §9 that the Kernel "never writes through" or "cannot be redirected" to adapter-moved/aliased targets **overstate** what userspace code can guarantee against a same-user process.
> - **Third review:** §10.1's claim that final-window mutations are "detected immediately" also **overstates**. Validation observes the *current* state only, so a transient mutation that is undone before the post-write check is not detected. In addition, a record refused live could regain authority on replay. Both are fixed or downgraded in §11.
>
> - **Fourth review:** §11's model let an unreachable host anchor still install authority, let an `onCommit` failure diverge live state from the host boundary, and recovered without re-binding the logs. All three are fixed in §12.
>
> - **Fifth review:** a count-0 host anchor with a wrong MAC was treated as a valid boundary, and recovery checked the committed prefix by size only while it ran. Both are fixed in §13.
>
> The authoritative statement of what H2 guarantees, and what needs OS isolation, is **§11.1 as amended by §12.1 and §13.1**. Earlier sections are kept as the historical record of each review round.

## 1. Inspection findings (before any code change)

### Already implemented on `main`

The H2 groundwork landed with the H1 lineage and is covered by C04/C07/C11/C13/C17.

**Two separate areas:**
- `.dvl/spool/<adapterInstanceId|kernel>/` is Kernel-owned.
- `.dvl/adapter-spool/<adapterInstanceId>/` is the only untrusted area. It's passed to the adapter via `DVL_ADAPTER_SPOOL_DIR`.
- Both are created with non-recursive `mkdir` per instance, so a new instance never shares or inherits one.

**Import (`importAdapterArtifact`):**
- The claimant must be the sending instance.
- The claimed path must be *exactly* `.dvl/adapter-spool/<own id>/<safe name>`.
- The area must be a real directory.
- The file is opened with `O_NOFOLLOW` and must be a regular file.
- Size and hash are verified over bytes read once.
- The bytes are copied into the Kernel spool under a Kernel-chosen name, and a `kernel.artifact_registered` provenance record is appended.

**Verification:**
- `verifyKernelArtifact` binds every ref field to the Kernel registration, then re-hashes the bytes.
- Location alone never confers trust.

**Durable logs:** both are HMAC chains keyed by a host-held key, so adapter-written records never authenticate (C13).

### Gaps reproduced on unchanged `main`

These came from a scratch probe against `EventStore`. Each probe below was a successful attack.

| # | Probe | Result on `main` | Invariant hit |
|---|---|---|---|
| P1 | Kernel spool owner dir `.dvl/spool/<aid>` replaced by a symlink to an outside dir, then a Kernel spool write (`spoolArtifact`) | **Kernel wrote the artifact into the outside directory** and registered it | 2, 5, 6 |
| P2 | `.dvl/events/events.jsonl` replaced by a symlink to an outside file, then a Kernel append | **Kernel appended its record to the outside file** | 2, 5, 6 |
| P3 | Kernel-owned registered artifact hard-linked into the adapter area and claimed with the correct hash | **Imported** (`ok: true`): Kernel-owned bytes re-entered as "adapter output" | 3, 6, 7 |
| P4 | `.dvl/adapter-spool` root replaced by a symlink to an outside dir | **Import accepted from outside the project** (the realpath check compared against the symlinked root itself) | 5, 6 |
| P5 | Provenance of a valid import | Registration lacked the **source path** in the adapter area and the **citing event** | 4 |

**Also found by reading the code:** the transport opens the queue-overflow diagnostics file lazily with flag `"a"`. That flag follows a symlink an adapter planted in its Kernel spool dir, so the same write-through-symlink class as P1 applies to frames the adapter controls.

## 2. H2 implementation plan (written before modifying code)

| Step | Change | File | Invariants |
|---|---|---|---|
| A | The canonical project root (`realpath`) is fixed at `EventStore` construction. A helper asserts a Kernel-owned directory is a real directory whose `realpath` equals its expected canonical path, so no symlinked component exists anywhere below the root. It's checked at construction (fail-closed: the Kernel refuses to open a store whose Kernel-owned dirs are symlinked) and before every Kernel write. | `event-store.ts` | 1, 5, 6 |
| B | Kernel spool writes are exclusive and no-follow: temp file via `O_CREAT\|O_EXCL\|O_NOFOLLOW`, a post-write identity check (directory inode unchanged, the temp name still maps to the written inode, `nlink == 1`), rename, then a final-name identity check. Registration happens only after all checks pass, otherwise the write throws. | `event-store.ts` | 2, 3, 6 |
| C | Durable log appends open with `O_APPEND\|O_CREAT\|O_NOFOLLOW`, require a regular file, and check the log directory (step A). A symlinked log is refused, and the in-memory chain is not advanced. | `event-store.ts` | 2, 6 |
| D | Import hardening: <br>(1) the area must canonically equal `<canonical root>/.dvl/adapter-spool/<id>` (fixes P4); <br>(2) reject `nlink != 1` hard-link aliases (fixes P3); <br>(3) a post-open identity re-check (area inode unchanged, the name still maps to the opened inode) narrows the check/open race, since Node has no `openat`; <br>(4) a Kernel-side write failure becomes a rejected import (`CORRUPTED` evidence), never a crash of the ingest path. | `event-store.ts` | 3, 5, 6, 7 |
| E | Import provenance gains `sourcePath` (the validated adapter-area path) and `sourceEventId` (the adapter event that cited it), both in `kernel.artifact_registered` and in `kernel.artifact_imported`. | `event-store.ts`, `kernel.ts` | 4 |
| F | Transport diagnostics files are created exclusively and no-follow: stderr/noise eagerly at construction, queue-overflow still lazily (C08 relies on its absence). A pre-planted entry is refused: overflow frames are still counted and never processed, and the refusal is counted. If the transport can't be built, `spawnAdapter` kills the just-spawned child instead of orphaning it. | `ndjson-transport.ts`, `kernel.ts` | 2, 6 |
| G | Mock-adapter adversarial step `alias_and_finish`: hard-link a Kernel-owned artifact into the adapter's own area and claim it with an exact hash (end-to-end P3). | `mock-provider.ts`, `scenarios.ts` | tests |
| H | New regression suite C20, plus a full run of C01–C19 (H1 C18/C19 unchanged). | `c20-*.test.ts` | 8 |

**Out of scope, stated explicitly:**
- an OS-level sandbox (the adapter remains the same OS user);
- `openat`-grade race freedom;
- Kernel-spool retention/GC;
- `chmod`-based write protection;
- the `.dvl/tx` attempt-workspace write paths;
- any contract change.

## 3. Exact changed files

| File | Kind | Change |
|---|---|---|
| `dvl-spike/src/kernel/event-store.ts` | production | Canonical root; `ownedDir` containment check; exclusive no-follow `writeKernelFile`; no-follow log appends; import hardening (canonical area, `nlink`, post-open identity re-check, refusal → rejection); `SpoolIntegrityError`; provenance fields `sourcePath` and `sourceEventId` |
| `dvl-spike/src/kernel/kernel.ts` | production | Passes `sourceEventId` into import; `kernel.artifact_imported` gains `path`, `sourcePath`, `sourceEventId`; transport construction extracted into `newTransport`, with failure cleanup (kill child, fence instance, `kernel.adapter_spawn_failed`) |
| `dvl-spike/src/kernel/ndjson-transport.ts` | production | Diagnostics files via `openDiagnostic` (`O_CREAT\|O_EXCL\|O_NOFOLLOW`, append); overflow file stays lazy but exclusive; `stats.overflowSpoolRefused` |
| `dvl-spike/src/mock-provider/mock-provider.ts` | test infrastructure | Adversarial step `alias_and_finish` (hard-link a Kernel-owned artifact into its own area and claim it) |
| `dvl-spike/src/mock-provider/scenarios.ts` | test infrastructure | Step type plus scenario `artifact-hardlink-alias` |
| `dvl-spike/src/conformance/c20-h2-adapter-kernel-spool-isolation.test.ts` | **new** test suite | 7 tests (below) |
| `CLAUDE_REPORTS/H2_ADAPTER_SPOOL_ISOLATION_REPORT.md` | report | This file |

**Not changed:**
- C01–C19;
- the harness;
- `types.ts`;
- the Stable Contract;
- `HARDENING.md`;
- `README.md`.

## 4. H2 invariants: what implements each one

1. **The adapter-writable area is separate from the Kernel-owned area.**
   - `.dvl/adapter-spool/<id>/` (untrusted, the only path given to the adapter) is distinct from `.dvl/spool/<id|kernel>/` and the logs.
   - Both areas are created fresh per instance. The store refuses to open if any Kernel-owned directory isn't a real directory at its canonical location.
   - Pre-existing on `main`; containment is now checked against the canonical root.
2. **Kernel-owned evidence/spool/truth files can't be directly overwritten by adapter output.**
   - The Kernel never writes through anything the adapter could plant *(overstated; see §10.1 for the actual guarantee)*:
     - spool files use exclusive no-follow create plus identity checks;
     - log appends are no-follow and require a regular file;
     - diagnostics files are exclusive and no-follow.
   - Direct overwrites by the adapter process are possible (same OS user, no sandbox), but they are **detected and never trusted**:
     - artifact bytes are checked against the registration and hash;
     - log records are checked against the HMAC chain.
3. **Imported adapter artifacts are copied by Kernel-controlled code.**
   - The bytes are read once through a no-follow fd from a single-link regular file and verified.
   - The Kernel writes its own copy under a Kernel-chosen name: a new inode, never a move or link.
   - The adapter file is never referenced afterwards.
4. **The Kernel records provenance for imported material.** The authenticated `kernel.artifact_registered` record carries:
   - origin `import`, `adapterInstanceId`, run and attempt;
   - `sourceArtifactRef`, `sourcePath`, `sourceEventId`;
   - hash and size.

   `kernel.artifact_imported` mirrors it, and replay rebuilds it.
5. **Paths are canonicalised and checked against allowed roots.**
   - The canonical root is fixed at construction.
   - Every Kernel-owned directory must `realpath` to exactly `<canonical root>/<relative path>`.
   - The adapter area must canonically equal `<canonical root>/.dvl/adapter-spool/<own id>`.
   - Claimed paths must match `.dvl/adapter-spool/<own id>/<safe name>` byte-for-byte; no normalisation is applied, so any variant is rejected.
6. **Path traversal and symlink escapes are rejected.** This covers:
   - `../`, absolute paths, backslash, NUL;
   - nested directories, other instances' areas, the Kernel spool;
   - symlinked files, symlinked areas, a symlinked `adapter-spool` root;
   - symlinked Kernel spool directories and logs, planted diagnostics links;
   - hard-link aliases.
7. **Adapter path claims are not trusted without Kernel validation.**
   - The claimed owner must equal the sending instance.
   - The claimed path, size and hash are all re-derived by the Kernel.
   - The claim's own id and path are never reused in a Kernel ref.
8. **Existing H1 behaviour stays green.** C18 8/8 and C19 3/3 pass, as do all other pre-existing suites.

## 5. Tests added: C20 "H2 adapter/Kernel spool isolation"

1. **Claims outside the permitted area import nothing.** Covered claims: `../` to the Kernel spool, `../` to another instance's area, `../` out of the project, absolute paths, the Kernel spool, `events.jsonl`, another instance's area, and a foreign owner id. Nothing is registered or materialised; a control claim inside the own area imports.
2. **Read-side symlink escapes are rejected:** a file link, an area link, and a symlinked `adapter-spool` root (P4).
3. **Kernel spool writes never follow a planted symlink** (P1).
   - At store level, for both an instance owner and `kernel`.
   - The import path turns the refusal into a rejection.
   - End to end: a hijacked live spool gives `CORRUPTED` evidence, no import, and nothing written outside.
4. **Overwrite attempts on Kernel-owned material:**
   - an imported artifact rewritten in place is rejected live and after replay;
   - an evidence record upgraded to `VALIDATED` fails to authenticate;
   - both logs swapped for symlinks: the append is refused, the victim file is unchanged, and in-memory history is not advanced (P2);
   - a Kernel-owned directory swapped for a symlink: the store refuses to open.
5. **Diagnostics:**
   - a symlink planted at the queue-overflow path receives nothing; the frames are counted (`overflowSpoolRefused`) and never processed;
   - stderr/noise paths planted before open are refused.
6. **Hard-link alias, end to end** (`artifact-hardlink-alias`, P3): the genuine artifact gives `PERSISTED`, the alias gives `CORRUPTED` ("hard-linked"), exactly one import happens, and the Kernel file still verifies. A store-level check also covers a hard link to a file outside the project.
7. **Valid import:**
   - the Kernel-chosen path and id differ from the claim;
   - the hash equals the adapter bytes, the Kernel copy and the registration;
   - the copy is a distinct inode with `nlink` 1;
   - full provenance is recorded (P5) in both the registration and `kernel.artifact_imported`;
   - rewriting or deleting the adapter source doesn't affect the Kernel copy;
   - provenance is rebuilt on replay.

### Fail-before / pass-after evidence

- **Against the original `main` Kernel** (`event-store.ts`, `kernel.ts` and `ndjson-transport.ts` from `f376652`, with the new mock step): C20 gives **6 failed / 1 passed**.
  - Test 1 passes there by design: it pins pre-existing containment behaviour.
  - The other six fail on their intended assertions.
- **Per-guard mutations** (each applied alone, then restored byte-for-byte):

| Guard disabled | Failing C20 tests |
|---|---|
| M1 `nlink` check | 6 |
| M2 canonical-root area check (old realpath comparison) | 2 |
| M3 `ownedDir` containment check | 3, 4 |
| M4 `O_NOFOLLOW` on log append | 4 |
| M5 overflow file opened with `"a"` | 5 |
| M6 import provenance fields | 7 |
| M7 post-open identity re-check | **none** (see limitations) |

## 6. Results (at reviewed commit `e94919b`; current results: §9.6)

| Command | Result |
|---|---|
| `npm test` run 1 | exit 0 — 20 files, **126/126 passed** |
| `npm test` run 2 | exit 0 — 20 files, **126/126 passed** |
| `npm test` run 3 | exit 0 — 20 files, **126/126 passed** |
| `npm run typecheck` | exit 0 |
| `npm run spike` | exit 0 — "SPIKE OK — every scenario reached its expected terminal state" |
| C18 + C19 (H1) | 11/11 passed |

Per suite: C01 6, C02 4, C03 6, C04 4, C05 4, C06 13, C07 10, C08 14, C09 4, C10 7, C11 7, C12 5,
C13 6, C14 8, C15 5, C16 3, C17 2, C18 8, C19 3, **C20 7**. The count was 119 before this change.

## 7. Known limitations at `e94919b` (superseded by §9.7)

- **No OS sandbox.** The adapter is the same OS user and can still physically write, delete or replace any file under the root, including Kernel spool files and logs.
  - H2 guarantees the Kernel never *reads adapter material from outside its own area* and never *writes through adapter-planted paths*. It also guarantees adapter overwrites are *detected* (registration plus hash, HMAC chain) and never trusted.
  - Prevention of the write itself needs OS isolation: a separate user, a container, or a read-only bind mount.
  - **Deletion and tail truncation remain availability attacks.** Truncation is detectable only with the host-held head anchor (C13).
- **No `openat` in Node.**
  - Directory checks and the subsequent open/rename are separate syscalls.
  - The post-open and post-write identity re-checks (directory inode unchanged, name ↔ inode) narrow the window but do not close it as `openat`/`O_BENEATH` would.
  - The import-side re-check (M7) is **not covered by a deterministic test**: it needs a concurrent swap between two syscalls.
- **Hard-link check scope.** `nlink == 1` rejects aliases of existing inodes. An adapter can still *copy* any file it can read into its area and import that copy. That is ordinary adapter output (same user, same read access): provenance records it as adapter-sourced, and it confers no Kernel authority.
- **Spawn-failure cleanup is untested.** The failure path in `spawnAdapter` (kill the child, fence the instance, `kernel.adapter_spawn_failed`) can't be triggered deterministically: the Kernel creates the directory and opens the files microseconds apart, before the child can run. The transport-level refusal it relies on *is* tested (C20-5).
- **A planted overflow path loses diagnostics.** If the adapter plants the overflow path, the rejected frames are counted but not written: diagnostics are lost by the adapter's own action, never processed.
- **Out of scope, unchanged:**
  - `.dvl/tx` attempt-workspace writes;
  - Kernel-spool retention/GC;
  - `chmod`-based protection (ineffective as root and against the same user);
  - Windows (`O_NOFOLLOW` is POSIX; the spike already relied on it).

## 8. Ready for Codex review? (at `e94919b` — result: H2 REVIEW FAIL, see §9)

**Yes — ready for Codex review of H2.**
- Every gap found during inspection (P1–P5 plus the overflow diagnostics link) was reproduced before the fix and is now pinned by a C20 test that fails without its guard.
- All 126 tests pass three times; typecheck and spike pass.

**Not claimed here:**
- an H2 PASS (that is the reviewer's verdict);
- any change to `main` (not pushed, not merged);
- protection that needs OS-level isolation.

## 9. Codex Review Failure Fixes

**Context:**
- Codex reviewed `e94919b` and returned **H2 REVIEW FAIL** with four blockers.
- The referenced probe file `dvl-spike/src/conformance/h2-review-probes.test.ts` is **not present in the repository** on any branch (`main`, this branch, or other remotes), so it could not be run or converted directly. Each blocker's described probe was re-implemented as a regression assertion in the new suite **C21**. Every assertion checks rejection and no outside write, never the old behaviour.

### 9.0 Approach: one confinement layer for every Kernel filesystem access

**New file `dvl-spike/src/kernel/confined-fs.ts`.**

- `Confinement` fixes the canonical root (path *and* inode) at construction.
- `openDir(rel)` walks Kernel-owned directories component by component and never follows a symlink.
  - **`procfd` mode (Linux, default):** each step is `open("/proc/self/fd/<parentFd>/<component>", O_DIRECTORY|O_NOFOLLOW)`. The final `open`/`mkdir`/`rename`/`lstat` is also issued relative to the held directory fd. This is **directory-relative no-follow confinement**: Node's nearest equivalent to `openat`. A swap after the walk cannot redirect the operation; it lands in the directory inode the Kernel holds.
  - **`path` mode** (non-Linux, or forced with `confinement: "path"`): an `lstat` walk, plus `realpath` equality, plus inode re-checks. This **narrows** the check/use window; it does **not** close it.
- `DirHandle.verify()` re-walks the canonical path and requires it to still lead to the held directory inode. This refuses a directory that was moved away (possibly out of the root) or replaced.
- `openBound(dir, name, flags)`:
  1. opens no-follow relative to the held directory;
  2. requires a regular file with `nlink == 1` whose name still maps to the opened inode;
  3. `verify()`s the directory;
  4. closes the descriptor on every failure path;
  5. on a failed bind after an exclusive create, unlinks its own new entry, but only if the name still maps to *its* inode.
- `SpoolIntegrityError` gains a `code` field (`symlink`/`missing`/`replaced`/...), used to map failures to precise rejection reasons.
- A test-only `fsProbe(stage, target)` hook (`EventStoreOptions`/`KernelOptions`) fires at named check/use points. Tests use it to force races **deterministically**.

**Uses:** all Kernel spool writes, durable log appends and reads, diagnostics opens, adapter-artifact import reads, artifact verification, and directory creation (non-recursive, relative to the verified parent).

### 9.1 Blocker 1 — diagnostics followed symlinked parent directories

**Fix:**
- `EventStore.openDiagnostic(owner, fileName)` walks `.dvl/spool/<owner>` from the canonical root without following symlinks and creates exclusively. It binds the file and verifies the directory before returning the fd.
- `kernel.ts newTransport` passes it as the transport's new `openDiagnostic` option. **Every** diagnostics open uses it: eager stderr/noise *and* the lazy queue-overflow file.
- **Counting:**
  - transport `stats.diagnosticOpenRefused` counts refused opens;
  - `stats.overflowSpoolRefused` counts overflow frames not written (still never processed);
  - a refused eager open fails the spawn: the child is killed, the instance is fenced, and `kernel.adapter_spawn_failed` is recorded.

**Tests** (C21, both modes):
- **1a:** owner dir swapped after adapter start, before the lazy overflow file: refused, counted (`overflowSpoolRefused == framesRejected`, `diagnosticOpenRefused == 1`), outside tree empty.
- **1b:** spool root (ancestor) swapped to an outside tree that even contains the expected owner dir: refused, counted, nothing written there.
- **1c:** constructor diagnostics, parent swapped between check and open (probe): `start()` throws, the child is killed, `kernel.adapter_spawn_failed` is recorded, and no file is left either outside or in the moved original directory.
- **1d:** owner dir already a symlink at open: refused.

**Before:** `openDiagnostic(path)` used `O_NOFOLLOW` on the final name only, so a swapped parent redirected the create/append.
**After:** the parent chain is confined and verified on every open.

### 9.2 Blocker 2 — durable-log hard links redirected writes

**Fix:**
- Logs are created once at construction (confined) and never created by `durableAppend`.
- `durableAppend` opens through `openBound` (regular, `nlink == 1`, name ↔ inode, directory verified). After the `log:after-open` probe point it re-binds again (`lstat` == `fstat`, `nlink == 1`) and re-verifies the directory **before writing**.
- On refusal it throws `SpoolIntegrityError` before the write, so neither the MAC chain head nor in-memory history advances.

**Tests:**
- **C21-2:** for each of `events.jsonl` and `evidence.jsonl` replaced by a hard link to an outside victim, the append/`putEvidence` is refused, the victim is unchanged, `head()` is unchanged, and the event/evidence counts are unchanged.
- **C21-2:** an adapter-made alias of the real log is also refused (fail closed).

**Before:** a hard-linked log received Kernel records.
**After:** refused, with no write.

### 9.3 Blocker 3 — replay and disk reads followed symlinked logs

**Fix:** `readChain` (used by replay, `readFromDisk` and `readEvidenceFromDisk`) reads through `openBound(..., O_RDONLY)`. A symlinked, hard-linked, non-regular or relocated log throws `SpoolIntegrityError`: fail closed. `new Kernel(...)` on such a root throws, and disk reads throw. A missing log reads as empty, which is unchanged; truncation is still detected via the head anchor.

**Tests:** C21-3 covers each log replaced by:
- a symlink to an authentic, correctly MAC'd copy outside the Kernel area: replay throws `... is a symlink`, and `readFromDisk`/`readEvidenceFromDisk` throw;
- a hard link to that copy: replay throws `hard-linked`.

The test then restores the logs and shows a clean replay.

**Before:** HMAC-valid content was accepted from any location.
**After:** location is enforced as well as content.

### 9.4 Blocker 4 — deterministic check/use swaps and import error handling

**Fix:**
- **`durableAppend`:** see 9.2 (bind at open, plus re-bind and directory re-verify immediately before the write).
- **`importAdapterArtifact`:**
  - the area is opened via the confined walk, the file via `openBound`;
  - every expected filesystem failure becomes `{ ok: false, reason }`: area missing, area swapped or moved, file vanished, symlink, hard link, size mismatch, I/O;
  - this includes the formerly unhandled `realpath` ENOENT, which can no longer occur because the walk uses descriptors;
  - Kernel-side materialisation failures (hijacked spool, swap, rename failure) also become rejections;
  - descriptors are closed in `finally` on every path.
- **`kernel.ts`:**
  - `maybeCreateEvidence` wraps the import (defence in depth) so an unexpected throw still yields `CORRUPTED` evidence plus `kernel.artifact_rejected`.
  - `capPayload` turns a refused Kernel spool write into a stored event with a refusal marker. The event is not lost, so lifecycle continues. Evidence is `CORRUPTED` ("payload spooling refused") and `kernel.spool_integrity_violation` is recorded.

**Tests** (C21, deterministic via `fsProbe`, both modes):

| Test | Forced swap | Result |
|---|---|---|
| 4a | log directory swapped between validation and open | refused; outside victim and moved original log unchanged; history and head unchanged |
| 4b | log name swapped between open and write | refused ("swapped or aliased"); neither file written; history unchanged |
| 4c | Kernel spool dir swapped between validation and create | refused; nothing outside; no temp leftover in the moved original; nothing registered |
| 4d(i) | adapter area deleted after the area check | `{ok:false}` (no exception) |
| 4d(ii) | adapter area swapped for a symlink to an outside dir holding a file with the claimed hash | `{ok:false, "changed during import"}`; nothing registered |
| 4e | end to end: area vanishes mid-import during a real run | run `finished`; evidence `CORRUPTED`; one `kernel.artifact_rejected`; no "kernel handler error" |
| 4f | end to end: Kernel spool hijacked before an oversized inline payload | run `finished`; evidence `CORRUPTED` ("payload spooling refused"); `kernel.spool_integrity_violation`; nothing outside; no handler error |

**Before:**
- The swap between validation and open redirected the log create/append.
- An area disappearing between `lstat` and `realpath` threw out of import into the transport handler, so the frame's evidence processing was lost.

**After:** refusals and rejections are recorded, and evidence is `CORRUPTED`.

### 9.5 Other changes from this fix round

- **C20-6 strengthened:** while the adapter's hard-link alias of a Kernel artifact exists, `verifyKernelArtifact` now refuses it (`hard-linked`), because the alias is a write path into a Kernel-owned inode. After the alias is removed, it verifies again.
- **C20-4:** the expected message wording for a symlinked Kernel directory changed; the refusal itself is the same.

### 9.6 Results (at `57a6797`; current results: §10.4)

| Command | Result |
|---|---|
| `npm test` ×3 | exit 0 each — 21 files, **152/152 passed** each run |
| `npm run typecheck` | exit 0 |
| `npm run spike` | exit 0 — "SPIKE OK — every scenario reached its expected terminal state" |
| `npx vitest run src/conformance/c18* src/conformance/c19* src/conformance/c20*` | exit 0 — 3 files, **18/18 passed** (C18 8, C19 3, C20 7) |
| C21 alone | 26/26 (13 tests × 2 confinement modes) |

Per suite: C01 6, C02 4, C03 6, C04 4, C05 4, C06 13, C07 10, C08 14, C09 4, C10 7, C11 7, C12 5, C13 6, C14 8, C15 5, C16 3, C17 2, C18 8, C19 3, C20 7, **C21 26**.

**Fail-before evidence:**
- **C21 against the reviewed commit's Kernel** (`event-store.ts`, `kernel.ts` and `ndjson-transport.ts` from `e94919b`): **26/26 fail**. This is partly because the new probe and confinement options don't exist there, so it is not taken as primary evidence.
- **Per-guard mutations of the new code** (each applied alone, then restored byte-for-byte; checked against C20+C21):

| Guard disabled | Failing tests |
|---|---|
| Kernel's confined diagnostics opener (transport falls back to path-based open) | C21 1a, 1b, 1c (both modes) |
| `nlink == 1` in `openBound` | C20-6; C21 2, 3 (both modes) |
| Log read by path (`readFileSync`) instead of bound fd | C21 3 (both modes) |
| Re-bind between open and write in `durableAppend` | C21 4b (both modes) |
| `DirHandle.verify()` | C21 1c, 4a, 4c, 4d (both modes) |
| Cleanup of own exclusive create on bind failure | C21 1c, 4c (both modes) |
| `capPayload` refusal handling | C21 4f (both modes) |
| Store import failure → rejection conversion | C20-2, C20-6; C21 4d (both modes); 4e still passes via the Kernel-level catch |
| Store conversion **and** the Kernel-level catch | additionally C21 4e (both modes) |
| Path-mode `realpath` equality check | **none**: redundant with the per-component `lstat` walk (belt and braces) |

### 9.7 Remaining limitations at `57a6797` (incomplete: missed the long-lived diagnostics descriptors and the final write window; superseded by §10.5)

- **Strictness depends on the mode.**
  - **`procfd` mode** (Linux, the default, and CI) gives directory-relative confinement for the operations the Kernel performs. Two caveats remain:
    1. **The project root** is trusted only by inode. A swapped root is refused, but the root directory itself is not walked from `/`.
    2. **A directory the Kernel already holds can be *moved* by the adapter** between `verify()` and the following syscall. The operation then lands in the Kernel's own (relocated) directory inode, never in a file the Kernel didn't create or open. The final re-verify shrinks this to a two-syscall window.
  - **`path` mode** (macOS/others, or forced) is **not** strict. Checks and uses are separate path-based syscalls, so the window is narrowed, not closed. C21 forces the same races in both modes and both refuse them, but a race landing in the remaining sub-syscall gaps is not excluded.
- **No OS sandbox, which is unchanged.** The same-user adapter can still delete, overwrite or alias Kernel files. Overwrites are detected (registration hash, HMAC chain). Aliases and symlinks are now refused at every Kernel access, and refusal is **fail closed**: an adapter can make the Kernel refuse to append (availability), never make it write elsewhere or trust relocated data.
- **Refusing aliased logs is fail closed.** An adapter that hard-links a Kernel log stops further appends to it. This is deliberate (Blocker 2) and is an availability, not an integrity, effect.
- **Spawn-failure cleanup** (Blocker 1 constructor path) kills the child with `SIGKILL` on the child pid. Grandchildren of a misbehaving adapter are not reaped there; this is the same scope as before.
- **The review probe file wasn't available** in the repository; C21 implements the described probes instead.
- **Not covered by a dedicated test:**
  - the path-mode `realpath` belt-and-braces check (see mutations);
  - errno failures other than the mapped ones (e.g. `EIO`), which are handled by the generic conversion but can't be produced deterministically.

### 9.8 Ready for Codex re-review? (at `57a6797` — result: H2 RE-REVIEW FAIL, see §10)

**Yes — ready for Codex re-review of H2.**
- All four blockers are fixed, each with deterministic regression tests in both confinement modes, pinned by mutation.
- All 152 tests pass three times; typecheck and spike pass; H1 C18/C19 are green.

**Not claimed:**
- an H2 PASS;
- strict confinement outside `procfd` mode;
- protection that needs OS-level isolation.

`main` was not pushed and nothing was merged.

## 10. Second Codex Re-review Fixes (reviewed at `4c53a43` — result: H2 SECOND RE-REVIEW FAIL, see §11)

Codex re-reviewed `57a6797` and returned **H2 RE-REVIEW FAIL** with three blockers. The instruction was to implement a real enforceable boundary or downgrade the guarantee honestly. **The boundary cannot be made strict in userspace Node against a same-user process.** This round therefore:
1. makes every check that *can* be enforced happen before every write;
2. adds detection after every write, with a fail-closed latch;
3. downgrades the stated guarantee to exactly what the tests prove.

### 10.1 What H2 guarantees, and what requires OS isolation (superseded by §11.1: detection was overstated, and live refusal did not survive restart)

**Threat model:** the adapter runs as the same OS user. Between any two syscalls of the Kernel, it can rename, symlink, hard-link or delete anything under the project root, and move Kernel inodes elsewhere on the same filesystem.

**H2 guarantees, enforced by code and pinned by tests:**

1. **Separate areas and trust.**
   - Adapters are told to write only to `.dvl/adapter-spool/<id>/`.
   - Kernel truth lives in `.dvl/spool`, `.dvl/events` and `.dvl/evidence`.
   - Location never confers trust: artifacts must match the Kernel registration and hash, and log records must authenticate in the HMAC chain.
2. **Reads.**
   - The Kernel reads adapter material only from the sender's own area, through a confined no-follow walk.
   - Files must be single-link regular files whose name still maps to the opened inode.
   - Imports are Kernel-made copies with recorded provenance.
   - The Kernel reads its own logs only through bound no-follow descriptors. Replay and disk reads fail closed on a symlinked, hard-linked or relocated log.
3. **Pre-write refusal.**
   - Before **every** Kernel write (artifact create, log record, diagnostics append), the target is re-opened and re-validated:
     - confined walk from the canonical root;
     - no symlink in any component;
     - regular file, `nlink == 1`, name ↔ inode, directory still at its canonical path.
   - No diagnostics descriptor is kept between writes.
   - Any state that exists **before** a write is refused: nothing is written, and the refusal is counted or recorded with a stable code.
4. **Post-write detection with fail-closed latch.** After **every** log record and diagnostics append, the target is re-bound. If it was moved or aliased in the final window:
   - **Durable store:** it is **sealed**. Head and in-memory history don't advance, and every later events/evidence append is refused (`sealed`). The Kernel records refusals in `durableWriteRefusals` and does not throw into handlers or timers.
   - **Diagnostics:** writing is **disabled** for that adapter instance. One `kernel.spool_integrity_violation{kind:"diagnostics_refused"}` is recorded. Later bytes and overflow frames are counted as refused, and rejected frames are never processed.
5. **Errors** carry stable codes, e.g. `symlink`, `hard_link`, `replaced`, `after_write`, `sealed`. Expected filesystem failures during import are rejections (`CORRUPTED` evidence), never handler exceptions.

**H2 does NOT guarantee — this requires OS isolation:**

- **The final write itself.** A same-user process that moves or hard-links the inode **between the last check and `write(2)`** makes that **one** write land in the relocated or aliased inode: the Kernel's own file, now also visible elsewhere. Node has no `openat2(RESOLVE_BENEATH)` and no way to pin an inode's location or link count across a syscall. H2 *detects* this immediately and writes nothing further, but cannot prevent that write. C22 asserts exactly this.
- **Adapter writes and deletions.** The adapter process can write, overwrite or delete files under the root directly. H2 detects overwrites (hash/HMAC) and treats deletions as availability failures; it does not prevent them.
- **Remedies:** strict no-outside-write and tamper prevention need the adapter under a different OS user, or in a mount namespace or container where the Kernel areas are absent or read-only, e.g. a read-only bind mount of `.dvl/` except its own `adapter-spool/<id>`.

**Mode note:** `procfd` (Linux, the default) removes path-resolution races for the open/create/rename itself; `path` (macOS/others) narrows them. **In both modes the guarantee is the one above: pre-write refusal plus post-write detection plus fail closed, not strict prevention.**

### 10.2 Exact fixes

**Blocker 1 — diagnostics kept writing after open.**
- **`ndjson-transport.ts`:**
  - Long-lived `stderrFd`/`noiseFd`/`overflowFd` are **removed**.
  - New `DiagnosticSink { create, append }` option. The default `pathSink` (unit tests) creates exclusively and no-follow, and appends no-follow to a single-link file, opening and closing per write.
  - stderr is written per chunk. Noise and overflow lines are buffered per stdout chunk and flushed once per chunk, so memory stays bounded by one chunk.
  - **The first sink refusal disables diagnostics for the instance** and emits one `diagnostics_refused` issue with the code.
  - New stats `diagnosticWritesRefused` and `diagnosticBytesRefused`; `overflowSpoolRefused` counts frames not written. Rejected frames are never enqueued.
  - An `after_write` detection counts as written (the bytes landed) but still disables.
- **`event-store.ts`:**
  - `createDiagnostic(owner, file)` does a confined exclusive create, keeping no fd.
  - `appendDiagnostic(owner, file, data)`, per write:
    1. confined walk;
    2. `openBound` of the existing file;
    3. re-bind (`replaced`);
    4. probe point `diagnostic:before-write`;
    5. write;
    6. re-bind (`after_write`);
    7. close.
  - `openDiagnostic` (which returned a long-lived fd) is removed.
- **`kernel.ts`:** the transport gets a sink bound to the instance (`store.createDiagnostic`/`appendDiagnostic`). `diagnostics_refused` is recorded as `kernel.spool_integrity_violation`.

**Blocker 2 — durable-log final window.**
- **`event-store.ts durableAppend`** (shared by events and evidence, so behaviour is identical), per record:
  1. sealed check;
  2. confined walk;
  3. `openBound` (existing file, never created here);
  4. re-bind before the write (`replaced`);
  5. probe point `log:before-write`;
  6. write and optional fsync;
  7. **post-write re-bind** (`after_write`), which on failure **seals the store**;
  8. close.
- Head and history advance only after a clean post-write check. `EventStore.sealed` exposes the latch.
- **`kernel.ts kernelEvent`:** on a `SpoolIntegrityError` it returns `null` and appends to `durableWriteRefusals` instead of throwing, so a sealed store can't crash timers or transport handlers.

**Blocker 3 — platform-specific error prose.**
- **`confined-fs.ts`:** stable `SpoolIntegrityCode` values: `symlink`, `not_dir`, `missing`, `not_regular`, `hard_link`, `replaced`, `after_write`, `sealed`, `root_replaced`, `exists`, `unsafe_name`, `io`.
- Import failure mapping now uses codes, not message regexes.
- `harness.integrityCode(fn)` returns the code of the thrown `SpoolIntegrityError`.
- C20-4 and C21 (2, 3, 4b, 1d) assert codes instead of prose.
- **`DVL_FS_CONFINEMENT=path`** (host environment, downgrade-only) forces the fallback mode used on macOS, so the **entire suite** can be run in that mode on Linux.

**Kept behaviour:**
- import-area disappearance gives `CORRUPTED` evidence, no handler exception (C21-4d/4e);
- replay and read refusal for symlinked or hard-linked logs (C21-3);
- C18/C19 green.

### 10.3 Tests added / changed

**New suite C22** (`c22-h2-second-review-fixes.test.ts`): 9 tests × 2 confinement modes = 18.

| Test | Scenario | Asserted (implemented guarantee) |
|---|---|---|
| 1a | End to end: owner spool dir moved outside after eager diagnostics create, then the `noisy` scenario (2 MiB stderr + 2 MiB noise) | Relocated files byte-identical; `diagnosticWritesRefused > 0`; `diagnosticBytesRefused > 2 MiB`; exactly one `diagnostics_refused` violation; run `finished` |
| 1b | Overflow file written once, then hard-linked outside; more frames rejected | Alias unchanged; `framesRejected` 6; `overflowSpoolRefused` 3; queue depth 0 (never processed); refusal code `hard_link` |
| 1c | Owner dir relocated outside after the first overflow write; more frames plus stderr | Relocated files unchanged; `overflowSpoolRefused` 3; refusals counted; one issue |
| 1d | Alias created in the final window before a stderr write | **That write lands** (alias = "FIRST"), code `after_write`; next write refused; alias unchanged after |
| 2a ×2 | Events / evidence log hard-linked in the final window | Code `after_write`; **the alias gains exactly the one racing record**; history and head unchanged; `store.sealed` set; later events **and** evidence appends `sealed`; alias unchanged after |
| 2b ×2 | Events / evidence log directory relocated outside in the final window | Same, for the relocated log |
| 2c | Kernel-level | `kernelEvent` returns `null` (no throw); refusals `after_write`, then `sealed`; nothing in history |

**Changed tests:**
- **C20-4(d):** asserts code `symlink` instead of prose (the macOS failure).
- **C21:**
  - 1a counts `diagnosticWritesRefused` plus one `diagnostics_refused` violation (replacing the removed `diagnosticOpenRefused`);
  - 1d uses `createDiagnostic` plus code `symlink`;
  - 2, 3, 4b assert codes `hard_link`/`symlink`/`replaced`;
  - test 0 honours the `DVL_FS_CONFINEMENT` override.

**Mutation check** (each applied alone against C22, then restored byte-for-byte):

| Mutation | Failing C22 tests |
|---|---|
| D1 diagnostics append keeps a long-lived fd (old behaviour) | 1b, 1c, 1d (both modes) |
| D2 no post-write check on diagnostics | 1d (both modes) |
| L1 no post-write check on log append | 2a, 2b (events and evidence), 2c (both modes) |
| L2 post-write detection without sealing | 2a, 2b, 2c (both modes) |
| K1 `kernelEvent` rethrows integrity errors | 2c (both modes) |

### 10.4 Exact results (at `4c53a43`; current results: §11.6)

| Command | Result |
|---|---|
| `npm test` run 1 | exit 0 — 22 files, **170/170 passed** |
| `npm test` run 2 | exit 0 — 22 files, **170/170 passed** |
| `npm test` run 3 | exit 0 — 22 files, **170/170 passed** |
| `npm run typecheck` | exit 0 |
| `npm run spike` | exit 0 — "SPIKE OK — every scenario reached its expected terminal state" |
| `npx vitest run src/conformance/c18* src/conformance/c19* src/conformance/c20* src/conformance/c21*` | exit 0 — 4 files, **44/44 passed** (C18 8, C19 3, C20 7, C21 26) |
| `DVL_FS_CONFINEMENT=path npm test` (macOS fallback mode, on Linux) | exit 0 — 22 files, **170/170 passed** |

Per suite: C01 6, C02 4, C03 6, C04 4, C05 4, C06 13, C07 10, C08 14, C09 4, C10 7, C11 7, C12 5, C13 6, C14 8, C15 5, C16 3, C17 2, C18 8, C19 3, C20 7, C21 26, **C22 18**.

**macOS:** the suite was **not executed on macOS**; no macOS host was available. The fallback mode macOS uses was exercised for the full suite via `DVL_FS_CONFINEMENT=path`. Assertions now use stable codes, and the remaining prose assertions match Kernel-defined rejection reasons (identical in both modes) or Node errno names (`EEXIST`).

### 10.5 Remaining limitations

- **No strict no-outside-write.** See §10.1: the one write racing the final check can land in a relocated or aliased Kernel inode. It is detected; the writer then fails closed. Strict prevention requires OS isolation.
- **Unacknowledged record after sealing.** When the store seals after an `after_write` detection, the racing record is on disk (in the Kernel's own inode) with a valid MAC, but isn't in the in-memory history. A later replay may accept that one record. It is a genuine Kernel record (the Kernel produced it) that was never acknowledged; no adapter-authored content can enter this way.
- **Sealing is fail-closed availability.** After sealing, the Kernel records nothing durable until restarted on a clean tree; refusals are kept in memory (`durableWriteRefusals`). An adapter that can trigger this can stop the Kernel's durable logging. That is an availability effect: the adapter could equally delete the logs.
- **Disabled diagnostics are fail-closed availability.** Once disabled for an instance, stderr/noise/overflow bytes are dropped (counted). Protocol processing continues.
- **Diagnostics cost.** Diagnostics now re-validate per write: one stderr chunk, or one flush of a stdout chunk's noise/overflow lines. The full suite and spike timings stayed within existing limits.
- **Carried over:**
  - root trusted by inode only;
  - spawn-failure cleanup kills only the direct child;
  - no dedicated test for unmapped errno failures (e.g. `EIO`) or the redundant path-mode `realpath` check;
  - the original Codex probe file is not in the repository.

### 10.6 Ready for Codex?

**Yes — ready for Codex review of this round.**
- All three blockers are addressed.
- The guarantee is downgraded to what is enforceable and tested: pre-write refusal, post-write detection, fail closed, with OS isolation named as the requirement for strict prevention.
- Results are as in §10.4.

**Not claimed:**
- an H2 PASS;
- strict no-outside-write prevention;
- a run on a macOS host.

`main` was not pushed and nothing was merged.

## 11. Durable Commit Semantics Fix (reviewed at `1380e76` — result: H2 DURABLE COMMIT REVIEW FAIL, see §12)

**Context:**
- Codex reviewed `4c53a43` and returned **H2 SECOND RE-REVIEW FAIL**.
- The remaining problem was durable commit semantics under uncertain writes, not path isolation.
  1. A completed write followed by an fsync failure left the store unsealed, so the next append could fork the chain.
  2. A record refused live could regain authority after restart, because its MAC was valid.
  3. Detection was overclaimed.
- This round defines **one** commit model and applies it to both logs, live reads, replay, evidence, the artifact registry and Kernel start-up.

### 11.1 Chosen commit model: Option A — refused means not committed

**Definitions** (`event-store.ts`, `DurableIncident`/`RecoveryState`, and `durableAppend`):

- **Committed.**
  - A record is committed only when its write, its fsync (when `fsync` is on) and the post-write integrity re-check (name ↔ inode, single link, directory canonical) **all** succeed.
  - Only then do the chain head, in-memory history and evidence map advance, and the store publishes the new **commit boundary** (`{events, evidence}` heads) to the host via `onCommit`.
- **Refused before the write.** The target is already unsafe (symlink, hard link, swapped or moved directory). Nothing is written; this is unchanged from earlier rounds.
- **Uncertain** (any error *after the write begins*):
  - write error, partial write followed by an I/O error, fsync error, or post-write detection (`after_write`);
  - the record may be on disk, so it is **not committed**;
  - **before any later append** the store seals (`sealed`) and never appends again from the old head, so **no chain fork** is possible;
  - an incident is reported to the host (`onIncident`) and persisted best-effort as an **HMAC-authenticated seal marker** `.dvl/integrity/sealed.json`, holding the commit boundary at the incident;
  - error code: `uncommitted` for I/O, `after_write` for detection.
- **Same-instance disk reads** (`readFromDisk`, `readEvidenceFromDisk`) return committed records only. They read up to the live commit boundary, never a possibly-written record beyond it.
- **Replay:**
  - The commit boundary is the **host anchors** (`expectedHeads`, both logs; legacy `expectedHead` still covers events) when given, else the **authenticated seal marker**.
  - Records and bytes beyond the boundary are counted as `uncommitted` and **quarantined**: never loaded into history, the evidence map or the artifact registry.
  - The store opens **RECOVERY_REQUIRED**: appends, `Kernel.start`, `startRun` and `retryRun` throw `recovery_required`.
  - A forged or corrupt marker confers nothing (`integrity.marker = "invalid"`).
- **Recovery** is an explicit host decision: `Kernel.recoverDurableTail()` → `EventStore.recover()`.
  1. Copy every byte beyond the boundary of each log to `.dvl/integrity/quarantine-<log>-<ts>.jsonl`.
  2. Truncate the logs to the boundary.
  3. Remove the marker, clear the seal, and record `kernel.durable_recovery`.
  - It refuses if a log is *shorter* than its boundary: a rollback needs a host decision.
- **Torn fragment.** A final fragment without a newline can never be a complete committed record. With no boundary at all, it is quarantined automatically at open. Previously the next append was glued onto it and became unreplayable.
- **Evidence and artifacts follow the same rule.**
  - An artifact registration (`kernel.artifact_registered`) that is uncertain is not in the registry live, after replay, or after recovery, so `verifyKernelArtifact` returns "not registered" even though the bytes exist.
  - A `FILE_SNAPSHOT` (`VALIDATED`) whose evidence write is uncertain never becomes `VALIDATED`: not live, not in same-instance disk reads, not after restart with host anchors or with the marker, and not after recovery.

**H2 guarantees** (enforced, and pinned by C20–C23):
1. Adapter and Kernel areas are separate, and location never confers trust (registration plus hash; HMAC chain).
2. Kernel reads use confined no-follow, single-link, inode-bound access.
3. Pre-write refusal: any unsafe state that exists before a write is refused, with nothing written.
4. **Commit semantics:**
   - no acknowledged record is ever unreplayable (no fork);
   - an uncertain record is never acknowledged, and is never authoritative on replay when a commit boundary (host anchors, or a surviving seal marker) is available;
   - recovery is explicit.
5. **Post-write check:** a mutation still in place after the write is detected, and seals the store or disables diagnostics.

**H2 does NOT guarantee:**
- **Detection of transient mutations.** Validation observes the *current* state. An alias or move created during the write and undone before the post-write check is **not detected**. The record commits, and an outside name may have observed it (C23-7 demonstrates this).
- **Prevention of the final racing write.** One write can land in a relocated or aliased Kernel inode (C22).
- **A boundary without host anchors once the marker is gone.** If the host keeps no anchors and a same-user process deletes the seal marker, a complete MAC-valid uncommitted tail record is indistinguishable from a committed one and is accepted (C23-5 demonstrates this). **The supported configuration is host-held anchors**, kept from `onCommit`.
- **Protection against the adapter writing or deleting files** under the root.

**Strict prevention and guaranteed detection both require OS/access isolation:** a separate OS user, or a mount namespace or container in which the Kernel's `.dvl` areas are absent or read-only to the adapter.

### 11.2 Exact behaviour for uncertain writes

| Situation | Live outcome | Head / history / evidence / registry | Later appends | Disk reads (same instance) | Restart with host anchors | Restart, marker only | Restart, no anchors, no marker |
|---|---|---|---|---|---|---|---|
| Write fails / partial write + I/O error | throws `uncommitted`; sealed; incident (+ marker) | unchanged | `sealed` | committed only | quarantined; RECOVERY_REQUIRED | quarantined; RECOVERY_REQUIRED | torn fragment auto-quarantined; complete record: **accepted (limitation)** |
| Full write, then fsync error | throws `uncommitted`; sealed | unchanged | `sealed` | committed only | quarantined; RECOVERY_REQUIRED | quarantined; RECOVERY_REQUIRED | **accepted (limitation)** |
| Post-write detection (alias/move still present) | throws `after_write`; sealed | unchanged | `sealed` | refused while the alias exists; then committed only | quarantined; RECOVERY_REQUIRED | quarantined; RECOVERY_REQUIRED | **accepted (limitation)** |
| Transient alias/move, undone before the post-write check | **committed** (not detected) | advanced | allowed | includes it | accepted | — | accepted |

The Kernel never throws into handlers or timers on these paths: `kernelEvent` returns `null` and logs to `durableWriteRefusals`. New work (`start`/`startRun`/`retryRun`) is refused while sealed or recovery is required.

### 11.3 Exact fixes (files)

- **`dvl-spike/src/kernel/event-store.ts`:**
  - Commit model types: `CommitHeads`, `DurableIncident`, `RecoveryState`.
  - Options: `expectedHeads`, `onCommit`, `onIncident`, `ioFaults` (test-only fault injection, given the record being written).
  - `durableAppend`:
    1. sealed/recovery checks;
    2. pre-write bind;
    3. write;
    4. optional fsync;
    5. probe `log:after-write`;
    6. post-write bind.

    Any error after the write begins seals the store; on success it advances the head, `committedBytes` and `onCommit`.
  - Seal marker: `seal()` writes it, `readMarker()` reads it (HMAC, domain-separated).
  - `readChain(kind, boundary)` is byte-accurate. It stops at the boundary, counts the `uncommitted` tail, and treats a torn fragment as uncommitted.
  - `replay()` resolves the boundary from host anchors, else the marker, then sets RECOVERY_REQUIRED or auto-quarantines a torn fragment.
  - Disk reads are bounded by the live commit head.
  - New `recover()`, `heads()`, `recovery`, `incident`.
- **`dvl-spike/src/kernel/kernel.ts`:**
  - passes `expectedHeads`/`onCommit`/`onIncident`/`ioFaults` through;
  - `assertDurable()` guards `start`, `startRun` and `retryRun`;
  - new `recoverDurableTail()`.
- **`dvl-spike/src/kernel/confined-fs.ts`:** codes `uncommitted` and `recovery_required`; probe stage `log:after-write`.
- **`dvl-spike/src/conformance/harness.ts`:** plays the host's commit-boundary store. Every Kernel publishes to it via `onCommit`; `anchorsFor(root)` returns it, for tests that replay with host anchors.
- **New test file:** `dvl-spike/src/conformance/c23-h2-durable-commit-semantics.test.ts`.

**Preserved:**
- diagnostics without long-lived handles, with refusal/count/drop (C22);
- static symlink/hard-link read refusal (C21-3, C23-3);
- import-area disappearance → `CORRUPTED` evidence (C21-4d/4e);
- C20 stable-code portability;
- C18/C19.

### 11.4 Tests: C23 (10 tests)

| Test | Covers | Asserts |
|---|---|---|
| 1 ×4 | {events, evidence} × {full write then fsync error, partial write then I/O error} | `uncommitted`; sealed; head/history unchanged; same-instance disk reads exclude it (the fully written record *is* on disk); later events **and** evidence appends `sealed` with no bytes written; incident + marker. Restart **with host anchors**: quarantined, RECOVERY_REQUIRED, `start()` and appends refused. Restart **without anchors**: marker valid, `seal_marker` recovery. `recoverDurableTail()` quarantines and truncates; then a new append, then an anchored replay: `ok`, no rejected lines, every acknowledged record present, the uncertain one absent |
| 2 | Codex fork scenario | After write+fsync error, the next append is `sealed` (not acknowledged). Replay with and without anchors: every acknowledged record present, zero `mac_mismatch` |
| 3 | Real Kernel snapshot/evidence path | `happy` run then `trySnapshot`; the evidence log is aliased while the `FILE_SNAPSHOT` record is written. Rejects `after_write`; no `VALIDATED` live; disk read refused while the alias exists, then committed only after removal. Restart with anchors / with marker / after recovery: never `VALIDATED` |
| 4 | Artifact registration recovery | fsync error on `kernel.artifact_registered` during `oversized-spooled`: bytes on disk, `verifyKernelArtifact` → not registered live, after restart with/without anchors, and after recovery; no evidence for the action; run not finished |
| 5 | **Limitation** (no anchors, marker deleted) | the MAC-valid uncertain evidence record **is accepted**; with host anchors it is quarantined again |
| 6 | Torn fragment, no boundary | auto-quarantined at open; a later append replays cleanly (no rejected lines) |
| 7 | **Limitation** (transient mutation) | an alias created before the write and removed before the post-check is **not detected**: the record commits, the store is not sealed, and the alias contents captured during the window contain the record |

**Mutation check** (each applied alone against C23, then restored byte-for-byte):

| Mutation | Failing C23 tests |
|---|---|
| U1 no seal on uncertain write | 1 (all 4), 2, 3, 4, 5, 6 |
| U2 disk reads not bounded by the commit head | 1 (2 variants), 3 |
| U3b replay ignores host anchors **and** marker | 1 (2 variants), 2, 3, 4, 5 |
| U3c replay ignores host anchors only | 5 |
| U4 seal marker not persisted | 1 (all 4), 2, 3, 4, 5, 6 |
| U5 no torn-fragment quarantine | 6 |
| U6 no durability guard on `Kernel.start` | 1 (all 4) |

### 11.5 Limitations

- **Without host anchors, the boundary survives restart only via the seal marker.** A same-user process can delete the marker, after which a complete signed uncommitted record is accepted (C23-5). Host-held anchors (`onCommit` → `expectedHeads`) close this and are the supported configuration. They must be persisted by the host outside the adapter's reach.
- **Transient mutations are not detected** (C23-7): validation sees current state only.
- **The final racing write can land in a relocated or aliased inode** (C22).
- **Sealing and RECOVERY_REQUIRED are fail-closed availability effects.** An adapter able to cause them can stop the Kernel's durable logging until the host recovers.
- **Recovery is all-or-nothing per log.** It truncates to the boundary and quarantines everything after it, including adapter-appended junk. It refuses on rollback (log shorter than boundary).
- **The host-anchor callback is synchronous.** A host that loses the latest `onCommit` value (e.g. its own crash) will see the last committed records as uncommitted and quarantine them. That's safe (they're not authoritative), but they're then lost to replay until the host restores them from quarantine.
- **Carried over:**
  - root trusted by inode;
  - spawn-failure cleanup kills the direct child only;
  - no macOS host run (fallback mode exercised via `DVL_FS_CONFINEMENT=path`);
  - the original Codex probe file is not in the repository.

### 11.6 Exact results (at `1380e76`; current results: §12.5)

| Command | Result |
|---|---|
| `npm test` run 1 | exit 0 — 23 files, **180/180 passed** |
| `npm test` run 2 | exit 0 — 23 files, **180/180 passed** |
| `npm test` run 3 | exit 0 — 23 files, **180/180 passed** |
| `npm run typecheck` | exit 0 |
| `npm run spike` | exit 0 — "SPIKE OK — every scenario reached its expected terminal state" |
| `npx vitest run src/conformance/c18* src/conformance/c19* src/conformance/c20* src/conformance/c21* src/conformance/c22*` | exit 0 — 5 files, **62/62 passed** (C18 8, C19 3, C20 7, C21 26, C22 18) |
| `npx vitest run src/conformance/c23*` | **10/10 passed** |
| `DVL_FS_CONFINEMENT=path npm test` (macOS fallback mode, on Linux) | exit 0 — 23 files, **180/180 passed** |

Per suite: C01 6, C02 4, C03 6, C04 4, C05 4, C06 13, C07 10, C08 14, C09 4, C10 7, C11 7, C12 5, C13 6, C14 8, C15 5, C16 3, C17 2, C18 8, C19 3, C20 7, C21 26, C22 18, **C23 10**.

### 11.7 Ready for Codex?

**Yes — ready for Codex review of the durable commit semantics.**
- One model (Option A) is applied consistently across append, disk reads, replay, evidence, the artifact registry, Kernel start-up and recovery.
- The guarantees are restated to match what is enforced, and the two remaining limitations (transient mutation, boundary loss without host anchors) are demonstrated by tests.

**Not claimed:**
- an H2 PASS;
- strict no-outside-write prevention;
- guaranteed detection;
- a macOS host run.

`main` was not pushed and nothing was merged.

## 12. Anchor Publication and Recovery Fixes (reviewed at `45e7674` — result: H2 ANCHOR/PUBLICATION/RECOVERY REVIEW FAIL, see §13)

Codex reviewed `1380e76` and returned **H2 DURABLE COMMIT REVIEW FAIL** with three High blockers. The commit model stays **Option A (refused means not committed)**, with the host-held commit boundary as the authority. This round closes the three gaps in how that authority is reached, published and restored.

### 12.1 Amended guarantees

- **The host anchor gates authority.**
  - If a commit boundary cannot be reached, nothing from either log becomes authority. That covers a host anchor or a seal marker where the log is shorter, or the MAC at the boundary count differs (including a valid-MAC chain behind a wrong anchor).
  - That means no history, no evidence and no artifact registrations. Nothing is written, the host anchor isn't replaced, and startup, append, evidence, normal recovery and Kernel records (`kernelEvent` → `null`) are all refused.
  - The only ways forward are restoring the logs, or the explicit host decision `hostDecision: "accept_disk_rollback"`. That decision adopts the authenticated disk chain, publishes it via `onCommit`, removes the stale marker, and records `kernel.anchor_rollback_accepted`.
- **Publication is part of the commit.** A record commits only after `onCommit(newHeads)` returns.
  - Until then the internal head, committed size and live history do not advance.
  - If `onCommit` throws, the store seals (`publication_failed`) before any later append, so nothing can be appended across an unpublished boundary.
  - If the host may have saved the boundary but failed to confirm, the **host's stored boundary decides on restart**:
    - old boundary → the record is quarantined;
    - new boundary → the record is committed.

    Either way the seal marker forces an explicit recovery step, and kernel sequence numbers stay contiguous.
- **Recovery is fail-closed and rebinding.** `recover()` / `recoverDurableTail()` runs in four phases:
  1. Validate **both** logs: bound reads, committed prefix re-verified against the commit head, exact tail bytes captured with short reads looped.
  2. Write the quarantine copies (confined, exclusive) and read them back.
  3. Per log: re-bind, re-check size and tail bytes, truncate, fsync, re-bind, check size.
  4. Re-bind **both** logs before removing the marker and clearing the seal.

  Any hard link, symlink, relocation, unsafe quarantine target, changed bytes or truncation error throws `recovery_failed` and keeps the seal, recovery state and marker. A failed recovery can be retried after the unsafe condition is removed. An anchor mismatch is refused (`anchor_mismatch`), never handled as ordinary recovery.
- **Unchanged from §11.1:** the "does NOT guarantee" list (transient mutations, the final racing write, boundary loss without host anchors once the marker is deleted, adapter writes or deletes) still holds and still requires OS/access isolation.

### 12.2 Blockers, fixes, before/after

**B1 — host-anchor mismatch/rollback did not gate authority** (`event-store.ts replay`, `kernel.ts`).
- **Fix:**
  - If either log reports `truncated` against its boundary, the store sets `RecoveryState{source:"anchor_mismatch", mismatch:{<log>:{expected, reachedRecords, boundary:"host_anchor"|"seal_marker"}}}`, returns without installing anything, and keeps the chains at genesis.
  - `durableAppend` and `Kernel.start`/`startRun`/`retryRun` throw `anchor_mismatch`; `recover()` refuses with the same code.
  - New option `hostDecision: "accept_disk_rollback"` and store field `rollbackAccepted`.
- **Before:** reported the mismatch, but installed records, history, evidence and registrations, appended a diagnostic event to the wrong chain, and allowed startup.
- **After:** fail closed, as above.

**B2 — `onCommit` failure created live/disk disagreement** (`event-store.ts durableAppend`).
- **Fix:**
  1. Compute `next` heads.
  2. Call `onCommit(next)`.
  3. Only if it returns, advance `committedBytes` and the head (the caller then updates history/evidence).
  4. If it throws, `seal(kind, "publication_failed", …)` persists the marker with the **old** boundary, and the append throws `publication_failed`.
- **Harness:** the test's own `onCommit` now runs before the harness "host" stores the boundary, so a throwing callback models "host did not save".
- **Before:** head and committed size advanced before `onCommit`; on a throw, history wasn't updated, the store wasn't sealed, and later appends published over the refused record.
- **After:** no divergence and no crossing.

**B3 — recovery truncated through a retained descriptor** (`event-store.ts recover`, `readLogRange`, `readFully`).
- **Fix:** the four-phase recovery in §12.1. New probe points `recover:before-quarantine`, `recover:before-truncate`, `recover:before-clear`; test-only `ioFaults.recover` truncation fault; new codes `recovery_failed`, `anchor_mismatch`, `publication_failed`.
- **Before:** validated once, then truncated through an fd held after the directory handle closed, so an aliased or relocated inode could be truncated and the seal cleared.
- **After:** every mutation happens through a freshly bound fd and is re-bound after; nothing clears until both logs re-verify.

**Changed test:** C13-4 now asserts the fail-closed semantics for an anchored rollback:
- `anchor_mismatch`;
- empty history;
- **no** new `kernel.integrity_violation` appended;
- log bytes unchanged;
- `start()` refused.

Previously it expected a diagnostic record to be appended to the shortened chain, which is exactly what B1 forbids.

### 12.3 Tests added: C24 `c24-h2-anchor-publication-recovery.test.ts` (18 tests)

| Test | Scenario | Asserts |
|---|---|---|
| B1a ×2 | events / evidence log shorter than the host anchor | `anchor_mismatch`; empty history and evidence; artifact not registered; `start`, appends to both logs, `recoverDurableTail` and `kernelEvent` all refused; both log files byte-identical; host anchor unchanged |
| B1b ×2 | count-matched anchor, wrong MAC | same |
| B1c ×2 | anchor behind on a different chain (every disk record MAC-valid) | zero rejected lines, and still the same fail-closed state |
| B1d | log rolled back below the **seal marker** boundary, no host anchors | `anchor_mismatch` with `boundary: "seal_marker"`; nothing installed; recovery refused |
| B1e | explicit `accept_disk_rollback` | chain adopted; artifact verifies; `kernel.anchor_rollback_accepted` recorded; host now holds the adopted heads; `start` works |
| B2a ×2 | `onCommit` throws for events / evidence (host did not save) | `publication_failed`; sealed; heads == host boundary; history/evidence counts unchanged; record on disk but not in same-instance disk reads; later appends to both logs `sealed`; restart with old boundary → quarantined (1 record); after recovery and a new append: `ok`, no rejected lines, contiguous `kernelSequence`, unpublished record absent |
| B2b ×2 | host saved the boundary but confirmation failed | live: `publication_failed`, sealed. Restart with the saved boundary: record present (committed by host decision), recovery still required (marker), nothing quarantined; afterwards contiguous sequence |
| B3a ×2 | events / evidence log hard-linked just before truncation | `recovery_failed`; seal, marker and append refusal kept; outside alias size unchanged (not truncated); retry after removing the alias succeeds and the tail is gone from the log |
| B3b | events dir relocated outside just before truncation | `recovery_failed`; seal kept; relocated log size unchanged |
| B3c | integrity dir swapped for a symlink just before the quarantine write | `recovery_failed`; outside dir empty; neither log truncated; seal kept |
| B3d | injected truncation error | `recovery_failed`; seal kept; log bytes byte-identical; retry without the fault succeeds |
| B3e | tails in **both** logs; evidence aliased after events was truncated; then an alias created just before clearing | both attempts `recovery_failed` with seal and marker kept and the victim unchanged; final retry clears the seal and removes the marker |

**Mutation check** (each applied alone against C24, then restored byte-for-byte):

| Mutation | Failing C24 tests |
|---|---|
| A1 no anchor-mismatch gate | B1a, B1b, B1c (events and evidence), B1d |
| P1 `onCommit` after advancing the head, no seal | B2a, B2b (events and evidence) |
| R1 no re-bind before truncation | B3a (events and evidence), B3b, B3e |
| R2 no final bound check before clearing | B3e |
| R3 seal/recovery cleared on a recovery failure | B3a (events and evidence), B3b, B3c, B3d, B3e |

### 12.4 Preserved

All earlier behaviour still passes:
- Option A semantics, the uncommitted-tail quarantine and torn-fragment auto-quarantine (C23);
- import disappearance → `CORRUPTED` evidence (C21-4d/4e);
- static symlink/hard-link replay refusal (C21-3, C23-3);
- per-write diagnostics validation (C22);
- C20 stable codes;
- C18/C19.

### 12.5 Exact command results (at `45e7674`; current results: §13.4)

| Command | Result |
|---|---|
| `npm test` run 1 | exit 0 — 24 files, **198/198 passed** |
| `npm test` run 2 | exit 0 — 24 files, **198/198 passed** |
| `npm test` run 3 | exit 0 — 24 files, **198/198 passed** |
| `npm run typecheck` | exit 0 |
| `npm run spike` | exit 0 — "SPIKE OK — every scenario reached its expected terminal state" |
| `npx vitest run src/conformance/c18* src/conformance/c19* src/conformance/c20* src/conformance/c21* src/conformance/c22* src/conformance/c23*` | exit 0 — 6 files, **72/72 passed** (C18 8, C19 3, C20 7, C21 26, C22 18, C23 10) |
| `npx vitest run src/conformance/c24*` | **18/18 passed** |
| `DVL_FS_CONFINEMENT=path npm test` (macOS fallback mode, on Linux) | exit 0 — 24 files, **198/198 passed** |

Per suite: C01 6, C02 4, C03 6, C04 4, C05 4, C06 13, C07 10, C08 14, C09 4, C10 7, C11 7, C12 5, C13 6, C14 8, C15 5, C16 3, C17 2, C18 8, C19 3, C20 7, C21 26, C22 18, C23 10, **C24 18**.

### 12.6 Remaining limitations

- **The host decision for a mismatch is coarse.** `accept_disk_rollback` adopts the whole authenticated disk chain. There is no partial reconciliation; restoring the logs from a backup is the alternative.
- **A seal marker that is unreachable or deleted** without host anchors: unchanged from §11.5. The supported configuration is host anchors held out of the adapter's reach.
- **Recovery check-to-use windows remain** for transient mutations. A move or alias done and undone *between* a recovery re-bind and the following truncate/unlink syscall isn't observed: validation sees current state only. Changes that persist across a re-bind are refused.
- **Publication ambiguity is resolved only on restart.** In the live process a failed `onCommit` is always "not committed, sealed"; whether the record ends up committed is decided by whichever boundary the host actually stored.
- **A failed recovery can leave work half done**, which is safe and idempotent. A quarantine file may already be written, and the first log already truncated, while the second failed. The seal and marker stay, and a retry continues: an already-truncated log has no tail left.
- **Carried over:** transient mutation detection and the final racing write both need OS/access isolation; there was no macOS host run (fallback mode exercised via `DVL_FS_CONFINEMENT=path`); the original Codex probe file is not in the repository.

### 12.7 Ready for Codex?

**Yes — ready for Codex review of the anchor/publication/recovery fixes.**

**Not claimed:**
- an H2 PASS;
- strict prevention;
- guaranteed detection;
- a macOS host run.

`main` was not pushed and nothing was merged.

## 13. Zero Anchor and Committed Prefix Recovery Fixes

**Context:**
- Codex reviewed `45e7674` and returned **H2 ANCHOR/PUBLICATION/RECOVERY REVIEW FAIL** with two blockers.
- Both were **reproduced on `45e7674` before any change**, with a scratch probe that was not committed.
- The commit model is unchanged: **Option A** (refused means not committed), with the host-held boundary as the authority and a valid MAC alone not counting as Project Truth.

### 13.1 Amended guarantees

- **A count-0 host anchor has authority.**
  - It must carry the log's genesis MAC, i.e. an empty committed chain.
  - A count-0 anchor with any other MAC is an **anchor mismatch** and fails closed exactly as in §12.1: nothing is installed from either log; start, append, evidence and ordinary recovery are refused; nothing is written and the host boundary is not replaced.
  - Only an explicit host decision (`accept_disk_rollback`) proceeds.
  - A *correct* count-0 anchor keeps its meaning: anything on disk beyond it is an uncommitted tail, requiring explicit recovery.
- **Recovery verifies committed content, not just size.** The committed prefix is checked against the commit head and its MAC chain in phase 1, and its SHA-256 is captured. It is then re-verified:
  - through the bound descriptor **before truncation** and **after truncation** (phase 3);
  - in the final pre-clear check (phase 4), together with a re-verification of the committed MAC chain.

  Any same-size corruption of committed bytes, whether before recovery, before truncation or before clearing, throws `recovery_failed`.
  - The seal and marker remain; appends and startup stay blocked.
  - No authority is restored and the host boundary is not replaced.
  - A retried ordinary recovery fails again.
  - On restart the corruption breaks the host boundary (`anchor_mismatch`), so only an explicit host decision (restore the logs, or `accept_disk_rollback`, which still rejects the corrupted record) can proceed.

### 13.2 Exact fixes

**Blocker 1 — wrong count-0 anchor** (`event-store.ts readChain`).
- **Before:** `boundaryMacOk = boundary === undefined || boundary.count === 0`, so the MAC of a count-0 boundary was never checked. The probe showed `recovery: host_anchor`: every valid disk record counted as an uncommitted tail. Ordinary recovery was allowed; it **truncated the whole log**, and startup then succeeded.
- **After:** `boundaryMacOk = boundary === undefined || (boundary.count === 0 && boundary.mac === genesis(log))`, so a wrong count-0 MAC yields `truncated` → `anchor_mismatch`, with all the fail-closed gates of §12.

**Blocker 2 — recovery cleared the seal after same-size corruption** (`event-store.ts recover`, new `digestRange`).
- **Before:** phases 3 and 4 checked size and tail bytes only. The probe showed corruption of committed event or evidence bytes injected at `recover:before-truncate` or `recover:before-clear` ending as "RECOVERED", with the seal cleared, in all 4 combinations.
- **After:**
  - **Phase 1:** after re-verifying the prefix against the commit head (MAC chain), it records `prefixDigest[log] = sha256(bytes[0, committed))` through a bound descriptor.
  - **Phase 3:** compares the digest before `ftruncate`, and again after it, through the same freshly bound descriptor.
  - **Phase 4:** for both logs, requires the exact committed size, the matching digest, and a committed MAC chain that still verifies against the commit head, before the marker is removed and the seal is cleared.
  - **Result:** any mismatch → `recovery_failed`; seal, recovery state and marker are kept.

### 13.3 Tests added: C25 `c25-h2-zero-anchor-prefix-recovery.test.ts` (11 tests)

| Test | Scenario | Asserts |
|---|---|---|
| Z1 ×2 | wrong count-0 **events** / **evidence** anchor over MAC-valid disk records (a real `oversized-spooled` project) | zero rejected lines (records are valid); `anchor_mismatch` naming the count-0 host anchor; no history, evidence or registry (artifact not registered); `start`, events and evidence appends, and ordinary recovery all refused; both log files byte-identical; host anchors unchanged |
| Z2 | wrong count-0 anchors on **both** logs | same fail-closed state. Then `accept_disk_rollback` is the only way to accept disk: chain adopted, artifact verifies, `kernel.anchor_rollback_accepted` recorded |
| Z3 | **correct** count-0 (genesis) anchor | empty log opens cleanly; after a record is written, the genesis anchor makes it an uncommitted tail (`host_anchor` recovery, nothing installed) |
| P1 ×6 | same-size corruption of committed **events** / **evidence** bytes, {before recovery, at `recover:before-truncate`, at `recover:before-clear`} | `recovery_failed`; seal and marker kept; events/evidence appends and `start()` refused (`sealed`); history count unchanged; host anchors unchanged. A retried ordinary recovery fails again. Restart with host anchors → `anchor_mismatch`, nothing installed, recovery and start refused. Only `accept_disk_rollback` proceeds, and the corrupted record is still rejected (not adopted) |
| P2 | control: no corruption | recovery succeeds, clears seal and marker, and later appends replay cleanly |

**Mutation check** (each applied alone against C25, then restored byte-for-byte):

| Mutation | Failing C25 tests |
|---|---|
| M1 count-0 boundary MAC not checked (old behaviour) | Z1 (events, evidence), Z2 |
| M2 phase-3 prefix digest checks removed | **none**: masked by the phase-4 check, which still refuses before anything clears (phase 3 is a fail-fast that avoids truncating under an untrusted prefix) |
| M3 phase-4 prefix digest + chain checks removed | P1 events/evidence at `recover:before-clear` |
| M4 all new prefix checks removed | P1 events/evidence at `recover:before-truncate` and at `recover:before-clear` |

Corruption present *before* recovery starts was already refused by the phase-1 chain check, as confirmed on `45e7674`. C25 pins it for both logs.

### 13.4 Command results (final tree)

| Command | Result |
|---|---|
| `npm test` run 1 | exit 0 — 25 files, **209/209 passed** |
| `npm test` run 2 | exit 0 — 25 files, **209/209 passed** |
| `npm test` run 3 | exit 0 — 25 files, **209/209 passed** |
| `npm run typecheck` | exit 0 |
| `npm run spike` | exit 0 — "SPIKE OK — every scenario reached its expected terminal state" |
| `npx vitest run src/conformance/c18* src/conformance/c19* src/conformance/c20* src/conformance/c21* src/conformance/c22* src/conformance/c23* src/conformance/c24*` | exit 0 — 7 files, **90/90 passed** (C18 8, C19 3, C20 7, C21 26, C22 18, C23 10, C24 18) |
| `npx vitest run src/conformance/c25*` | **11/11 passed** |
| `DVL_FS_CONFINEMENT=path npm test` (macOS fallback mode, on Linux) | exit 0 — 25 files, **209/209 passed** |

Per suite: C01 6, C02 4, C03 6, C04 4, C05 4, C06 13, C07 10, C08 14, C09 4, C10 7, C11 7, C12 5, C13 6, C14 8, C15 5, C16 3, C17 2, C18 8, C19 3, C20 7, C21 26, C22 18, C23 10, C24 18, **C25 11**.

**C09 (outside H2 scope; no change made):**
- Passed in every full run above.
- Isolated: **10/10** runs passed.
- Under 6 concurrent CPU-busy loops: **3/3** runs passed.
- No flake was reproduced in this environment. If it flakes elsewhere, that is a timing issue of the safety-halt regression suite and is tracked separately from H2.

### 13.5 Remaining limitations

- **Unchanged from §11.5/§12.6.** All of these need OS/access isolation:
  - transient mutations are not detected (validation observes current state);
  - the final racing write can land in a relocated or aliased inode;
  - without host anchors, a deleted seal marker loses the boundary;
  - adapter writes and deletes are not prevented.
- **Recovery check-to-use windows remain.** Corruption of committed bytes done and undone between a digest check and the next syscall is not observed. Persistent corruption is always caught before the seal clears.
- **Phase-3 digest checks are not independently pinned** (mutation M2 is masked by phase 4).
- **The explicit host decision is coarse.** `accept_disk_rollback` adopts the authenticated chain up to the first corrupted record; there is no partial repair. Restoring from backup is the alternative.
- **Not done:** no macOS host run (fallback mode exercised via `DVL_FS_CONFINEMENT=path`); the original Codex probe file is not in the repository.

### 13.6 Ready for Codex?

**Yes — ready for Codex review of the zero-anchor and committed-prefix recovery fixes.**

**Not claimed:**
- an H2 PASS;
- strict prevention;
- guaranteed detection;
- a macOS host run.

`main` was not pushed and nothing was merged.
