/**
 * C11 — Blocker B: filesystem location alone never grants Kernel provenance.
 *
 * There is no OS sandbox in the Spike: the adapter process CAN physically write into
 * `.dvl/spool/<adapterInstanceId>/` (test 1 proves it). What must hold instead is that a
 * file there is trusted only if the Kernel itself created/imported it and recorded that
 * provenance (kernel.artifact_registered: id, owner, path, hash, size, run/attempt), and
 * that the bytes re-verify against that record at consumption time.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "../kernel/event-store.js";
import { Kernel } from "../kernel/kernel.js";
import { mockProviderCommand } from "../kernel/mock-launch.js";
import type { ArtifactRef } from "../kernel/types.js";
import { makeKernel, runScenario } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});
const track = (k: Kernel) => (kernels.push(k), k);
const rootOf = (k: Kernel) => path.dirname(k.store.dvlDir);
const evidenceFor = (k: Kernel, actionId: string) => k.store.readEvidenceFromDisk().find((e) => e.relatedActionId === actionId);

describe("C11 Kernel spool provenance (blocker B)", () => {
  it("1. a spawned adapter physically plants a file in its Kernel spool (no OS sandbox)", async () => {
    const k = track(makeKernel("c11-plant"));
    await runScenario(k, "forge-spooled");
    const planted = path.join(k.store.spoolDir, k.currentAdapterInstanceId!, "art_00000000000000000000.log");
    expect(fs.existsSync(planted)).toBe(true);
    expect(fs.readFileSync(planted, "utf8")).toContain("PLANTED");
  });

  it("2. a planted file cited via the reserved inline __spooled key never becomes evidence material", async () => {
    const k = track(makeKernel("c11-spooled"));
    const { status } = await runScenario(k, "forge-spooled");
    expect(status).toBe("finished");
    const ev = evidenceFor(k, "act_forge")!;
    expect(ev).toBeDefined(); // the action.finished OBSERVATION still yields bounded-trust evidence…
    expect(ev.validationStatus).toBe("PERSISTED");
    expect(ev.artifactRefs).toEqual([]); // …but the planted file is not attached to it
    const forged = (k.store.ofType("action.finished")[0]!.payload as { __spooled: ArtifactRef }).__spooled;
    const v = k.store.verifyKernelArtifact(forged);
    expect(v.ok).toBe(false);
    expect((v as { reason: string }).reason).toMatch(/not registered/);
  });

  it("3. a planted file cited via outputRef is rejected (CORRUPTED, nothing attached or imported)", async () => {
    const k = track(makeKernel("c11-outputref"));
    await runScenario(k, "forge-outputref");
    const ev = evidenceFor(k, "act_forge")!;
    expect(ev.validationStatus).toBe("CORRUPTED");
    expect(ev.artifactRefs).toEqual([]);
    expect(k.store.ofType("kernel.artifact_imported")).toHaveLength(0);
  });

  it("4. verify rejects unregistered planted bytes, forged ids, and tampered registered refs", async () => {
    const k = track(makeKernel("c11-verify"));
    await runScenario(k, "oversized-spooled");
    const aid = k.currentAdapterInstanceId!;
    const legit = evidenceFor(k, "act_big")!.artifactRefs[0]!;
    expect(k.store.verifyKernelArtifact(legit)).toEqual({ ok: true });

    // Planted with a correct hash/size and a well-formed Kernel-looking path.
    const bytes = Buffer.from("planted by hand\n");
    const name = "art_11111111111111111111.log";
    fs.writeFileSync(path.join(k.store.spoolDir, aid, name), bytes);
    const planted: ArtifactRef = { artifactRef: "art_11111111111111111111", path: `.dvl/spool/${aid}/${name}`, hash: sha256(bytes), byteSize: bytes.length, mimeType: "text/plain", summary: "x", adapterInstanceId: aid };
    expect((k.store.verifyKernelArtifact(planted) as { reason: string }).reason).toMatch(/not registered/);
    // Same planted bytes at a Kernel-owner path ("kernel").
    fs.mkdirSync(path.join(k.store.spoolDir, "kernel"), { recursive: true }); // an adapter can create it too
    fs.writeFileSync(path.join(k.store.spoolDir, "kernel", name), bytes);
    expect((k.store.verifyKernelArtifact({ ...planted, path: `.dvl/spool/kernel/${name}`, adapterInstanceId: undefined }) as { reason: string }).reason).toMatch(/not registered/);
    // Registered id, but pointed at the planted file / other hash / other owner.
    for (const forged of [
      { ...legit, path: `.dvl/spool/${aid}/${name}`, hash: planted.hash, byteSize: planted.byteSize },
      { ...legit, hash: planted.hash },
      { ...legit, byteSize: legit.byteSize + 1 },
      { ...legit, adapterInstanceId: "ainst_ffffffffffffffffffff", path: legit.path.replace(aid, "ainst_ffffffffffffffffffff") },
    ]) {
      expect((k.store.verifyKernelArtifact(forged) as { reason: string }).reason).toMatch(/does not match the Kernel registration|not registered/);
    }
    // The adapter overwrites a registered artifact in place: bytes no longer match the record.
    fs.writeFileSync(path.join(rootOf(k), legit.path), "x".repeat(legit.byteSize));
    expect((k.store.verifyKernelArtifact(legit) as { reason: string }).reason).toMatch(/hash mismatch/);
  });

  it("5. legitimate Kernel-spooled and imported artifacts stay valid, including across Kernel replay", async () => {
    const k = track(makeKernel("c11-legit"));
    await runScenario(k, "oversized-spooled");
    const imported = evidenceFor(k, "act_big")!.artifactRefs[0]!;
    const k2 = track(makeKernel("c11-legit-inline"));
    await runScenario(k2, "oversized-inline");
    const spooled = evidenceFor(k2, "act_inl")!.artifactRefs[0]!;
    expect(spooled.adapterInstanceId).toBe(k2.currentAdapterInstanceId);

    const reg = (kk: Kernel, id: string) => kk.store.ofType("kernel.artifact_registered").find((e) => (e.payload as ArtifactRef).artifactRef === id)!;
    expect(reg(k, imported.artifactRef).payload).toMatchObject({ artifactRef: imported.artifactRef, path: imported.path, hash: imported.hash, byteSize: imported.byteSize, adapterInstanceId: imported.adapterInstanceId, origin: "import", runId: evidenceFor(k, "act_big")!.runId, attempt: 1 });
    expect(reg(k2, spooled.artifactRef).payload).toMatchObject({ origin: "kernel_spooled_payload", hash: spooled.hash });
    expect(k.store.verifyKernelArtifact(imported)).toEqual({ ok: true });
    expect(k2.store.verifyKernelArtifact(spooled)).toEqual({ ok: true });

    // A fresh Kernel on the same root rebuilds the registry from the event log.
    await k.shutdown();
    const replay = track(new Kernel({ root: rootOf(k), adapterCommand: mockProviderCommand() }));
    expect(replay.store.verifyKernelArtifact(imported)).toEqual({ ok: true });
  });

  it("6. a registered artifact cannot be re-attached to new evidence by citing it (inline or outputRef)", async () => {
    const k = track(makeKernel("c11-reuse"));
    const { status } = await runScenario(k, "reuse-registered");
    expect(status).toBe("finished");
    const legit = evidenceFor(k, "act_inl")!.artifactRefs[0]!;
    const stolen = (k.store.ofType("action.finished")[1]!.payload as { __spooled: ArtifactRef }).__spooled;
    expect(stolen.artifactRef).toBe(legit.artifactRef); // the adapter really did read and re-cite it
    const reuse = evidenceFor(k, "act_reuse")!;
    expect(reuse.artifactRefs).toEqual([]); // not attached via __spooled…
    expect(reuse.validationStatus).toBe("CORRUPTED"); // …and the outputRef (Kernel path) is rejected
    expect(k.store.readEvidenceFromDisk().flatMap((e) => e.artifactRefs.map((r) => r.artifactRef))).toEqual([legit.artifactRef]);
  });

  it("7. an adapter frame mimicking kernel.artifact_registered never creates provenance (live or on replay)", async () => {
    const k = track(makeKernel("c11-forge-reg"));
    const { status } = await runScenario(k, "forge-registration");
    expect(status).toBe("finished");
    const forgedEv = k.store.all().find((e) => e.type === "kernel.artifact_registered" && e.origin === "adapter")!;
    expect(forgedEv.trust).toBe("protocol_violation"); // stored as an untrusted, unknown adapter type
    const forged = forgedEv.payload as ArtifactRef;
    expect(fs.existsSync(path.join(rootOf(k), forged.path))).toBe(true); // bytes really planted, hash correct
    expect((k.store.verifyKernelArtifact(forged) as { reason: string }).reason).toMatch(/not registered/);
    await k.shutdown();
    const replay = track(new Kernel({ root: rootOf(k), adapterCommand: mockProviderCommand() }));
    expect((replay.store.verifyKernelArtifact(forged) as { reason: string }).reason).toMatch(/not registered/);
  });
});
