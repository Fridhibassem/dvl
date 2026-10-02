/**
 * C03 (contract C38 + C37 drain half) — DVL1 frame prefix handling of stdout noise,
 * stderr diagnostic spool, and continuous drain independent of processing.
 */
import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { encodeFrame, LineSplitter, parseLine } from "../kernel/frame.js";
import type { Kernel } from "../kernel/kernel.js";
import { makeKernel, runScenario } from "./harness.js";

let k: Kernel | undefined;
afterEach(async () => {
  await k?.shutdown();
  k = undefined;
});

describe("C03 frame-prefix handling of stdout noise", () => {
  it("unit: only lines starting exactly with 'DVL1:' are frames", () => {
    expect(parseLine('DVL1:{"type":"run.started"}').kind).toBe("frame");
    expect(parseLine(' DVL1:{"type":"run.started"}').kind).toBe("noise");
    expect(parseLine('dvl1:{"type":"run.started"}').kind).toBe("noise");
    expect(parseLine('info DVL1:{"type":"run.started"}').kind).toBe("noise");
    expect(parseLine("DVL1:{bad json").kind).toBe("malformed");
    expect(parseLine("DVL1:[1,2]").kind).toBe("malformed");
    expect(parseLine('DVL1:{"no":"type"}').kind).toBe("malformed");
    expect(parseLine('DVL1:{"type":"x"}\r').kind).toBe("frame"); // CRLF tolerated
  });

  it("unit: splitter reassembles frames split across chunks, incl. multi-byte UTF-8", () => {
    const got: string[] = [];
    const s = new LineSplitter((l) => got.push(l), () => {});
    const buf = Buffer.from(encodeFrame({ type: "provider.message", text: "héllo — 漢字 ✓" }));
    for (let i = 0; i < buf.length; i++) s.push(buf.subarray(i, i + 1)); // 1 byte at a time
    expect(got).toHaveLength(1);
    expect(parseLine(got[0]!).kind).toBe("frame");
    expect((parseLine(got[0]!) as unknown as { value: { text: string } }).value.text).toBe("héllo — 漢字 ✓");
  });

  it("unit: an oversized line is discarded without buffering it whole", () => {
    const overflow: number[] = [];
    const lines: string[] = [];
    const s = new LineSplitter((l) => lines.push(l), (i) => overflow.push(i.bytes), 1024);
    s.push(Buffer.from("DVL1:" + "a".repeat(5000)));
    s.push(Buffer.from('\nDVL1:{"type":"ok"}\n'));
    expect(overflow).toHaveLength(1);
    expect(lines).toEqual(['DVL1:{"type":"ok"}']);
  });

  it("end-to-end: noise never becomes protocol; the run still completes correctly", async () => {
    k = makeKernel("c03");
    const { status } = await runScenario(k, "noisy");
    expect(status).toBe("finished");

    const stats = k.transportStats!;
    expect(stats.noiseLines).toBeGreaterThan(1000); // 2MB stdout flood + crafted lines
    expect(stats.malformedLines).toBe(2);

    // Fake frames embedded in noise did NOT produce events.
    expect(k.store.ofType("evidence.validated")).toHaveLength(0);
    expect(k.store.ofType("kernel.truth_violation")).toHaveLength(0);
    expect(k.store.ofType("run.finished")).toHaveLength(1); // only the real one

    // Noise spooled for diagnostics, not lost.
    const noise = fs.readFileSync(k.noiseSpoolPath!, "utf8");
    expect(noise).toContain("npm WARN deprecated");
    expect(noise).toContain("<- embedded, not a frame");
    expect(noise).toContain("[MALFORMED");
  });

  it("stderr is continuously drained to the diagnostic spool, byte-exact", async () => {
    k = makeKernel("c03-stderr");
    await runScenario(k, "noisy");
    await k.shutdown();
    const spool = fs.readFileSync(k.stderrSpoolPath!);
    expect(spool.length).toBe(k.transportStats!.stderrBytes);
    expect(spool.length).toBeGreaterThan(2 * 1024 * 1024);
    expect(spool.toString("utf8")).toContain("provider debug: booting");
    expect(spool.toString("utf8")).toContain("provider debug: done");
    // stderr content never entered the event log.
    expect(fs.readFileSync(k.store.eventsPath, "utf8")).not.toContain("stderr diagnostic chatter");
  });

  it("drain is independent of processing: a BLOCKED Kernel does not stall the provider", async () => {
    // The Kernel is frozen inside its handler for the very first run event. While it is
    // frozen, the provider must still be able to push >2MB through stdout AND stderr.
    // If drain waited on processing, the OS pipes (~64KB) would fill, the provider would
    // block on write(), and the byte counters would stall far below 2MB.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    k = makeKernel("c03-blocked", {
      frameGate: async (type) => {
        if (type === "run.started") await gate;
      },
    });
    k.start();
    await k.describe();
    const id = await k.startRun({ role: "builder", goal: "noisy", acceptanceCriteria: [], scope: [], scenario: "noisy" });

    const deadline = Date.now() + 10_000;
    // Wait until (a) >2MB drained on each pipe and (b) ALL 6 run frames of the scenario
    // are held: run.started in-flight (already shifted, blocked in the handler) + 5 queued.
    const s = () => k!.transportStats!;
    while (s().stdoutBytes < 2 * 1024 * 1024 || s().stderrBytes < 2 * 1024 * 1024 || s().queueHighWater < 5) {
      if (Date.now() > deadline) throw new Error(`drain stalled: stdout=${s().stdoutBytes} stderr=${s().stderrBytes} queued=${s().queueHighWater}`);
      await new Promise((r) => setTimeout(r, 20));
    }
    // Proof the Kernel really was blocked the whole time: run.started not yet persisted.
    expect(k.store.ofType("run.started")).toHaveLength(0);
    expect(k.store.ofType("run.finished")).toHaveLength(0);

    release();
    expect(await k.waitForRunEnd(id.runId, 10_000)).toBe("finished");
  });
});
