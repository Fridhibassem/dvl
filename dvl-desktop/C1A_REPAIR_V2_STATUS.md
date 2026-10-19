> **2026-10-20 V3 status annotation — C1B-UNICODE-01: F1/N-2 REOPENED.**
> The historical scoped C1a PASS and its Mac evidence remain recorded in the independent review. New owner Mac evidence proves that V2 read eight stored sensitive-name aliases using U+FB01, U+FB05 and U+FB06. Reopen F1 privacy closure and N-2 treatment for independent reassessment; exact stored-entry binding alone does not enforce the sensitive-name policy. V3 is a repair candidate, not accepted/frozen. See `review-v3/C1B_UNICODE_01_REOPENED.md` and the full native diff. The original independent review is retained unmodified.
>
> Everything below is the historical C1a repair-v2 authoring status, not the current V3 verdict.

# DVL Code 😈 — C1a repair v2

Date: 2026-10-16
Status: REPAIR CANDIDATE — MAC RETEST AND INDEPENDENT RE-REVIEW REQUIRED
Parent review: Claude `C1A_INDEPENDENT_REVIEW.md`, verdict FIX_REQUIRED.
Phase B repair v3: preserved; no new B freeze or full C1 PASS declared.

## 1. الحالة الحالية

صلّحنا الكود حسب F1–F11، وزدنا اختبارات مخصّصة. هذي candidate جديدة، موش النسخة المقبولة: نتائج الـMac القديمة تخصّ v1، وما تتنقلش آلياً لـv2.

ما فماش IPC/UI/provider/worker wiring. التطبيق مازال يفتح نفس واجهة B. ما نفعّلوش `.dvl/` أو RootLock أو Kernel authority في هالمرحلة.

## 2. سجلّ الإصلاحات

| Finding | Candidate change | Evidence / remaining gate |
| --- | --- | --- |
| F1 HIGH — aliases | Native traversal requires a byte-exact stored directory entry before opening each component, checks the named inode before/after open, and repeats binding checks before publication. It does not approximate filesystem Unicode folding. Alias spellings that resolve to a different stored name fail closed. | Direct-native Mac tests cover long-s, sharp-s, Kelvin-sign, ASCII case and NFC/NFD variants, recording whether each alias actually resolves. Target run still required. Existing exact Unicode names remain supported. |
| F2 — synchronous matching | Linear incremental code-point counting; bounded snippet windows; cooperative yields and cancellation/deadline checks within long matching work. | Real matching CPU/control tests pass locally. One-MiB / 200-match cases are orders of magnitude below the original multi-second report in local runs; see raw timings. Native data-path Mac test still required. |
| F3 — process/FD cost | macOS enumerates actual open FDs with `proc_pidinfo`, closes them and verifies closure. Linux uses close_range or /proc enumeration. One immutable native sandbox/session is reused within each job; a search no longer recompiles a sandbox per file. The 5-second search deadline is unchanged. | Native FD test passes on Linux, including FD37 after lowering the soft limit to16. Simulated protocol test confirms one child serves an entire search. Target Mac: 100 reads and 500-file search with one helper must run. |
| F4 — root policy | Shared root policy rejects Home/ancestors, broad roots, system trees, protected Home directories and userData ancestors/descendants. Host and native check filesystem identities to handle existing path aliases. Trusted `userDataPath` is passed to the native process. | Host/native refusal tests pass locally before confinement. C1b must supply the real `app.getPath('userData')`, especially if overridden; the default is not a substitute for that integration. |
| F5 — completion | Excluded directories and skipped names/entries are counted, partial status is explicit, newline/CR queries rejected, recoverable directory failures preserve earlier matches. | Focused control cases pass, including deep paths, changed directory, invalid listing names, excluded build tree and timeout with earlier matches. |
| F6 — stuck processes | Kill grace is bounded; a helper that does not close is unref'd/detached but remains counted until close. At most two live/abandoned helpers per service. Close returns a bounded status with abandoned/pending counts. | Never-closing fake child tests pass. These simulate uninterruptible I/O; no real hung mount was induced. C1b should own one service/global process budget and handle nonzero abandoned counts honestly. |
| F7 — policy coverage | JS and generated C use `read-policy.json`; additional SSH key types, .git-credentials, .docker/.config, .pgpass, vault/kubeconfig, tfstate and keystore names/extensions. | Table-driven tests exercise JS and the production native entrypoint directly, before sandbox setup. Naming is not universal secret detection. |
| F8 — native response schema | Exact key sets, bounded numeric ranges, known errors/modes/kinds, hex length consistency and lossless decimal identity strings. Session framing is bounded and unknown output fails closed. | Malformed response/schema tests pass; no raw helper errors or payloads appear in public errors. |
| F9 — snippets | Bounded UTF-16 slices are aligned to surrogate boundaries before conversion to code points. | The reported emoji fixture returns a well-formed snippet and correct column locally. |
| F10 — Landlock | Require ABI>=3; handle REFER/TRUNCATE and IOCTL_DEV when available, alongside the original rights. No general network/syscall sandbox claim. | Extended real boundary probe now requires outside truncate denial too. Authoring host has no Landlock syscall; new Linux native qualification remains pending on a capable host. |
| F11 — hardening | Checked output formatter; special-file precheck; device-boundary refusal; transient operation FDs cleaned on failures; independent directory positions for repeated session paging; quote/backslash/Unicode root cases added. | Build/control tests pass. Native root/profile cases, paging and resource behavior await target run. Metadata prechecks do not eliminate all same-user races or create an atomic snapshot. |

**These are implementation responses, not independent closure of the findings.** Claude must reassess the repaired source and the new target evidence.

## 3. Execution evidence here

Platform: Linux x64; Node v24.19.0; cc 13.3.0.

- Native source compilation with warnings-as-errors: PASS.
- Frozen B automated regression: 24/24 PASS.
- Existing C1a policy/control suite: 16/16 PASS.
- New repair policy/control/CPU suite: 16/16 PASS.
- Original native suite: attempted, stopped at `OS boundary probe failed: UNSUPPORTED`.
- Repair native suite: attempted, stopped at the required positive read with `BOUNDARY_UNSUPPORTED`.
- Landlock availability diagnostic during this workstream: ABI syscall -1, errno38 (ENOSYS).

Raw logs are in `evidence/`. Simulated protocol/lifecycle tests are explicitly distinguished from native OS evidence. No fallback was enabled to obtain passing native results. Native Linux security tests remain unqualified here even though Claude previously ran the older candidate successfully on a different Linux host.

## 4. Mac — what the owner does next

Extract this new archive as `dvl-desktop-C1a-repair-v2`. Keep the previous candidate and B folder. Do not copy individual files into them or modify the real DVL database.

Inside the NEW extracted folder:

```bash
npm test
npm run test:c1
```

No dependency install is needed for these tests. Use the same working Node/toolchain as the earlier Mac run.

`test:c1` builds from the shared policy, runs the 16 existing and 16 repair control tests, then the 17 original native cases and 10 repair native cases. It includes real alias checks, native-only wrong-inode checks, post-spawn cancellation/context switching, escaped root paths, 100 reads, and a 500-file search. If anything fails, preserve the full output and stop; do not weaken expected refusals or disable confinement.

Expected boundary-probe booleans now include **truncateDenied** in addition to the previous three. Every value must be true.

The benchmark prints actual `100 READS MS` and `500 FILE SEARCH MS`; the latter must be complete over500 files with exactly one helper. It must not silently increase its deadline. Matching control tests print CPU and event-loop measurements.

Tests create disposable OS-temporary fixtures; they do not open the user's real project or userData database. A test that creates project fixtures is distinct from a production read API creating files; production tools remain read-only.

Before independent re-review, optional source identity check:

```bash
node <<'JS'
const fs = require('node:fs');
const crypto = require('node:crypto');
const manifest = JSON.parse(fs.readFileSync('SOURCE_SHA256.json', 'utf8'));
for (const [file, expected] of Object.entries(manifest)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected) throw new Error('SOURCE MISMATCH: ' + file);
}
console.log('C1A REPAIR V2 SOURCE MATCH PASS');
JS
```

The generated policy header is deterministic; building should not change any manifest hash. Compiled binaries are deliberately absent from the ZIP and are built for the target machine.

## 5. Important boundaries and limits

- Exact stored spelling is deliberately conservative on normalization/case-insensitive filesystems. Requests using an alternative spelling may be denied even for a harmless file. Use names returned by listing. This is a C1a policy choice, not a claim of complete Unicode case folding.
- Exact-name enumeration inspects at most10,002 raw entries/component. Extremely large directories may refuse direct lookup outside that bound; no unbounded scan is introduced.
- Session identity/root cannot change after startup. One session lasts only one job, is serial, and owns no mutation methods. Rebinding invalidates the entire old job/session.
- Reads/searches are observations, not Project Truth or an atomic project snapshot. Named policies cannot discover secrets hidden in ordinary source files.
- Physical I/O and directory enumeration on pathological/network filesystems need broader qualification; synchronous host registry/root stat calls are not converted into fully preemptible I/O by this change. The stuck-helper fix bounds child supervision, not every possible host syscall.
- Cross-device descendants are refused/skipped. Unsupported storage or system privacy behavior must be reported, never bypassed.
- New native macOS code, persistent sessions and profile/root edge cases require fresh Mac evidence and independent review. Prior successful v1 native results do not qualify v2.
- No C1b IPC/UI work starts until blockers are independently resolved. Full C1 PASS/freeze is not declared.

## 6. Technical source consulted

Apple's published [XNU libproc header](https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.h) was consulted for the macOS FD enumeration API. Target SDK compilation and actual behavior are still part of the Mac gate; a header reference is not execution evidence.

## 7. Review package

`review-history/CLAUDE_C1A_REVIEW_V1_FIX_REQUIRED.md` is the unmodified received review. Earlier status, Mac evidence and review request are preserved in that history folder and apply to v1. This document is the current v2 state.

After Mac results, send this archive and output back to Claude using `C1A_RE_REVIEW_REQUEST.md`.
