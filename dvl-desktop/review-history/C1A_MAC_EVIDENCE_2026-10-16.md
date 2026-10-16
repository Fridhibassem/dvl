# DVL C1a — user-supplied target-Mac evidence

Date: 2026-10-16
Status: AUTOMATED MAC TESTS PASSED / INDEPENDENT REVIEW PENDING
No C1a freeze or full C1 PASS declared.

## Source and machine

Candidate originally downloaded: DVL_C1A_BOUNDARY_CANDIDATE_V0_1.zip.
User applied the supplied closefrom compile repair locally, then reran `npm run test:c1`.
Expected repaired native source SHA256: `3206e4e67b023f1247482189601ff3700aaf4c67e46cfd8bf72c57685a383a05`.
This is the authoring source hash, not a newly supplied Mac hash attestation.
Test output reports `darwin x64`. Current Node/compiler/OS versions were not included in this output; do not infer new measurements from the older B baseline.

Evidence provenance: terminal output pasted by the user. The author did not execute commands on the user's Mac. Independent reviewer has not executed or assessed these results yet.

## Executed commands and outcomes

- `npm test`: 24/24 B regression checks passed in the user's previous output, before the native-only compile repair. B application source was not changed by the repair. Real SQLite/filesystem; Electron/crypto/DOM mocked in this suite.
- `npm run test:c1`: native helper compilation completed with no reported error after repair.
- `test:c1:unit`: 16/16 policy/control checks passed. Some cases use test-only fake executables for error/cancellation/queue control; this is distinct from native confinement.
- Native support probe: `NOT_FOUND` for an intentionally absent file inside the fixture. This is expected with the native sandbox operational; the native qualification below provides the stronger evidence.
- `test:c1:native`: 17/17 real native boundary/filesystem checks passed.

## Native sandbox probe — exact supplied output

```text
READY seatbelt
{"externalDenied":true,"writeDenied":true,"movedDenied":true}
```

The test-only probe bypasses application path policy and attempts raw outside read, file creation inside the project, and read through an already held directory descriptor after that directory is moved outside and an external file is injected. All three attempts were refused in the supplied run. No such test entrypoint is built into the production reader.

## Native suite — supplied passing cases

1. Mandatory OS boundary blocks direct outside read, write, and moved-directory injection.
2. Real directory list hides denied targets, links and non-regular files.
3. UTF-8 Unicode path, exact contents/hash and inert markup bytes.
4. Traversal, empty, absolute, backslash, drive and NUL rejection.
5. Denied targets blocked across read/list/search.
6. Symlink parent, internal symlink, hard link and FIFO refusal.
7. Binary, invalid encoding, oversized and missing-file errors.
8. Literal search, 1-based Unicode column and explicit skipped files.
9. Regex characters literal; empty/oversize query rejected.
10. Unknown keys, caller-supplied root, duplicate IDs and bad project rejected.
11. Cancellation and A → B → A generation fencing.
12. Root identity replacement invalidates capability.
13. Pagination limit, single-use cursor and directory-change rejection.
14. Match result limit labels partial.
15. Unavailable backend fails closed without path-only fallback.
16. Fixture inventory including hidden/.git bytes unchanged; `.dvl` absent.
17. Close cancels pending requests and leaves no tracked helper.

Final supplied line:

```text
C1a CHECKS PASSED: 17 platform: darwin x64
```

## Remaining gate

- Independent source/security review with explicit PASS / FIX_REQUIRED / BLOCKED verdict scoped to C1a.
- Source identity confirmation for the Mac candidate if needed by the reviewer.
- Broader concurrency/race/permission/budget qualification and the distinction between tested cases and general guarantees.
- C1b IPC sender validation, navigation handling, UI wiring and UI acceptance remain unimplemented. Electron native C1 execution was not tested because the service is not connected to Electron.
- Passing finite fixtures is not proof against every same-user race, atomic snapshot assurance, whole-product security or full C1 acceptance.

Only after review findings are resolved may the owner consider accepting this increment and proceeding to C1b.
