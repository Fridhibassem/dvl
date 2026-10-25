# DVL Code 😈 — ÉTAPE 1.A DESKTOP SHELL CLEAN CHECKPOINT

**Date:** 2026-10-15
**Stage:** ÉTAPE 1.A — macOS Desktop Shell
**Status:** CLEAN CHECKPOINT BEFORE PERSISTENCE

## Verified PASS

### 1.A.3 — Electron Shell Launch
PASS ✅

Evidence observed on physical Mac:
- Electron launches.
- DVL Code window appears.
- Renderer loads.
- App remains stable.

### 1.A.4 — Open Project
PASS ✅

Evidence observed on physical Mac:
- Native macOS folder picker opens.
- User selected a real local project folder.
- DVL received and displayed the real path:
  `/Users/user/Desktop/lifrOS`

### 1.A.5 — Close & Reopen
PASS ✅

Evidence observed on physical Mac:
- DVL closed.
- `npm start` relaunched the application successfully.
- Window reopened without crash.

## Current Desktop Structure

```text
dvl-desktop/
├── package.json
└── src/
    ├── main/
    │   └── main.js
    ├── preload/
    │   └── preload.js
    └── renderer/
        ├── index.html
        └── renderer.js
```

## Security Baseline

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
```

Renderer does not receive unrestricted Node.js access.

## Current Known Limitation

The selected project is NOT yet persisted across restart.

This is expected and is NOT silently upgraded to PASS.

## Next Allowed Step

```text
1.A.6 — Persist Last Opened Project
```

Do not start later ÉTAPE 1 features before 1.A.6 is built and tested.
