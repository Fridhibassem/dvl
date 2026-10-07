# H3 Transport Input Bounding Report

## Identification

| | |
|---|---|
| Branch | `claude/h3-transport-input-bounding` |
| Base commit | `6390bdca48f5df037d9fbf9c0335d87dc0d87b31` (`main`, "merge H2 closed branch") |
| First implementation (reviewed) | `43f5784d1e348de60d981bd7726055b8fba5ad41`: **REVIEW FAIL** |
| First fix round (re-reviewed) | `4130f8cea8eb49319dd29f8bd0ccd94d3c79d1d5`: **RE-REVIEW FAIL** (2 defects, see "Second re-review fixes") |
| Final commit | the commit that adds this revision of the report together with the second fix round. A file cannot contain its own hash; it is the branch head and is given in the hand-off reply |
| Scope | H3 only. H1/H2 behaviour unchanged (see "H1/H2 statement"). **H4 not touched.** `main` not pushed, nothing merged |

## Investigation (base commit)

| Area | Found on the base commit |
|---|---|
| Line/frame size | Single splitter cap of **4 MiB**. A `DVL1:` frame up to 4 MiB was fully `JSON.parse`d, its payload spooled and registered |
| Over-cap line | Discarded, with a raw 256-byte head written to noise, then processing continued (even for a `DVL1:` frame) |
| Malformed `DVL1:` frame | Recorded, then processing continued. The reason echoed V8's message, which contains input bytes |
| Partial frame at EOF | An unterminated final line was parsed and **accepted**. An unterminated `action.finished` from the real adapter **created Evidence** |
| After seal | Every later line was still `JSON.parse`d; refused frames were stored raw in the overflow spool |
| stderr / stdout noise | No per-stream bound; only the 256 MiB `maxIncomingBytes` total |
| Many small frames | Already bounded by the queue limits (1024 / 16 MiB), with seal and halt |
| Provider size claims | None used for framing (newline-delimited). Artifact sizes are re-verified via `fstat` (H2) |

## Exact limits (`dvl-spike/src/kernel/types.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `MAX_FRAME_BYTES` | **1 048 576** | Maximum bytes of one `DVL1:` frame line, prefix included, newline excluded. Counted while reading, before `JSON.parse`. Above the 32 KiB inline cap, so oversized inline payloads up to that size can still be defensively spooled |
| `MAX_LINE_BYTES` | = `MAX_FRAME_BYTES` | Per-line buffering cap of the stdout splitter (frames and noise). It was 4 MiB |
| `MAX_DIAGNOSTIC_STREAM_BYTES` | **8 388 608** | **Exact** maximum file size per adapter instance per diagnostic stream (`diagnostics.stderr.log`, `diagnostics.stdout-noise.log`, `diagnostics.queue-overflow.log`), marker included |
| `DIAGNOSTIC_CAP_MARKER_RESERVE` | **160** | Part of that cap reserved for the one-time "cap reached" marker: payload ≤ 8 388 448 bytes, marker ≤ 160 bytes |
| `MAX_DIAGNOSTIC_DETAIL_BYTES` | **256** | Maximum UTF-8 bytes of any attacker-derived text (detail or preview) in a diagnostic |
| `OVERFLOW_PREVIEW_BYTES` (`frame.ts`) | **256** | Bytes of an over-cap line kept as its preview, in an independently owned buffer |

These come on top of the existing limits: `MAX_QUEUED_FRAMES` 1024, `MAX_QUEUED_BYTES` 16 MiB, and `maxIncomingBytes` (default 256 MiB).

## Exact behaviour

**Fail-closed sequence**, applied on every rejection below. All of these steps happen synchronously inside the stdout `data` handler that delivered the offending bytes:
1. `stats.inputRejected++`.
2. The queue is sealed. Frames queued *before* the bad input keep FIFO order; every later `DVL1:` line goes, **unparsed**, to the overflow spool as a bounded record.
3. One bounded line, `[REJECTED <reason> bytes=<n>] <detail>`, is written to the noise spool.
4. An `input_rejected` issue `{reason, bytes, limit?, detail}` is reported **once** per instance.
5. The Kernel calls `haltForSafety("transport input rejected (<reason>)", {kind: "transport_input_rejected", …})` for the current instance, once. This terminates the instance and fails its runs, so frames still queued from it are **fenced** when processed (never applied). For a stale instance it only records `kernel.transport_issue {kind: "input_rejected", stale: true}`.

**What rejected input never produces:** an event, actor/action transition, Evidence, artifact registration or Kernel-spooled payload.

**Oversized input (`frame_too_large`).**
- The splitter counts bytes per line as chunks arrive. **At the first byte past `MAX_FRAME_BYTES`**, while the line is still open, with no newline or EOF needed, it:
  1. stops buffering;
  2. copies at most 256 bytes into a new, owned preview buffer;
  3. calls `onOverflowStart`.

  If the line starts with `DVL1:`, the fail-closed sequence runs immediately with `limit: 1048576` and the bytes seen so far.
- The rest of the line is drained and counted, never buffered or parsed. Its eventual newline or EOF produces **no** second rejection.
- `parseLine` also checks the size before `JSON.parse`, as a defensive second check.
- An over-long **non-frame** line is noise, not fatal: discarded, one bounded `[OVERFLOW n bytes] <escaped head>` line, processing continues.

**Malformed input (`malformed_frame`).**
- **Trigger:** a newline-terminated `DVL1:` line whose body is not JSON, is not a JSON object, or lacks a non-empty string `type`. It gets one bounded parse attempt (≤ 1 MiB), then nothing is applied and the fail-closed sequence runs.
- **Detail:** a fixed reason (`invalid JSON at position N` / `frame body is not a JSON object` / `frame missing string 'type'`) plus a bounded, escaped sample. V8's message is never stored.
- **Not affected:** lines not starting exactly with `DVL1:` are noise and never parsed.

**Partial input (`partial_frame`).** At stdout EOF, a final `DVL1:` line without its newline is **never parsed** (complete or truncated JSON alike), and the fail-closed sequence runs. A partial non-frame line is noise.

**Refused lines after the seal.** Each refused line is recorded as `[REFUSED <queue_overflow|byte_limit|input_rejected> bytes=<original byte count>] <escaped preview ≤ 256 bytes>`, never raw. `framesRejected` counts every refused line. This applies to every seal cause, so queue overflow and byte limit use the same representation.

**Noise/stderr bounding.**
- Draining never stops: every byte is read and charged to `maxIncomingBytes`.
- Per stream, payload is written up to `8 388 448` bytes; then the one-time marker `\n[DVL: diagnostic cap of 8388608 bytes reached for <file>; further bytes dropped]\n` (≤ 160 bytes) is appended **last**. The file is always ≤ 8 388 608 bytes.
- Every byte not written is counted exactly in `stats.diagnosticBytesDropped`.
- Once a stream's budget is used, further noise lines and refused records are counted and **not collected**, so no chunk-sized buffer is built only to be discarded.

## Exact diagnostic truncation rule

`boundedText(input, maxBytes = 256)` in `frame.ts`:
1. Take at most `maxBytes` characters.
2. `JSON.stringify` them, without the outer quotes, so control characters, quotes and backslashes are escaped and never raw.
3. Shorten the result until it is ≤ `maxBytes` UTF-8 bytes.

It is used for:
- rejection `detail` (from a sample of ≤ 1024 characters);
- refused-line previews;
- the overflow head;
- noise issue text;
- Kernel handler-error reasons.

Kernel records contain only these bounded fields plus numbers.

## Codex review findings (`43f5784`) and fixes

| # | Finding | Fix | Test (fails on `43f5784`, passes now) |
|---|---|---|---|
| High 1 | An open oversized `DVL1:` line was not rejected until newline/EOF; a completion queued earlier produced Evidence after the cap was crossed | `LineSplitter` calls `onOverflowStart` at the first byte past the cap; the transport rejects, seals and reports there; the line's end adds nothing | **C26-12** (transport: not sealed at ≤ cap, sealed + one rejection on crossing, none added by later newline/EOF); **C26-13** (real Kernel: gated heartbeat + queued `action.finished` + open 1.06 MiB line → exactly one `transport_input_rejected` halt, **no Evidence**, run `halted`); **C26-14** (stale instance: recorded `stale: true`, current instance not halted and still answers) |
| Medium 2 | Post-seal refused lines were stored raw (300 KB, raw NUL/ESC) | `reject()` stores `[REFUSED <why> bytes=N] <boundedText>` for every seal cause | **C26-15** (after seal: a 300 KB control-character line gives a record ≤ 320 bytes, no raw control bytes, original byte count recorded, no `JSON.parse` of it, nothing ingested) |
| Low 3 | The cap marker exceeded the 8 MiB stream cap (≈ +100 bytes) | Marker reserve (160 bytes) inside the cap; marker written once, after the pending payload | **C26-16** (stderr cap + 1, many small noise writes, queue overflow: each file ≤ cap; exact dropped accounting; marker last). C26-6/7 tightened to `≤ MAX_DIAGNOSTIC_STREAM_BYTES` with exact accounting |
| Medium 4 | The overflow preview retained a view of a full-size `Buffer.concat` (32 MiB) | The preview is copied into an owned ≤ 256-byte buffer; no concat of over-cap data | **C26-17** (32 MiB single chunk: preview `length` and `buffer.byteLength` ≤ 256, no `Buffer.concat` over 1 KiB, `onOverflowStart` called once) |
| Test weakness | C26-1's parse spy used a length filter that missed the exact oversized body | The spy now matches the exact body string, or any string at least that long | C26-1 |

**Mutation check of the fixes** (each applied alone, then restored byte-for-byte):

| Mutation | Failing tests |
|---|---|
| N1 no rejection at the crossing (old: at newline/EOF) | C26-12, 13, 14 |
| N2 refused lines raw | C26-15 |
| N3 marker outside the budget | C26-6, 7, 16 |
| N4 preview as a view of a full concat | C26-17 |
| N5 marker written mid-collection | C26-16 |

**Mutation check of the original guards** (all still hold):

| Mutation | Failing tests |
|---|---|
| old 4 MiB cap | 1, 7, 9 |
| no seal | 1, 3 |
| partial accepted | 4, 10 |
| no stream cap | 6, 7 |
| Kernel no halt | 9 ×2, 10 |
| unbounded detail | 5 |

C26 against `43f5784`'s Kernel (new mock hooks kept): tests **6, 7 and 12–17 fail**; the rest pass.

## Second re-review fixes (defects found at `4130f8c`)

Both defects were **reproduced on `4130f8c` before any change**, with a scratch probe that was not committed:
- **D1:** after a seal, one stdout chunk of 40 000 hostile refused frames, delivered before the overflow file existed, collected **11 720 000 bytes of pending records**. That is more than the 8 388 448-byte payload budget: the first batch bypassed collection budgeting, and the bound applied only at write time.
- **D2:** **22 of 399** `boundedText` outputs over hostile input could not be decoded as JSON string bodies, because the cut landed inside an escape.

**D1 — first refused-frame batch bypassed collection budgeting.**
- **Cause:** in `reject()`, the collection check was `if (this.overflowCreated && budgetLeft − pending <= 0)`. Before the overflow file was created, every refused record was collected regardless of budget. The cap was applied only when `writeDiagnostic` trimmed the batch at a byte offset, which can cut a record.
- **Fix** (`ndjson-transport.ts`, `reject()` and `writeNoise()`):
  - one budgeted collection path for **every** refused record, with no first-batch exception: `budgetLeft(file) − pendingBytes < recordBytes` → not collected;
  - `budgetLeft` counts nothing written yet for a file that doesn't exist yet;
  - **whole records only**: a record is collected only if it fits the remaining payload budget in full, so the file never holds a cut record and pending memory never exceeds the budget;
  - every record not collected adds its exact byte count to `diagnosticBytesDropped` and schedules the one-time marker, which is written after the flushed payload, inside the reserve, at the end of the file;
  - stdout-noise lines follow the same whole-line rule; stderr (not line-structured) is still trimmed at the exact budget;
  - unchanged: fencing, no-parse, `framesRejected` counting and FIFO.

**D2 — preview truncation could split an escape.**
- **Cause:** `boundedText` escaped the whole sample, then shortened the escaped string by character count. It could end inside `\u00XX` or on a dangling `\`.
- **Fix** (`frame.ts`, `boundedText`): the output is built **one code point at a time** from complete escape units (`JSON.stringify(ch)` without quotes) and stops before the first unit that would exceed `maxBytes`. Truncation can only happen between complete escapes. Therefore:
  - the result is always a valid JSON string body (`JSON.parse('"' + r + '"')` decodes it to a prefix of the input);
  - it is ≤ 256 bytes;
  - it never ends with a partial escape;
  - it contains no raw control characters (lone surrogates are escaped as `\udXXX`).
- **C08 reader:** needed no change. It already decodes `JSON.parse('"' + preview + '"')` and extracts `adapterSequence`, and that decode is now guaranteed to succeed.

**Tests added (C26, now 22):**

| # | Asserts |
|---|---|
| 18 | Seal, then **one chunk** of 40 000 hostile refused frames (NUL, ESC, quotes, backslashes) before the overflow file exists: peak pending ≤ payload budget; file ≤ 8 MiB; marker once and last; no raw control bytes; every record whole and identical in the bounded escaped form; record count = ⌊budget / record size⌋; `framesRejected` = 40 000; `diagnosticBytesDropped` = (N − k) × record size **exactly**. A later batch of 1000 adds nothing to the file and exactly 1000 × record size to the dropped count |
| 19 | `boundedText` over 14 hostile symbols (quote, backslash, NUL, ESC, `\n`, `\r`, `\t`, é, 漢, 😀, lone surrogate, `/`, DEL) at many lengths up to 400: ≤ 256 bytes; no raw control characters; no trailing partial escape; always decodable; the decoded text is a prefix of the input |
| 20 | 50 refused frames whose previews are cut at every alignment inside 6-byte escapes plus mixed hostile text: all 50 records decode with the C08-style reader; previews ≤ 256 bytes; no raw control characters; the recovered `adapterSequence` values are in exact order; file ≤ cap |

**Fail-before / pin:**
- Against `4130f8c`'s `frame.ts` and `ndjson-transport.ts`: C26 tests **18, 19 and 20 fail**; all others pass.
- Reverting only D1 (old guarded check): test 18 fails.
- Reverting only D2 (old truncation): tests 19 and 20 fail.
- C08 passes in all fixed runs.

**C09:**
- **Not reproduced.**
- In every full run on this tree (3 × 231/231, plus path mode), and in the dedicated `c08/c09/c26` run, C09 passed.
- Isolated: **10/10**. Under 6 concurrent CPU-busy loops: **5/5**.
- **Why it can still fail elsewhere:** its duration checks are wall-clock windows (the halt fires no earlier than `maxDurationMs` − 50 ms and no later than `maxDurationMs` + 5 s, with gated processing). A heavily loaded full run can exceed such a window.
- **Not caused by H3:** the H3 diff doesn't touch the duration timer, the halt path or the gating it measures. I classify it as a known timing-sensitive test (a flake), **not an H3 regression**, and made no C09 change.

## Files changed (base → final commit)

| File | Change |
|---|---|
| `dvl-spike/src/kernel/types.ts` | `MAX_FRAME_BYTES`, `MAX_DIAGNOSTIC_STREAM_BYTES`, `DIAGNOSTIC_CAP_MARKER_RESERVE`, `MAX_DIAGNOSTIC_DETAIL_BYTES`; `MAX_LINE_BYTES` = `MAX_FRAME_BYTES` |
| `dvl-spike/src/kernel/frame.ts` | `isFrameLine`, `boundedText`, `OVERFLOW_PREVIEW_BYTES`; size check before parse with non-echoing reasons; `LineSplitter` gains `onPartial` and `onOverflowStart` (immediate, owned preview) |
| `dvl-spike/src/kernel/ndjson-transport.ts` | Frame cap; reject at the crossing; `rejectInput` (seal, bounded line, one issue); no parse after seal; bounded `[REFUSED …]` records; exact per-stream caps with a reserved, last-written marker; no collection once a stream is full; stats `inputRejected` and `diagnosticBytesDropped` |
| `dvl-spike/src/kernel/kernel.ts` | `onTransportIssue` handles `input_rejected`: halt the current instance; stale → record only |
| `dvl-spike/src/mock-provider/mock-provider.ts` | Test-only `adapter.ping` options: `raw`, `padded`, `unterminated`, `openLine` |
| `dvl-spike/src/mock-provider/scenarios.ts` | `noisy` no longer contains malformed `DVL1:` lines (they fail closed now) |
| `dvl-spike/src/conformance/c26-h3-transport-input-bounding.test.ts` | **New**, 22 tests |
| `dvl-spike/src/conformance/c03-frame-prefix-noise.test.ts` | `noisy` expects 0 malformed lines and 0 rejections; the `[MALFORMED` noise check is removed |
| `dvl-spike/src/conformance/c07-adapter-spool-isolation.test.ts` | Incidental `[MALFORMED` assertion removed (subject unchanged) |
| `dvl-spike/src/conformance/c08-queue-limits.test.ts` | The overflow reader decodes the bounded `[REFUSED …]` records (sequence number from the escaped preview). All FIFO and accounting assertions are unchanged |
| `CLAUDE_REPORTS/H3_TRANSPORT_INPUT_BOUNDING_REPORT.md` | This report |

## Tests: C26 (22)

| # | Asserts |
|---|---|
| 0 | Explicit limits |
| 1 | Oversized frame (cap + 1, valid JSON, 64 KiB chunks): no `JSON.parse` of the body; not delivered; `frame_too_large`; sealed; later valid frame not processed |
| 2 | Frames at the cap, cap − 1 and small are accepted |
| 3 | Five malformed variants: earlier frame processed, nothing after; `malformed_frame`; sealed |
| 4 | Partial at EOF (complete and truncated JSON) never delivered; partial non-frame is noise |
| 5 | Rejection detail ≤ 256 bytes, escaped; bounded noise line; bounded issues |
| 6 | 20 MiB stderr: file ≤ cap; payload = cap − reserve; all bytes read; exact dropped count |
| 7 | 20 MiB noise ≤ cap; a 3 MiB non-frame line is discarded, not fatal |
| 8 | 5000 small frames: queue ≤ 64, sealed, `queue_overflow` |
| 9 ×2 | Real adapter, 2 MiB frame / malformed frame: state identical to before; halted; no Evidence; durable log lines < 8 KiB |
| 10 | Real adapter, unterminated `action.finished` + exit: no Evidence; `partial_frame` |
| 11 | 100 KiB inline payload, `happy`, `oversized-spooled`, `noisy` all finish with no halt |
| 12–17 | First review fixes, as in the table above |
| 18–20 | Second re-review fixes (first-batch budgeting, escape-safe previews), see "Second re-review fixes" |

## Exact command results (final tree)

| Command | Result |
|---|---|
| `npm test` run 1 | exit 0 — 26 files, **231/231 passed** |
| `npm test` run 2 | exit 0 — 26 files, **231/231 passed** |
| `npm test` run 3 | exit 0 — 26 files, **231/231 passed** |
| `npm run typecheck` | exit 0 |
| `npm run spike` | exit 0 — "SPIKE OK — every scenario reached its expected terminal state" |
| `npx vitest run src/conformance/c18* … c26*` (focused) | exit 0 — 9 files, **123/123 passed** (C18 8, C19 3, C20 7, C21 26, C22 18, C23 10, C24 18, C25 11, C26 22) |
| `npx vitest run src/conformance/c08* src/conformance/c09* src/conformance/c26*` | exit 0 — 3 files, **40/40 passed** (C08 14, C09 4, C26 22) |
| C09 alone ×10 / under 6 busy loops ×5 | 10/10 and 5/5 passed |
| `DVL_FS_CONFINEMENT=path npm test` (H2 fallback mode, as on macOS) | exit 0 — 26 files, **231/231 passed** |

Per suite: C01 6, C02 4, C03 6, C04 4, C05 4, C06 13, C07 10, C08 14, C09 4, C10 7, C11 7, C12 5, C13 6, C14 8, C15 5, C16 3, C17 2, C18 8, C19 3, C20 7, C21 26, C22 18, C23 10, C24 18, C25 11, **C26 22**.

The runs were on Linux (procfd confinement), plus the full suite in path mode; there was no macOS host run.

## Known limitations

- **Whole-record budgeting can leave the payload just under the budget.** Up to one record or line (≤ ~1 MiB for a noise line, ~300 bytes for a refused record) of payload budget can stay unused when the next whole item doesn't fit. The file is still ≤ the cap, and the unwritten bytes are counted as dropped. stderr is not line-structured and is trimmed at the exact budget.
- **C09** is timing-sensitive under heavy load (see above). It was not reproduced, and H3 doesn't touch it.
- **Behaviour changes:**
  - A malformed `DVL1:` frame now halts the instance; before, it was logged and processing continued (C03).
  - Refused frames in the overflow spool are bounded previews, not raw lines (C08 reader adapted).
- **Memory is bounded per line, not per pipe read.**
  - Up to `MAX_FRAME_BYTES` per line, plus the current chunk delivered by Node's pipe read.
  - Diagnostic collection per chunk is bounded by the stream's remaining budget plus one line.
  - Normal pipe reads are ≤ 64 KiB, but the transport does not impose its own chunk-size limit; a caller pushing a huge synthetic chunk still has that chunk in memory (it is not copied).
  - This is not a native-memory or allocation profile.
- **Frames up to 1 MiB are still parsed** (32× the inline cap) to keep defensive spooling of non-conformant inline payloads.
- **Queued frames are fenced, not rolled back.** Frames queued before a rejection are still pumped, and the Kernel fences them after the halt; nothing is rolled back.
- **Reporting:** one `input_rejected` issue per instance; later rejections are counted (`inputRejected`, `framesRejected`) and recorded in bounded form.
- **Stale-instance coverage:** the stale case is tested by emitting on the retired child's stdout after a forced replacement, not by a still-running stale process.
- **Not in H3:** frame *rate* limiting and stdin backpressure (covered only by the existing queue and `maxIncomingBytes` limits); OS isolation (inherited H2 limits).

## H1/H2 statement

- H1 (C06, C10, C14–C19) and H2 (C04, C07, C11, C13, C20–C25) **remain green**: 228/228 in all three full runs, the focused run, and path mode.
- The only H1/H2-era test edits follow directly from the deliberate H3 changes:
  - C03's malformed-count expectation;
  - C07-3's `[MALFORMED` check;
  - C08's overflow-record reader, with its assertions unchanged.
- No H1/H2 logic was modified.

## H4 statement

**H4 is not touched.**

H3 SECOND FIX READY FOR CODEX RE-REVIEW
