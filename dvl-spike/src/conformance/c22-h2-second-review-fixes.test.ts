/**
 * C22 — H2 second re-review regressions: diagnostics after open, the durable-log final
 * write window, and the guarantee H2 actually provides.
 *
 * Implemented guarantee (asserted here, not more):
 *   - PRE-WRITE: every diagnostics write and every durable-log record re-opens and re-validates
 *     its target (confined walk, single link, name ↔ inode, directory still canonical). A target
 *     moved, aliased or swapped BEFORE a write is refused: nothing is written, the refusal is
 *     counted/recorded, rejected frames are never processed.
 *   - FINAL WINDOW: a same-user process can still move/alias the inode between the last check
 *     and write(2) — no userspace check excludes that. That one write may land in the relocated/
 *     aliased inode (the Kernel's own file); it is DETECTED immediately after the write, and the
 *     writer fails closed: diagnostics disabled for the instance; the durable store sealed (head
 *     and history not advanced, every later append refused). Nothing further is ever written.
 * Strict prevention of that final write requires OS isolation (separate user / mount namespace).
 */
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import type { FsProbe, FsStage } from "../kernel/confined-fs.js";
import { encodeFrame } from "../kernel/frame.js";
import type { Kernel, KernelOptions } from "../kernel/kernel.js";
import { NdjsonTransport, type TransportIssue } from "../kernel/ndjson-transport.js";
import type { EvidenceRecord } from "../kernel/types.js";
import { integrityCode, makeKernel } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown().catch(() => undefined)));
  kernels = [];
});
const track = (k: Kernel) => (kernels.push(k), k);
const outsideDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dvl-c22-outside-"));
const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
const lines = (p: string) => fs.readFileSync(p, "utf8").split("\n").filter(Boolean);
const flush = () => new Promise((r) => setImmediate(r));
const frame = (n: number) => encodeFrame({ type: "heartbeat", adapterSequence: n, actorId: "a", actorSequence: n, runId: "r", attempt: 1 });
const frames = (from: number, to: number) => Buffer.from(Array.from({ length: to - from + 1 }, (_, i) => frame(from + i)).join(""));
const evidenceRec = (id: string): EvidenceRecord =>
  ({ evidenceId: id, runId: "run_x", attempt: 1, evidenceType: "TEST_RESULT", source: "PROVIDER_HARNESS_RECORD", validationStatus: "PERSISTED", artifactRefs: [] }) as unknown as EvidenceRecord;
function once(stage: FsStage, match: (t: string) => boolean, act: (t: string) => void) {
  const state = { armed: false, fired: false };
  const probe: FsProbe = (s, t) => {
    if (state.armed && !state.fired && s === stage && match(t)) {
      state.fired = true;
      act(t);
    }
  };
  return { probe, state };
}

for (const mode of ["auto", "path"] as const) {
  const opts = (extra: Partial<KernelOptions> = {}): Partial<KernelOptions> => ({ confinement: mode, ...extra });

  /** A transport on a fake child whose diagnostics go through the Kernel's confined store sink. */
  function confinedTransport(k: Kernel, aid: string) {
    k.store.createInstanceSpools(aid);
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough() }) as unknown as ChildProcess;
    const issues: TransportIssue[] = [];
    const t = new NdjsonTransport(child, {
      spoolDir: k.store.kernelSpoolDirOf(aid),
      diagnosticsName: "diagnostics",
      adapterInstanceId: aid,
      maxQueuedFrames: 1024,
      maxQueuedBytes: 16 * 1024 * 1024,
      maxIncomingBytes: 1_000,
      onFrame: async () => {
        await new Promise(() => {}); // processing blocked
      },
      onIssue: (i) => issues.push(i),
      diagnosticSink: { create: (f) => k.store.createDiagnostic(aid, f), append: (f, d) => k.store.appendDiagnostic(aid, f, d) },
    });
    const refusals = () => issues.filter((i) => i.kind === "diagnostics_refused") as Extract<TransportIssue, { kind: "diagnostics_refused" }>[];
    return { t, child, refusals };
  }

  describe(`C22 H2 second re-review fixes [confinement=${mode}]`, () => {
    // ───────── Blocker 1: no long-lived diagnostics descriptors ─────────

    it("1a. owner spool dir moved outside after the eager diagnostics create: later stderr/noise refused, no outside bytes, counted (end to end)", async () => {
      const k = track(makeKernel(`c22-diag-move-${mode}`, opts()));
      k.start();
      await k.describe();
      const aid = k.currentAdapterInstanceId!;
      const moved = path.join(outsideDir(), "moved-owner");
      fs.renameSync(k.store.kernelSpoolDirOf(aid), moved); // the whole owner dir now lives outside
      const snapshot = Object.fromEntries(fs.readdirSync(moved).map((f) => [f, read(path.join(moved, f))]));
      const id = await k.startRun({ role: "builder", goal: "x", acceptanceCriteria: [], scope: ["src/**"], scenario: "noisy" });
      expect(await k.waitForRunEnd(id.runId, 20_000)).toBe("finished"); // protocol unaffected
      await k.shutdown();
      // Not one byte of the 2 MiB stderr / 2 MiB noise reached the relocated files.
      expect(Object.fromEntries(fs.readdirSync(moved).map((f) => [f, read(path.join(moved, f))]))).toEqual(snapshot);
      const s = k.transportStats!;
      expect(s.diagnosticWritesRefused).toBeGreaterThan(0);
      expect(s.diagnosticBytesRefused).toBeGreaterThan(2 * 1024 * 1024);
      const v = k.store.ofType("kernel.spool_integrity_violation").map((e) => e.payload as { kind: string; adapterInstanceId: string });
      expect(v.filter((x) => x.kind === "diagnostics_refused")).toEqual([expect.objectContaining({ adapterInstanceId: aid })]);
    });

    it("1b. overflow file hard-linked outside after its first write: later rejected frames refused, alias unchanged, counted, never processed", async () => {
      const k = track(makeKernel(`c22-ovf-link-${mode}`, opts()));
      const aid = "ainst_33333333333333333333";
      const { t, child, refusals } = confinedTransport(k, aid);
      child.stderr!.emit("data", Buffer.alloc(1_200, 0x61)); // byte breach → queue sealed
      child.stdout!.emit("data", frames(1, 3)); // rejected → overflow created + written
      await flush();
      expect(lines(t.overflowSpoolPath)).toHaveLength(3);
      const alias = path.join(outsideDir(), "alias.log");
      fs.linkSync(t.overflowSpoolPath, alias);
      const before = read(alias);
      child.stdout!.emit("data", frames(4, 6));
      await flush();
      expect(read(alias)).toBe(before); // no new bytes through the alias
      expect(t.stats.framesRejected).toBe(6);
      expect(t.stats.overflowSpoolRefused).toBe(3);
      expect(t.stats.queueDepth).toBe(0); // nothing rejected was ever enqueued/processed
      expect(refusals().map((r) => r.code)).toEqual(["hard_link"]);
    });

    it("1c. owner dir relocated outside after the first overflow write: later frames and stderr refused, relocated files unchanged", async () => {
      const k = track(makeKernel(`c22-ovf-move-${mode}`, opts()));
      const aid = "ainst_44444444444444444444";
      const { t, child, refusals } = confinedTransport(k, aid);
      child.stderr!.emit("data", Buffer.alloc(1_200, 0x61));
      child.stdout!.emit("data", frames(1, 2));
      await flush();
      const moved = path.join(outsideDir(), "moved");
      fs.renameSync(k.store.kernelSpoolDirOf(aid), moved);
      const snapshot = Object.fromEntries(fs.readdirSync(moved).map((f) => [f, read(path.join(moved, f))]));
      child.stdout!.emit("data", frames(3, 5));
      child.stderr!.emit("data", Buffer.from("more stderr\n"));
      await flush();
      expect(Object.fromEntries(fs.readdirSync(moved).map((f) => [f, read(path.join(moved, f))]))).toEqual(snapshot);
      expect(t.stats.overflowSpoolRefused).toBe(3);
      expect(t.stats.diagnosticWritesRefused).toBeGreaterThanOrEqual(2);
      expect(refusals()).toHaveLength(1);
    });

    it("1d. alias created in the final window before a diagnostics write: that write lands (limit), is detected, and nothing more is written", () => {
      const alias = path.join(outsideDir(), "alias.log");
      const p = once("diagnostic:before-write", (t) => t.endsWith("diagnostics.stderr.log"), (t) => fs.linkSync(t, alias));
      const k = track(makeKernel(`c22-diag-final-${mode}`, opts({ fsProbe: p.probe })));
      const { t, child, refusals } = confinedTransport(k, "ainst_55555555555555555555");
      p.state.armed = true;
      child.stderr!.emit("data", Buffer.from("FIRST\n"));
      expect(p.state.fired).toBe(true);
      expect(read(alias)).toBe("FIRST\n"); // honest: the racing write reached the aliased inode
      expect(refusals().map((r) => r.code)).toEqual(["after_write"]);
      child.stderr!.emit("data", Buffer.from("SECOND\n"));
      expect(read(alias)).toBe("FIRST\n"); // fail closed: nothing after detection
      expect(t.stats.diagnosticWritesRefused).toBe(1);
    });

    // ───────── Blocker 2: durable-log final write window ─────────

    for (const kind of ["events", "evidence"] as const) {
      const write = (k: Kernel, n: number) => (kind === "events" ? k.store.append({ origin: "kernel", trust: "kernel_truth", type: "kernel.probe", payload: { n } }) : k.store.putEvidence(evidenceRec(`evd_probe_${n}`)));
      const count = (k: Kernel) => (kind === "events" ? k.store.all().length : k.store.allEvidence().length);
      const logOf = (k: Kernel) => (kind === "events" ? k.store.eventsPath : k.store.evidencePath);

      it(`2a. ${kind} log hard-linked in the final window: write detected after the fact, store sealed, head/history not advanced, nothing more written`, () => {
        const alias = path.join(outsideDir(), "alias.jsonl");
        const p = once("log:before-write", (t) => t.endsWith(`${kind}.jsonl`), (t) => fs.linkSync(t, alias));
        const k = track(makeKernel(`c22-log-link-${kind}-${mode}`, opts({ fsProbe: p.probe })));
        const n0 = count(k);
        const head0 = k.store.head();
        const lines0 = lines(logOf(k)).length;
        p.state.armed = true;
        expect(integrityCode(() => write(k, 1))).toBe("after_write");
        expect(p.state.fired).toBe(true);
        expect(lines(alias)).toHaveLength(lines0 + 1); // honest: the racing record reached the aliased inode
        expect(count(k)).toBe(n0); // …but it is not acknowledged
        expect(k.store.head()).toEqual(head0);
        expect(k.store.sealed).toMatch(/detected after write/);
        // Fail closed: every later record (events AND evidence) is refused before any write.
        expect(integrityCode(() => write(k, 2))).toBe("sealed");
        expect(integrityCode(() => k.store.append({ origin: "kernel", trust: "kernel_truth", type: "kernel.other", payload: {} }))).toBe("sealed");
        expect(integrityCode(() => k.store.putEvidence(evidenceRec("evd_other")))).toBe("sealed");
        expect(lines(alias)).toHaveLength(lines0 + 1);
      });

      it(`2b. ${kind} log directory relocated outside in the final window: detected, sealed, nothing more written to the relocated log`, () => {
        const movedDir = path.join(outsideDir(), "moved");
        const p = once("log:before-write", (t) => t.endsWith(`${kind}.jsonl`), (t) => fs.renameSync(path.dirname(t), movedDir));
        const k = track(makeKernel(`c22-log-move-${kind}-${mode}`, opts({ fsProbe: p.probe })));
        const n0 = count(k);
        const head0 = k.store.head();
        const lines0 = lines(logOf(k)).length;
        p.state.armed = true;
        expect(integrityCode(() => write(k, 1))).toBe("after_write");
        const movedLog = path.join(movedDir, `${kind}.jsonl`);
        expect(lines(movedLog)).toHaveLength(lines0 + 1); // honest: landed in the relocated inode
        expect(count(k)).toBe(n0);
        expect(k.store.head()).toEqual(head0);
        expect(integrityCode(() => write(k, 2))).toBe("sealed");
        expect(lines(movedLog)).toHaveLength(lines0 + 1);
      });
    }

    it("2c. the Kernel fails closed without throwing into handlers/timers once the store is sealed", () => {
      const alias = path.join(outsideDir(), "alias.jsonl");
      const p = once("log:before-write", (t) => t.endsWith("events.jsonl"), (t) => fs.linkSync(t, alias));
      const k = track(makeKernel(`c22-kernel-sealed-${mode}`, opts({ fsProbe: p.probe })));
      p.state.armed = true;
      expect(k.kernelEvent("kernel.probe", { n: 1 })).toBeNull();
      expect(k.kernelEvent("kernel.probe", { n: 2 })).toBeNull();
      expect(k.durableWriteRefusals.map((r) => r.code)).toEqual(["after_write", "sealed"]);
      expect(k.store.ofType("kernel.probe")).toHaveLength(0);
    });
  });
}
