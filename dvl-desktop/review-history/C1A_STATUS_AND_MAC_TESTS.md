# DVL Code — C1a boundary candidate

Date: 2026-10-16
Status: MAC AUTOMATED TESTS PASSED / INDEPENDENT REVIEW PENDING

Update: Read `C1A_MAC_EVIDENCE_2026-10-16.md` for the subsequently supplied successful target-Mac run. Earlier pending-Mac statements below are historical. C1a is still not frozen.
Parent: B repair v3, verified archive/source identity.

Repair 1 (2026-10-16): the user supplied a native Mac compile error for undeclared `closefrom`. Replaced that call with bounded descriptor closure using the existing `getrlimit` result and standard `close`. Infinite/unrepresentable bounds fail closed. The sandbox policy is unchanged. User's Mac B regression: 24/24 PASS; C1 compilation failed before any C1 test ran. Repaired Mac compilation/native qualification still pending.

## وين وصلنا؟

بدينا C1 بالكود: Host-internal service للـlist/read/search وnative reader منفصل، مع policy، bounds، cancellation، queue، project generations، وfail-closed عند غياب OS confinement.

**ما ربطناش الـservice بالـElectron ولا بالواجهة.** أوّل gate هو إثبات boundary على الـMac. التطبيق الموجود في هالcandidate مازال يعرض واجهة B نفسها؛ ما تستنّاش Files panel تولّي فعّالة توا.

الـB baseline الأصلية ما تبدّلتش. ملفات main/preload/renderer واختبارات B في هالcandidate مطابقة للنسخة المقبولة. التغيير في package.json يضيف أوامر الاختبار فقط؛ source manifest الجديد يعرّف هالcandidate، وB_SOURCE_SHA256.json يحفظ manifest التاريخي للـbaseline ولا يُستعمل كـcandidate manifest.

## What was built

- `src/main/project-read-service.cjs`: internal API bound to trusted registry resolver and root inode. Client requests cannot supply a root. Unique generation per bind; stale outputs fenced. Two active / eight queued operations; native helper timeout and cancellation wait for close.
- `native/project-reader.c`: short-lived C helper; root identity binding; component-relative openat/O_NOFOLLOW; regular files only; hard links denied; per-operation OS read confinement mandatory. Linux Landlock and macOS Seatbelt branches; no path-only fallback.
- Native reader has only list and bounded read; literal search is composed by the host with traversal/byte/result/deadline limits. No provider, shell, network or mutation API is exposed. Linux Landlock here restricts filesystem access, not all syscalls/network; do not represent it as a general-purpose process sandbox.
- Sensitive-path policy applies before target metadata/content reads. Listing skips forbidden names. Strict UTF-8 decoding and binary/size errors. No content/query logging added.
- `tests/c1-unit.cjs`: policy/control/fail-closed tests; some control cases intentionally use test-only fake executables. These are not native security evidence.
- `tests/boundary-probe.c` and `tests/c1-boundary.cjs`: real native boundary and filesystem scenarios, including raw out-of-root read, write denial, and parent-directory relocation followed by outside injection. Test entrypoints are absent from the production binary.

## Evidence in this environment

| Check | Observed result |
| --- | --- |
| Accepted B archive SHA256 | MATCH: f77387a4bfc60fccb196bee0228c25f03abb76844c49046860489bb846367aff |
| Original B source manifest | 11/11 MATCH before derivation |
| Linux C compilation | PASS, cc 13.3.0, warning-as-error build |
| B automated regression | 24/24 PASS; Electron/encryption/DOM mocked as in original B suite |
| C1a policy/control tests | 16/16 PASS; native support probe returns BOUNDARY_UNSUPPORTED |
| Native OS qualification | BLOCKED here: Landlock ABI syscall returned -1 / errno 38 (ENOSYS) |
| Full boundary/filesystem suite | Attempted; stopped at first actual OS boundary probe, UNSUPPORTED. Remaining native cases NOT EXECUTED here |
| macOS compilation / Seatbelt / moved-directory probe | NOT EXECUTED; target Mac required |
| New native Electron C1 tests | NOT APPLICABLE yet; C1a is not wired to Electron |
| Independent review | NOT DONE |

No PASS/freeze for C1a or C1. A successfully compiled helper does not establish OS confinement. The refusal here is evidence of fail-closed behavior only.

## Mac: exact next action

1. Extract this candidate in a NEW folder. Do not overwrite `dvl-desktop-B-gate-v3` or remove/reset your real DVL database.
2. Open Terminal in the extracted `dvl-desktop-C1-candidate` directory.
3. Run:

```bash
node --version
cc --version
npm test
npm run test:c1
```

The read-runtime tests need Node >=24 (the accepted Mac baseline used Node 26.8.1) and Xcode Command Line Tools `cc`. These commands do not need a new npm install: tests use built-in Node modules; B test mocks Electron. `npm start` still requires the original Electron dependency installation and is not needed for this probe.

`test:c1` compiles the helper for THIS machine, runs control tests, then native acceptance scenarios. Fixtures are created under the OS temporary directory and removed afterward. Your real project and userData database are not used. The reader does not create `.dvl/` in projects.

Expected native output starts with `READY seatbelt`, followed by:

```json
{"externalDenied":true,"writeDenied":true,"movedDenied":true}
```

Then the suite must end with `C1a CHECKS PASSED: 17 platform: darwin ...`. This is an expected outcome to verify, NOT an observed Mac result.

If any compilation or test fails, preserve the full output and stop there. No disabling sandbox, changing the expected result, or fallback to unrestricted reads. In particular, `movedDenied:false` is a boundary failure requiring design/implementation work.

## Open work and limits

1. Validate macOS compiler/API compatibility and native sandbox behavior. No Seatbelt production stability claim is made. Kernel-enforced permission at open and postchecks do not create an atomic project snapshot or absolute defense against every same-user race.
2. The original C1 v0.1 contract's broad race guarantee is not proven. The finite moved-directory probe is necessary evidence, not a proof over all adversarial schedules. If the target test exposes an escape, the gate remains open. Do not silently redefine the contract to accept it.
3. A read observation can become stale; search is best-effort, not Project Truth. Boundary tests must be reviewed before provider or IPC adoption.
4. Native full suite and all successful real-read/list/search paths are UNVERIFIED in this environment. Unit control success must not be presented as functional/native acceptance.
5. Tests for IPC sender/frame validation, navigation, renderer content handling, and real UI generation switching belong to C1b and are not implemented here. The existing B bridge must be hardened before exposing filesystem capabilities.
6. Permission failure, live growing-file races, all limits under stress, malformed native payload bounds, deterministic target/root swaps at every syscall stage, and source/log evidence need broader qualification before full C1 acceptance. Existing tests cover selected cases only.
7. No change to RootLock, Event Store, worker identity, provider permissions, Kernel authority, transaction worktrees, or Integration truth.

## Next allowed step

First collect Mac native results and review the boundary. After that evidence supports this increment, connect the service behind validated IPC and the Files UI (C1b), finish remaining C1 acceptance, rerun B native regressions, obtain independent review, and only then consider C1 PASS/freeze.

The older GREEN_GATE_B / Gemini review files in this candidate are historical B evidence. They do not review or accept the new C1a files.
