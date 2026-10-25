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

- `history/kits/C1b-v2-pre-mac-kit` (with `desktop/C1b-v2`): package `629de6cf087bb28cd86107097f05fab73ee6d3d9752297982085e16d39d3d39d`
- `history/kits/C1b-unicode-alias-probe-1` (with `desktop/C1b-v2`): package `97e6be4883d20fe278e42d4f0d1ff7d1c84e7c0502c6c9eed6a06e7bb71770ff`
- `history/kits/C1b-v3-pre-mac-kit` (with `desktop/C1b-v3`): package `d25dea65681ce862468331a8e43639cf0d856c75b01371c2a2c5b4db4f50d03a`
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

## 4. Files (SHA-256): current (`docs/`, `evidence/`, `kits/`) and old (`history/`)

- `f215e4d4d72439e52e744a5a038b287560385813a3b51aa3d604e60f2aa33acc`  docs/CHANGELOG.md
- `6a9786cb47a207e3c1d05d811000ddaa7fdc63f063c874edb8c125ac8452b364`  docs/DECISIONS.md
- `c901a52e22ee41ca361d14688726c1dc73d851953c6fa88d1e7af17623eda3c1`  docs/FINDINGS.md
- `e475b013654f90509aca8011d67b81ae148a97d97f8faee97f2ec2b34f14fee2`  docs/IMPORT_MANIFEST.json
- `f46190070c65c34f4a69c45d400c84890a358cb7f428e9bc79aa6cb66f3a3395`  docs/MASTER_STATE.md
- `bfc2c12b0face1d4851dd49561338dc1f37a8d112afa1698f8ee01a15512b0b8`  docs/PLAN.md
- `6c83a0e08d294ca549c35c57ef7954ca83241be63a2674220c1d1eda2995cf76`  docs/SOURCES_INDEX.md
- `ebaa3c6048fef3e6c09268b0580a8e9bbda7539a2443fe05758e5c2ef69f3ade`  docs/gates/DVL_ETAPE_00_BASELINE_PASS.md
- `f89e8b99a2ec02ac8f67353de750787a9d85ad41dbc0683a64ac03b0d2cfa0ec`  docs/gates/DVL_ETAPE_01A_DESKTOP_SHELL_CLEAN_CHECKPOINT.md
- `308da619f3ba7a76b08dd7d3e5e7fa45d8f5177918ebccba1d4dd75b6f4f7e93`  docs/gates/DVL_ETAPE_0G_BASELINE_REPORT_EVIDENCE_2026-10-15.md
- `836a4cb02e900daf97ad4ca367e8b2d57d8c42c3d7a6a8becb1677df2ee1b75d`  docs/gates/DVL_PHASE_B_GREEN_FROZEN_v3.md
- `57181593a24f3da9e104f030dde5bec05e0a6e8b8679635b71779a9973353c4c`  docs/handoffs/H-01_CODEX_VERIFY_REPO_MIGRATION.md
- `4a31f1cb0583e708de7b4ab925ed1f23bfabdbf6da96a20b8767b9c523e2f39a`  docs/handoffs/H-02_CHATGPT_RS0_ROOMS_SHELL_SPEC.md
- `05d0a0cb0793a874f90bbfd1fcf9c4e15a7ccb999aed78d4c9a81cf83136718a`  docs/sources/architecture/DVL_AGREED_CORE_ARCHITECTURE_SOURCE_RECONSTRUCTED_2026-10-11.md
- `a00c099cefdaabaad5ba2314f08c597151fd97910390825fbba1f25d4ca9f58b`  docs/sources/architecture/DVL_ARCHITECTURE_VNEXT_RECONCILIATION_2026-10-12.md
- `9cdd20eadd376aa8ba5cfd8c9a3d8aee13f274b4ae89c612249187f825232d97`  docs/sources/architecture/DVL_CONSOLIDATED_ARCHITECTURE_CLAUDE_CODEX_RECONCILIATION_AND_RETEST_2026-10-11.md
- `b86dc97bee11850751a60834641fd2936fd3f5a82a0e24d6130919ac9783a19d`  docs/sources/architecture/DVL_INPUT_TO_EXECUTION_PIPELINE_V0_1.md
- `393910c8295ee5e8cb4bad3dacaea4b0c9a601ce6d949079606d899ef061d679`  docs/sources/checkpoint/DVL_COMPLETE_CHECKPOINT_STEP0_TO_C1B_R1_2026-10-20.md
- `c3c6ad99ce9e9747afaf03520ee1909d77327f187ac39519d911dc5018218658`  docs/sources/contract/DVL_CORE_STABLE_CONTRACT_FINAL_V0_3_2_FROZEN_FOR_SPIKE.md
- `43750afbc5e1baf11975786180b1d406f8ba9203c6d1b0b5ef58ee644969137d`  docs/sources/plans/DVL_STEP_BY_STEP_BUILD_ROADMAP_V2_AR.md
- `93053d997a9cee4581be416c0f7099af7f103493792add263cfc697ff262fa68`  docs/sources/product/DVL_MASTER_PROJECT_STATE_V1_EN.md
- `4e8672175b387a76784e1d7fe2a00b379d638fd7d38c90c3d1d0edbf55120318`  docs/sources/product/WHAT_DVL_MEANS.md
- `a366d9e09cc1956882e3ddd9700977f02f21e164c39efe46ddb63b9dc4c83dfd`  docs/sources/product/WHAT_SMART_DECALAGE_MEANS_AND_WHY_DVL_CHOSE_IT.md
- `992dc86b3a942895ffd0752682d58efd5fd7d27b55798b602d848e89f71969ff`  evidence/mac/C1b-r1/SHA256SUMS.txt
- `47c5d001519b40392b6c3391cad40df5042a1a51c667ff0bd2b7900676303d94`  evidence/mac/C1b-r1/capture-status.txt
- `fb539a155484f27ac0d6ee06f521a86888a029d434b8a0881619e9b3743f8631`  evidence/mac/C1b-r1/mac-built-reader-integrity.json
- `84da6a96777175a9bab58dba5b9a8d52ae74dcec290ccdb63e3703f42c0ff858`  evidence/mac/C1b-r1/qualification.log
- `2a5c0cb0a6ddab8360d94046bdb12f4d86d15accba4224887b9e933a93b76369`  evidence/mac/C1b-r1/unicode-aliases-v3.json
- `64546e020629e1c0d74684d842011cc0b5b42d57cf7e3ab2e23af005a1a7ef06`  kits/C1b-r1-kit-r2/AUTH_TESTS_R1_REPORT.md
- `68876d38231f0e092f4b983d2dd41c5629f6121ded98cb815fa8c06b40b30665`  kits/C1b-r1-kit-r2/KIT_SHA256.json
- `bd5548dd9e80251c129317c6132d3d10b3a892c51c9bfda6b695767e7816532c`  kits/C1b-r1-kit-r2/MAC_STEP_BY_STEP.md
- `a0a814721a8a8fc6eb3f1808652b8f38eaf74663abc67e16cad2e13eee065a09`  kits/C1b-r1-kit-r2/approved-harness-adaptations.json
- `5a3e89e5c0bed5640fd602586389548105758df575936f8fbc2a1ec4cf974339`  kits/C1b-r1-kit-r2/auth-mutation-child.cjs
- `31e864b33749b135aaf65cd971220f237c8c18f9b14849c13840c2549b1078ff`  kits/C1b-r1-kit-r2/capture-qualification.zsh
- `83062fb78adf1d65eebbcfd62db73cb46fc290c870fea16eafcdd76669339602`  kits/C1b-r1-kit-r2/capture-v3-launch.cjs
- `d2c94795bc4ff03ad77157efec2d9c2974cab3e1e39886e87be3e3544d79f5ed`  kits/C1b-r1-kit-r2/expected-identities.json
- `9c3a354c3ed9ad3bb286efb8c584311a13967dc9f36b9bffc14b5c68af822c5a`  kits/C1b-r1-kit-r2/run-auth-mutations.cjs
- `f8fd9cf2dfcaf7ef5c6e98e20458ff9e499395d4083c5391615823331d677a0c`  kits/C1b-r1-kit-r2/verify-b-harness.cjs
- `286d86e27efd529aa5a0db52e74c262094d35f91e415479374a7bfad30328994`  kits/C1b-r1-kit-r2/references/ALIAS_MISSING_TARGET_LOCAL.log
- `2a5e4d8edb60427ef5685efc43ea7d815b8cb28a3cd34e6056265668c4ab979b`  kits/C1b-r1-kit-r2/references/AUTH_CLAUSE_MUTATIONS_LOCAL.log
- `93d26f071ea94ed8ae67a0586ae3e32c0e89f757977982bbda65a8d3a2372a8b`  kits/C1b-r1-kit-r2/references/B_AUTH_90_LOCAL.log
- `735a094e543230da8eb005481ddb223bfdb9e838bbe67f477bfefcb3d7d654ed`  kits/C1b-r1-kit-r2/references/CAPTURE_WRAPPER_LOCAL_TEST.json
- `1128725c3763ed0058e174307f6878f873b84a85fd4c3e97b0ce7106c79e8090`  kits/C1b-r1-kit-r2/references/KIT_R2_AUTH_MUTATIONS_LOCAL.log
- `1e0726512a46a94a516227d9375929537ababec842b398f1ef2cfb32dc89bb58`  kits/C1b-r1-kit-r2/references/NATIVE_IDENTITIES.json
- `25ed61c9086948f81fc4576b46266757be77bf639e1baf83e4ee73e74a09c0ce`  kits/C1b-r1-kit-r2/references/UNCHANGED_PRODUCTION_AND_VERIFIERS.json
- `1150d25826770bded6db8cbd27e0c405cf4397eaac661491d669e8d211a2cb7a`  kits/C1b-r1-kit-r2/references/V3-to-auth-tests-r1.patch
- `a1c599efc9859812486462c91102c0dbcc55583dd33e79c5e17c4f825e8f4d4c`  kits/C1b-r1-kit-r2/references/frozen-B-green-gate.cjs
- `6b1349a13e02abb7e30c21680b9059666ed2e0c22b10b6400a0362a044f53f75`  kits/C1b-r1-kit-r2/references/project-reader.c.C1a-to-V3.patch
- `4bd24fd7e05c534f2db3f6c223e22f5b0d5c0277d9ca4724445e90fa88afe4b5`  kits/C1b-r1-kit-r2/references/read-policy.h.C1a-to-V3.patch
- `67ab86f1b4e34239b63fb2cf02c9087b109c2c611e8d1f1810014fdc56277cf6`  history/docs/lead-2026-10-25/DVL_CLEANUP_PLAN_2026-10-25.md
- `96bfb4c817c070efcf7c4238cec86e1b5486eba79ce14fe53b92e944100f8226`  history/docs/lead-2026-10-25/DVL_MASTER_STATE_ANSWERS_FOR_CLAUDE_2026-10-25.md
- `7c8dc7b98fb9bf94ba964ba95e96e62b893b7ef7e497f32996bd0335e40d9038`  history/docs/lead-2026-10-25/QUESTION_FOR_CHATGPT_MASTER_STATE.md
- `6138daf66676bd943318be37a7d0147c8673c2cc465a0bf7534596544f04383c`  history/docs/plans/DVL_BUILD_ROADMAP_V3_PROPOSAL.md
- `2f855da115b3ab278c66ac577155b4676c7d98a5cd9893005cab9bbe9123e6c7`  history/docs/plans/DVL_BUILD_ROADMAP_V3_PROPOSAL.png
- `1078a33b5b0794dcf83efe398837f6c28de19ccf71c6daf8410402946860489f`  history/docs/plans/bluid_dvl_etape_by_etape.md
- `0684f935e024759755eef96035e324445de88669c456538371afa04ead8b0ac7`  history/docs/reviews/C1B_INDEPENDENT_REVIEW_V1.md
- `783dc4d18a09234782025b71ca1ac349e14863a9f20b2c160b3700e3b8aeb4d6`  history/docs/reviews/C1B_REVIEWER_PROTOTYPE_NOT_A_CANDIDATE.patch
- `0f8b5cafd27c829fbb48a468bfb2bde6dd83986144a4f8688744b8a84285d5e5`  history/docs/state-history/DVL_CODE_MASTER_STATE_2026-09-29.md
- `a03e54ac8ea384dde87d060e3f231b1d1a04216265c98b720e76a12fedbcfee6`  history/docs/state-history/DVL_FULL_RESUME_2026-10-12.md
- `4318ce35c228e3861dcdc7910b1ec33cfe7fd700a1787f4525b33449be5f1b80`  history/docs/state-history/DVL_MASTER_STATE_UPDATE_2026-10-08.md
- `d84e8648acbf978b6dabf312742e66a34a49911dd9583c710f0679acf41befa3`  history/evidence/mac/C1b-v2/C1B_UNICODE_ALIAS_PROBE.json
- `d7b4e5afdd01058126c7b9a74fe742fc7d0d348c39299c53aef7a608e522efc7`  history/evidence/mac/C1b-v2/C1B_UNICODE_ALIAS_PROBE_REPAIR1.json
- `aa8314e5aae5df20aff5800f846f5fc494cf47179a21566bf692de3b30932f26`  history/evidence/mac/C1b-v2/C1B_V2_MAC_QUALIFICATION.log
- `71449f70f7f884231458986f96a2a475b0ea6697c580fb43d022cfc7f3b4524d`  history/kits/C1b-unicode-alias-probe-1/HOST_LOGIC_SELFTEST.log
- `e16a3b970aa438091c120c001e17d171e01d0694b95a874e45219db379cea49d`  history/kits/C1b-unicode-alias-probe-1/README_AND_POLICY_PLAN.md
- `02fe7b2867d05eedaf610dc97a14b9c2ba246cf44bad6cc5dabd1e3d659aa50d`  history/kits/C1b-unicode-alias-probe-1/SHA256.json
- `1cfc6a557c7edc6ee1022d602f5c1c908f6d18c66169671303d9c85d3ae27c83`  history/kits/C1b-unicode-alias-probe-1/probe-unicode-aliases.cjs
- `cb0e6c7ce461b77cfad7ca4dcfa9828025546399e66341945b24f8fb6e47f773`  history/kits/C1b-v2-pre-mac-kit/KIT_SHA256.json
- `f560088f610bc7e5f0acf80a5c0f7be09816e8852960a85c1b67564a9d27a9ad`  history/kits/C1b-v2-pre-mac-kit/README.md
- `a0a814721a8a8fc6eb3f1808652b8f38eaf74663abc67e16cad2e13eee065a09`  history/kits/C1b-v2-pre-mac-kit/approved-harness-adaptations.json
- `51e0b94517638fb9383c17b6dbd6780f0df84056fecb332e2a9e4102fd2204ff`  history/kits/C1b-v2-pre-mac-kit/capture-host-check.json
- `02f14a7fe96c4c9aee0ab30d23b276375db6b1ba7aea4d472ce7a22b106658bb`  history/kits/C1b-v2-pre-mac-kit/capture-v2-launch.cjs
- `5a943314bbd5ce87365ff012aa6966dbb770a0e1b7864afb83642e0d5ad2267d`  history/kits/C1b-v2-pre-mac-kit/expected-identities.json
- `196a6f01dd80619afaed6f540fbeb9925b672251a211396a131415f074616dc3`  history/kits/C1b-v2-pre-mac-kit/green-gate-comparison-result.json
- `0ce7dd60764f57763f47a5b9d8177491eb6d4482fcfeb1185f343d23743bd516`  history/kits/C1b-v2-pre-mac-kit/green-gate-vs-frozen-B.patch
- `3239fdddbfaaec353877f1147ecd61b989e68369953404ffd6a5fa2dc8807f38`  history/kits/C1b-v2-pre-mac-kit/native-input-identities.json
- `3c985ead1f123a11d9311fbc854bb90b62f81b03365534179bd7bebf001b6fd1`  history/kits/C1b-v2-pre-mac-kit/project-reader-vs-reviewed-C1a.patch
- `6dc4540118bee87e367885eaea465564b36a0df0970ef169e9a412aef48e2176`  history/kits/C1b-v2-pre-mac-kit/read-policy-header-vs-reviewed-C1a.patch
- `2fc15592000f5d5b653c8783af37657809e1b0f73d45390fedd88a95995e2f3f`  history/kits/C1b-v2-pre-mac-kit/verify-b-harness.cjs
- `a1c599efc9859812486462c91102c0dbcc55583dd33e79c5e17c4f825e8f4d4c`  history/kits/C1b-v2-pre-mac-kit/references/frozen-B-green-gate.cjs
- `594d83e6e26ba47b058d37f0f701efdfca2d903c81b42f67fd3222eb6d529d0f`  history/kits/C1b-v3-pre-mac-kit/KIT_SHA256.json
- `b60c818abfec0291d722d686c4983f3420eaf0fe1845d90ca22a3ff326cbe631`  history/kits/C1b-v3-pre-mac-kit/MAC_STEP_BY_STEP.md
- `a0a814721a8a8fc6eb3f1808652b8f38eaf74663abc67e16cad2e13eee065a09`  history/kits/C1b-v3-pre-mac-kit/approved-harness-adaptations.json
- `83062fb78adf1d65eebbcfd62db73cb46fc290c870fea16eafcdd76669339602`  history/kits/C1b-v3-pre-mac-kit/capture-v3-launch.cjs
- `0175d2de5d608c2eb5b8079ef167bcc406835762760a433a53a61db13b633fd5`  history/kits/C1b-v3-pre-mac-kit/expected-identities.json
- `f8fd9cf2dfcaf7ef5c6e98e20458ff9e499395d4083c5391615823331d677a0c`  history/kits/C1b-v3-pre-mac-kit/verify-b-harness.cjs
- `1e0726512a46a94a516227d9375929537ababec842b398f1ef2cfb32dc89bb58`  history/kits/C1b-v3-pre-mac-kit/references/NATIVE_IDENTITIES.json
- `a1c599efc9859812486462c91102c0dbcc55583dd33e79c5e17c4f825e8f4d4c`  history/kits/C1b-v3-pre-mac-kit/references/frozen-B-green-gate.cjs
- `6b1349a13e02abb7e30c21680b9059666ed2e0c22b10b6400a0362a044f53f75`  history/kits/C1b-v3-pre-mac-kit/references/project-reader.c.C1a-to-V3.patch
- `4bd24fd7e05c534f2db3f6c223e22f5b0d5c0277d9ca4724445e90fa88afe4b5`  history/kits/C1b-v3-pre-mac-kit/references/read-policy.h.C1a-to-V3.patch
- `83ad767188d20f8b266ad665510c08da3f7a216bd2d90ee25c6dff09b61fca2a`  history/mac-only/H4_FINAL_REVIEW.txt
- `ecb69d0d165167fead49517c01cec3579c749d71627e31885b487074d1b250a1`  history/mac-only/kernel-h4.diff
- `2e13be0bfcce7dc451d1166db4bd2308efb772b60615de6d54f9ef4618821262`  history/mac-only/kernel-TS/c27-h4-kernel-crash-replay-step5.test.ts
- `849aec32313b983d0f20445ec61e70a3bdf25ad13db836da3a4a19a66356271d`  history/mac-only/kernel-TS/c27-h4-kernel-crash-replay-unknown-hold.test.ts
- `849aec32313b983d0f20445ec61e70a3bdf25ad13db836da3a4a19a66356271d`  history/mac-only/kernel-TS/c27-h4-kernel-crash-replay.test.ts
- `2e13be0bfcce7dc451d1166db4bd2308efb772b60615de6d54f9ef4618821262`  history/mac-only/kernel-TS/c27-h4-physical-current.ts
- `87c60384d5d167b8cd8bc7ccec7131b6378d714170e1f2dc66b440798045666b`  history/mac-only/kernel-TS/c27-h4-physical-sigkill-step6.ts
- `bf23761b3af2f37dd50408125bc63b0b786e9317930dad357185c5bbf71000e9`  history/mac-only/kernel-TS/kernel.ts
- `bf23761b3af2f37dd50408125bc63b0b786e9317930dad357185c5bbf71000e9`  history/mac-only/kernel-TS/kernel_fixed_step3.ts
- `916cf51316a78f5c8c32fa38c0d2b38bd14ea4e077070e364a2207de91d3c087`  history/mac-only/kernel-TS/kernel_step4_durable_unknown.ts
- `59d157b65567d76ddc2091b9309c3d2080fa3122a2815afcc12b24fb11c0ced7`  history/mac-only/kernel-TS/kernel_step5_reconciliation.ts
