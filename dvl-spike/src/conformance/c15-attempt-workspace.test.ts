/**
 * C15 — Blocker 3: a new Attempt never inherits the dirty, unverified work of a failed one.
 *
 * Each Attempt owns its own transaction workspace (.dvl/tx/<runId>/attempt-<n>) and a fresh
 * workspaceId. On retry the failed attempt's workspace is archived (Kernel-registered
 * manifest) and left behind. The ONLY way to carry files forward is an explicitly selected
 * safe mechanical checkpoint: a Kernel-VALIDATED FILE_SNAPSHOT of the same run whose
 * registered manifest still matches the bytes on disk; only those files, byte-verified,
 * are copied into the new attempt's workspace.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Kernel } from "../kernel/kernel.js";
import type { EvidenceRecord } from "../kernel/types.js";
import { makeKernel } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});
const task = (scenario: string) => ({ role: "builder", goal: scenario, acceptanceCriteria: [], scope: ["src/**"], scenario });
const rootOf = (k: Kernel) => path.dirname(k.store.dvlDir);
const manifestOf = (k: Kernel, ev: EvidenceRecord) =>
  JSON.parse(fs.readFileSync(path.join(rootOf(k), ev.artifactRefs[0]!.path), "utf8")) as { path: string; hash: string }[];

/** Attempt 1 runs `scenario` (which crashes); returns after the adapter is gone and restarted. */
async function failedAttempt(tag: string, scenario: string, during?: (k: Kernel, runId: string) => Promise<void>) {
  const k = makeKernel(tag, { quiescenceMs: 100 });
  kernels.push(k);
  k.start();
  await k.describe();
  const a1 = await k.startRun(task(scenario));
  const ws1 = k.txWorkspaceOf(a1.runId);
  if (during) await during(k, a1.runId);
  expect(await k.waitForRunEnd(a1.runId)).toBe("failed");
  await k.waitClosed(5_000);
  k.restartAdapter();
  await k.describe();
  return { k, a1, ws1 };
}

describe("C15 attempt-owned workspaces (blocker 3)", () => {
  it("default retry: fresh workspace; the failed attempt's partial file never reaches the retry snapshot", async () => {
    const { k, a1, ws1 } = await failedAttempt("c15-fresh", "crash-after-write");
    expect(fs.existsSync(path.join(ws1, "src/partial.ts"))).toBe(true); // attempt 1 left dirt
    const a2 = await k.retryRun(a1.runId, task("happy"));
    const ws2 = k.txWorkspaceOf(a1.runId);
    expect(ws2).not.toBe(ws1);
    expect(a2.workspaceId).not.toBe(a1.workspaceId);
    expect(fs.existsSync(path.join(ws2, "src/partial.ts"))).toBe(false);
    expect(await k.waitForRunEnd(a1.runId)).toBe("finished");
    const snap = await k.awaitSnapshot(a1.runId);
    expect(snap.status).toBe("SNAPSHOT_TAKEN");
    expect(snap.evidence!.attempt).toBe(2);
    expect(snap.evidence!.workspaceId).toBe(a2.workspaceId);
    expect(manifestOf(k, snap.evidence!).map((f) => f.path)).toEqual(["src/users.ts"]); // only attempt-2 work
  });

  it("the failed attempt's dirty workspace is archived with a Kernel-registered manifest", async () => {
    const { k, a1, ws1 } = await failedAttempt("c15-archive", "crash-after-write");
    await k.retryRun(a1.runId, task("happy"));
    const arch = k.store.ofType("kernel.workspace_archived")[0]!.payload as Record<string, unknown> & { manifestRef: { path: string } };
    expect(arch).toMatchObject({ runId: a1.runId, attempt: 1, workspaceId: a1.workspaceId, previousStatus: "failed", files: ["src/partial.ts"] });
    expect(k.store.verifyKernelArtifact(arch.manifestRef as never)).toEqual({ ok: true });
    const m = JSON.parse(fs.readFileSync(path.join(rootOf(k), arch.manifestRef.path), "utf8")) as { path: string; hash: string }[];
    expect(m[0]!.hash).toMatch(/^sha256:/);
    expect(fs.existsSync(path.join(ws1, "src/partial.ts"))).toBe(true); // archived in place, never reused
  });

  it("intentional resume from a safe mechanical checkpoint carries exactly the checkpointed bytes", async () => {
    let checkpoint: EvidenceRecord | undefined;
    const { k, a1, ws1 } = await failedAttempt("c15-resume", "checkpoint-then-crash", async (kk, runId) => {
      const r = await kk.awaitSnapshot(runId, 5_000); // root finished, a.ts written, no writers
      expect(r.status).toBe("SNAPSHOT_TAKEN");
      checkpoint = r.evidence!;
    });
    expect(checkpoint!.validationStatus).toBe("VALIDATED");
    expect(fs.existsSync(path.join(ws1, "src/partial.ts"))).toBe(true); // dirt written after the checkpoint
    await k.retryRun(a1.runId, task("happy"), { resumeFromEvidenceId: checkpoint!.evidenceId });
    const ws2 = k.txWorkspaceOf(a1.runId);
    expect(fs.readFileSync(path.join(ws2, "src/a.ts"), "utf8")).toBe("export const a = 1;\n");
    expect(fs.existsSync(path.join(ws2, "src/partial.ts"))).toBe(false);
    expect(k.store.ofType("kernel.checkpoint_restored")[0]!.payload).toMatchObject({ runId: a1.runId, attempt: 2, fromAttempt: 1, evidenceId: checkpoint!.evidenceId, files: ["src/a.ts"] });
    expect(await k.waitForRunEnd(a1.runId)).toBe("finished");
    const snap = await k.awaitSnapshot(a1.runId);
    expect(manifestOf(k, snap.evidence!).map((f) => f.path)).toEqual(["src/a.ts", "src/users.ts"]);
  });

  it("unsafe checkpoints are refused before any attempt is created", async () => {
    let checkpoint: EvidenceRecord | undefined;
    const { k, a1, ws1 } = await failedAttempt("c15-unsafe", "checkpoint-then-crash", async (kk, runId) => {
      checkpoint = (await kk.awaitSnapshot(runId, 5_000)).evidence!;
    });
    // A VALIDATED snapshot of a DIFFERENT run on the same Kernel.
    const r2 = await k.startRun(task("happy"));
    expect(await k.waitForRunEnd(r2.runId)).toBe("finished");
    const otherSnap = (await k.awaitSnapshot(r2.runId)).evidence!;
    expect(otherSnap.validationStatus).toBe("VALIDATED");
    const refuse = async (evidenceId: string, why: RegExp) => {
      await expect(k.retryRun(a1.runId, task("happy"), { resumeFromEvidenceId: evidenceId })).rejects.toThrow(why);
      expect(k.store.ofType("kernel.attempt_created")).toHaveLength(0);
      expect(k.runStatus(a1.runId)).toBe("failed");
    };
    await refuse("evd_doesnotexist", /unknown checkpoint/);
    await refuse(otherSnap.evidenceId, /belongs to run/);
    // Tamper with a checkpointed file after the snapshot: bytes no longer match the manifest.
    fs.writeFileSync(path.join(ws1, "src/a.ts"), "export const a = 666;\n");
    await refuse(checkpoint!.evidenceId, /checkpoint bytes changed: src\/a.ts/);
  });

  it("only a VALIDATED FILE_SNAPSHOT of the same run is a checkpoint", async () => {
    const { k, a1 } = await failedAttempt("c15-kind", "crash-after-write");
    // Attempt 2 produces a TEST_RESULT (PERSISTED) evidence — never a checkpoint.
    await k.retryRun(a1.runId, task("happy"));
    expect(await k.waitForRunEnd(a1.runId)).toBe("finished");
    const testEv = k.store.readEvidenceFromDisk().find((e) => e.evidenceType === "TEST_RESULT")!;
    await expect(k.retryRun(a1.runId, task("happy"), { resumeFromEvidenceId: testEv.evidenceId })).rejects.toThrow(/not a VALIDATED FILE_SNAPSHOT/);
  });
});
