/**
 * C07 — H2 adapter spool isolation (HARDENING.md).
 *
 * Layout under .dvl/:
 *   spool/<adapterInstanceId>/          Kernel-owned: diagnostics + Kernel-spooled + imported artifacts
 *   adapter-spool/<adapterInstanceId>/  untrusted: the only area an adapter is told to write
 *
 * Spool material is diagnostic/runtime material, never Project Truth: it never creates
 * EvidenceRecords by itself, and adapter claims are only referenced after the Kernel
 * verified the exact bytes and imported them into its own spool.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "../kernel/event-store.js";
import { Kernel } from "../kernel/kernel.js";
import { mockProviderCommand } from "../kernel/mock-launch.js";
import { MAX_INLINE_PAYLOAD_BYTES, type ArtifactRef, type StoredEvent } from "../kernel/types.js";
import { makeKernel, runScenario, violations, waitForEvent } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});
function track(k: Kernel): Kernel {
  kernels.push(k);
  return k;
}

const rootOf = (k: Kernel) => path.dirname(k.store.dvlDir);
const kSpool = (k: Kernel, aid: string) => path.join(k.store.spoolDir, aid);
const aSpool = (k: Kernel, aid: string) => path.join(k.store.adapterSpoolDir, aid);
const filesIn = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
const spawned = (k: Kernel) => k.store.ofType("kernel.adapter_spawned").map((e) => e.payload as { adapterInstanceId: string; kernelSpool: string; adapterSpool: string });
const evidenceFor = (k: Kernel, actionId: string) => k.store.readEvidenceFromDisk().find((e) => e.relatedActionId === actionId);
const hashFile = (abs: string) => sha256(fs.readFileSync(abs));

async function runOnCurrent(k: Kernel, scenario: string) {
  await k.describe();
  const id = await k.startRun({ role: "builder", goal: scenario, acceptanceCriteria: ["mock"], scope: ["src/**"], scenario });
  const status = await k.waitForRunEnd(id.runId, 20_000);
  await k.settle();
  return { id, status };
}

/** A claim with the correct hash/size of `bytes`, so only the path/name decides. */
function claimFor(p: string, bytes: Buffer, extra: Partial<ArtifactRef> = {}): ArtifactRef {
  return { artifactRef: "art_claim", path: p, hash: sha256(bytes), byteSize: bytes.length, mimeType: "text/plain", summary: "claim", ...extra };
}

describe("C07 adapter spool isolation (H2)", () => {
  it("1. every adapter instance gets its own fresh Kernel spool root and untrusted adapter area", async () => {
    const k = track(makeKernel("c07-roots"));
    await runScenario(k, "happy");
    await k.shutdown();
    k.restartAdapter();
    await runOnCurrent(k, "happy");

    const [a, b] = spawned(k);
    expect(a!.adapterInstanceId).not.toBe(b!.adapterInstanceId);
    for (const s of [a!, b!]) {
      expect(s.kernelSpool).toBe(path.join(".dvl", "spool", s.adapterInstanceId));
      expect(s.adapterSpool).toBe(path.join(".dvl", "adapter-spool", s.adapterInstanceId));
      expect(fs.statSync(path.join(rootOf(k), s.kernelSpool)).isDirectory()).toBe(true);
      expect(fs.statSync(path.join(rootOf(k), s.adapterSpool)).isDirectory()).toBe(true);
      // Each instance's diagnostics live in its own root.
      expect(filesIn(path.join(rootOf(k), s.kernelSpool))).toEqual(expect.arrayContaining(["diagnostics.stderr.log", "diagnostics.stdout-noise.log"]));
    }
    // Nothing is written flat into .dvl/spool: only per-owner directories.
    for (const ent of fs.readdirSync(k.store.spoolDir, { withFileTypes: true })) expect(ent.isDirectory()).toBe(true);
    // An existing instance's areas can never be re-created / shared.
    expect(() => k.store.createInstanceSpools(a!.adapterInstanceId)).toThrow(/EEXIST/);
  });

  it("2. stderr of parallel instances is drained into each instance's own spool, byte-exact, never mixed", async () => {
    const k1 = track(makeKernel("c07-stderr"));
    const k2 = track(new Kernel({ root: rootOf(k1), adapterCommand: mockProviderCommand(), requestTimeoutMs: 5_000 }));
    const [r1, r2] = await Promise.all([runScenario(k1, "crash"), runScenario(k2, "noisy")]);
    expect([r1.status, r2.status]).toEqual(["failed", "finished"]);
    await k1.waitClosed(5_000);

    const e1 = fs.readFileSync(path.join(kSpool(k1, k1.currentAdapterInstanceId!), "diagnostics.stderr.log"));
    const e2 = fs.readFileSync(path.join(kSpool(k2, k2.currentAdapterInstanceId!), "diagnostics.stderr.log"));
    expect(e1.length).toBe(k1.transportStats!.stderrBytes);
    expect(e2.length).toBe(k2.transportStats!.stderrBytes);
    expect(e1.toString()).toContain("FATAL: segfault simulated");
    expect(e1.toString()).not.toContain("provider debug");
    expect(e2.toString()).toContain("provider debug: booting");
    expect(e2.toString()).not.toContain("FATAL");
    expect(k1.stderrSpoolPath).toBe(path.join(kSpool(k1, k1.currentAdapterInstanceId!), "diagnostics.stderr.log"));
  });

  it("3. non-DVL1 stdout goes to the instance's diagnostic spool and is never parsed as protocol", async () => {
    const k = track(makeKernel("c07-noise"));
    const { status } = await runScenario(k, "noisy");
    expect(status).toBe("finished");
    const aid = k.currentAdapterInstanceId!;
    const noisePath = path.join(kSpool(k, aid), "diagnostics.stdout-noise.log");
    expect(k.noiseSpoolPath).toBe(noisePath);
    const noise = fs.readFileSync(noisePath, "utf8");
    expect(noise).toContain("npm WARN deprecated");
    expect(noise).toContain('log: DVL1:{"type":"evidence.validated"}'); // embedded fake frame: spooled, not parsed
    expect(noise).toContain("[MALFORMED");
    // None of the fake frames became events.
    expect(k.store.ofType("evidence.validated")).toHaveLength(0);
    expect(k.store.ofType("run.finished")).toHaveLength(1);
    // Diagnostic spool is not runtime material: no evidence references it.
    for (const ev of k.store.readEvidenceFromDisk()) for (const r of ev.artifactRefs) expect(r.path).not.toMatch(/diagnostics\./);
  });

  it("4. large payloads are spooled and represented by artifactRef (adapter-spooled and Kernel-spooled)", async () => {
    const k = track(makeKernel("c07-large"));
    await runScenario(k, "oversized-spooled");
    const aid = k.currentAdapterInstanceId!;
    const claim = (k.store.ofType("action.finished")[0]!.payload as { outputRef: ArtifactRef }).outputRef;
    expect(claim.path.startsWith(`.dvl/adapter-spool/${aid}/`)).toBe(true);
    const imported = evidenceFor(k, "act_big")!.artifactRefs[0]!;
    expect(imported.path.startsWith(`.dvl/spool/${aid}/`)).toBe(true);
    expect(imported.byteSize).toBe(512 * 1024);
    expect(hashFile(path.join(rootOf(k), imported.path))).toBe(claim.hash);
    expect(Math.max(...fs.readFileSync(k.store.eventsPath, "utf8").split("\n").map((l) => Buffer.byteLength(l)))).toBeLessThan(MAX_INLINE_PAYLOAD_BYTES);

    const k2 = track(makeKernel("c07-large-inline"));
    await runScenario(k2, "oversized-inline");
    const aid2 = k2.currentAdapterInstanceId!;
    const spooled = (k2.store.ofType("action.finished")[0]!.payload as { __spooled: ArtifactRef }).__spooled;
    expect(spooled.path.startsWith(`.dvl/spool/${aid2}/`)).toBe(true);
    expect(spooled.adapterInstanceId).toBe(aid2);
    expect(k2.store.verifyKernelArtifact(spooled)).toEqual({ ok: true });
  });

  it("5. Kernel-issued artifactRef carries ownership metadata; the adapter's claim is never reused", async () => {
    const k = track(makeKernel("c07-meta"));
    await runScenario(k, "oversized-spooled");
    const aid = k.currentAdapterInstanceId!;
    const claim = (k.store.ofType("action.finished")[0]!.payload as { outputRef: ArtifactRef }).outputRef;
    const ref = evidenceFor(k, "act_big")!.artifactRefs[0]!;
    expect(ref).toMatchObject({
      adapterInstanceId: aid,
      hash: claim.hash,
      byteSize: claim.byteSize,
      mimeType: "text/plain",
      summary: claim.summary,
      sourceArtifactRef: claim.artifactRef,
    });
    expect(ref.artifactRef).toMatch(/^art_[0-9a-f]{20}$/); // Kernel-assigned id
    expect(ref.artifactRef).not.toBe(claim.artifactRef);
    expect(ref.path).toBe(`.dvl/spool/${aid}/${ref.artifactRef}.log`); // safe, Kernel-built path
    expect(k.store.verifyKernelArtifact(ref)).toEqual({ ok: true });
    const imp = k.store.ofType("kernel.artifact_imported")[0]!.payload as Record<string, unknown>;
    expect(imp).toMatchObject({ adapterInstanceId: aid, artifactRef: ref.artifactRef, sourceArtifactRef: claim.artifactRef, hash: claim.hash });
  });

  it("6. parallel adapter instances never share, overwrite, or read each other's spool", async () => {
    const k1 = track(makeKernel("c07-parallel"));
    const k2 = track(new Kernel({ root: rootOf(k1), adapterCommand: mockProviderCommand(), requestTimeoutMs: 5_000 }));
    const [r1, r2] = await Promise.all([runScenario(k1, "oversized-spooled"), runScenario(k2, "oversized-spooled")]);
    expect([r1.status, r2.status]).toEqual(["finished", "finished"]);
    const a1 = k1.currentAdapterInstanceId!;
    const a2 = k2.currentAdapterInstanceId!;
    expect(a1).not.toBe(a2);

    // Shared root ⇒ shared evidence.jsonl (one Kernel per root is the design); use each
    // Kernel's own in-memory view.
    const own = (k: Kernel) => k.store.allEvidence().find((e) => e.relatedActionId === "act_big")!.artifactRefs[0]!;
    const ref1 = own(k1);
    const ref2 = own(k2);
    expect(ref1.path.startsWith(`.dvl/spool/${a1}/`)).toBe(true);
    expect(ref2.path.startsWith(`.dvl/spool/${a2}/`)).toBe(true);
    expect([ref1.adapterInstanceId, ref2.adapterInstanceId]).toEqual([a1, a2]);
    // Disjoint directories, each holding only its own material, all bytes intact.
    for (const [dirA, dirB] of [[kSpool(k1, a1), kSpool(k1, a2)], [aSpool(k1, a1), aSpool(k1, a2)]] as const) {
      expect(filesIn(dirA).filter((f) => filesIn(dirB).includes(f) && !f.startsWith("diagnostics."))).toEqual([]);
    }
    expect(k1.store.verifyKernelArtifact(ref1)).toEqual({ ok: true });
    expect(k1.store.verifyKernelArtifact(ref2)).toEqual({ ok: true });

    // Cross-instance read attempt: instance 2 cites instance 1's (valid, intact) artifact.
    const claim1 = (k1.store.ofType("action.finished")[0]!.payload as { outputRef: ArtifactRef }).outputRef;
    const cross = k2.store.importAdapterArtifact(claim1, a2);
    expect(cross.ok).toBe(false);
    expect((cross as { reason: string }).reason).toMatch(/outside own adapter instance area/);
    // ...and claiming to BE instance 1 does not help.
    const spoof = k2.store.importAdapterArtifact({ ...claim1, adapterInstanceId: a1 }, a2);
    expect((spoof as { reason: string }).reason).toMatch(/claims adapterInstanceId/);
  });

  it("7. late output of a retired instance is fenced: no import, no evidence, nothing in the live instance's spool", async () => {
    let hold = false;
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    const k = track(
      makeKernel("c07-stale", {
        frameGate: async (type) => {
          if (hold && !["command.ack", "adapter.described", "adapter.pong"].includes(type)) await released;
        },
      }),
    );
    k.start();
    await k.describe();
    const aidA = k.currentAdapterInstanceId!;
    hold = true;
    await k.startRun({ role: "builder", goal: "stale", acceptanceCriteria: ["mock"], scope: ["src/**"], scenario: "oversized-spooled" });
    // Wait until A has spooled its artifact and all its frames sit in the queue.
    let last = -1;
    for (let since = Date.now(), end = Date.now() + 5_000; Date.now() < end; ) {
      const n = k.transportStats!.framesReceived;
      if (n !== last) [last, since] = [n, Date.now()];
      else if (n > 2 && Date.now() - since > 200) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(filesIn(aSpool(k, aidA)).some((f) => f.startsWith("art_mock_"))).toBe(true);

    k.restartAdapter({ force: true });
    const aidB = k.currentAdapterInstanceId!;
    hold = false;
    release();
    await waitForEvent(k, (e) => e.type === "kernel.adapter_exited" && (e.payload as { stale?: boolean }).stale === true);

    // A's late action.finished (carrying its artifactRef) was fenced, not applied.
    const stale = k.store.all().filter((e) => e.adapterInstanceId === aidA && e.type === "action.finished");
    expect(stale).toHaveLength(1);
    expect(stale[0]!.trust).toBe("protocol_violation");
    expect(violations(k, "stale_adapter_instance").length).toBeGreaterThan(0);
    expect(k.store.ofType("kernel.artifact_imported")).toHaveLength(0);
    expect(k.store.readEvidenceFromDisk()).toHaveLength(0);
    // A's Kernel spool holds only diagnostics; B's spool has nothing of A's.
    expect(filesIn(kSpool(k, aidA)).every((f) => f.startsWith("diagnostics."))).toBe(true);
    const aHashes = new Set(filesIn(aSpool(k, aidA)).map((f) => hashFile(path.join(aSpool(k, aidA), f))));
    const bFiles = [...filesIn(kSpool(k, aidB)), ...filesIn(aSpool(k, aidB))];
    expect(bFiles.filter((f) => !f.startsWith("diagnostics.") && aHashes.has(hashFile(path.join(kSpool(k, aidB), f))))).toEqual([]);

    // The live instance works normally and imports only its own material.
    await runOnCurrent(k, "oversized-spooled");
    const imported = k.store.ofType("kernel.artifact_imported").map((e) => e.payload as { adapterInstanceId: string });
    expect(imported).toEqual([expect.objectContaining({ adapterInstanceId: aidB })]);
  });

  it("8. path traversal, unsafe names, symlink escape and any adapter-controlled escape are rejected", async () => {
    const k = track(makeKernel("c07-traversal"));
    k.start();
    const aid = k.currentAdapterInstanceId!;
    const area = aSpool(k, aid);
    const bytes = Buffer.from("legit artifact bytes\n");
    fs.writeFileSync(path.join(area, "good.log"), bytes);
    const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dvl-outside-")), "secret.log");
    fs.writeFileSync(outside, bytes);
    fs.symlinkSync(outside, path.join(area, "link.log"));
    fs.mkdirSync(path.join(area, "sub"));
    fs.writeFileSync(path.join(area, "sub", "good.log"), bytes);
    const other = "ainst_ffffffffffffffffffff";
    k.store.createInstanceSpools(other);
    fs.writeFileSync(path.join(aSpool(k, other), "good.log"), bytes);
    fs.writeFileSync(path.join(kSpool(k, aid), "planted.log"), bytes);

    const base = `.dvl/adapter-spool/${aid}`;
    const cases: [string, RegExp][] = [
      [".dvl/adapter-spool/../../etc/passwd", /outside own adapter instance area/],
      [`${base}/../${aid}/good.log`, /outside own adapter instance area/],
      [`${base}/./good.log`, /outside own adapter instance area/],
      [path.join(rootOf(k), base, "good.log"), /outside own adapter instance area/],
      [`.dvl/adapter-spool/${other}/good.log`, /outside own adapter instance area/],
      [`.dvl/spool/${aid}/planted.log`, /outside own adapter instance area/],
      [`${base}/sub/good.log`, /outside own adapter instance area/],
      [`${base}/.hidden`, /unsafe artifact filename/],
      [`${base}/..`, /unsafe artifact filename/],
      [`${base}/a..b`, /unsafe artifact filename/],
      [`${base}/bad\nname.log`, /unsafe artifact filename/],
      [`${base}/nul\0.log`, /unsafe artifact path/],
      [`${base}\\..\\..\\etc\\passwd`, /unsafe artifact path/],
      [`${base}/link.log`, /symlink/],
      [`${base}/sub`, /not a regular file/],
    ];
    for (const [p, why] of cases) {
      const r = k.store.importAdapterArtifact(claimFor(p, bytes), aid);
      expect(r.ok, p).toBe(false);
      expect((r as { reason: string }).reason, p).toMatch(why);
    }
    // Control: the same bytes at a safe path inside the own area import fine.
    expect(k.store.importAdapterArtifact(claimFor(`${base}/good.log`, bytes), aid).ok).toBe(true);

    // Symlinked instance area (dir escape) is rejected even with a valid filename.
    const evil = "ainst_eeeeeeeeeeeeeeeeeeee";
    fs.mkdirSync(kSpool(k, evil));
    fs.symlinkSync(path.dirname(outside), aSpool(k, evil));
    const viaDir = k.store.importAdapterArtifact(claimFor(`.dvl/adapter-spool/${evil}/secret.log`, bytes), evil);
    expect((viaDir as { reason: string }).reason).toMatch(/not a real directory/);
    // Owner names are never adapter-controlled path segments.
    expect(() => k.store.adapterSpoolDirOf("../../tmp")).toThrow(/invalid/);

    // End to end: traversal and Kernel-spool forgery claims → CORRUPTED, nothing attached or imported.
    for (const [scenario, actionId] of [["artifact-traversal", "act_trav"], ["artifact-kernel-path", "act_kp"]] as const) {
      const ke = track(makeKernel(`c07-${scenario}`));
      await runScenario(ke, scenario);
      const ev = evidenceFor(ke, actionId)!;
      expect(ev.validationStatus).toBe("CORRUPTED");
      expect(ev.artifactRefs).toEqual([]);
      expect(ev.statusReason).toMatch(/outside own adapter instance area/);
      expect(ke.store.ofType("kernel.artifact_imported")).toHaveLength(0);
      expect(fs.existsSync(path.join(ke.store.spoolDir, "kernel", "forged.log"))).toBe(false);
    }
  });

  it("9. retention removes only non-live untrusted areas; never the active instance's spool or Kernel spool", async () => {
    const k = track(makeKernel("c07-retention"));
    await runScenario(k, "oversized-spooled");
    const aidA = k.currentAdapterInstanceId!;
    fs.writeFileSync(path.join(k.store.adapterSpoolDir, "README"), "not an instance dir");

    // While A is live, nothing is pruned.
    expect(k.pruneAdapterSpools()).toEqual([]);
    expect(fs.existsSync(aSpool(k, aidA))).toBe(true);

    await k.shutdown();
    k.restartAdapter();
    const aidB = k.currentAdapterInstanceId!;
    await runOnCurrent(k, "oversized-spooled"); // B is live and has spooled material
    const bAreaBefore = filesIn(aSpool(k, aidB));
    expect(bAreaBefore.length).toBeGreaterThan(0);

    expect(k.pruneAdapterSpools()).toEqual([aidA]);
    expect(fs.existsSync(aSpool(k, aidA))).toBe(false);
    expect(filesIn(aSpool(k, aidB))).toEqual(bAreaBefore); // active instance untouched
    expect(fs.existsSync(path.join(k.store.adapterSpoolDir, "README"))).toBe(true);
    // Kernel spool (imported artifacts + diagnostics) of both instances is retained and valid.
    for (const ev of k.store.readEvidenceFromDisk()) for (const r of ev.artifactRefs) expect(k.store.verifyKernelArtifact(r)).toEqual({ ok: true });
    expect(filesIn(kSpool(k, aidA))).toEqual(expect.arrayContaining(["diagnostics.stderr.log"]));
    expect(k.store.ofType("kernel.adapter_spool_pruned").at(-1)!.payload).toEqual({ removed: [aidA], kept: [aidB] });
  });

  it("10. corrupted or missing artifacts never become trusted material; spool alone never creates evidence", async () => {
    // Hash lie → CORRUPTED, claim not attached, not imported.
    const k1 = track(makeKernel("c07-corrupt"));
    await runScenario(k1, "corrupted-artifact");
    const bad = evidenceFor(k1, "act_bad")!;
    expect(bad.validationStatus).toBe("CORRUPTED");
    expect(bad.artifactRefs).toEqual([]);
    expect(k1.store.ofType("kernel.artifact_imported")).toHaveLength(0);
    expect((k1.store.ofType("kernel.artifact_rejected")[0]!.payload as { reason: string }).reason).toMatch(/hash mismatch/);
    expect(filesIn(kSpool(k1, k1.currentAdapterInstanceId!)).every((f) => f.startsWith("diagnostics."))).toBe(true);

    // Missing file → CORRUPTED.
    const k2 = track(makeKernel("c07-missing"));
    await runScenario(k2, "artifact-missing");
    const gone = evidenceFor(k2, "act_gone")!;
    expect(gone.validationStatus).toBe("CORRUPTED");
    expect(gone.statusReason).toMatch(/artifact missing/);
    expect(gone.artifactRefs).toEqual([]);

    // An imported Kernel artifact that is later altered, replaced by a symlink, or deleted is not valid.
    const k3 = track(makeKernel("c07-tamper"));
    await runScenario(k3, "oversized-spooled");
    const ref = evidenceFor(k3, "act_big")!.artifactRefs[0]!;
    const abs = path.join(rootOf(k3), ref.path);
    expect(k3.store.verifyKernelArtifact(ref)).toEqual({ ok: true });
    fs.appendFileSync(abs, "x");
    expect((k3.store.verifyKernelArtifact(ref) as { reason: string }).reason).toMatch(/byteSize mismatch/);
    fs.truncateSync(abs, ref.byteSize - 1);
    fs.appendFileSync(abs, "!");
    expect((k3.store.verifyKernelArtifact(ref) as { reason: string }).reason).toMatch(/hash mismatch/);
    fs.rmSync(abs);
    fs.symlinkSync(k3.store.eventsPath, abs);
    expect((k3.store.verifyKernelArtifact(ref) as { reason: string }).reason).toMatch(/symlink/);
    fs.rmSync(abs);
    expect((k3.store.verifyKernelArtifact(ref) as { reason: string }).reason).toMatch(/artifact missing/);
    expect(k3.store.verifyKernelArtifact({ ...ref, path: `.dvl/adapter-spool/${k3.currentAdapterInstanceId}/x.log` }).ok).toBe(false);

    // stderr, stdout noise, and an artifactRef on a non-evidence event never create evidence or imports.
    const k4 = track(makeKernel("c07-spool-only"));
    const { status } = await runScenario(k4, "spool-only");
    expect(status).toBe("finished");
    await k4.shutdown(); // stderr is drained asynchronously; closed ⇒ fully drained
    const aid4 = k4.currentAdapterInstanceId!;
    expect(fs.readFileSync(path.join(kSpool(k4, aid4), "diagnostics.stderr.log"), "utf8")).toContain("diag: spool-only");
    expect(fs.readFileSync(path.join(kSpool(k4, aid4), "diagnostics.stdout-noise.log"), "utf8")).toContain("plain stdout line");
    expect(k4.store.readEvidenceFromDisk()).toHaveLength(0);
    expect(k4.store.all().filter((e: StoredEvent) => e.type.startsWith("kernel.artifact_") || e.type === "kernel.evidence_recorded")).toHaveLength(0);
  });
});
