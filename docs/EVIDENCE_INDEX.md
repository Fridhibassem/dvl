# DVL — EVIDENCE INDEX

Revision E-1, 2026-10-25. Every entry gives its SHA-256 and where to find it. Generated, not hand-edited.

## 1. Desktop versions (tags) and source packages

| Tag | Status | Source package | Package SHA-256 | Files |
|---|---|---|---|---|
| `desktop/B10-workspace-panels-v1` | HISTORICAL | `dvl-desktop-B10-workspace-panels-v1.zip` | `ba5b41ba278ee8295f6c38a8c12efdf8fa9884995af54c1d94232ac50a373a7c` | 5 |
| `desktop/B-green-gate-review-v1` | HISTORICAL | `DVL_GREEN_GATE_B_REVIEW_v1.zip` | `bdd950cd53a58f42f687c3ea133ea8acf62fa240215d3b907c236c2c537f8e9a` | 6 |
| `desktop/B-repair-v2` | SUPERSEDED | `DVL_GREEN_GATE_B_REPAIR_v2.zip` | `1e136f34fbd9075269497f28b67239cbb726233fd64b5c79a3edebeb4948f9e6` | 8 |
| `desktop/B-final-review-v1` | SUPERSEDED | `DVL_B_FINAL_REVIEW_v1.zip` | `b4ceb18268be012552624c859031c11b4ea0a4117b0e83698ef8c75e68484924` | 8 |
| `desktop/B-repair-v3-FROZEN` | PASS/FROZEN | `DVL_GREEN_GATE_B_REPAIR_v3.zip` | `f77387a4bfc60fccb196bee0228c25f03abb76844c49046860489bb846367aff` | 13 |
| `desktop/C1a-boundary-v0.1` | SUPERSEDED | `DVL_C1A_BOUNDARY_CANDIDATE_V0_1.zip` | `32a9948ba6e7c966c50cacc3741b017523e12355fb1b40e8bfb2a74dd74bf4cb` | 24 |
| `desktop/C1a-repair-v2-DRAFT` | SUPERSEDED (string-escaped Seatbelt profile; not the reviewed reader.c) | `DVL_C1A_REPAIR_V2.zip` | `338010883702992be3e6448cdec5080793096f6f3a81df20a309eb3849f54593` | 41 |
| `desktop/C1a-repair-v2` | scoped PASS, NOT frozen; F1/N-2 reopened by C1B-UNICODE-01 | `dvl-desktop-C1a-repair-v2.zip` | `5eccd0b21bd0bebd9544805686db8a8cb8474030f4cbe288bdbd98e014a11775` | 42 |
| `desktop/C1b-v1` | NOT PASS | `DVL_C1B_CANDIDATE_V1.zip` | `1c5f05b639e2cba2fe585d680ff3549ffbb63945498691e5f4db0acf99ed7db3` | 66 |
| `desktop/C1b-v2` | SUPERSEDED (Unicode ligature aliases) | `DVL_C1B_CANDIDATE_V2.zip` | `17f7026185633726c248b3baaac8d1b16ca14cc1284ce8dfd237a47a332989dd` | 95 |
| `desktop/C1b-v3` | SUPERSEDED by R1 (auth tests) | `DVL_C1B_CANDIDATE_V3.zip` | `a69338dbd748273bdd598012b5af06aaf376ad1097631eb30b4e1237fef62b6c` | 112 |
| `desktop/C1b-v3-auth-r1` | CANDIDATE — automated Mac qualification PASS; 0/5 launches; NOT frozen | `DVL_C1B_V3_AUTH_TESTS_R1.zip` | `5701ab7c622697ba8a052536dbbf2e8fea69eb02c284b088c06613bf519b6df5` | 125 |

Kits:

- `kits/C1b-v2-pre-mac-kit` (with `desktop/C1b-v2`): package `629de6cf087bb28cd86107097f05fab73ee6d3d9752297982085e16d39d3d39d`
- `kits/C1b-unicode-alias-probe-1` (with `desktop/C1b-v2`): package `97e6be4883d20fe278e42d4f0d1ff7d1c84e7c0502c6c9eed6a06e7bb71770ff`
- `kits/C1b-v3-pre-mac-kit` (with `desktop/C1b-v3`): package `d25dea65681ce862468331a8e43639cf0d856c75b01371c2a2c5b4db4f50d03a`
- `kits/C1b-r1-kit-r2` (with `desktop/C1b-v3-auth-r1`): package `241fddcf9d8a3d9716eedd573debc65286ffce1a1b7c73c74aff9b3510d63435`

## 2. Spike commits

| Ref | Commit | Meaning |
|---|---|---|
| `spike/H3-main` | `e55760f0e336a49ad291a1b5aa1aa226c270bcbb` | GitHub `dvl-spike-phase-1` main (H1–H3) |
| `spike/H4-d92d063` | `d92d0636334a4342b917331fa8bbc2d7e24b9b6a` | H4 evaluated implementation |
| `spike/H4-evidence-05eef68` | `05eef688102bf43e80e37cc024fa2169b1b8e850` | H4 evidence child: READY_FOR_FINAL_H4_CLOSURE_DECISION |
| `spike/ETAPE0-FROZEN-ae13301` | `ae13301b8794889d33b3fdab08a85d99aa0e0b7a` | ÉTAPE 0 PASS frozen baseline, reconstructed byte-exact (author/committer fridhi, 1792020439 +0000) |
| `archive/spike-h4-claude-branch-unmerged` | `a6896f80f2c9e40703549a93bb78e7cfb5a6dad1` | Claude H4 B1–B4 line (GitHub), not merged |

## 3. Migration verification receipt (Claude, 2026-10-25)

```
desktop/B10-workspace-panels-v1  OK files=5 missing=[] extra=[] diff=[]
desktop/B-green-gate-review-v1   OK files=6 missing=[] extra=[] diff=[]
desktop/B-repair-v2              OK files=8 missing=[] extra=[] diff=[]
desktop/B-final-review-v1        OK files=8 missing=[] extra=[] diff=[]
desktop/B-repair-v3-FROZEN       OK files=13 missing=[] extra=[] diff=[]
desktop/C1a-boundary-v0.1        OK files=24 missing=[] extra=[] diff=[]
desktop/C1a-repair-v2-DRAFT      OK files=41 missing=[] extra=[] diff=[]
desktop/C1a-repair-v2            OK files=42 missing=[] extra=[] diff=[]
desktop/C1b-v1                   OK files=66 missing=[] extra=[] diff=[]
desktop/C1b-v2                   OK files=95 missing=[] extra=[] diff=[]
desktop/C1b-v3                   OK files=112 missing=[] extra=[] diff=[]
desktop/C1b-v3-auth-r1           OK files=125 missing=[] extra=[] diff=[]
ALL_TAGS_IDENTICAL
desktop/C1b-v2 verify-source: C1B SOURCE MATCH PASS: 94 entries
desktop/C1b-v3 verify-source: C1B SOURCE MATCH PASS: 111 entries
desktop/C1b-v3-auth-r1 verify-source: C1B SOURCE MATCH PASS: 124 entries
```

Method: for every tag, every file of the source ZIP (excluding `__MACOSX`, `.DS_Store`, `node_modules` and compiled `bin/`) is compared as a git blob hash against the tagged tree. Missing, extra and differing files must all be zero. A tag preserves the package's file bytes, not the ZIP container; the container is identified by the package SHA-256 above.

Independent check needed: per the ChatGPT answer, this receipt stays **CLAIMED** until another party reproduces it (`python3 tools/verify_dvl_repo.py`).

## 4. Files in docs/, evidence/, kits/ (SHA-256)

- `31007810ba4079fc166295224039766679e4a24c235e6b34cb13f264b534271c`  docs/CHANGELOG.md
- `044f7903b2ec87453125356be0fb271c87179113ac6056bf4b4f78945412fe1c`  docs/DECISIONS.md
- `26c8ed9ad9c597c4662f8a839bed251e761626dab600835183b71e46c3653bdc`  docs/FINDINGS.md
- `c853e61211607f0c380e679df5c72532238ee4e9888d001a3d54834069b4f6fc`  docs/IMPORT_MANIFEST.json
- `c4c33a95a723f52b05b48a9b0b5844187114f100c4eb5a4c35cfbe98ecb5b1dc`  docs/MASTER_STATE.md
- `3f79c19a00607935ea14ade3b4172fe3fba3a4800c05088228d23e865ce33d74`  docs/PLAN.md
- `ebaa3c6048fef3e6c09268b0580a8e9bbda7539a2443fe05758e5c2ef69f3ade`  docs/gates/DVL_ETAPE_00_BASELINE_PASS.md
- `f89e8b99a2ec02ac8f67353de750787a9d85ad41dbc0683a64ac03b0d2cfa0ec`  docs/gates/DVL_ETAPE_01A_DESKTOP_SHELL_CLEAN_CHECKPOINT.md
- `308da619f3ba7a76b08dd7d3e5e7fa45d8f5177918ebccba1d4dd75b6f4f7e93`  docs/gates/DVL_ETAPE_0G_BASELINE_REPORT_EVIDENCE_2026-10-15.md
- `836a4cb02e900daf97ad4ca367e8b2d57d8c42c3d7a6a8becb1677df2ee1b75d`  docs/gates/DVL_PHASE_B_GREEN_FROZEN_v3.md
- `83ad767188d20f8b266ad665510c08da3f7a216bd2d90ee25c6dff09b61fca2a`  docs/history/mac-only/H4_FINAL_REVIEW.txt
- `ecb69d0d165167fead49517c01cec3579c749d71627e31885b487074d1b250a1`  docs/history/mac-only/kernel-h4.diff
- `2e13be0bfcce7dc451d1166db4bd2308efb772b60615de6d54f9ef4618821262`  docs/history/mac-only/kernel-TS/c27-h4-kernel-crash-replay-step5.test.ts
- `849aec32313b983d0f20445ec61e70a3bdf25ad13db836da3a4a19a66356271d`  docs/history/mac-only/kernel-TS/c27-h4-kernel-crash-replay-unknown-hold.test.ts
- `849aec32313b983d0f20445ec61e70a3bdf25ad13db836da3a4a19a66356271d`  docs/history/mac-only/kernel-TS/c27-h4-kernel-crash-replay.test.ts
- `2e13be0bfcce7dc451d1166db4bd2308efb772b60615de6d54f9ef4618821262`  docs/history/mac-only/kernel-TS/c27-h4-physical-current.ts
- `87c60384d5d167b8cd8bc7ccec7131b6378d714170e1f2dc66b440798045666b`  docs/history/mac-only/kernel-TS/c27-h4-physical-sigkill-step6.ts
- `bf23761b3af2f37dd50408125bc63b0b786e9317930dad357185c5bbf71000e9`  docs/history/mac-only/kernel-TS/kernel.ts
- `bf23761b3af2f37dd50408125bc63b0b786e9317930dad357185c5bbf71000e9`  docs/history/mac-only/kernel-TS/kernel_fixed_step3.ts
- `916cf51316a78f5c8c32fa38c0d2b38bd14ea4e077070e364a2207de91d3c087`  docs/history/mac-only/kernel-TS/kernel_step4_durable_unknown.ts
- `59d157b65567d76ddc2091b9309c3d2080fa3122a2815afcc12b24fb11c0ced7`  docs/history/mac-only/kernel-TS/kernel_step5_reconciliation.ts
- `0684f935e024759755eef96035e324445de88669c456538371afa04ead8b0ac7`  docs/reviews/C1B_INDEPENDENT_REVIEW_V1.md
- `783dc4d18a09234782025b71ca1ac349e14863a9f20b2c160b3700e3b8aeb4d6`  docs/reviews/C1B_REVIEWER_PROTOTYPE_NOT_A_CANDIDATE.patch
- `05d0a0cb0793a874f90bbfd1fcf9c4e15a7ccb999aed78d4c9a81cf83136718a`  docs/sources/architecture/DVL_AGREED_CORE_ARCHITECTURE_SOURCE_RECONSTRUCTED_2026-10-11.md
- `a00c099cefdaabaad5ba2314f08c597151fd97910390825fbba1f25d4ca9f58b`  docs/sources/architecture/DVL_ARCHITECTURE_VNEXT_RECONCILIATION_2026-10-12.md
- `9cdd20eadd376aa8ba5cfd8c9a3d8aee13f274b4ae89c612249187f825232d97`  docs/sources/architecture/DVL_CONSOLIDATED_ARCHITECTURE_CLAUDE_CODEX_RECONCILIATION_AND_RETEST_2026-10-11.md
- `b86dc97bee11850751a60834641fd2936fd3f5a82a0e24d6130919ac9783a19d`  docs/sources/architecture/DVL_INPUT_TO_EXECUTION_PIPELINE_V0_1.md
- `c3c6ad99ce9e9747afaf03520ee1909d77327f187ac39519d911dc5018218658`  docs/sources/contract/DVL_CORE_STABLE_CONTRACT_FINAL_V0_3_2_FROZEN_FOR_SPIKE.md
- `67ab86f1b4e34239b63fb2cf02c9087b109c2c611e8d1f1810014fdc56277cf6`  docs/sources/lead-2026-10-25/DVL_CLEANUP_PLAN_2026-10-25.md
- `96bfb4c817c070efcf7c4238cec86e1b5486eba79ce14fe53b92e944100f8226`  docs/sources/lead-2026-10-25/DVL_MASTER_STATE_ANSWERS_FOR_CLAUDE_2026-10-25.md
- `7c8dc7b98fb9bf94ba964ba95e96e62b893b7ef7e497f32996bd0335e40d9038`  docs/sources/lead-2026-10-25/QUESTION_FOR_CHATGPT_MASTER_STATE.md
- `6138daf66676bd943318be37a7d0147c8673c2cc465a0bf7534596544f04383c`  docs/sources/plans/DVL_BUILD_ROADMAP_V3_PROPOSAL.md
- `2f855da115b3ab278c66ac577155b4676c7d98a5cd9893005cab9bbe9123e6c7`  docs/sources/plans/DVL_BUILD_ROADMAP_V3_PROPOSAL.png
- `43750afbc5e1baf11975786180b1d406f8ba9203c6d1b0b5ef58ee644969137d`  docs/sources/plans/DVL_STEP_BY_STEP_BUILD_ROADMAP_V2_AR.md
- `1078a33b5b0794dcf83efe398837f6c28de19ccf71c6daf8410402946860489f`  docs/sources/plans/bluid_dvl_etape_by_etape.md
- `93053d997a9cee4581be416c0f7099af7f103493792add263cfc697ff262fa68`  docs/sources/product/DVL_MASTER_PROJECT_STATE_V1_EN.md
- `4e8672175b387a76784e1d7fe2a00b379d638fd7d38c90c3d1d0edbf55120318`  docs/sources/product/WHAT_DVL_MEANS.md
- `a366d9e09cc1956882e3ddd9700977f02f21e164c39efe46ddb63b9dc4c83dfd`  docs/sources/product/WHAT_SMART_DECALAGE_MEANS_AND_WHY_DVL_CHOSE_IT.md
- `0f8b5cafd27c829fbb48a468bfb2bde6dd83986144a4f8688744b8a84285d5e5`  docs/sources/state-history/DVL_CODE_MASTER_STATE_2026-09-29.md
- `393910c8295ee5e8cb4bad3dacaea4b0c9a601ce6d949079606d899ef061d679`  docs/sources/state-history/DVL_COMPLETE_CHECKPOINT_STEP0_TO_C1B_R1_2026-10-20.md
- `a03e54ac8ea384dde87d060e3f231b1d1a04216265c98b720e76a12fedbcfee6`  docs/sources/state-history/DVL_FULL_RESUME_2026-10-12.md
- `4318ce35c228e3861dcdc7910b1ec33cfe7fd700a1787f4525b33449be5f1b80`  docs/sources/state-history/DVL_MASTER_STATE_UPDATE_2026-10-08.md
- `992dc86b3a942895ffd0752682d58efd5fd7d27b55798b602d848e89f71969ff`  evidence/mac/C1b-r1/SHA256SUMS.txt
- `47c5d001519b40392b6c3391cad40df5042a1a51c667ff0bd2b7900676303d94`  evidence/mac/C1b-r1/capture-status.txt
- `fb539a155484f27ac0d6ee06f521a86888a029d434b8a0881619e9b3743f8631`  evidence/mac/C1b-r1/mac-built-reader-integrity.json
- `84da6a96777175a9bab58dba5b9a8d52ae74dcec290ccdb63e3703f42c0ff858`  evidence/mac/C1b-r1/qualification.log
- `2a5c0cb0a6ddab8360d94046bdb12f4d86d15accba4224887b9e933a93b76369`  evidence/mac/C1b-r1/unicode-aliases-v3.json
- `d84e8648acbf978b6dabf312742e66a34a49911dd9583c710f0679acf41befa3`  evidence/mac/C1b-v2/C1B_UNICODE_ALIAS_PROBE.json
- `d7b4e5afdd01058126c7b9a74fe742fc7d0d348c39299c53aef7a608e522efc7`  evidence/mac/C1b-v2/C1B_UNICODE_ALIAS_PROBE_REPAIR1.json
- `aa8314e5aae5df20aff5800f846f5fc494cf47179a21566bf692de3b30932f26`  evidence/mac/C1b-v2/C1B_V2_MAC_QUALIFICATION.log
