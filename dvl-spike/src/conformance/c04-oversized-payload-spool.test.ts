/**
 * C04 (contract C37) — 32KB inline cap, oversized payload spooling, artifactRef integrity.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "../kernel/event-store.js";
import type { Kernel } from "../kernel/kernel.js";
import { MAX_INLINE_PAYLOAD_BYTES, type ArtifactRef } from "../kernel/types.js";
import { makeKernel, runScenario, violations } from "./harness.js";

let k: Kernel | undefined;
afterEach(async () => {
  await k?.shutdown();
  k = undefined;
});

function maxEventLineBytes(file: string): number {
  return Math.max(...fs.readFileSync(file, "utf8").split("\n").map((l) => Buffer.byteLength(l)));
}

describe("C04 oversized payload spooling", () => {
  it("conformant adapter: 512KB output is spooled by the adapter, verified and imported into the Kernel spool", async () => {
    k = makeKernel("c04");
    const { status } = await runScenario(k, "oversized-spooled");
    expect(status).toBe("finished");

    const fin = k.store.ofType("action.finished")[0]!;
    const ref = (fin.payload as { outputRef: ArtifactRef }).outputRef;
    for (const f of ["artifactRef", "hash", "summary", "byteSize", "mimeType"] as const) expect(ref[f]).toBeDefined();
    // H2: the adapter wrote only into its own untrusted area.
    expect(ref.path.startsWith(`.dvl/adapter-spool/${k.currentAdapterInstanceId}/`)).toBe(true);
    expect(ref.byteSize).toBe(512 * 1024);

    const ev = k.store.readEvidenceFromDisk().find((e) => e.relatedActionId === "act_big")!;
    expect(ev.validationStatus).toBe("PERSISTED");
    const imported = ev.artifactRefs[0]!;
    expect(imported.hash).toBe(ref.hash);
    expect(imported.path.startsWith(`.dvl/spool/${k.currentAdapterInstanceId}/`)).toBe(true);

    // Kernel-independent re-verification of the imported bytes on disk.
    const bytes = fs.readFileSync(path.join(k.store.dvlDir, "..", imported.path));
    expect(bytes.length).toBe(ref.byteSize);
    expect(sha256(bytes)).toBe(ref.hash);

    // Nothing near 512KB went inline into the event log.
    expect(maxEventLineBytes(k.store.eventsPath)).toBeLessThan(MAX_INLINE_PAYLOAD_BYTES + 4096);
    expect(violations(k, "inline_payload_exceeded")).toHaveLength(0);
  });

  it("non-conformant adapter: >32KB inline payload is spooled by the Kernel and flagged", async () => {
    k = makeKernel("c04-inline");
    const { status } = await runScenario(k, "oversized-inline");
    expect(status).toBe("finished");

    const v = violations(k, "inline_payload_exceeded");
    expect(v).toHaveLength(1);
    expect(v[0]!.bytes as number).toBeGreaterThan(MAX_INLINE_PAYLOAD_BYTES);

    const fin = k.store.ofType("action.finished")[0]!;
    const spooled = (fin.payload as { __spooled: ArtifactRef }).__spooled;
    expect(spooled.path.startsWith(".dvl/spool/")).toBe(true);
    const onDisk = fs.readFileSync(path.join(k.store.dvlDir, "..", spooled.path));
    expect(sha256(onDisk)).toBe(spooled.hash);
    expect(JSON.parse(onDisk.toString("utf8")).output).toHaveLength(100 * 1024); // nothing lost

    expect(maxEventLineBytes(k.store.eventsPath)).toBeLessThan(MAX_INLINE_PAYLOAD_BYTES);
    // The evidence still exists and points at the Kernel-spooled artifact.
    const ev = k.store.readEvidenceFromDisk().find((e) => e.relatedActionId === "act_inl")!;
    expect(ev.artifactRefs.map((r) => r.hash)).toContain(spooled.hash);
  });

  it("adapter lies about the artifact hash → evidence CORRUPTED, never PERSISTED", async () => {
    k = makeKernel("c04-corrupt");
    await runScenario(k, "corrupted-artifact");
    const ev = k.store.readEvidenceFromDisk().find((e) => e.relatedActionId === "act_bad")!;
    expect(ev.validationStatus).toBe("CORRUPTED");
    expect(ev.statusReason).toMatch(/hash mismatch/);
  });

  it("artifactRef path traversal outside the adapter's own area is rejected", () => {
    k = makeKernel("c04-traversal");
    const r = k.store.importAdapterArtifact({ artifactRef: "x", path: ".dvl/spool/../../etc/passwd", hash: "sha256:00", summary: "", byteSize: 1, mimeType: "text/plain" }, "ainst_00000000000000000000");
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/outside own adapter instance area/);
  });
});
