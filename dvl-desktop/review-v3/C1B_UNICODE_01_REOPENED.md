# C1B-UNICODE-01 — sensitive stored ligature names disclose bytes

New finding, reported 2026-10-20 Europe/Paris. Proposed severity HIGH; independent reviewer determines final severity and closure.

## Evidence and impact

Owner Mac report `OWNER_V2_UNICODE_ALIAS_PROBE_REPAIR1.json` completed 79/79 pairs on darwin x64, Node v26.8.1, Darwin22.6.0, same filesystem device as the target project. Fixtures were removed. This JSON is the original owner report; it was not rewritten. Its result is observations complete, not a security PASS.

V2 native reads succeeded for eight stored names: `.conﬁg`, `kubeconﬁg`, `.password-ﬅore`, `ordinary.tfﬅate`, `ordinary.keyﬅore`, `.password-ﬆore`, `ordinary.tfﬆate`, `ordinary.keyﬆore`. U+FB01/U+FB05/U+FB06 are new sensitive aliases. All seven U+FB00..U+FB06 ligatures resolved for generic ASCII pairs. Together with ß/ſ/ẞ/K this yields eleven observed alias characters.

The original report recorded statfsType26 and sameDeviceAsProject=true, but diskutilSucceeded=false and apfsReported=false. Do not describe it as an independently confirmed APFS filesystem identity. The qualification probe now resolves the device using df before asking diskutil, and fails if APFS identity remains unconfirmed. U+1DF95 creation was rejected with EILSEQ in five Unicode-stored directions; no stored-file native proof exists for those. İ was not an alias in the tested pairs.

## Reopened review state

C1a's historical scoped PASS and successful tests remain historical evidence. F1 was previously marked CLOSED with N-2 as residual. **Reopen F1 sensitive-name privacy closure and N-2 treatment**: exact-entry binding prevents requests with alternative spellings, but still accepts an exact stored ligature spelling unless the policy itself refuses it. The original review called N-2 recommended rather than a C1b-start blocker; this new finding must be reassessed explicitly. No silent change of the old reviewer verdict.

V2's four-character treatment is incomplete. Its prior Mac gate did not test these eight spellings and cannot close this finding. V3 implements a proposed repair; fresh Mac evidence and independent review are required. C1b is not accepted/frozen. B repair v3 remains frozen and untouched; C1a is not frozen. No full C1 PASS.

## Proposed V3 repair and accepted limitation

The shared code-point table refuses any path component containing any of the eleven observed characters, including legitimate ordinary filenames. This is the broad refusal explicitly accepted by the owner for C1b. The original bytes are retained for lookup; traversal/identity/confinement behavior is not replaced by path normalization.

List/search now return `hiddenByPolicy`. This intentionally changes the earlier policy of omission without a count, at the owner's request. It discloses aggregate encountered-entry counts only, not names or payloads. List pages return a page-local count; UI accumulates pages, resets on refresh/directory/project change. Search sums visited pages. A hidden directory counts once; descendants are not visited or counted. Search exclusions and invalid/unsupported entries remain separate. With partial/racing observations this is not a complete project inventory. Policy omissions alone do not mark the permitted namespace incomplete.

## Mandatory re-verification

`qualify:c1b` ends with `test:c1b:aliases`: the repaired probe is integrated as a fail-closed gate, testing the same twelve pinned default-full-fold-to-ASCII mappings plus the separate Turkic diagnostic on the target project's filesystem. It records OS/kernel/runtime, source manifest identity, filesystem identity and per-pair results. For every sensitive pair that resolves in either direction, every created direction must reject the Unicode spelling with POLICY_DENIED in BOTH host and direct native. A newly resolving U+1DF95, for example, fails the gate until policy is extended. Incomplete probes, unknown APFS identity, unexpected runtime failures, unreadable evidence or cleanup failures fail qualification. EILSEQ on a non-creatable filename is recorded as not applicable, never a successful denial.

The pinned data covers single code points whose C+F default fold is entirely ASCII. It is not an exhaustive test of all Unicode sequences, APFS equivalences, normalization or confusables. Rerun for each target macOS/filesystem version; the gate records, rather than assumes, that version. Updating Unicode data is a separate reviewed change.

## Planned replacement, not implemented

Use pinned Unicode CaseFolding C+F data with retained version/source digest, generate identical host/native folding, then match folded components against policy. Keep original filesystem bytes and exact-entry/inode/confinement checks. Turkic T is not default folding; filesystem-specific differences still require tests. This reduces broad refusal of harmless filenames but must be separately reviewed. No universal secret detection claim.
