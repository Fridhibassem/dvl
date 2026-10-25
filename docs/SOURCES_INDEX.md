# DVL — SOURCES INDEX (claude.ai Project "dvlproduct", GitHub, Mac)

Revision SI-1, 2026-10-25. **Label-only.** Nothing listed here has been moved,
edited or deleted (DECISIONS D-02). The label says whether to *use* an item
for current work. It never says whether to keep it.

Labels:
- **CURRENT**: use it.
- **GOVERNING**: use it; it has authority over its layer.
- **RECORD**: an acceptance or evidence record; never edit it.
- **SUPERSEDED**: history; the current copy lives at the place named.
- **DUPLICATE**: a byte-identical or same-content copy of another item.

## 1. claude.ai Project sources (589 docs + 28 files; knowledge 99.97% full)

| Path group | Label | Current home |
|---|---|---|
| `dvl-dsktop/dvlagent/DVL_MASTER_PROJECT_STATE_V1_EN (1) (1).md` | GOVERNING (product) | `dvl/docs/sources/product/` |
| `dvl-dsktop/dvlagent/DVL_CORE_STABLE_CONTRACT_FINAL_V0_3_2_FROZEN_FOR_SPIKE (3).md` | GOVERNING (contract) | `dvl/docs/sources/contract/` |
| `dvl-dsktop/dvlagent/DVL_CORE_STABLE_CONTRACT_FINAL_V0_3_2_FROZEN_FOR_SPIKE (1) (1).md` | DUPLICATE (byte-identical, SHA-256 `c3c6ad99…`) | same |
| `dvl-dsktop/dvlagent/` other architecture files | see MASTER_STATE §2 for each | `dvl/docs/sources/architecture/`, `../history/docs/state-history/`, `product/` |
| `dvl-dsktop/DVL_ARCHITECTURE_VNEXT_RECONCILIATION_2026-10-12 (1).md` | DUPLICATE of the dvlagent copy | `dvl/docs/sources/architecture/` |
| `dvl-spike-phase-1/DVL_ETAPE_00_BASELINE_PASS.md`, `DVL_ETAPE_0G_…`, `DVL_ETAPE_01A_…`, `DVL_PHASE_B_GREEN_FROZEN_v3.md` | RECORD | `dvl/docs/gates/` |
| `dvl-dsktop/dvl-spike-phase-1/**` | DUPLICATE of `dvl-spike-phase-1/**` | — |
| `dvl-spike-phase-1/dvl-spike/**` (H4-era code, tests, H4 evidence) | SUPERSEDED as working copy | `dvl` `main` (spike/H4-d92d063, ETAPE0-FROZEN-ae13301) |
| `dvl-spike-phase-1/README.md`, `HARDENING.md`, `DVL_H1_…`, `DVL_H2_…`, `CLAUDE_REPORTS/H1–H4_*.md` | RECORD | `dvl` repo root (left in place because the H4 evidence hashes them by path) |
| `dvl-spike-phase-1/CLAUDE_REPORTS/C1A_INDEPENDENT_REVIEW.md`, `C1A_INDEPENDENT_REVIEW_V2.md`, `C1B_INDEPENDENT_REVIEW_V1.md`, `C1B_REVIEWER_PROTOTYPE_NOT_A_CANDIDATE.patch` | RECORD (reviews) | V2 and C1B review in `dvl` tags under `review-history/`; C1B review in `dvl/history/docs/reviews/` |
| `dvl-dsktop/C1B_INDEPENDENT_REVIEW_V1.md`, `dvl-dsktop/C1B_REVIEWER_PROTOTYPE_NOT_A_CANDIDATE.patch` | DUPLICATE | `dvl/history/docs/reviews/` |
| `dvl-spike-phase-1/dvl-desktop/**`, `dvl-desktop 2/**`, `dvl-desktop-B-gate-v3/**` | SUPERSEDED | tags `desktop/B-*` (B v3 = `desktop/B-repair-v3-FROZEN`) |
| `dvl-desktop-C1-candidate/**`, `dvl-dsktop/dvl-desktop-C1-candidate/**` | SUPERSEDED | tag `desktop/C1a-boundary-v0.1` |
| `dvl-dsktop/dvl-desktop-C1a-repair-v2/dvl-desktop-C1a-repair-v2/**` | SUPERSEDED | tag `desktop/C1a-repair-v2` |
| `dvl-dsktop/dvl-desktop-C1a-repair-v2/dvl-desktop-C1b/**` | SUPERSEDED | tag `desktop/C1b-v1` |
| `dvl-dsktop/dvl-desktop-C1b-v2/**` | SUPERSEDED | tag `desktop/C1b-v2` |
| `dvl-dsktop/dvl_C1B_CANDIDATE_V3/**` | SUPERSEDED (by R1) | tag `desktop/C1b-v3` |
| `dvl-dsktop/DVL_C1B_V2_PRE_MAC_KIT/**`, `DVL_C1B_V3_PRE_MAC_KIT/**`, `DVL_C1B_UNICODE_ALIAS_PROBE/**` | SUPERSEDED | `dvl/history/kits/` |
| `dvl-dsktop/C1B_UNICODE_ALIAS_PROBE*.json`, `C1B_V2_MAC_QUALIFICATION.log`, `probe-unicode-aliases-repair1.cjs` | RECORD | `dvl/history/evidence/mac/C1b-v2/`; the probe script is inside the `desktop/C1b-v3` tag |
| Uploaded ZIPs (28 files), `dvl_flock.node/.o`, `bin/project-reader` | RECORD (original packages and binaries) | Package SHA-256 values in `EVIDENCE_INDEX.md` §1 |
| `dvl-dsktop/DVL_C1A_REPAIR_V2.zip` | SUPERSEDED: **early draft, do not use** | tag `desktop/C1a-repair-v2-DRAFT` |
| `dvl-spike-phase-1/dvl-spike-phase-1 2.zip`, `dvl-dsktop/dvl-spike-phase-1/dvl-spike-phase-1 2.zip` | RECORD (contains the uncommitted 0.G test fixes, the source of `ae13301`) | tag `spike/ETAPE0-FROZEN-ae13301` |

**Not in Project sources (owner to upload):** R1 source and KIT R2 ZIPs (on the
Mac and now in `dvl`), `we_continue_from_here_phase_B_frozen_next_C (1).md`,
`DVL_MASTER_PROJECT_STATE_V1_AR`, `DVL_SCIENTIFIC_BUILD_MAP_CURRENT_POSITION_V1`.

## 2. GitHub (all left untouched)

| Repo | Label |
|---|---|
| `dvl` (to create) | **CURRENT**: canonical |
| `dvl-spike-phase-1` | SUPERSEDED as working repo. `main` = H3; H4 on `codex/h4-candidate`. All of it is inside `dvl`. |
| `dvl-code-research` | Research history. Its `DVL_CODE_MASTER_STATE.md` (2026-09-29) is SUPERSEDED for status. |
| `PRIVATE-DVL-BACKUP-CLEAN-FOR-NEW-VERSION-LAPTOP` | RECORD: full 3.2 GB laptop backup (release `backup-20261020-130157`) |
| `dvl-private-backup-20261020-130157` | Empty (README only) |

## 3. Mac `~/Desktop/dvl-dsktop` (old files; the clean DVL is kept separately, see MASTER_STATE §4)

| Item | Label |
|---|---|
| `dvl.bundle` (SHA-256 `d3222997…`, added 2026-10-25 by the lead) | Early copy of the repo, superseded by the copy in the separate clean folder. Not deleted (owner rule); the owner may remove it. |
| `dvl-desktop-C1b-v3-auth-repair1/` | CURRENT working folder for the C1b launches (same source as tag `desktop/C1b-v3-auth-r1`) |
| `C1B_V3_R1_MAC_EVIDENCE/` | RECORD (in `dvl/evidence/mac/C1b-r1/`) |
| `dvl-spike-phase-1/` (with `.git`) | RECORD. Holds local-only branches (FINDINGS F-15). |
| `dvl-spike-phase-1 2.zip`, `dvl-spike-phase-1 3.zip` (477 MB each) | RECORD (near-duplicates) |
| other unpacked candidate folders | SUPERSEDED (each is a `dvl` tag) |
| `kernel-TS/`, `H4_FINAL_REVIEW.*`, `kernel-h4.diff` | RECORD (in `dvl/history/mac-only/`) |
