# DVL Phase 1 Spike

Status: Phase 1 Spike accepted and pushed.

This repository contains the first executable DVL runtime spike.

## What this proves

- Mock Provider launch
- Kernel Event Store
- NDJSON over stdio
- DVL1 frame prefix
- stdout/stderr continuous drain
- stderr diagnostic spool
- 32KB inline payload cap
- oversized payload spooling
- actor lifecycle tracking
- basic EvidenceRecord creation
- first conformance tests

## Run locally

```bash
cd dvl-spike
npm install
npm test
npm run spike
npm run typecheck
```
