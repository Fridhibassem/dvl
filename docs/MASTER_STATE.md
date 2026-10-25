# DVL Code 😈 — MASTER STATE (operational entry point)

| | |
|---|---|
| Revision | MS-1, 2026-10-25 |
| Writer | Claude, continuity lead. The owner (Bacem) approves. |
| Basis | ChatGPT answers 2026-10-25 (`../history/docs/lead-2026-10-25/`), the Oct 20 checkpoint, and the source register below. |
| Owner rule | **Nothing is deleted.** Cleanup is additive only. Old documents are labelled, never edited or removed. |
| This file does NOT | Accept, freeze or close any gate, or replace any governing source listed below. |

This file is the single place to start. It does not replace the governing
sources. It says which source governs which layer and what the current
operational position is. If anything here conflicts with a governing source,
the source wins and this file is corrected.

---

## 0. What DVL is (owner's words, 2026-10-25)

> **DVL is a coding agent like Claude Code / Claude Desktop / Codex, but with
> something special: the Dynamic Project Environment (dynamic Rooms).**

From the governing product baseline (`sources/product/DVL_MASTER_PROJECT_STATE_V1_EN.md` §3–4, §23):

1. **First, a complete coding agent.** It reads, edits, runs and tests the
   project, shows the live result, and keeps work alive through interruptions.
   This is the same category as Claude Code and Codex, and it must hold up
   against them on its own.
2. **Then, the differentiator: the Dynamic Project Environment.** DVL works out
   the project type (web app, mobile app, website, presentation, visual
   product, …) and builds a matching environment of **Rooms**. Rooms differ by
   project type.
   - Core Rooms: **Meeting / Chat**, **Live Task**, **Design** (visual only),
     **Live Product**.
   - Rooms sit side by side in a semi-circle; clicking one brings it forward
     inside the environment.
   - Fixed sidebar: Settings, Providers, Skills, Toolbox.
3. Thesis: *an AI-native dynamic project environment where a user builds,
   designs, observes, controls, verifies and experiences a software product
   through natural interaction, while DVL handles the technical complexity,
   orchestration, parallel work, recovery and execution behind the scenes.*

**Visual reference (owner, 2026-10-25):** `sources/product/DVL_ROOMS_VISUAL_REFERENCE_2026-10-25.jpg`.
The glowing cube in the centre is the **DVL logo** (owner, 16:40), not a status widget. The **Rooms** are curved glass
panels standing around it (code/activity, charts and data, a document/form, a
live camera/product view). It is labelled "Dynamic Room" and, at the bottom, the owner's handwritten "D.E.Dy", meaning the **Dynamic Project Environment** (owner, 17:38). It is a
mood reference for RS-0 and [37], not a pixel spec. Open: full circle or the semi-circle in
the product baseline (P-04)?

Where the Rooms are today: Phase B froze **four static panels** (workspace
shell). A read-only Rooms shell (RS-0, DECISIONS D-09) comes right after C1b closes.
Full dynamic Rooms come at plan step [37]. See PLAN.md.

---

## 1. Where we are (last verified point)

| Item | Status | Truth label | Evidence |
|---|---|---|---|
| Product baseline V1 | LOCKED product scope | VERIFIED (document) | `sources/product/DVL_MASTER_PROJECT_STATE_V1_EN.md` |
| Core Stable Contract V0.3.2 | FROZEN_FOR_SPIKE (scoped) | VERIFIED (document) | `sources/contract/…V0_3_2…md` |
| H1–H3 | CLOSED. Re-review in the Oct 8 update was resolved by the later owner correction. | VERIFIED (documentary) | `sources/architecture/…RECONSTRUCTED_2026-10-11.md` §33–35 |
| H4 | See the four separate records in §1a. | — | — |
| ÉTAPE 0 (0.A–0.H) | **PASS / FROZEN**, baseline `ae13301b`. | VERIFIED (record found and commit reconstructed byte-exact; see §1b) | `gates/DVL_ETAPE_00_BASELINE_PASS.md`, tag `spike/ETAPE0-FROZEN-ae13301` |
| Phase B Desktop Foundation | **GREEN / FROZEN**: repair v3, ZIP `f77387a4…`, gate `a1c599ef…` | VERIFIED (record) | `gates/DVL_PHASE_B_GREEN_FROZEN_v3.md`, tag `desktop/B-repair-v3-FROZEN` |
| C1a read-only reader, repair v2 | Historical scoped PASS, **not frozen**. F1/N-2 privacy closure **reopened** by C1B-UNICODE-01. | VERIFIED (record) | tag `desktop/C1a-repair-v2`, FINDINGS F-01 |
| **C1b V3 auth-tests R1** | **CANDIDATE.** Automated Mac qualification PASS. Manual launches **0/5**. NOT frozen. Full C1 not accepted. | VERIFIED (owner-Mac logs + 2 independent reviews of the log) | tag `desktop/C1b-v3-auth-r1`, `evidence/mac/C1b-r1/` |

### 1a. H4 — four separate facts (do not merge them)

| Record | Value |
|---|---|
| historical_acceptance | **CLOSED_MACOS_SCOPED**, recorded in the Oct 11 reconstruction §36 and Oct 12 Full Resume §14 as an owner correction |
| candidate_evidence | **READY_FOR_FINAL_H4_CLOSURE_DECISION**: implementation `d92d0636`, evidence child `05eef688` (72/72 source hashes match; focused 82/82; full 318/318 ×2; macOS 13.7.8 x86_64) |
| acceptance_provenance | **GAP**: no standalone verdict found that binds the closure to `d92d063`. The ÉTAPE 0 PASS record does bind a frozen baseline (`ae13301`, child of `05eef68`), which narrows this gap but does not close it. |
| git_integration | `dvl-spike-phase-1` GitHub `main` = H3 (`e55760f`). H4 exists only on branch `codex/h4-candidate`. In the new `dvl` repo, `main` descends from `ae13301`. That is lineage, not a new acceptance. |

Out of scope for H4: power-loss durability, Linux/Windows physical runtime, arbitrary providers.

### 1b. ÉTAPE 0.H — record found (2026-10-25)

- `DVL_ETAPE_00_BASELINE_PASS.md` was in Project sources and in `~/Desktop/dvl-dsktop`. It declares 0.A–0.H PASS, **ÉTAPE 0 PASS — FROZEN**, with canonical baseline `ae13301b8794889d33b3fdab08a85d99aa0e0b7a` = `05eef68` plus test-only fixes to C07/C09/C10 (3 files, +40/−16). Its evidence is 318/318 ×2 and typecheck PASS.
- That commit was **not on GitHub and not on any branch of the Mac clone**. The three fixed test files existed as uncommitted changes in the spike ZIP. Claude committed exactly those bytes on `05eef68` with the recorded message and recovered the timestamp (2026-10-14 23:27:19 UTC). The resulting SHA-1 is **identical** to `ae13301b…`. The hash covers tree, parent, author, time and message, so this proves the bytes are the frozen baseline.
- Remaining gap (FINDING F-09): the record names no independent verifier for 0.H ("Independent verification outcome: 0.H = PASS, Confidence High").

---

## 2. Authority / disposition register

Superseded *for execution status* does not mean superseded as product requirement, contract, acceptance record, evidence or unresolved finding.

| Source (in `docs/sources/` unless noted) | Disposition | Governs / retained for |
|---|---|---|
| `product/DVL_MASTER_PROJECT_STATE_V1_EN.md` (AR version not in this repo yet) | **GOVERNING: product scope** | Coding agent → Dynamic Project Environment; role separation; work survival; human control |
| `contract/DVL_CORE_STABLE_CONTRACT_FINAL_V0_3_2_FROZEN_FOR_SPIKE.md` (two byte-identical copies in Project sources) | **GOVERNING: frozen-for-spike contract** | Identities, execution modes, isolation, evidence, verification and integration |
| `checkpoint/DVL_COMPLETE_CHECKPOINT_STEP0_TO_C1B_R1_2026-10-20.md` | **CURRENT OPERATIONAL CONSOLIDATION** (imported into §1) | Execution, freeze and evidence status up to R1 |
| `../gates/*` | **ACCEPTANCE RECORDS** (never edited) | ÉTAPE 0 PASS, 0.G, 1.A checkpoint, Phase B freeze |
| `architecture/…RECONSTRUCTED_2026-10-11.md` | PARTLY VALID: source reconstruction | Core architecture reference. Final Kernel law **not** frozen. H1–H4 status corrections. |
| `architecture/DVL_ARCHITECTURE_VNEXT_RECONCILIATION_2026-10-12.md` | CANDIDATE / TEST BASELINE ONLY | R1–R20 not accepted. Physical-test obligations. |
| `architecture/…CLAUDE_CODEX_RECONCILIATION_AND_RETEST_2026-10-11.md`, `…INPUT_TO_EXECUTION_PIPELINE_V0_1.md` | Reference (not frozen) | Pipeline: Normal → Smart → Ultra → Ultra-Pro → URG → Compiler → … |
| `../history/docs/state-history/DVL_FULL_RESUME_2026-10-12.md` | SUPERSEDED for desktop progress; **VALID as architecture/findings handoff** | VN-F01–F06, VN-1–VN-13 (imported into FINDINGS); invalid-V2 disposition |
| `../history/docs/state-history/DVL_MASTER_STATE_UPDATE_2026-10-08.md` | SUPERSEDED for status; partly valid architecture | Its "H4 not closed" is historical |
| `../history/docs/state-history/DVL_CODE_MASTER_STATE_2026-09-29.md` (also in the `dvl-code-research` repo) | SUPERSEDED for status; historical research | Its "FREEZE — waiting" was a research pause |
| `DVL_ARCHITECTURE_CURRENT_STATE_V2_2026-10-11.md` (not in this repo) | **INVALID — DO NOT USE** | Invalid history only |
| `DVL_SCIENTIFIC_BUILD_MAP_CURRENT_POSITION_V1` (not in this repo) | Historical plan reference | Capability/dependency map. Its status table is stale (B shown RED). |
| `plans/DVL_STEP_BY_STEP_BUILD_ROADMAP_V2_AR.md` | **Plan reference IDs 00–40** (see PLAN.md) | Dependency order |
| `../history/docs/plans/bluid_dvl_etape_by_etape.md` (chart of Oct 25) | History. Its C10 placement is **corrected** (DECISIONS D-04). | — |
| `../history/docs/plans/DVL_BUILD_ROADMAP_V3_PROPOSAL.*` | Proposal, not approved | — |
| `we_continue_from_here_phase_B_frozen_next_C (1).md` | Acceptance appendix for B (ChatGPT verified, SHA `3a230587…`). **Not yet in this repo; owner to upload.** | B freeze binding |

---

## 3. Active work, owners, blockers

| Work | Owner / lane | Status |
|---|---|---|
| Repository consolidation (this repo) | Claude (lead) | **DONE**: GitHub `Fridhibassem/dvl` (main, archive branches, all 16 tags; verified identical). Clean Mac copy in `~/Desktop/DVL`. |
| C1b R1 manual launches (5) | Owner on Mac, with the launch-evidence kit (`1a6cf525…`) | 0/5. Discovery **done and reviewed (OK)** on 2026-10-25: Electron 44.7.2; executable `5ebaa92f…`; 1 cache ZIP found; app log present (239 lines, ends with a newline); no errors. Next: step 2, preflight. |
| C1b independent review | to be assigned | WAITING (after the launches) |
| Lanes | D-07 | Code = Claude Code / Codex (cross-review each other); ChatGPT = context, specs, independent review; Claude (this) = lead + evidence; owner = Mac, approvals |
| H-01 independent check of the repo migration | Codex (handoff `docs/handoffs/H-01_*.md`) | READY to send |
| H-02 RS-0 Rooms shell spec (no code) | ChatGPT (handoff `docs/handoffs/H-02_*.md`) | READY to send |
| H-03 Rooms by type, Database Room, sidebar/providers/skills spec (no code) | ChatGPT (`docs/handoffs/H-03_*.md`) | READY to send |
| Q-02 product and architecture questions | ChatGPT | **ANSWERED** by `docs/handoffs/A-02_*.md`. Imported into FINDINGS F-17..F-22 and P-01..P-02. A-02 is an answer, not a second Master State. |

## 4. Exact next action

1. **Owner: C1b preflight** (step 2 in `docs/RUN_C1B_LAUNCHES.md`, with the real cache path). It launches nothing. Send the output to the lead.
2. Owner: send H-01 to Codex, and H-02 + H-03 to ChatGPT.
3. Lead: finish importing the DVL source documents found in `~/Downloads` (including the C-01..C-04 core-freeze-candidate files, which address F-18) into `history/`. Nothing is moved or deleted on the Mac.

See `PLAN.md`, `FINDINGS.md`, `DECISIONS.md`, `EVIDENCE_INDEX.md`, `SOURCES_INDEX.md` (where every old copy lives), `CHANGELOG.md`.
