/**
 * C20 — H2 adapter / Kernel spool isolation regressions.
 *
 * Defense in depth: the adapter is now OS-confined. Host fault injection still models
 * historical replacement, symlink and hard-link attacks under the root. H2 therefore
 * guarantees, on the Kernel side:
 *   - the Kernel never READS adapter material from outside the adapter's own area
 *     (canonical-root containment, no symlinks, no hard-link aliases);
 *   - the Kernel never WRITES through anything the adapter could have planted (Kernel spool
 *     files, durable logs, diagnostics: exclusive + no-follow + canonical directory checks);
 *   - imported material is a Kernel-made copy with recorded provenance;
 *   - adapter overwrites of Kernel-owned material are detected and never trusted.
 * Steps below that "act as the adapter" use the test process, which has host authority beyond the confined adapter.
 */
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { SpoolIntegrityError, sha256 } from "../kernel/event-store.js";
import { encodeFrame } from "../kernel/frame.js";
import type { Kernel } from "../kernel/kernel.js";
import { NdjsonTransport } from "../kernel/ndjson-transport.js";
import type { ArtifactRef, StoredEvent } from "../kernel/types.js";
import { integrityCode, kernelOn, makeKernel, runScenario } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});
const track = (k: Kernel) => (kernels.push(k), k);
const rootOf = (k: Kernel) => path.dirname(k.store.dvlDir);
const outsideDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dvl-c20-outside-"));
const registrations = (k: Kernel) => k.store.ofType("kernel.artifact_registered");
const evidenceFor = (k: Kernel, actionId: string) => k.store.readEvidenceFromDisk().find((e) => e.relatedActionId === actionId);
const claimFor = (p: string, bytes: Buffer): ArtifactRef => ({ artifactRef: "art_claim", path: p, hash: sha256(bytes), byteSize: bytes.length, mimeType: "text/plain", summary: "claim" });
const reason = (r: unknown) => (r as { reason: string }).reason;
/** Replace a directory by a symlink to `target` (what a same-user adapter can do). */
const swapDirForSymlink = (dir: string, target: string) => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.symlinkSync(target, dir);
};

describe("C20 H2 adapter/Kernel spool isolation", () => {
  it("1. claims outside the adapter's permitted area (../, absolute, Kernel spool, other instance) never import anything", async () => {
    const k = track(makeKernel("c20-outside"));
    k.start();
    const aid = k.currentAdapterInstanceId!;
    const bytes = Buffer.from("adapter bytes\n");
    const area = k.store.adapterSpoolDirOf(aid);
    fs.writeFileSync(path.join(area, "ok.log"), bytes);
    // The adapter physically writes outside its area: into its Kernel spool and outside the project.
    fs.writeFileSync(path.join(k.store.kernelSpoolDirOf(aid), "planted.log"), bytes);
    const outside = path.join(outsideDir(), "outside.log");
    fs.writeFileSync(outside, bytes);
    const other = "ainst_dddddddddddddddddddd";
    k.store.createInstanceSpools(other);
    fs.writeFileSync(path.join(k.store.adapterSpoolDirOf(other), "ok.log"), bytes);

    const base = `.dvl/adapter-spool/${aid}`;
    const registeredBefore = registrations(k).length;
    const kernelSpoolBefore = fs.readdirSync(k.store.kernelSpoolDirOf(aid)).sort();
    for (const p of [
      `${base}/../../spool/${aid}/planted.log`,
      `${base}/../${other}/ok.log`,
      `${base}/../../../${path.relative(rootOf(k), outside)}`,
      outside,
      path.relative(rootOf(k), outside),
      `.dvl/spool/${aid}/planted.log`,
      `.dvl/events/events.jsonl`,
      `.dvl/adapter-spool/${other}/ok.log`,
    ]) {
      const r = k.store.importAdapterArtifact(claimFor(p, bytes), aid);
      expect(r.ok, p).toBe(false);
      expect(reason(r), p).toMatch(/outside own adapter instance area/);
    }
    // A claim naming another instance as its owner is refused even for an in-area path.
    expect(reason(k.store.importAdapterArtifact({ ...claimFor(`${base}/ok.log`, bytes), adapterInstanceId: other }, aid))).toMatch(/claims adapterInstanceId/);
    expect(registrations(k)).toHaveLength(registeredBefore); // nothing registered
    expect(fs.readdirSync(k.store.kernelSpoolDirOf(aid)).sort()).toEqual(kernelSpoolBefore); // nothing materialized
    // Control: the same bytes inside the own area import.
    expect(k.store.importAdapterArtifact(claimFor(`${base}/ok.log`, bytes), aid).ok).toBe(true);
  });

  it("2. symlink escapes on the read side are rejected: file link, area link, and a symlinked adapter-spool root", () => {
    const k = track(makeKernel("c20-read-symlink")); // store only: no adapter needed
    const aid = "ainst_aaaaaaaaaaaaaaaaaaaa";
    k.store.createInstanceSpools(aid);
    const bytes = Buffer.from("OUTSIDE BYTES\n");
    const out = outsideDir();
    fs.writeFileSync(path.join(out, "x.log"), bytes);
    const claim = claimFor(`.dvl/adapter-spool/${aid}/x.log`, bytes);

    // (a) file symlink inside the own area
    fs.symlinkSync(path.join(out, "x.log"), path.join(k.store.adapterSpoolDirOf(aid), "x.log"));
    expect(reason(k.store.importAdapterArtifact(claim, aid))).toMatch(/symlink/);
    // (b) the own area itself replaced by a symlink
    fs.mkdirSync(path.join(out, aid));
    fs.writeFileSync(path.join(out, aid, "x.log"), bytes);
    swapDirForSymlink(k.store.adapterSpoolDirOf(aid), path.join(out, aid));
    expect(reason(k.store.importAdapterArtifact(claim, aid))).toMatch(/not a real directory/);
    // (c) the whole .dvl/adapter-spool root replaced by a symlink: the area is a real
    // directory, but it resolves outside the canonical project root.
    swapDirForSymlink(k.store.adapterSpoolDir, out);
    const r = k.store.importAdapterArtifact(claim, aid);
    expect(r.ok).toBe(false);
    expect(reason(r)).toMatch(/resolves outside adapter-spool/);
    expect(registrations(k)).toHaveLength(0);
  });

  it("3. Kernel spool writes never follow a planted symlink; an import into a hijacked spool is CORRUPTED, nothing written outside", async () => {
    // Store level: owner dir and Kernel owner dir swapped for symlinks.
    const k = track(makeKernel("c20-write-symlink"));
    const aid = "ainst_bbbbbbbbbbbbbbbbbbbb";
    k.store.createInstanceSpools(aid);
    const out = outsideDir();
    swapDirForSymlink(k.store.kernelSpoolDirOf(aid), out);
    fs.symlinkSync(out, k.store.kernelSpoolDirOf("kernel"));
    for (const owner of [aid, "kernel"]) {
      expect(() => k.store.spoolArtifact("PAYLOAD", { owner, mimeType: "text/plain", summary: "s", provenance: { origin: "kernel_spooled_payload" } })).toThrow(SpoolIntegrityError);
    }
    // The import path turns the refusal into a rejection instead of a crash.
    const bytes = Buffer.from("good adapter bytes\n");
    fs.writeFileSync(path.join(k.store.adapterSpoolDirOf(aid), "good.log"), bytes);
    const imp = k.store.importAdapterArtifact(claimFor(`.dvl/adapter-spool/${aid}/good.log`, bytes), aid);
    expect(imp.ok).toBe(false);
    expect(reason(imp)).toMatch(/spool integrity/);
    expect(fs.readdirSync(out)).toEqual([]);
    expect(registrations(k)).toHaveLength(0);

    // End to end: the live adapter's Kernel spool is hijacked before it reports a valid artifact.
    const ke = track(makeKernel("c20-write-symlink-e2e"));
    ke.start();
    await ke.describe();
    const out2 = outsideDir();
    swapDirForSymlink(ke.store.kernelSpoolDirOf(ke.currentAdapterInstanceId!), out2);
    const id = await ke.startRun({ role: "builder", goal: "x", acceptanceCriteria: [], scope: ["src/**"], scenario: "oversized-spooled" });
    expect(await ke.waitForRunEnd(id.runId, 20_000)).toBe("finished");
    await ke.settle();
    const ev = evidenceFor(ke, "act_big")!;
    expect(ev.validationStatus).toBe("CORRUPTED");
    expect(ev.artifactRefs).toEqual([]);
    expect(ev.statusReason).toMatch(/spool integrity/);
    expect(ke.store.ofType("kernel.artifact_imported")).toHaveLength(0);
    expect(fs.readdirSync(out2)).toEqual([]); // the Kernel wrote nothing outside its spool
  });

  it("4. adapter attempts to overwrite Kernel logs/spool: no write through planted links, overwrites detected and never trusted", async () => {
    const k = track(makeKernel("c20-overwrite"));
    await runScenario(k, "oversized-spooled");
    await k.shutdown();
    const root = rootOf(k);
    const imported = evidenceFor(k, "act_big")!.artifactRefs[0]!;

    // (a) Overwrite the imported Kernel artifact in place (same size) → never valid again, also after replay.
    fs.writeFileSync(path.join(root, imported.path), "X".repeat(imported.byteSize));
    expect(reason(k.store.verifyKernelArtifact(imported))).toMatch(/hash mismatch/);
    const replay = track(kernelOn(root));
    expect(reason(replay.store.verifyKernelArtifact(imported))).toMatch(/hash mismatch/);

    // (b) Overwrite an evidence record (status upgrade) → the record no longer authenticates.
    const evLines = fs.readFileSync(k.store.evidencePath, "utf8").split("\n").filter(Boolean);
    const i = evLines.findIndex((l) => l.includes('"act_big"'));
    const rec = JSON.parse(evLines[i]!);
    rec.validationStatus = "VALIDATED";
    evLines[i] = JSON.stringify(rec);
    fs.writeFileSync(k.store.evidencePath, evLines.join("\n") + "\n");
    const replay2 = track(kernelOn(root));
    expect(replay2.store.integrity.evidence.ok).toBe(false);
    expect(replay2.store.allEvidence().some((e) => e.validationStatus === "VALIDATED")).toBe(false);

    // (c) Replace both logs by symlinks to a victim file → the Kernel refuses to append through them.
    const victim = path.join(outsideDir(), "victim.txt");
    fs.writeFileSync(victim, "victim\n");
    for (const log of [replay2.store.eventsPath, replay2.store.evidencePath]) {
      fs.rmSync(log);
      fs.symlinkSync(victim, log);
    }
    const before = replay2.store.all().length;
    expect(() => replay2.store.append({ origin: "kernel", trust: "kernel_truth", type: "kernel.probe", payload: {} })).toThrow(SpoolIntegrityError);
    expect(replay2.store.all()).toHaveLength(before); // in-memory history not advanced either
    expect(fs.readFileSync(victim, "utf8")).toBe("victim\n");

    // (d) A Kernel-owned directory replaced by a symlink: a new Kernel refuses to open the store.
    const root2 = rootOf(track(makeKernel("c20-dir-swap")));
    swapDirForSymlink(path.join(root2, ".dvl", "evidence"), outsideDir());
    // Stable code, not prose: the walk reports "symlink" in both confinement modes (it was
    // "not a real directory" vs "is a symlink" wording that differed between platforms).
    expect(integrityCode(() => kernelOn(root2))).toBe("symlink");
  });

  it("5. queue-overflow diagnostics are never written through a planted symlink; stderr/noise files must be fresh", async () => {
    const victim = path.join(outsideDir(), "victim.txt");
    fs.writeFileSync(victim, "victim\n");
    const fakeChild = () => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough() }) as unknown as ChildProcess;
    const opts = (spoolDir: string) => ({
      spoolDir,
      diagnosticsName: "diagnostics",
      adapterInstanceId: "ainst_00000000000000000000",
      maxQueuedFrames: 1024,
      maxQueuedBytes: 16 * 1024 * 1024,
      maxIncomingBytes: 1_000,
      onFrame: async () => {
        await new Promise(() => {}); // processing blocked: frames queue up
      },
    });
    const frame = (n: number) => encodeFrame({ type: "heartbeat", adapterSequence: n, actorId: "a", actorSequence: n, runId: "r", attempt: 1 });
    const flush = () => new Promise((r) => setImmediate(r));

    // Overflow file planted as a symlink after the transport started (the adapter knows the path).
    const child = fakeChild();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dvl-c20-diag-"));
    const t = new NdjsonTransport(child, opts(dir));
    fs.symlinkSync(victim, t.overflowSpoolPath);
    child.stdout!.emit("data", Buffer.from(frame(1)));
    child.stderr!.emit("data", Buffer.alloc(1_200, 0x61)); // breach → sealed
    await flush();
    child.stdout!.emit("data", Buffer.from([2, 3, 4].map(frame).join("")));
    await flush();
    expect(t.isSealed).toBe(true);
    expect(t.stats.framesRejected).toBe(3);
    expect(t.stats.overflowSpoolRefused).toBe(3); // counted, never processed, never written through the link
    expect(fs.readFileSync(victim, "utf8")).toBe("victim\n");
    expect(fs.lstatSync(t.overflowSpoolPath).isSymbolicLink()).toBe(true);

    // stderr / noise diagnostics planted before the transport opens them: refused, victim untouched.
    for (const name of ["diagnostics.stderr.log", "diagnostics.stdout-noise.log"]) {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), "dvl-c20-diag-"));
      fs.symlinkSync(victim, path.join(d, name));
      expect(() => new NdjsonTransport(fakeChild(), opts(d))).toThrow(/EEXIST/);
    }
    expect(fs.readFileSync(victim, "utf8")).toBe("victim\n");
  });

  it("6. hard-link aliases are rejected: Kernel-owned bytes re-presented as adapter output (end to end) and files outside the project", async () => {
    const k = track(makeKernel("c20-hardlink"));
    const { status } = await runScenario(k, "artifact-hardlink-alias");
    expect(status).toBe("finished");
    const src = evidenceFor(k, "act_src")!;
    expect(src.validationStatus).toBe("PERSISTED");
    expect(src.artifactRefs).toHaveLength(1);
    const alias = evidenceFor(k, "act_alias")!;
    expect(alias.validationStatus).toBe("CORRUPTED");
    expect(alias.artifactRefs).toEqual([]);
    expect(alias.statusReason).toMatch(/missing|ENOENT/i); // broker denied provider link creation
    expect(k.store.ofType("kernel.artifact_imported")).toHaveLength(1); // only the genuine one
    const aliasPath = path.join(k.store.adapterSpoolDirOf(k.currentAdapterInstanceId!), "alias.log");
    expect(fs.existsSync(aliasPath)).toBe(false);
    expect(k.store.verifyKernelArtifact(src.artifactRefs[0]!)).toEqual({ ok: true });
    // Inject a historical alias with host authority; retain the independent H2 defense.
    fs.linkSync(path.join(rootOf(k), src.artifactRefs[0]!.path), aliasPath);
    expect(reason(k.store.importAdapterArtifact(claimFor(path.relative(rootOf(k), aliasPath), fs.readFileSync(aliasPath)), k.currentAdapterInstanceId!))).toMatch(/hard-linked/);
    expect(reason(k.store.verifyKernelArtifact(src.artifactRefs[0]!))).toMatch(/hard-linked/);
    fs.rmSync(path.join(k.store.adapterSpoolDirOf(k.currentAdapterInstanceId!), "alias.log"));
    expect(k.store.verifyKernelArtifact(src.artifactRefs[0]!)).toEqual({ ok: true });

    // A hard link to a file outside the project (same filesystem) is rejected the same way.
    const aid = k.currentAdapterInstanceId!;
    const outside = path.join(outsideDir(), "secret.txt");
    fs.writeFileSync(outside, "outside secret\n");
    try {
      fs.linkSync(outside, path.join(k.store.adapterSpoolDirOf(aid), "secret.log"));
    } catch {
      return; // cross-device tmpdir: hard link not possible here, the end-to-end case above still ran
    }
    const r = k.store.importAdapterArtifact(claimFor(`.dvl/adapter-spool/${aid}/secret.log`, fs.readFileSync(outside)), aid);
    expect(reason(r)).toMatch(/hard-linked/);
  });

  it("7. a valid artifact is copied by the Kernel and its hash and provenance are recorded (live and on replay)", async () => {
    const k = track(makeKernel("c20-provenance"));
    const { id } = await runScenario(k, "oversized-spooled");
    const aid = k.currentAdapterInstanceId!;
    const root = rootOf(k);
    const finished = k.store.all().find((e) => e.origin === "adapter" && e.type === "action.finished" && (e.payload as { actionId?: string }).actionId === "act_big")!;
    const claim = (finished.payload as { outputRef: ArtifactRef }).outputRef;
    const ref = evidenceFor(k, "act_big")!.artifactRefs[0]!;

    // Kernel-issued, Kernel-chosen location; the adapter's path and id are not reused.
    expect(ref.path).toMatch(new RegExp(`^\\.dvl/spool/${aid}/art_[0-9a-f]{20}\\.log$`));
    expect(ref.path).not.toBe(claim.path);
    expect(ref.artifactRef).not.toBe(claim.artifactRef);
    // Exact bytes: hash/size of the Kernel copy == adapter's file == registration.
    const srcAbs = path.join(root, claim.path);
    const dstAbs = path.join(root, ref.path);
    expect(sha256(fs.readFileSync(dstAbs))).toBe(ref.hash);
    expect(sha256(fs.readFileSync(srcAbs))).toBe(ref.hash);
    expect(ref.byteSize).toBe(512 * 1024);
    // Materialized as an independent copy: a different inode, single link.
    const [s, d] = [fs.statSync(srcAbs), fs.statSync(dstAbs)];
    expect(d.ino).not.toBe(s.ino);
    expect(d.nlink).toBe(1);

    const provenance = {
      origin: "import",
      adapterInstanceId: aid,
      runId: id.runId,
      attempt: 1,
      sourceArtifactRef: claim.artifactRef,
      sourcePath: claim.path,
      sourceEventId: finished.eventId,
      hash: ref.hash,
      byteSize: ref.byteSize,
    };
    const regOf = (kk: Kernel) => kk.store.ofType("kernel.artifact_registered").find((e: StoredEvent) => (e.payload as ArtifactRef).artifactRef === ref.artifactRef)!;
    expect(regOf(k)).toMatchObject({ origin: "kernel", trust: "kernel_truth", runId: id.runId, attempt: 1 });
    expect(regOf(k).payload).toMatchObject(provenance);
    expect(k.store.ofType("kernel.artifact_imported")[0]!.payload).toMatchObject({ adapterInstanceId: aid, artifactRef: ref.artifactRef, path: ref.path, sourcePath: claim.path, sourceEventId: finished.eventId, hash: ref.hash });

    // Later changes to the adapter's source never affect the Kernel copy.
    fs.writeFileSync(srcAbs, "rewritten by adapter");
    fs.rmSync(srcAbs);
    expect(k.store.verifyKernelArtifact(ref)).toEqual({ ok: true });

    // Provenance is durable: a replaying Kernel rebuilds it from the authenticated log.
    await k.shutdown();
    const replay = track(kernelOn(root));
    expect(regOf(replay).payload).toMatchObject(provenance);
    expect(replay.store.verifyKernelArtifact(ref)).toEqual({ ok: true });
  });
});
