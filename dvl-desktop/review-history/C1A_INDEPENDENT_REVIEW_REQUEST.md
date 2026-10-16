# Independent review request — DVL C1a

Act as an independent software/security reviewer experienced in native filesystem confinement, macOS Seatbelt, Node process supervision and authority boundaries. Review this exact source candidate end-to-end within the C1a scope. Do not implement changes or redesign unrelated frozen DVL architecture.

## Scope and status

C1a is a host-internal list/read/search backend prototype. It is NOT exposed through Electron IPC or the UI. B application source remains unchanged; package scripts add tests. C1a is NOT frozen. Full C1 is NOT complete.

Read:

1. `C1A_STATUS_AND_MAC_TESTS.md` (chronological history, including the initial Linux blocker and Mac compilation failure).
2. `C1A_MAC_EVIDENCE_2026-10-16.md` (newer user-supplied Mac execution evidence supersedes the earlier pending-Mac status).
3. `native/project-reader.c`, `src/main/project-read-service.cjs`, build script, and both C1 test suites plus test-only native probe.
4. `SOURCE_SHA256.json`, package scripts, and original B application source as needed to verify no runtime exposure.

The Mac output reports repaired compilation success, 16/16 control tests and 17/17 native tests, including `READY seatbelt` and externalDenied/writeDenied/movedDenied all true. B automated regression was 24/24. These are USER-SUPPLIED results; distinguish them from anything you execute yourself. The authoring Linux host lacked Landlock (ENOSYS); only compilation, control tests and B regressions passed there. Do not label Linux native confinement qualified.

## Attack the implementation and acceptance claims

- Native root identity, openat/O_NOFOLLOW component walk, root/parent/target replacement and moved-directory behavior; authorization-at-open vs atomic-snapshot claims.
- Seatbelt profile escaping, inherited descriptors, any pre-confinement access, stderr/stdout and error disclosure, self-check adequacy. Linux Landlock limitations and unsupported-platform refusal.
- Sensitive filename policy across all operations; metadata, symlink, hard-link, special-file and query/contents leaks. Naming policy is not universal secret detection.
- Byte/memory/CPU/time/result/queue/cursor limits, growing inputs, oversized escaped JSON and partial-search correctness.
- Project A → B → A fencing, resolver failures, context invalidation, cancellation races, helper crashes/timeouts and shutdown cleanup.
- Match semantics and UTF-8 handling; no writes inside project, no `.dvl`/RootLock activation, no provider/worker/Kernel authority claims.
- Tests that could pass for the wrong reason, missing adversarial cases and any mismatch between C1a evidence and stated guarantees.

## Required response

Return `C1A_INDEPENDENT_REVIEW.md` with:

1. Verdict: PASS / FIX_REQUIRED / BLOCKED, explicitly scoped to C1a and the proposed next step.
2. Each finding: severity, exact code location, concrete failure/attack scenario, impact, smallest necessary fix, regression test.
3. Evidence inspected vs commands you actually ran, with failures and environment limits.
4. Assessment of which C1a guarantees are established and which remain unproven.
5. Open findings and whether proceeding to validated IPC/UI wiring is justified.

Do not issue full C1 PASS. Do not call an authoring claim independent proof. A PASS must follow source and evidence assessment, not simply the test totals. An actual defect in current C1a is a finding; unimplemented future C1b UI/IPC should be recorded as next-stage requirements, not falsely described as an exposed current filesystem API.
