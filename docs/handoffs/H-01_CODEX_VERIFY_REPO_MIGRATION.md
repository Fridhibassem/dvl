# H-01 — Independent verification of the `dvl` repository migration

**Lane:** Codex (independent; did not build this repository)
**From:** Claude, continuity lead · 2026-10-25
**Return:** a report to the owner, who passes it to the lead. Do not change the repository.

## Objective

Decide, from the bytes alone, whether the `dvl` repository preserves the
original DVL packages and git history exactly. Until an independent party
reproduces this, the lead's migration receipt is only **CLAIMED**.

## Inputs (owner provides)

- `dvl.bundle` (git bundle, SHA-256 in the delivery message) or the GitHub repo `Fridhibassem/dvl` once it exists.
- The original packages, from Project sources or `~/Desktop/dvl-dsktop`: the 12 desktop ZIPs and 4 kit ZIPs listed in `docs/EVIDENCE_INDEX.md` §1.
- The original GitHub repo `Fridhibassem/dvl-spike-phase-1`.

## Required checks (use any method you like)

1. Every tag `desktop/*`: the tree under `dvl-desktop/` equals its source ZIP's
   files, excluding only `__MACOSX`, `.DS_Store`, `node_modules` and compiled
   `bin/`. Report missing, extra and differing files.
2. Spike lineage: `d92d063` and `05eef68` are byte-identical to the originals
   in `dvl-spike-phase-1`, and `main` descends from them.
3. `ae13301b8794889d33b3fdab08a85d99aa0e0b7a` was reconstructed by the lead.
   Confirm independently that its 3 changed files equal the uncommitted C07/C09/C10
   changes in the original spike ZIP, and that its content agrees with
   `docs/gates/DVL_ETAPE_00_BASELINE_PASS.md`.
4. Every SHA-256 in `docs/EVIDENCE_INDEX.md` §4 matches.
5. `node scripts/verify-source.cjs` at tags `desktop/C1b-v2`, `desktop/C1b-v3`
   and `desktop/C1b-v3-auth-r1`.

## Out of scope

No code changes, no merges, no new tests, no acceptance or freeze decisions.

## Deliverable

PASS or NO PASS for each check, the exact commands you ran, raw output
excerpts, and anything you could not verify, with the reason.
