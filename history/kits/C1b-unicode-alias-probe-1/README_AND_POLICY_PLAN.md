# C1b Unicode alias probe and policy follow-up

Date: 2026-10-20. **Manual restored-launch collection is paused for this requested probe.** Production V2 remains unchanged; any runtime policy/counter change must receive a new candidate identity and qualification.

## Accepted decisions

1. Broad refusal of the current four characters is accepted as a C1b compatibility limitation. It can hide legitimate names such as Straße.txt and entire subtrees under refused directory names.
2. Test the seven requested ligatures and every other non-ASCII single code point in pinned Unicode default full CaseFolding data whose fold consists entirely of ASCII. If new sensitive-name aliases resolve on the target APFS volume, extend the guarded set before proceeding with the revised candidate.
3. Add an owner-visible `hidden by policy: N` count to listing/search in the next candidate. **This is requested and planned, not implemented by this external probe or by retained V2.**
4. Planned replacement: fold-then-match using pinned Unicode CaseFolding data and identical generated mappings in JS/native. This is a plan, not current behaviour.

## Data coverage and source

Source: [Unicode CaseFolding 18.0.0](https://www.unicode.org/Public/18.0.0/ucd/CaseFolding.txt). Its header identifies CaseFolding-18.0.0.txt. The implementer retrieved all 1702 web-rendered lines without gaps and parsed default full mappings (C + F; S and locale-specific T excluded). The census contains 26 ASCII uppercase inputs, already handled by ordinary ASCII lowercasing, and **12 non-ASCII inputs whose full mapping is entirely ASCII**:

| Code point | Character | ASCII full fold |
|---|---|---|
| U+00DF | ß | ss |
| U+017F | ſ | s |
| U+1E9E | ẞ | ss |
| U+212A | K | k |
| U+FB00 | ﬀ | ff |
| U+FB01 | ﬁ | fi |
| U+FB02 | ﬂ | fl |
| U+FB03 | ﬃ | ffi |
| U+FB04 | ﬄ | ffl |
| U+FB05 | ﬅ | st |
| U+FB06 | ﬆ | st |
| U+1DF95 | supplementary long-s ligature | ss |

The probe additionally tests U+0130 (İ) -> i as a separately labelled **Turkic-only** mapping. Its default full mapping includes a combining dot and is not ASCII-only. Default/Turkic results must not be conflated.

These are CaseFolding mappings, not NFKC compatibility decomposition, visual confusable detection or a proof of APFS equivalence. Old target macOS/APFS Unicode tables can differ from the pinned current dataset; actual filesystem observations decide the requested compatibility question. No claim is made that these are all possible filesystem aliases.

## What the probe does

- Verify the retained V2 manifest identity, all 94 shipped file hashes, and platform/architecture/helper digest before probing.
- Create one disposable sibling fixture directory beside the target project, on the same filesystem device. Never create files inside the real project or edit V2 source/userData/settings.
- Record filesystem information, including optional diskutil APFS identification and an actual ASCII case-sensitivity observation. If APFS is not identified, do not label the result APFS-qualified without resolving the filesystem identity.
- For each non-ASCII mapping, test neutral ASCII names. For every occurrence of that mapped ASCII sequence in a current sensitive policy name/prefix/extension sample, also test that sensitive spelling.
- Test **both directions**: ASCII stored / Unicode lookup, and Unicode stored / ASCII lookup. Compare device+inode, not mere existence, and record actual stored spelling bytes.
- For each sensitive Unicode-stored fixture, invoke the existing V2 native helper directly on that stored Unicode name. Record only bounded status/mode and whether disposable fixture bytes matched; never return payload bytes in the report. This distinguishes filesystem alias resolution from actual V2 policy refusal.
- Remove only the fixture tree it created, then save the report outside the real project/source. Refuse to overwrite an existing report.

`ADDITIONAL_SENSITIVE_ALIASES` identifies characters outside V2's four-character guard that resolved to a sensitive ASCII sample in at least one direction. `V2_ALLOWED_SENSITIVE_ALIAS_READS` identifies cases where that alias also had a permitted native read of the stored Unicode spelling. Generic-only alias observations are recorded separately. A successful probe is **not a security PASS**. Native or stat failures make the probe incomplete rather than evidence of safety.

## Run on the target Mac — one step

Extract this folder onto Desktop. Keep the already-built/qualified V2 folder in its existing location. From Terminal:

```bash
node "$HOME/Desktop/DVL_C1B_UNICODE_ALIAS_PROBE/probe-unicode-aliases.cjs" "$HOME/Desktop/dvl-desktop-C1b-v2" "$HOME/Desktop/khedma.tn" "$HOME/Desktop/C1B_UNICODE_ALIAS_PROBE.json"
```

Expected: ALIAS_RESOLUTION observations, then UNICODE_ALIAS_REPORT, ADDITIONAL_SENSITIVE_ALIASES, and V2_ALLOWED_SENSITIVE_ALIAS_READS. Send **C1B_UNICODE_ALIAS_PROBE.json**, including any incomplete/error result. Do not infer PASS from an empty alias array when the probe failed. If the report already exists, retain it and choose a new output filename; do not overwrite old evidence.

The actual probe is **UNTESTED on macOS here**. Its mapping census/pair generation/inode-comparison logic passed the included self-test on the implementer Linux host; that self-test does not invoke APFS, diskutil or the production native helper. V2's earlier Mac qualification does not execute this new probe.

## Next candidate: count semantics to implement after observations

- Native listing will report a bounded `hiddenByPolicy` count for policy-refused **directory entries actually encountered on that page**, after the raw pagination offset. No names/content are added. One refused directory counts as one entry; its descendants are not traversed or counted.
- The host will validate this native field strictly, preserve non-policy skipped counts separately, and aggregate exactly once across traversed pages/directories during search. The renderer will accumulate current listing pages and display `hidden by policy: N` for list/search, including complete-over-permitted results.
- Partial scans are lower-bound observations, not a total hidden-file inventory. Hidden-by-policy counts remain distinct from `.next`/other search exclusions, unsupported encodings, filesystem failures and invalid-name skips.
- This is an explicitly requested change to the prior omission-without-count behaviour. It exposes an aggregate existence count to the user; it is not authority for providers/workers or disclosure of denied names.
- Add meaningful native/host/UI regressions: denied ordinary names and legitimate Unicode names, list/read/search agreement, directory subtrees, page boundaries/no double counting, strict integer/schema rejection, and partial-result counts. Rebuild/qualify the new source; do not mutate the accepted V2 ZIP.

## Planned replacement: Unicode fold-then-match

Pin a specific CaseFolding version and reproducible mapping snapshot. Use default full C+F mappings in a shared generated representation for JS/native, then match the resulting name against the existing denied exact names/prefixes/extensions. Handle malformed UTF-8 consistently and bound transformed sizes/expansion. Do not substitute JS toLowerCase or locale-dependent C tolower for Unicode full case folding.

Preserve original filename bytes for actual lookup, byte-exact stored-name checks, descriptor/root identity, symlink/hardlink restrictions and mandatory confinement. Do not normalize/rewrite the requested path or treat a folded skeleton as an OS path. Case folding alone does not guarantee coverage of all filesystem normalization/alias rules; the APFS findings and any Turkic-only/out-of-table aliases need explicit treatment and regression coverage before replacing broad refusal. Retain the broad guard until the replacement is reviewed and qualified.

STATE -> Goal: close C1b with visible policy limits | Decisions: broad rejection accepted for now; probe all pinned ASCII-producing full folds; add aggregate hidden count in a new candidate; fold-then-match planned | Open: actual Mac/APFS probe observations, extension set, new candidate implementation/qualification, original TIMEOUT evidence and independent review | Next: run this probe and send its JSON; then implement the scoped new candidate. Five restored-project runs remain pending.
