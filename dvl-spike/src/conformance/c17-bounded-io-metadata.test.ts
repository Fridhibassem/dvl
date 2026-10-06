/**
 * C17 — non-blocking findings reviewed with the blockers.
 *
 * 1. Bounded shutdown: an adapter that stops reading stdin makes Kernel→adapter writes
 *    back up. Neither send() nor shutdown(timeoutMs) may wait forever on 'drain'.
 * 2. Artifact metadata: every field of a Kernel-issued ArtifactRef (including mimeType,
 *    summary, sourceArtifactRef) is bound to the Kernel registration. No field is
 *    "display-only and unchecked": a ref that differs from its registration in ANY field
 *    does not verify.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Kernel } from "../kernel/kernel.js";
import { makeKernel, runScenario } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown(500)));
  kernels = [];
});

describe("C17 bounded I/O and artifact metadata binding", () => {
  it("shutdown(timeout) returns in bounded time when the adapter stopped reading stdin", async () => {
    const k = makeKernel("c17-stuck", { adapterEnv: { DVL_MOCK_STOP_READING: "1" } });
    kernels.push(k);
    k.start();
    await k.describe(); // answered, then the adapter stops reading
    // Back up the stdin pipe far beyond its buffer.
    const big = { type: "adapter.ping" as const, requestId: "req_flood", payload: { blob: "x".repeat(4 * 1024 * 1024) } };
    const transport = (k as unknown as { transport: { send: (c: unknown) => Promise<void> } }).transport;
    const flood = transport.send(big).then(
      () => "sent",
      (e: Error) => e.message,
    );
    const t0 = Date.now();
    const outcome = await Promise.race([k.shutdown(200).then(() => "returned"), new Promise((r) => setTimeout(() => r("hung"), 5_000))]);
    expect(outcome).toBe("returned");
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(await k.waitClosed(3_000)).toBe(true); // the stuck adapter was killed
    expect(await Promise.race([flood, new Promise((r) => setTimeout(() => r("still pending"), 2_000))])).not.toBe("still pending");
  });

  it("every ArtifactRef field is bound to the Kernel registration", async () => {
    const k = makeKernel("c17-meta");
    kernels.push(k);
    await runScenario(k, "oversized-spooled");
    const ref = k.store.readEvidenceFromDisk().find((e) => e.relatedActionId === "act_big")!.artifactRefs[0]!;
    expect(k.store.verifyKernelArtifact(ref)).toEqual({ ok: true });
    for (const tampered of [{ ...ref, mimeType: "text/html" }, { ...ref, summary: "all tests passed" }, { ...ref, sourceArtifactRef: "art_mock_other" }]) {
      expect((k.store.verifyKernelArtifact(tampered) as { reason: string }).reason).toMatch(/does not match the Kernel registration/);
    }
  });
});
