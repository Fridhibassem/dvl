/**
 * C21 — H2 review-failure regressions (diagnostics parents, log hard links, log reads,
 * deterministic check/use swaps, import failure handling).
 *
 * Every filesystem test runs in both confinement modes:
 *   - "auto"  → directory-relative confinement via /proc/self/fd on Linux ("procfd");
 *   - "path"  → the path-check fallback used where procfd is unavailable.
 * Races are forced deterministically through the store's test-only fsProbe hook, which
 * mutates the filesystem exactly between a Kernel check and the Kernel's use.
 * Steps that "act as the adapter" use the test process (same OS user, same knowledge).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FsProbe, FsStage } from "../kernel/confined-fs.js";
import { SpoolIntegrityError, sha256 } from "../kernel/event-store.js";
import type { Kernel, KernelOptions } from "../kernel/kernel.js";
import type { ArtifactRef, EvidenceRecord } from "../kernel/types.js";
import { integrityCode, kernelOn, makeKernel, runScenario, waitForEvent } from "./harness.js";

let kernels: Kernel[] = [];
let releases: (() => void)[] = [];
afterEach(async () => {
  releases.splice(0).forEach((r) => r());
  await Promise.all(kernels.map((x) => x.shutdown().catch(() => undefined)));
  kernels = [];
});
const track = (k: Kernel) => (kernels.push(k), k);
const rootOf = (k: Kernel) => path.dirname(k.store.dvlDir);
const outsideDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dvl-c21-outside-"));
const reason = (r: unknown) => (r as { reason: string }).reason;
const claimFor = (p: string, bytes: Buffer): ArtifactRef => ({ artifactRef: "art_claim", path: p, hash: sha256(bytes), byteSize: bytes.length, mimeType: "text/plain", summary: "claim" });
const evidenceFor = (k: Kernel, actionId: string) => k.store.readEvidenceFromDisk().find((e) => e.relatedActionId === actionId);
/** Recursively list everything under `dir` (empty array = nothing was created there). */
const tree = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).sort() : []);
/** Move a directory away (inside the root) and put a symlink to `target` in its place. */
const swapForSymlink = (dir: string, target: string) => {
  fs.renameSync(dir, `${dir}-moved`);
  fs.symlinkSync(target, dir);
};
/** A probe that runs `act` exactly once, at the first `stage` whose target matches. */
function once(stage: FsStage, match: (target: string) => boolean, act: (target: string) => void) {
  const state = { armed: false, fired: false };
  const probe: FsProbe = (s, t) => {
    if (state.armed && !state.fired && s === stage && match(t)) {
      state.fired = true;
      act(t);
    }
  };
  return { probe, state };
}
const evidenceRec = (id: string): EvidenceRecord =>
  ({ evidenceId: id, runId: "run_x", attempt: 1, evidenceType: "TEST_RESULT", source: "PROVIDER_HARNESS_RECORD", validationStatus: "PERSISTED", artifactRefs: [] }) as unknown as EvidenceRecord;

for (const mode of ["auto", "path"] as const) {
  const opts = (extra: Partial<KernelOptions> = {}): Partial<KernelOptions> => ({ confinement: mode, ...extra });

  describe(`C21 H2 review fixes [confinement=${mode}]`, () => {
    it("0. confinement mode in effect", () => {
      const k = track(makeKernel(`c21-mode-${mode}`, opts()));
      expect(k.store.fsc.mode).toBe(mode === "auto" && process.platform === "linux" && process.env.DVL_FS_CONFINEMENT !== "path" ? "procfd" : "path");
    });

    // ───────── Blocker 1: diagnostics and symlinked parent directories ─────────

    /** Run a burst against a tiny, held queue so the lazy overflow diagnostics file is needed. */
    async function overflowAfter(tag: string, hijack: (k: Kernel, aid: string) => void) {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let held = true;
      releases.push(() => ((held = false), release()));
      const k = track(makeKernel(tag, opts({ queueLimits: { maxQueuedFrames: 16 }, frameGate: async (t) => void (held && t === "heartbeat" && (await gate)) })));
      k.start();
      await k.describe();
      const aid = k.currentAdapterInstanceId!;
      hijack(k, aid); // after adapter start, before the overflow file exists
      await k.startRun({ role: "builder", goal: "x", acceptanceCriteria: [], scope: ["src/**"], scenario: "burst-100" });
      await waitForEvent(k, (e) => e.type === "kernel.safety_halt", 10_000);
      held = false;
      release();
      await k.waitClosed(10_000);
      return { k, aid };
    }

    it("1a. lazy overflow diagnostics: swapped owner directory → refused and counted, nothing written outside", async () => {
      const out = outsideDir();
      const { k } = await overflowAfter(`c21-ovf-owner-${mode}`, (kk, aid) => swapForSymlink(kk.store.kernelSpoolDirOf(aid), out));
      const s = k.transportStats!;
      expect(s.framesRejected).toBeGreaterThan(0);
      expect(s.overflowSpoolRefused).toBe(s.framesRejected); // counted, never processed, never written
      // Once the owner directory is unsafe every diagnostics write is refused (stderr too).
      expect(s.diagnosticWritesRefused).toBeGreaterThanOrEqual(1);
      expect(k.store.ofType("kernel.spool_integrity_violation").filter((e) => (e.payload as { kind: string }).kind === "diagnostics_refused")).toHaveLength(1);
      expect(tree(out)).toEqual([]);
    });

    it("1b. lazy overflow diagnostics: swapped spool root (ancestor) → refused and counted, nothing written outside", async () => {
      const out = outsideDir();
      const { k } = await overflowAfter(`c21-ovf-root-${mode}`, (kk, aid) => {
        fs.mkdirSync(path.join(out, aid)); // the redirected tree even has the expected owner dir
        swapForSymlink(kk.store.spoolDir, out);
      });
      const s = k.transportStats!;
      expect(s.framesRejected).toBeGreaterThan(0);
      expect(s.overflowSpoolRefused).toBe(s.framesRejected);
      expect(tree(out)).toEqual([k.currentAdapterInstanceId!]); // only the empty dir the attacker made
    });

    it("1c. constructor diagnostics: parent swapped between check and open → spawn refused, child killed, nothing outside", async () => {
      const out = outsideDir();
      const p = once("diagnostic:before-open", () => true, (target) => swapForSymlink(path.dirname(target), out));
      const k = track(makeKernel(`c21-ctor-diag-${mode}`, opts({ fsProbe: p.probe })));
      p.state.armed = true;
      expect(() => k.start()).toThrow(SpoolIntegrityError);
      expect(p.state.fired).toBe(true);
      expect(tree(out)).toEqual([]);
      const failed = k.store.ofType("kernel.adapter_spawn_failed");
      expect(failed).toHaveLength(1);
      expect((failed[0]!.payload as { reason: string }).reason).toMatch(/spool integrity/);
      const child = (k as unknown as { child: { killed: boolean } }).child;
      expect(child.killed).toBe(true); // never left running without a drained transport
      // The moved original directory holds no leftover diagnostics file either.
      const aid = (failed[0]!.payload as { adapterInstanceId: string }).adapterInstanceId;
      expect(tree(`${k.store.kernelSpoolDirOf(aid)}-moved`)).toEqual([]);
    });

    it("1d. constructor diagnostics: owner directory already a symlink → refused before any write", () => {
      const k = track(makeKernel(`c21-ctor-symlink-${mode}`, opts()));
      const aid = "ainst_cccccccccccccccccccc";
      k.store.createInstanceSpools(aid);
      const out = outsideDir();
      swapForSymlink(k.store.kernelSpoolDirOf(aid), out);
      expect(integrityCode(() => k.store.createDiagnostic(aid, "diagnostics.stderr.log"))).toBe("symlink");
      expect(tree(out)).toEqual([]);
    });

    // ───────── Blocker 2: hard-linked durable logs ─────────

    it("2. a log replaced by a hard link to an outside file is refused: victim unchanged, chain/history not advanced", () => {
      for (const kind of ["events", "evidence"] as const) {
        const k = track(makeKernel(`c21-log-hardlink-${kind}-${mode}`, opts()));
        const log = kind === "events" ? k.store.eventsPath : k.store.evidencePath;
        const victim = path.join(outsideDir(), "victim.txt");
        fs.writeFileSync(victim, "victim\n");
        fs.rmSync(log);
        fs.linkSync(victim, log);
        const head = k.store.head();
        const nEvents = k.store.all().length;
        const nEvidence = k.store.allEvidence().length;
        const write = () => (kind === "events" ? k.store.append({ origin: "kernel", trust: "kernel_truth", type: "kernel.probe", payload: {} }) : k.store.putEvidence(evidenceRec("evd_probe")));
        expect(integrityCode(write)).toBe("hard_link");
        expect(fs.readFileSync(victim, "utf8")).toBe("victim\n");
        expect(k.store.head()).toEqual(head);
        expect(k.store.all()).toHaveLength(nEvents);
        expect(k.store.allEvidence()).toHaveLength(nEvidence);
      }
      // An adapter-made alias of the real log (log now has 2 links) is refused too (fail closed).
      const k = track(makeKernel(`c21-log-alias-${mode}`, opts()));
      fs.linkSync(k.store.eventsPath, path.join(outsideDir(), "alias.jsonl"));
      expect(integrityCode(() => k.store.append({ origin: "kernel", trust: "kernel_truth", type: "kernel.probe", payload: {} }))).toBe("hard_link");
    });

    // ───────── Blocker 3: replay and disk reads of symlinked logs ─────────

    it("3. replay and disk reads refuse symlinked or hard-linked log files (even with authentic content)", async () => {
      const k = track(makeKernel(`c21-read-${mode}`, opts()));
      await runScenario(k, "oversized-spooled");
      await k.shutdown();
      const root = rootOf(k);
      for (const log of [k.store.eventsPath, k.store.evidencePath]) {
        const name = path.basename(log);
        const copy = path.join(outsideDir(), name);
        fs.copyFileSync(log, copy); // authentic, correctly MAC'd bytes — but outside the Kernel area
        fs.renameSync(log, `${log}.orig`);
        fs.symlinkSync(copy, log);
        expect(integrityCode(() => kernelOn(root, opts()))).toBe("symlink");
        expect(() => (name.startsWith("events") ? k.store.readFromDisk() : k.store.readEvidenceFromDisk())).toThrow(SpoolIntegrityError);
        // Hard link instead of symlink: also refused.
        fs.rmSync(log);
        fs.linkSync(copy, log);
        expect(integrityCode(() => kernelOn(root, opts()))).toBe("hard_link");
        fs.rmSync(log);
        fs.renameSync(`${log}.orig`, log); // restore for the next log
      }
      // Restored: replays cleanly.
      expect(track(kernelOn(root, opts())).store.integrity.events.ok).toBe(true);
    });

    // ───────── Blocker 4: deterministic check/use swaps + import failure handling ─────────

    it("4a. log directory swapped between validation and open → refused, victim unchanged, history not advanced", () => {
      const out = outsideDir();
      fs.writeFileSync(path.join(out, "events.jsonl"), "victim\n");
      const p = once("log:before-open", (t) => t.endsWith("events.jsonl"), (t) => swapForSymlink(path.dirname(t), out));
      const k = track(makeKernel(`c21-swap-logdir-${mode}`, opts({ fsProbe: p.probe })));
      const before = { n: k.store.all().length, head: k.store.head(), bytes: fs.readFileSync(k.store.eventsPath) };
      p.state.armed = true;
      expect(() => k.store.append({ origin: "kernel", trust: "kernel_truth", type: "kernel.probe", payload: {} })).toThrow(SpoolIntegrityError);
      expect(p.state.fired).toBe(true);
      expect(fs.readFileSync(path.join(out, "events.jsonl"), "utf8")).toBe("victim\n");
      expect(fs.readFileSync(path.join(path.dirname(k.store.eventsPath) + "-moved", "events.jsonl"))).toEqual(before.bytes);
      expect(k.store.all()).toHaveLength(before.n);
      expect(k.store.head()).toEqual(before.head);
    });

    it("4b. log name swapped between open and write → refused, neither file written, history not advanced", () => {
      const p = once("log:after-open", (t) => t.endsWith("events.jsonl"), (t) => {
        fs.renameSync(t, `${t}.moved`);
        fs.writeFileSync(t, "attacker file\n");
      });
      const k = track(makeKernel(`c21-swap-logname-${mode}`, opts({ fsProbe: p.probe })));
      const before = { n: k.store.all().length, head: k.store.head(), bytes: fs.readFileSync(k.store.eventsPath) };
      p.state.armed = true;
      expect(integrityCode(() => k.store.append({ origin: "kernel", trust: "kernel_truth", type: "kernel.probe", payload: {} }))).toBe("replaced");
      expect(fs.readFileSync(`${k.store.eventsPath}.moved`)).toEqual(before.bytes);
      expect(fs.readFileSync(k.store.eventsPath, "utf8")).toBe("attacker file\n");
      expect(k.store.all()).toHaveLength(before.n);
      expect(k.store.head()).toEqual(before.head);
    });

    it("4c. Kernel spool dir swapped between validation and create → refused, nothing outside, no leftovers, nothing registered", () => {
      const out = outsideDir();
      const aid = "ainst_eeeeeeeeeeeeeeeeeeee";
      const p = once("artifact:before-open", (t) => t.includes(aid), (t) => swapForSymlink(path.dirname(t), out));
      const k = track(makeKernel(`c21-swap-spool-${mode}`, opts({ fsProbe: p.probe })));
      k.store.createInstanceSpools(aid);
      p.state.armed = true;
      expect(() => k.store.spoolArtifact("PAYLOAD", { owner: aid, mimeType: "text/plain", summary: "s", provenance: { origin: "kernel_spooled_payload" } })).toThrow(SpoolIntegrityError);
      expect(tree(out)).toEqual([]);
      expect(tree(`${k.store.kernelSpoolDirOf(aid)}-moved`)).toEqual([]); // own temp file removed again
      expect(k.store.ofType("kernel.artifact_registered")).toHaveLength(0);
    });

    it("4d. import: adapter area disappears or is swapped after the area check → rejection result, never an exception", () => {
      const bytes = Buffer.from("adapter bytes\n");
      // (i) disappears
      {
        const aid = "ainst_11111111111111111111";
        const p = once("import:after-area-check", () => true, (area) => fs.rmSync(area, { recursive: true, force: true }));
        const k = track(makeKernel(`c21-imp-gone-${mode}`, opts({ fsProbe: p.probe })));
        k.store.createInstanceSpools(aid);
        fs.writeFileSync(path.join(k.store.adapterSpoolDirOf(aid), "ok.log"), bytes);
        p.state.armed = true;
        const r = k.store.importAdapterArtifact(claimFor(`.dvl/adapter-spool/${aid}/ok.log`, bytes), aid);
        expect(p.state.fired).toBe(true);
        expect(r.ok).toBe(false);
        expect(reason(r)).toMatch(/missing|changed during import/);
      }
      // (ii) swapped for a symlink to an outside dir holding a file with the claimed bytes
      {
        const aid = "ainst_22222222222222222222";
        const out = outsideDir();
        fs.writeFileSync(path.join(out, "ok.log"), bytes);
        const p = once("import:before-open", () => true, (target) => swapForSymlink(path.dirname(target), out));
        const k = track(makeKernel(`c21-imp-swap-${mode}`, opts({ fsProbe: p.probe })));
        k.store.createInstanceSpools(aid);
        fs.writeFileSync(path.join(k.store.adapterSpoolDirOf(aid), "ok.log"), bytes);
        p.state.armed = true;
        const r = k.store.importAdapterArtifact(claimFor(`.dvl/adapter-spool/${aid}/ok.log`, bytes), aid);
        expect(r.ok).toBe(false);
        expect(reason(r)).toMatch(/changed during import/);
        expect(k.store.ofType("kernel.artifact_registered")).toHaveLength(0);
      }
    });

    it("4e. end to end: area vanishes mid-import → CORRUPTED evidence recorded, run completes, no handler exception", async () => {
      const p = once("import:after-area-check", () => true, (area) => fs.rmSync(area, { recursive: true, force: true }));
      const k = track(makeKernel(`c21-imp-e2e-${mode}`, opts({ fsProbe: p.probe })));
      p.state.armed = true;
      const { status } = await runScenario(k, "oversized-spooled");
      expect(p.state.fired).toBe(true);
      expect(status).toBe("finished");
      const ev = evidenceFor(k, "act_big")!;
      expect(ev.validationStatus).toBe("CORRUPTED");
      expect(ev.artifactRefs).toEqual([]);
      expect(ev.statusReason).toMatch(/artifact verification failed/);
      expect(k.store.ofType("kernel.artifact_rejected")).toHaveLength(1);
      expect(JSON.stringify(k.store.all())).not.toMatch(/kernel handler error/);
    });

    it("4f. end to end: Kernel cannot spool an oversized payload safely → event kept, evidence CORRUPTED, nothing outside", async () => {
      const k = track(makeKernel(`c21-cap-refused-${mode}`, opts()));
      k.start();
      await k.describe();
      const out = outsideDir();
      swapForSymlink(k.store.kernelSpoolDirOf(k.currentAdapterInstanceId!), out);
      const id = await k.startRun({ role: "builder", goal: "x", acceptanceCriteria: [], scope: ["src/**"], scenario: "oversized-inline" });
      expect(await k.waitForRunEnd(id.runId, 20_000)).toBe("finished");
      await k.settle();
      const ev = evidenceFor(k, "act_inl")!;
      expect(ev.validationStatus).toBe("CORRUPTED");
      expect(ev.statusReason).toMatch(/payload spooling refused/);
      expect(k.store.ofType("kernel.spool_integrity_violation").length).toBeGreaterThan(0);
      expect(tree(out)).toEqual([]);
      expect(JSON.stringify(k.store.all())).not.toMatch(/kernel handler error/);
    });
  });
}
