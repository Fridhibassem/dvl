# DVL — CHANGELOG of project truth

- **2026-10-25 (MS-1).** The `dvl` repository was created as the single code
  location. Spike history was imported unchanged. The ÉTAPE 0 frozen baseline
  commit `ae13301` was recovered byte-exact. 12 desktop versions were added as
  tags (identity-verified). Mac kits and evidence were added. Verbatim sources,
  gate records, reviews and Mac-only H4 drafts were added under `docs/`.
  MASTER_STATE, PLAN, FINDINGS, DECISIONS and EVIDENCE_INDEX were created.
  Nothing was deleted or edited anywhere else. No gate was accepted or frozen.
- **2026-10-25 (MS-2).** Product identity added (§0). Lead decisions D-03, D-07 (lanes; the owner corrected the code lane to Claude Code / Codex), D-08 (delegation), D-09 (RS-0 milestone, reversible), D-10 (bundle durability). Handoffs H-01 (Codex: verify the migration) and H-02 (ChatGPT: RS-0 spec) issued. No gate accepted or frozen. Nothing deleted.
- **2026-10-25 (MS-3).** SOURCES_INDEX added (label-only map of Project sources, GitHub and Mac). Owner rule D-11: new and old are never mixed. Repo restructured so that current files are at the top and old material sits in `history/` (moved with `git mv`; nothing deleted). The planned release in the old backup repo was cancelled. Nothing deleted.
- **2026-10-25 (MS-4).** Pushed to GitHub `Fridhibassem/dvl` (main and archive branches). Tags could not be pushed from the lead's environment; `docs/VERSIONS.md` maps every tag to its commit and gives the owner a one-command tag push. Clean Mac copy written to the separate folder `~/Desktop/DVL`.
