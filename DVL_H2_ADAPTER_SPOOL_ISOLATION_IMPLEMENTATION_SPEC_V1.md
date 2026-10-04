# DVL H2 — ADAPTER SPOOL ISOLATION IMPLEMENTATION SPEC V1

**Status:** Spike implementation target  
**Scope:** H2 only  
**Contract authority:** `DVL_CORE_STABLE_CONTRACT_FINAL_V0_3_2_FROZEN_FOR_SPIKE.md`  
**Must not modify the Stable Contract.**

## 1. Goal

H2 proves that large or diagnostic adapter output is isolated into DVL-controlled spool artifacts instead of being pushed inline over the NDJSON stdio protocol, and that one adapter instance cannot accidentally collide with or overwrite another adapter instance's spool artifacts.

This extends the H1 identity/fencing work where `adapterInstanceId` is Kernel-assigned and stale/dead instances are fenced.

## 2. Contract facts H2 must preserve

The Spike transport is NDJSON over stdio and every protocol frame begins with `DVL1:`.

- `stdout` is protocol transport.
- `stderr` is diagnostic and must be drained continuously to spool.
- Non-`DVL1:` stdout is diagnostic noise and must not be parsed as protocol.
- Inline payloads are capped at 32 KB.
- Large logs, diffs, compiler output, test output, AST dumps and diagnostics are written to `.dvl/spool/`.
- Events reference large artifacts through `artifactRef`, `hash`, `summary`, `byteSize`, and `mimeType`.
- Large outputs must be spooled rather than sent inline.
- The Mock Provider must simulate large-output spooling.
- Conformance scenario C37 covers oversized payload spooling and continuous stdout drain.
- C38 covers frame-prefix handling of stdout noise.

## 3. H2 engineering invariant

> Every spool artifact produced by an adapter process must be uniquely attributable to the live `adapterInstanceId` that produced it, and stale/dead adapter instances must not be able to overwrite, alias, or be mistaken for artifacts from another instance.

## 4. Proposed Spike layout

Use adapter-instance isolation below the contract's `.dvl/spool/` root:

```text
.dvl/
  spool/
    <adapterInstanceId>/
      stdout-noise/
      stderr/
      artifacts/
```

Example:

```text
.dvl/spool/ai_01HXYZ/artifacts/art_0001.log
.dvl/spool/ai_01HXYZ/stderr/stderr_0001.log
.dvl/spool/ai_02ABCD/artifacts/art_0001.log
```

`art_0001.log` may repeat between adapter instances because the directory namespace is isolated.

This directory scheme is a Spike implementation proposal, not a new Stable Contract rule.

## 5. Artifact identity

Every spool record should be associated internally with:

```ts
type SpoolArtifactRecord = {
  artifactId: string;
  adapterInstanceId: string;
  path: string;
  byteSize: number;
  sha256: string;
  mimeType: string;
  summary: string;
  createdAt: string;
};
```

Recommended invariant:

```text
artifactRef resolves only through Kernel-owned metadata,
not by trusting an arbitrary path supplied by the Provider.
```

The Provider must never be allowed to choose an absolute spool path.

## 6. Safe path construction

The Kernel/adapter supervisor builds the path from Kernel-issued identifiers.

Conceptually:

```ts
spoolRoot = <project>/.dvl/spool
instanceRoot = spoolRoot / sanitize(adapterInstanceId)
artifactPath = instanceRoot / "artifacts" / sanitize(artifactId + extension)
```

Required checks:

1. Canonicalize the root.
2. Reject absolute Provider-originated paths.
3. Reject `..`.
4. Reject path separators inside IDs.
5. Confirm the final canonical parent stays under the adapter instance spool root.
6. Create files with non-clobber semantics where practical.
7. Never follow a Provider-controlled symlink out of the spool root.

## 7. Continuous drain behavior

The supervisor must independently drain:

```text
child.stdout
child.stderr
```

### stdout

Process line/frame stream continuously.

If a line begins with:

```text
DVL1:
```

parse it as a protocol frame.

Otherwise:

```text
diagnostic stdout noise
→ spool under this adapterInstanceId
→ never parse as protocol
```

### stderr

All stderr is diagnostic.

```text
stderr
→ continuously drain
→ spool under this adapterInstanceId
```

Event processing must not block pipe draining.

## 8. Oversized payload behavior

For inline protocol payloads:

```text
<= 32 KB
    may remain inline

> 32 KB
    must not travel as the full inline payload
    → write content to spool
    → emit compact metadata/reference
```

Conceptual event fragment:

```json
{
  "artifactRef": "spool://<artifactId>",
  "hash": "sha256:...",
  "summary": "large compiler output",
  "byteSize": 84213,
  "mimeType": "text/plain"
}
```

The exact URI/reference encoding remains Spike-local unless already implemented elsewhere.

## 9. Stale/dead adapter behavior

H1 already fences stale/dead `adapterInstanceId`s.

H2 must extend that protection to spool intake.

When an instance is dead/fenced:

```text
new protocol event from stale instance → reject / ignore according to H1 policy
new authoritative spool association from stale instance → reject
existing spool bytes → preserve as diagnostics
```

Important distinction:

> Fencing prevents stale data from becoming current runtime state. It does not require deleting diagnostic artifacts already written.

## 10. Crash behavior

If the adapter crashes while writing a spool artifact:

- preserve the partial file as diagnostic context;
- do not claim it is a complete artifact;
- record incomplete/corrupt status in Kernel-owned metadata;
- never let a partial diagnostic artifact satisfy Evidence or Verification.

Suggested temporary write pattern:

```text
<artifactId>.partial
        ↓ complete write + fsync/close/hash
<artifactId>.log
```

If the process dies before completion, `.partial` remains diagnostic-only.

## 11. H2 tests

### H2-01 — Separate adapter namespaces

Start two adapter instances.

Both produce artifact ID `art_001`.

PASS if:

```text
instance A file != instance B file
no overwrite
metadata points to correct adapterInstanceId
```

### H2-02 — Large stdout payload spools

Mock Provider emits >32 KB diagnostic output.

PASS if:

- protocol loop stays alive;
- large body is on disk;
- emitted event/reference is compact;
- hash and byte size match disk content.

### H2-03 — stderr drained continuously

Mock Provider emits stderr while also producing valid `DVL1:` frames.

PASS if:

- adapter does not deadlock;
- protocol frames continue;
- stderr is preserved in the correct instance spool.

### H2-04 — stdout noise is not protocol

Mock Provider emits:

```text
hello from provider
DVL1:{valid frame}
random debug
```

PASS if:

- only the `DVL1:` line is parsed;
- the two noise lines are diagnostic spool content.

### H2-05 — stale instance cannot append current artifact

1. Start instance A.
2. Kill/fence A.
3. Start instance B.
4. Simulate late data from A.

PASS if:

- B's spool metadata remains untouched;
- late A data cannot become B data;
- late A diagnostics remain attributable to A if retained.

### H2-06 — crash during artifact write

Crash provider in the middle of a large write.

PASS if:

- process is cleaned up;
- no completed artifact is falsely reported;
- partial artifact is diagnostic-only;
- next adapter instance starts with a clean namespace.

### H2-07 — malicious traversal rejected

Try identifiers/path hints containing:

```text
../
../../other-instance/
absolute paths
path separators
```

PASS if no write escapes the instance spool root.

### H2-08 — same artifact name, concurrent writers

Two live adapter instances simultaneously spool `compiler.log`.

PASS if both survive independently with correct hashes.

### H2-09 — event processing slowdown does not stop draining

Artificially delay Kernel event processing while Mock Provider writes enough stdout/stderr to fill normal pipe buffers.

PASS if:

- drain continues independently;
- child does not block from undrained pipes;
- all protocol frames remain available in order.

### H2-10 — 32 KB boundary

Test:

```text
32767 bytes
32768 bytes
32769 bytes
```

The implementation must apply one explicit byte-based rule consistently and document whether the contract's “32KB max inline payload” treats exactly 32768 as allowed or spooled.

For the Spike, choose one interpretation in code/tests and record it as a Spike detail, not a Contract rewrite.

## 12. Conformance mapping

H2 primarily advances:

```text
C37 — oversized payload spooling and continuous stdout drain
C38 — frame-prefix handling of stdout noise
```

It also strengthens:

```text
C05 — Adapter death
C13 — duplicate / out-of-order events
C14 — secret redaction
C17 — heartbeat and stall
C34 — divergence diagnostics
```

where spool data is involved.

## 13. Out of scope for H2

Do not add yet:

- Smart Décalage production scheduler
- provider-specific real adapters
- Evidence PASS logic
- Integration Gate changes
- new Stable Contract fields
- production WIP/concurrency constants
- UI

H2 is infrastructure isolation.

## 14. Definition of done

H2 is DONE only when:

```text
[ ] per-adapterInstance spool namespace exists
[ ] stdout and stderr drain continuously
[ ] non-DVL1 stdout is diagnostic-only
[ ] > inline-limit payloads spool correctly
[ ] artifact metadata includes adapterInstance attribution
[ ] stale/dead instance cannot contaminate a new instance
[ ] crash/partial write cannot masquerade as complete artifact
[ ] traversal/symlink escape protections exist
[ ] H2 tests pass
[ ] existing H1 tests remain green
[ ] npm test PASS
[ ] npm run spike PASS
[ ] npm run typecheck PASS
```

## 15. Next after H2

Only after H2 passes should the next Spike item be selected from the actual implementation backlog/evidence.

Smart Décalage remains a research policy hypothesis and should later consume real measurements from this instrumentation rather than changing H2.
