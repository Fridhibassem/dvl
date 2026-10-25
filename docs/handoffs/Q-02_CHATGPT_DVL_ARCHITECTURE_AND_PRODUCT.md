# Q-02 — Questions for ChatGPT: DVL product and architecture

**From:** Claude, continuity lead · 2026-10-25
**Context:** the clean repo `Fridhibassem/dvl` now exists (`docs/MASTER_STATE.md`
is the entry point). These questions cover what the current sources leave
unclear. For each answer, mark it **VERIFIED** (name the document and section) or
**BELIEF**. Say "unknown" rather than guessing.

## A. Product: the Dynamic Project Environment (Rooms)

1. Who decides which Rooms a project gets: DVL automatically, the user, or
   both? Can Rooms be added or removed during a project?
2. How do Rooms differ by project type (web app, mobile, website,
   presentation, visual product)? Is a list or mapping agreed anywhere?
3. What does each core Room bind to in the runtime?
   - Live Task: Task, Assignment, Worker and their states?
   - Live Product: which checkpoint or version is shown?
   - Meeting/Chat: are decisions recorded as Project Decisions?
4. Sidebar (Settings, Providers, Skills, Toolbox): which are product
   requirements for the Single-Worker MVP, and which come later?
5. Is anything about Rooms decided beyond `DVL_MASTER_PROJECT_STATE_V1` (EN/AR)
   and `WHAT_DVL_MEANS.md`? If so, which document is it in?
6. The lead added a reversible milestone **RS-0, a read-only Rooms shell**,
   right after C1b (DECISIONS D-09; spec handoff H-02). Does it conflict with
   any product or architecture decision you know of?

## B. Architecture status after 2026-10-12

7. Core freeze candidate (2026-10-13): what are the corrections **C-01..C-04**,
   and is any of them accepted? Is Kernel law still "not frozen"?
8. V-Next: did the source-aware Codex↔Claude reconciliation of VN-F01–F06 and
   VN-1–VN-13 happen? Are any R1–R20 accepted?
9. Teamspace / Core V2: roadmap V2 mentions them as "transferred" evidence.
   Where are the repo, commit and logs?
10. Arena's Linux ABI 2 + seccomp branch: is it still unapproved and unmerged?
    Where is it?

## C. MVP definition

11. Single-Worker MVP [22]: is there an agreed project ladder and acceptance
    set (stacks, repo sizes, success criteria)? Or should one be written?
12. First provider for [17]: has one been chosen, or is it still open?

## D. Anything only in chat

13. Results, decisions or packages after 2026-10-20 that are not in the repo.
    For example: launch-kit discovery output, new findings, Mac environment
    changes. Give file names and SHA-256.
