# H3 Transport Input Bounding Report

## Identification

| | |
|---|---|
| Branch | `claude/h3-transport-input-bounding` |
| Base commit | `6390bdca48f5df037d9fbf9c0335d87dc0d87b31` (`main`, "merge H2 closed branch") |
| Implementation commit | `43f5784d1e348de60d981bd7726055b8fba5ad41` |
| Final commit | the commit that adds this report, the direct child of `43f5784`, on the same branch. Its hash is given in the hand-off reply because a file cannot contain its own commit hash |
| Scope | H3 only. H1 and H2 behaviour unchanged (see "H1/H2 statement"). **H4 not touched.** `main` not pushed, nothing merged |

## Investigation (before any change)

Read:
- `frame.ts` (`parseLine`, `LineSplitter`);
- `ndjson-transport.ts` (drain/process loops, `classify`, diagnostics sink, queue);
- `kernel.ts` (`onTransportIssue`, `ingest`, `capPayload`);
- `mock-provider.ts`;
- `scenarios.ts`;
- tests C03, C07, C08 and C12.

| Area | Found on the base commit |
|---|---|
| Line/frame size | One splitter cap, `MAX_LINE_BYTES` = **4 MiB**, for all stdout lines. A `DVL1:` frame of up to 4 MiB was fully `JSON.parse`d, then its payload was spooled by `capPayload` and registered. That is 128× the 32 KiB inline-payload cap |
| Over-cap line | Discarded with a raw 256-byte head written to noise, then an `overflow` issue and **processing continued**, even for a `DVL1:` frame |
| Malformed `DVL1:` frame | `JSON.parse` error recorded, preview written to noise, then **processing continued** (C03 asserted this). The error reason embedded V8's message, which echoes input bytes |
| Partial frame at EOF | `LineSplitter.end()` flushed the unterminated last line through `onLine`, so a complete JSON object without its newline **was accepted as a frame**. Proven end to end: an unterminated `action.finished` from the real adapter **created Evidence** (C26-10 on base) |
| After the queue sealed | Every later line was still `JSON.parse`d before being rejected |
| stderr / stdout noise | Drained continuously and written to the spool **without a per-stream bound**; the only limit was the 256 MiB `maxIncomingBytes` total |
| Many small frames | Already bounded by the queue limits (1024 frames / 16 MiB) with seal and halt; kept as a regression check |
| Provider size claims | None used for framing, which is newline-delimited. Artifact sizes are re-verified against `fstat` (H2) |

## Exact limits introduced (`dvl-spike/src/kernel/types.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `MAX_FRAME_BYTES` | **1 048 576** (1 MiB) | Maximum bytes of one incoming `DVL1:` frame line, prefix included, newline excluded. Counted while reading, before `JSON.parse`. Above the 32 KiB inline cap, so a non-conformant oversized inline payload (e.g. the 100 KiB `oversized-inline` scenario) is still received and defensively spooled |
| `MAX_LINE_BYTES` | = `MAX_FRAME_BYTES` | Per-line buffering cap of the stdout splitter for frames and noise alike. It was 4 MiB |
| `MAX_DIAGNOSTIC_STREAM_BYTES` | **8 388 608** (8 MiB) | Per adapter instance, per diagnostic stream (`diagnostics.stderr.log`, `diagnostics.stdout-noise.log`, `diagnostics.queue-overflow.log`) |
| `MAX_DIAGNOSTIC_DETAIL_BYTES` | **256** | Maximum UTF-8 bytes of any attacker-derived text in a diagnostic (reason detail or preview) |

These come on top of the existing limits: `MAX_QUEUED_FRAMES` 1024, `MAX_QUEUED_BYTES` 16 MiB, and `maxIncomingBytes` (default 256 MiB).

## Exact behaviour

**Fail-closed sequence.** Every rejection below follows the same five steps:
1. `stats.inputRejected++`.
2. The queue is sealed immediately. Frames already queued before the bad one keep FIFO order; every later `DVL1:` line goes unparsed to the overflow diagnostics.
3. One bounded line `[REJECTED <reason> bytes=<n>] <detail>` is written to the noise spool.
4. An `input_rejected` issue is reported once per instance: `{reason, bytes, limit?, detail}`.
5. The Kernel calls `haltForSafety("transport input rejected (<reason>)", {kind: "transport_input_rejected", …})` for the current instance, recorded once, which terminates the instance and its runs. For a stale instance it only records `kernel.transport_issue {stale: true}`.

**What a rejected frame never produces:** an event, an actor/action transition, Evidence, an artifact registration, or a Kernel-spooled payload.

**Oversized input** (`frame_too_large`):
- The splitter counts bytes as chunks arrive. Once the current line exceeds `MAX_FRAME_BYTES` it stops buffering (it keeps a 256-byte head) and counts the remaining bytes until the newline.
- If the line begins with `DVL1:` it is **never parsed**, and the fail-closed sequence runs with `limit: 1048576` and the observed byte count.
- `parseLine` also checks the size before `JSON.parse`, as a defensive second check.
- An over-long **non-frame** line is noise, not a protocol failure: it is discarded, a bounded `[OVERFLOW n bytes] <head>` line is recorded, and processing continues.

**Malformed input** (`malformed_frame`): a `DVL1:` line whose body is not JSON, is not a JSON object, or lacks a non-empty string `type`.
- Nothing is applied, and the fail-closed sequence runs.
- The detail is a fixed reason (`invalid JSON at position N`, `frame body is not a JSON object`, `frame missing string 'type'`) plus a bounded, escaped sample. The V8 parse message, which echoes input, is no longer stored.
- Lines not starting exactly with `DVL1:` are noise and are never parsed. This is unchanged (C03/C38 semantics).

**Partial input** (`partial_frame`): at stdout EOF, a final line without its terminating newline that starts with `DVL1:` is **never parsed**, whether its JSON is complete or truncated, and the fail-closed sequence runs. A partial non-frame line at EOF is ordinary noise.

**Noise / stderr bounding:**
- Draining never stops: every byte is still read and charged to `maxIncomingBytes`.
- Per instance and per stream, at most `MAX_DIAGNOSTIC_STREAM_BYTES` are written. The first write that would cross the cap writes up to it, followed by one marker line, `[DVL: diagnostic cap of 8388608 bytes reached for <file>; further bytes dropped]`.
- All excess bytes are counted in `stats.diagnosticBytesDropped` and dropped. Nothing is buffered in memory beyond one chunk.

## Exact diagnostic truncation rule

`boundedText(input, maxBytes = 256)` in `frame.ts`:
1. Take at most `maxBytes` characters.
2. `JSON.stringify` them, without the outer quotes, so control characters, quotes and backslashes are escaped and never raw.
3. Shorten the result until its UTF-8 length is ≤ `maxBytes`.

Where it applies:
- rejection `detail`: at most a 1024-character sample of the line goes in, 256 bytes come out;
- the overflow head;
- noise issue lines;
- Kernel handler-error reasons.

Kernel records (`kernel.safety_halt`, `kernel.transport_issue`) only ever contain these bounded fields plus numbers. No raw attacker body reaches the durable log: C26-9 asserts that no events-log line exceeds 8 KiB after a 2 MiB frame or a 10 KB malformed frame.

## Files changed (base → implementation commit)

| File | Change |
|---|---|
| `dvl-spike/src/kernel/types.ts` | New `MAX_FRAME_BYTES`, `MAX_DIAGNOSTIC_STREAM_BYTES`, `MAX_DIAGNOSTIC_DETAIL_BYTES`; `MAX_LINE_BYTES` = `MAX_FRAME_BYTES` |
| `dvl-spike/src/kernel/frame.ts` | `isFrameLine`, `boundedText`; `parseLine` checks size before parse and has non-echoing reasons; `LineSplitter` gains an optional `onPartial` for an unterminated final line |
| `dvl-spike/src/kernel/ndjson-transport.ts` | Frame cap on the splitter; `rejectInput` (seal + bounded diagnostic + one `input_rejected` issue); no parse after seal; partial-line handling; per-stream diagnostic caps; stats `inputRejected` and `diagnosticBytesDropped`; bounded noise/handler-error text |
| `dvl-spike/src/kernel/kernel.ts` | `onTransportIssue` handles `input_rejected`: halt the current instance (`transport_input_rejected`), record only for a stale instance |
| `dvl-spike/src/mock-provider/mock-provider.ts` | Test-only `adapter.ping` options `raw`, `padded`, `unterminated` (written by the current, handshaken adapter) |
| `dvl-spike/src/mock-provider/scenarios.ts` | `noisy` no longer contains the two malformed `DVL1:` lines (they now fail closed; C26 covers them). All genuine noise is kept |
| `dvl-spike/src/conformance/c26-h3-transport-input-bounding.test.ts` | **New** suite, 13 tests |
| `dvl-spike/src/conformance/c03-frame-prefix-noise.test.ts` | E2E now expects `malformedLines` 0 and `inputRejected` 0 for `noisy`; the `[MALFORMED` noise assertion is removed. The behaviour change is deliberate |
| `dvl-spike/src/conformance/c07-adapter-spool-isolation.test.ts` | C07-3 drops the incidental `[MALFORMED` assertion; its subject (non-DVL1 stdout spooled, never parsed) is unchanged |
| `CLAUDE_REPORTS/H3_TRANSPORT_INPUT_BOUNDING_REPORT.md` | This report |

## Tests: C26 (13)

| # | Covers | Asserts |
|---|---|---|
| 0 | Explicit limits | constants as above; inline cap < frame cap |
| 1 | Oversized `DVL1:` frame (cap + 1 byte, valid JSON, sent in 64 KiB chunks) | no `JSON.parse` call on any string > cap; not delivered; `frame_too_large` with `limit` and `bytes`; sealed; a later valid frame is not processed |
| 2 | Frames at the limit, one byte below it, and small | accepted, no rejection |
| 3 | Malformed: invalid JSON, array, missing type, `null`, empty type | prior valid frame processed, nothing after; `malformed_frame`; sealed |
| 4 | Partial at EOF | a complete-JSON frame without newline and a truncated frame are never delivered (`partial_frame`); a partial non-frame line is noise |
| 5 | Bounded diagnostics | 500 KB malformed body with control bytes: detail ≤ 256 bytes with no raw control characters; noise spool ≤ 712 bytes; every issue's JSON bounded |
| 6 | Huge stderr (20 MiB) | spool ≤ cap + 512 bytes; all 20 MiB still read; `diagnosticBytesDropped` = 20 MiB − cap |
| 7 | Huge stdout noise (20 MiB of short lines; one 3 MiB noise line) | noise spool ≤ cap + 512 bytes; dropped bytes counted. The 3 MiB noise line is discarded with a bounded head, is **not** fatal, and the next valid frame is processed |
| 8 | Many small frames (5000, blocked processing, queue 64) | depth and high-water mark ≤ 64; sealed; `queue_overflow`; only one frame reached the handler |
| 9 ×2 | Real adapter, live run: 2 MiB padded `action.finished`; malformed `DVL1:` line | `kernel.safety_halt` kind `transport_input_rejected`; accepted adapter events, Evidence, registrations and actor state are **identical** to before the input; no Evidence; run `halted`; max events-log line < 8 KiB |
| 10 | Real adapter: validly sequenced `action.finished` without newline, then exit | no Evidence; `partial_frame` recorded |
| 11 | Valid traffic still works | `oversized-inline` (100 KiB inline payload) finishes without a halt; H1/H2 scenarios `happy`, `oversized-spooled`, `noisy` finish without a halt |

### Fail-before / pass-after

- **On the base commit**, with only the test-only mock hooks added, C26 gives **11 failed / 2 passed**. The two that pass are the controls: test 8 (existing queue bound) and test 11 (valid traffic).
- **Behavioural failures on base include:**
  - malformed frames do not stop processing (`[1, 2]` delivered instead of `[1]`);
  - a partial frame is accepted;
  - the real adapter's unterminated `action.finished` creates Evidence (`evd_…` instead of `[]`);
  - no halt for oversized or malformed input;
  - a 20 MiB stdout noise spool.

**Mutation check** (each guard disabled alone, then restored byte-for-byte):

| Mutation | Failing C26 tests |
|---|---|
| G1 old 4 MiB cap | 1, 7, 9 (oversized) |
| G2 no seal on rejection | 1, 3 |
| G3 partial line delivered at EOF (old behaviour) | 4, 10 |
| G4 no diagnostic stream cap | 6, 7 |
| G5 Kernel does not halt on `input_rejected` | 9 (oversized), 9 (malformed), 10 |
| G6 `boundedText` returns its input unchanged | 5 |

## Exact command results (implementation commit `43f5784`)

| Command | Result |
|---|---|
| `npm test` run 1 | exit 0 — 26 files, **222/222 passed** |
| `npm test` run 2 | exit 0 — 26 files, **222/222 passed** |
| `npm test` run 3 | exit 0 — 26 files, **222/222 passed** |
| `npm run typecheck` | exit 0 |
| `npm run spike` | exit 0 — "SPIKE OK — every scenario reached its expected terminal state" |
| `npx vitest run src/conformance/c18* … c26*` (focused) | exit 0 — 9 files, **114/114 passed** (C18 8, C19 3, C20 7, C21 26, C22 18, C23 10, C24 18, C25 11, C26 13) |
| `DVL_FS_CONFINEMENT=path npm test` (H2 fallback mode) | exit 0 — 26 files, **222/222 passed** |

Per suite: C01 6, C02 4, C03 6, C04 4, C05 4, C06 13, C07 10, C08 14, C09 4, C10 7, C11 7, C12 5, C13 6, C14 8, C15 5, C16 3, C17 2, C18 8, C19 3, C20 7, C21 26, C22 18, C23 10, C24 18, C25 11, **C26 13**.

## Known limitations

- **Malformed frames now fail closed.** That is a deliberate behaviour change from the original spike, where they were logged and processing continued (C03). One malformed `DVL1:` line now halts the instance. The `noisy` scenario and two assertions were adjusted accordingly. Non-prefixed noise is unaffected.
- **Frames up to 1 MiB are still parsed.** That is 32× the inline cap, kept so the existing defensive spooling of non-conformant inline payloads keeps working. Peak per-line memory is bounded by `MAX_FRAME_BYTES` plus one read chunk.
- **Accounting:**
  - The diagnostic caps are per instance and per stream. Total disk use per instance is bounded at about 3 × 8 MiB plus markers, while a run's total incoming bytes remain bounded by `maxIncomingBytes`.
  - Bytes dropped by the cap are counted but not recoverable.
  - The cap marker is written once per stream.
- **Already-queued frames.** Frames queued *before* a rejected frame are still processed in order. The halt then terminates the instance, so the H1 fencing rules apply to anything still in flight.
- **One report per instance.** A rejected frame is reported once per instance; later rejections are counted in `stats.inputRejected` and the noise spool, not re-reported.
- **Not covered by H3:** adapter→Kernel *rate* (frames per second) and stdin backpressure. Those are bounded only by the existing queue and `maxIncomingBytes` limits.

## H1/H2 statement

- H1 (C06, C10, C14–C19) and H2 (C04, C07, C11, C13, C20–C25) **remain green**: 222/222 in all three full runs, the focused run, and the H2 path-confinement mode.
- Only two H1/H2-era assertions changed, both tied to the deliberate H3 malformed-frame change: C03's malformed-count expectation, and the `[MALFORMED` noise check in C07-3.
- No H1 or H2 logic was modified.

## H4 statement

**H4 is not touched.**

H3 IMPLEMENTATION READY FOR CODEX REVIEW
