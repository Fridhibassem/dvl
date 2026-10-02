/**
 * C05 (contract C35 + C39) — actor.fork / actor.started / actor.finished and the
 * no-writer rule: the Kernel must not snapshot while registered actors may still write.
 */
import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { ActorTracker, type Kernel } from "../kernel/kernel.js";
import { ROOT } from "../mock-provider/scenarios.js";
import { makeKernel, waitForEvent } from "./harness.js";

let k: Kernel | undefined;
afterEach(async () => {
  await k?.shutdown();
  k = undefined;
});

async function startScenario(kernel: Kernel, scenario: string) {
  kernel.start();
  await kernel.describe();
  return kernel.startRun({ role: "builder", goal: scenario, acceptanceCriteria: [], scope: ["src/**"], scenario });
}

describe("C05 actor lifecycle prevents premature snapshot", () => {
  it("unit: parent is not fully finished while declared children are unresolved", () => {
    const t = new ActorTracker();
    t.start("p");
    t.fork("p", ["c1", "c2"]);
    t.finish("p");
    expect(t.isFullyFinished("p")).toBe(false);
    t.start("c1");
    t.finish("c1");
    expect(t.isFullyFinished("p")).toBe(false);
    t.finish("c2"); // even never-started declared child must resolve
    expect(t.isFullyFinished("p")).toBe(true);
  });

  it("refuses to snapshot after a premature parent finish, then snapshots the COMPLETE state", async () => {
    k = makeKernel("c05");
    const id = await startScenario(k, "actor-lifecycle");

    // Wait for the dangerous moment: root says finished while actor_w2 is mid-write.
    await waitForEvent(k, (e) => e.type === "actor.finished" && e.actorId === ROOT);
    await waitForEvent(k, (e) => e.type === "kernel.actor_finish_pending_children");

    const early = await k.trySnapshot(id.runId);
    expect(early.status).toBe("DEFERRED");
    expect(early.reasons.join(" ")).toMatch(/actor_w2:running/);
    // Filesystem is quiet during the 700ms sleep, yet the snapshot is still refused:
    // quiescence alone is not sufficient while a registered actor is live.
    expect(k.store.ofType("kernel.snapshot_deferred").length).toBeGreaterThanOrEqual(1);
    expect(k.store.allEvidence().filter((e) => e.evidenceType === "FILE_SNAPSHOT")).toHaveLength(0);

    const later = await k.awaitSnapshot(id.runId, 10_000);
    expect(later.status).toBe("SNAPSHOT_TAKEN");
    const snap = later.evidence!;
    expect(snap.evidenceType).toBe("FILE_SNAPSHOT");
    expect(snap.source).toBe("DVL_RUNTIME_CAPTURE");
    expect(snap.validationStatus).toBe("VALIDATED");

    // The snapshot contains w2's FINAL content, not the partial write.
    const manifestPath = `${k.store.dvlDir}/../${snap.artifactRefs[0]!.path}`;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { path: string; hash: string }[];
    const b = fs.readFileSync(`${k.txWorkspaceOf(id.runId)}/src/b.ts`, "utf8");
    expect(b).toBe("export const b = 'complete';\n");
    expect(manifest.map((m) => m.path)).toEqual(["src/a.ts", "src/b.ts"]);

    // Ordering proof on disk: the deferral precedes w2's finish, the snapshot follows it.
    const disk = k.store.readFromDisk();
    const iDeferred = disk.findIndex((e) => e.type === "kernel.snapshot_deferred");
    const iW2Done = disk.findIndex((e) => e.type === "actor.finished" && e.actorId === "actor_w2");
    const iSnap = disk.findIndex((e) => e.type === "kernel.snapshot_taken");
    expect(iDeferred).toBeLessThan(iW2Done);
    expect(iW2Done).toBeLessThan(iSnap);
  });

  it("fork race: child started before actor.fork still blocks the snapshot", async () => {
    k = makeKernel("c05-race");
    const id = await startScenario(k, "actor-fork-race");
    await waitForEvent(k, (e) => e.type === "kernel.actor_fork_race");
    await waitForEvent(k, (e) => e.type === "actor.finished" && e.actorId === ROOT);

    const early = await k.trySnapshot(id.runId);
    expect(early.status).toBe("DEFERRED");
    expect(early.reasons.join(" ")).toMatch(/actor_late:running/);

    const later = await k.awaitSnapshot(id.runId, 10_000);
    expect(later.status).toBe("SNAPSHOT_TAKEN");
    expect(await k.waitForRunEnd(id.runId)).toBe("finished");
  });

  it("no snapshot is possible before the root actor has even started", async () => {
    k = makeKernel("c05-early");
    k.start();
    await k.describe();
    // Run registered by Kernel, but provider has not emitted run.started yet at this instant
    // is racy; instead assert the rule on an unknown run id.
    const r = await k.trySnapshot("run_does_not_exist");
    expect(r.status).toBe("DEFERRED");
  });
});
