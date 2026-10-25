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
- **2026-10-25 (MS-5).** The owner pushed all 16 tags from the Mac bundle; the lead verified 16/16 tag objects identical on GitHub. Repository consolidation complete.
- **2026-10-25 (MS-6).** Imported A-02 (ChatGPT answers to Q-02). Added F-17..F-23 and P-01..P-03. D-12 fixes where the C1b launches run and where their evidence goes. RS-0's Live Product is limited to a static, read-only view. SOURCES_INDEX updated. C1b launches are blocked on the launch kit (F-17). Nothing accepted or frozen; nothing deleted.
- **2026-10-25 (MS-7).** Owner decided P-01 = NO (D-13): the user cannot add, remove or hide Rooms.
- **2026-10-25 (MS-8).** Owner's Rooms visual reference added (product sources). P-04 opened (full circle vs semi-circle; visible core).
- **2026-10-25 (MS-9).** Owner: the centre cube in the Rooms reference is the DVL logo.
- **2026-10-25 (MS-10).** D-14: Rooms are clickable; clicking one brings it to the front.
- **2026-10-25 (MS-11).** D-15: the clicked Room comes forward and covers the rest; X closes it and returns it to its place; the ring does not rotate.
- **2026-10-25 (MS-12).** Owner decisions D-16 (Rooms differ by type; Database Room), D-17 (outer sidebar; multi-provider roles; per-provider skills; Design Room has no code), D-18 (layout by prototype). Lead D-19 (MVP sidebar honesty and build order). Handoff H-03 issued.
- **2026-10-25 (MS-13).** Launch kit received (`1a6cf525…` verified; 7/7 internal hashes). Inspected: writes only to the given evidence folder; no hard-coded old paths. Imported to `kits/`. D-12 procedure in `docs/RUN_C1B_LAUNCHES.md`. F-17 resolved. C1b is ready for discovery.
- **2026-10-25 (MS-14).** C1b discovery run by the owner and reviewed OK (`evidence/mac/C1b-r1-launches/00-discovery-…json`). Preflight command finalized.
- **2026-10-25 (MS-15).** C1b preflight run by the owner and reviewed OK. Evidence imported (SHA256SUMS verified). F-12 resolved; F-07 partly resolved. Next: launch 1.
