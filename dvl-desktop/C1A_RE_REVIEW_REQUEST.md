# Claude — independent re-review of C1a repair v2

Your earlier review returned FIX_REQUIRED. Review this repaired candidate against **every F1–F11 item** in `review-history/CLAUDE_C1A_REVIEW_V1_FIX_REQUIRED.md`.

1. Read `C1A_REPAIR_V2_STATUS.md`, the exact current source/manifest and new tests. Treat historical v1 test totals as historical, not v2 proof. Assess supplied fresh Mac output separately from any commands you execute.
2. Review F1 exact stored-name enforcement and inode binding, without assuming it is equivalent to a universal Unicode case fold. Confirm actual alias behavior and direct-native protection on the target filesystem.
3. Review the new **job-scoped persistent native session**: fixed root/sandbox, bounded frames, serialized operations, no rebind/new-method path, operation FD cleanup on all error paths, independent directory offsets and shutdown/cancellation. This is a material new implementation surface introduced to fix F3; do not approve it solely because it is faster.
4. Assess F2 CPU yielding/snippets, F4 root/userData policy in both layers, F5 honest partial results, F6 abandoned helpers/process limits, F7 shared policy, F8 strict helper schema, F9 Unicode, F10 rights and F11 hardening.
5. Run relevant tests if possible. State your exact environment/commands. Unsupported confinement must fail closed; do not introduce a weaker execution path for test success.
6. Return one complete `C1A_INDEPENDENT_REVIEW_V2.md`: verdict PASS / FIX_REQUIRED / BLOCKED scoped to C1a, finding-by-finding CLOSED / OPEN / UNVERIFIED status, new findings with severity/reproducer/smallest fix/regression test, and whether C1b may begin.

Do not modify implementation files, redesign frozen B, begin C1b or declare full C1 PASS/freeze. Architectural-role skill may guide boundaries, but the task is independent code/security review of this candidate.
