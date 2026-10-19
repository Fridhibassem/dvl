# Targeted owner Mac observations — 2026-10-20

Owner-pasted terminal evidence collected after the V1 independent review, before V2 exists on the Mac. Not independently executed by the implementer.

## TCC excerpt

Command queried 2026-10-19 16:33:00 through 16:37:00, subsystem com.apple.TCC, then grep desktop|electron|project-reader and head -50.

Supplied rows span 16:35:05.979 through 16:35:15.233. Electron main pid 18891 and Electron Helper pid 18909 were attributed to responsible com.apple.Terminal pid 354. One row at 16:35:08.019 says Electron attempted TCCAccessRequest for kTCCServiceAccessibility without the recommended com.apple.private.tcc.manager.check-by-audit-token entitlement. Other rows involve WindowServer and Grammarly attribution/access checks. No project-reader row or explicit Desktop-folder access refusal is visible in the supplied filtered excerpt. Absence in this excerpt does not exclude a privacy gate. No TCC reset or permission change was requested/executed.

## Directory flags

Owner command:

```bash
/bin/ls -ldO "$HOME/Desktop/khedma.tn"
```

Owner-pasted output:

```text
drwxr-xr-x  31 user  staff  - 992  5 sep 16:22 /Users/user/Desktop/khedma.tn
```

This is a listing of permissions/flags, not an iCloud or TCC test. iCloud Desktop & Documents and original permission-prompt history remain unanswered.

## Installed dependency version

Owner command used Node require() on the existing C1b node_modules/electron/package.json. Output: `44.7.2`. This verifies installed package metadata, not process.versions.electron from a running Electron process. V2's actual-Electron child prints that runtime value when executed.

## State

Original first-open TIMEOUT cause remains unestablished. No source changes had been applied to the owner's Mac during these observations.
