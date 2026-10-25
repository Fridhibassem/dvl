# DVL — PLAN (reference IDs and dependency order)

Revision P-1, 2026-10-25. Plan step IDs come from roadmap V2
(`sources/plans/DVL_STEP_BY_STEP_BUILD_ROADMAP_V2_AR.md`, phases 00–40).
Gate and increment IDs (ÉTAPE 0, B, C1a, C1b, C2 …) are kept unchanged and
cross-referenced. Evidence is never renumbered. ÉTAPE 0–28, Phase A–T and the
C1–C10 chart are historical navigation only (DECISIONS D-03).

A partial overlap does **not** close a whole step. For example, B's SQLite
and settings work does not close [05] or [06].

## Fields

`plan_step_id · increment_id · scope · status · depends_on · evidence_refs · review_refs`

## Current position

| plan_step_id | increment_id | scope | status | depends_on | evidence_refs |
|---|---|---|---|---|---|
| 00 | ÉTAPE 0 | Spike baseline | **PASS / FROZEN** | — | `gates/DVL_ETAPE_00_BASELINE_PASS.md`, tag `spike/ETAPE0-FROZEN-ae13301` |
| 01 (partial) | — | macOS-first; Electron chosen de facto (B frozen on 44.7.2) | Decision recorded (D-06). The 8 GB target and Apple Silicon are **not** qualified. | 00 | — |
| 03, 04 (scoped) | ÉTAPE 1.A, B | Desktop shell, open/restore project, recent, settings, secrets | **B GREEN / FROZEN** | 00 | `gates/DVL_PHASE_B_GREEN_FROZEN_v3.md` |
| 06.1–06.2 (scoped) | B | Secure secret storage, no secrets in logs | Covered inside B scope only | — | B gate |
| 08.1–08.2 | C1a, C1b | Read-only list/read/search, ignore and secret rules | C1a scoped PASS (F1/N-2 reopened); **C1b R1 CANDIDATE** | B | `evidence/mac/C1b-r1/` |

## Order after C1b (corrected; DECISIONS D-04)

1. **Close C1b** in its read-only scope: 5 launches, independent review, Unicode closure decision.
1b. **RS-0 Rooms shell, read-only** (D-09). Scope is plan [03]/[37] visual subset:
   semi-circle Room layout plus switching; Meeting/Chat (UI only, no provider);
   Live Task (shows real reader activity: list, search, Stop); Live Product (shows
   the opened project read-only: file and static content view only. It **never launches a
   dev server and never executes project HTML/JS**; the executable preview stays behind [13]); Design (static placeholder). Gate: B 24/24 and
   C1b suites still pass, no new IPC authority, the sender-auth tests extended to
   any new channel, and owner visual acceptance. Spec runs in parallel with the
   C1b launches; code starts only after C1b PASS.
2. **Shared prerequisites before ANY mutation or shell:**
   [05] authoritative durable Event Store wired into the app
   (B's app SQLite is **not** it), [06.3–06.6] allow/block/ask plus scoped approval
   with revalidation, and [07] Kernel binding, canonical paths, isolated candidate
   workspace, fencing, and an enforced execution boundary. Runtime activation
   (`.dvl`, RootLock) needs its own contract and gate.
3. [09] candidate patching, [11] Git/baseline, [10] owned process execution.
   Basic recovery and durable-before-effect apply **from the first effect**.
4. [12] test/build, [13] server/preview, all under those boundaries.
   Test/build commands are effectful until proven otherwise.
5. [14] Evidence → Verification → Integration and [15] safe checkpoints/restart,
   before anything autonomous can publish Project Truth.
6. [16] no-LLM full tool-chain gate (former "C10" becomes this end-to-end
   regression gate), then [17]/[18] provider with budget/cancel, then [19]–[21],
   then [22] **Single-Worker MVP — GREEN-SCOPED** (needs the qualification manifest, F-21).
7. Then [23]–[40] as in roadmap V2: context, planning/URG/compiler, lifecycle,
   multi-worker, orchestrator, Smart Décalage, review/security, rooms, scale, release.

## Open plan decisions (owner)

- Whether H4 gets an explicit final closure decision bound to `ae13301` / `d92d063` (FINDINGS F-08).
