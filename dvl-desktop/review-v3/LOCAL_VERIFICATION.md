# V3 local verification — Linux authoring host

112 control checks passed: B24 + C1unit16 + repair16 + IPC14 + policy3 + DOM7 + V2control8 + Bauth18 + V3control6. No claim of native confinement from simulated child/protocol/DOM checks or pre-confinement policy refusals.

Production helper built with -Wall -Wextra -Werror. Generated header is deterministic. Original native suite attempted and failed at required boundary probe UNSUPPORTED. Repair native10 and V3 native3 attempted and failed at first positive operation BOUNDARY_UNSUPPORTED. V3 native cleanup counts were all zero. No fallback or altered confinement used.

Actual Electron and target Mac/APFS execution are pending. Modified actual Electron test scripts were syntax checked, not executed here.

Automated static check: removing ONLY the two new hiddenByPolicy:0 fake native response fields restores tests/c1-repair.cjs byte-for-byte to V2; all existing assertions unchanged. B green-gate is byte-identical V2. Companion verifier supplies full frozen-B assertion/name equivalence.

This file is an authoring verification summary, not a raw terminal log. The owner Mac qualification must retain its full raw output and alias JSON.
