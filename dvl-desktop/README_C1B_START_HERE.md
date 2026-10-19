# DVL C1b V3 — Mac qualification candidate

Read `C1B_STATUS_AND_REVIEW_REQUEST.md` and `review-v3/C1B_UNICODE_01_REOPENED.md` first. V2 is preserved; V3 does not inherit its qualification or acceptance. The new ligature finding explicitly reopens C1a F1/N-2 privacy closure for review.

Extract into a NEW Desktop folder `dvl-desktop-C1b-v3`; do not overlay V2. The companion `DVL_C1B_V3_PRE_MAC_KIT` supplies identity verification and the five-run capture procedure. Follow its `MAC_STEP_BY_STEP.md` one step at a time. The five manual launches remain paused until the complete V3 gate passes.

The required alias gate writes only disposable sibling fixtures on the target project's filesystem, removes its own fixtures, never reads or edits project contents, and saves a new JSON outside source/project. Explicitly set DVL_ALIAS_PROJECT and DVL_ALIAS_REPORT before qualification. Missing settings are a failed/not-run gate, never a skip. macOS APFS identity must be confirmed by the probe.

Source identity:

```bash
node scripts/verify-source.cjs
```

No binaries/node_modules are shipped. Build uses the actual platform SDK and produces its own integrity manifest. No Linux ABI downgrade or Arena change is approved.
