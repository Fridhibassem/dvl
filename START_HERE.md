# DVL Code 😈 — start here

The single repository for DVL code. It replaces scattered ZIP packages: every
delivered version is one commit plus one tag, imported byte-for-byte.

**Project state starts at [`docs/MASTER_STATE.md`](docs/MASTER_STATE.md).**
It is followed by `PLAN.md`, `FINDINGS.md`, `DECISIONS.md`, `EVIDENCE_INDEX.md`, `SOURCES_INDEX.md`, `VERSIONS.md`
and `CHANGELOG.md`. Verbatim governing and historical sources are in
`docs/sources/` and acceptance records in `docs/gates/`. Everything old (superseded kits, old evidence, old state documents, drafts) is kept separately in `history/`, never mixed with current files.
Owner rule: nothing is ever deleted; old material is labelled, not removed.

## Layout

| Path | Contents |
|---|---|
| `dvl-spike/` | Kernel / Harness spike (H1–H4). Its own `README.md`, `HARDENING.md` and `CLAUDE_REPORTS/` stay at the repository root. Their hashes are recorded in `dvl-spike/H4_CANDIDATE_TEST_RESULTS.json`, so they must not be moved or edited. |
| `dvl-desktop/` | The desktop app. Checking out a tag gives that version's exact package. |
| `kits/` | The **current** owner-run Mac kits: C1b R1 KIT R2 and the C1b launch-evidence kit. |
| `evidence/mac/` | **Current** raw Mac evidence (C1b R1), with SHA-256. |
| `history/` | **Old material only, kept apart:** superseded kits and evidence, old state documents, drafts, Mac-only H4 work, earlier reviews. Older code versions are git tags. |
| `docs/` | **Current** truth only: Master State, plan, findings, decisions, evidence and sources index, handoffs, governing sources, gate records, current checkpoint. |
| `tools/` | The import and identity-verification scripts used to build this repository. |

## Versions (tags)

| Tag | Status as of 2026-10-20 |
|---|---|
| `spike/H3-main` | Former `main` of `dvl-spike-phase-1` (H1–H3 closed). |
| `spike/H4-d92d063` | H4 evaluated implementation. Evidence child `spike/H4-evidence-05eef68` = READY_FOR_FINAL_H4_CLOSURE_DECISION (318/318 ×2, macOS). |
| `spike/ETAPE0-FROZEN-ae13301` | **ÉTAPE 0 PASS / FROZEN baseline** (`05eef68` + C07/C09/C10 test-only fixes). Reconstructed byte-exact on 2026-10-25. **`main` starts here.** |
| `desktop/B10-workspace-panels-v1` … `desktop/B-final-review-v1` | Phase B history. |
| `desktop/B-repair-v3-FROZEN` | **Phase B GREEN / FROZEN baseline.** `tests/green-gate.cjs` = `a1c599ef…`. |
| `desktop/C1a-boundary-v0.1` | Superseded. |
| `desktop/C1a-repair-v2-DRAFT` | Superseded early draft: Seatbelt profile built by string escaping. **Do not use.** |
| `desktop/C1a-repair-v2` | Reviewed reader (`project-reader.c` = `a9705e7d…`). Scoped PASS, not frozen. F1/N-2 reopened by C1B-UNICODE-01. |
| `desktop/C1b-v1`, `C1b-v2`, `C1b-v3` | Superseded candidates. |
| `desktop/C1b-v3-auth-r1` | **Current candidate.** Automated Mac qualification PASS. 0/5 manual launches. NOT frozen. |

Each commit message records the source package name and its SHA-256.
Excluded on import: macOS metadata, `node_modules`, and compiled `bin/`
helpers. Helpers are rebuilt by `npm run build:reader`, which writes its own
integrity manifest.

## Archive branches

- `archive/spike-main-H3`: the old spike `main`.
- `archive/spike-h4-claude-branch-unmerged`: Claude's earlier H4 B1–B4 line.
  It was never merged; the Codex consolidated candidate (`d92d063`) superseded it.

The original repositories are archived read-only and left unchanged. The full
3.2 GB laptop backup is the release `backup-20261020-130157` of
`PRIVATE-DVL-BACKUP-CLEAN-FOR-NEW-VERSION-LAPTOP`.
