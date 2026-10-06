# H2 Adapter / Kernel Spool Isolation Report

Scope: H2 only — adapter/Kernel spool isolation. Base `main` at `f376652` (H1 merged). Work branch
`claude/h2-adapter-spool-isolation`. No H1/H3/H4 work, no architecture redesign, no Stable
Contract change.

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
   - The Kernel never writes through anything the adapter could plant:
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

## 6. Results (on the final tree)

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

## 7. Known limitations (stated, not hidden)

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

## 8. Ready for Codex review?

**Yes — ready for Codex review of H2.**
- Every gap found during inspection (P1–P5 plus the overflow diagnostics link) was reproduced before the fix and is now pinned by a C20 test that fails without its guard.
- All 126 tests pass three times; typecheck and spike pass.

**Not claimed here:**
- an H2 PASS (that is the reviewer's verdict);
- any change to `main` (not pushed, not merged);
- protection that needs OS-level isolation.
