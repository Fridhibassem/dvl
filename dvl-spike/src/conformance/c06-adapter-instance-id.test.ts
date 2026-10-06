/**
 * C06 — H1 adapterInstanceId (HARDENING.md).
 *
 * adapterSequence is only meaningful within one adapter process. The Kernel assigns
 * every process a unique adapterInstanceId, stamps it on every adapter-origin record,
 * and validates ordering per (adapterInstanceId, adapterSequence).
 */
import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { Kernel } from "../kernel/kernel.js";
import { mockProviderCommand } from "../kernel/mock-launch.js";
import type { StoredEvent } from "../kernel/types.js";
import { makeKernel, runScenario, violations, waitForEvent, kernelOn } from "./harness.js";

let k: Kernel | undefined;
afterEach(async () => {
  await k?.shutdown();
  k = undefined;
});

const adapterRecords = (es: readonly StoredEvent[]) => es.filter((e) => e.origin === "adapter");
const adapterEvents = (es: readonly StoredEvent[], aid: string) =>
  es.filter((e) => e.origin === "adapter" && e.adapterInstanceId === aid && e.adapterSequence !== undefined);
const spawnedIds = (es: readonly StoredEvent[]) =>
  es.filter((e) => e.type === "kernel.adapter_spawned").map((e) => (e.payload as { adapterInstanceId: string }).adapterInstanceId);

/** 1..n with no holes — what a conformant instance's accepted sequence looks like. */
const contiguous = (seqs: (number | undefined)[]) => seqs.length > 1 && seqs.every((s, i) => s === i + 1);

/** Run a scenario on the already-started (or restarted) current adapter instance. */
async function runOnCurrent(kernel: Kernel, scenario: string) {
  await kernel.describe();
  const id = await kernel.startRun({ role: "builder", goal: scenario, acceptanceCriteria: ["mock"], scope: ["src/**"], scenario });
  const status = await kernel.waitForRunEnd(id.runId, 20_000);
  await kernel.settle();
  return { id, status };
}

describe("C06 adapterInstanceId (H1)", () => {
  it("stamps the Kernel-assigned adapterInstanceId on every adapter-origin record, in memory and on disk", async () => {
    k = makeKernel("c06-stamp");
    const { status } = await runScenario(k, "happy");
    expect(status).toBe("finished");

    const disk = k.store.readFromDisk();
    const [aid] = spawnedIds(disk);
    expect(aid).toMatch(/^ainst_[0-9a-f]{20}$/);
    expect(k.currentAdapterInstanceId).toBe(aid);

    // Events AND response frames (adapter.described, command.ack) carry it.
    const recs = adapterRecords(disk);
    expect(recs.some((e) => e.type === "adapter.described")).toBe(true);
    expect(recs.some((e) => e.type === "run.started")).toBe(true);
    for (const e of recs) expect(e.adapterInstanceId).toBe(aid);

    // Kernel records are not adapter claims and carry no instance stamp.
    expect(disk.filter((e) => e.origin === "kernel").every((e) => e.adapterInstanceId === undefined)).toBe(true);
    // The spawn record precedes every adapter record of that instance.
    const spawnSeq = disk.find((e) => e.type === "kernel.adapter_spawned")!.kernelSequence;
    expect(recs.every((e) => e.kernelSequence > spawnSeq)).toBe(true);
    expect(violations(k)).toHaveLength(0);
  });

  it("rejects a duplicate adapterSequence within the same instance and records a protocol violation", async () => {
    k = makeKernel("c06-dup");
    const { status } = await runScenario(k, "duplicate-seq");
    expect(status).toBe("finished");
    const aid = k.currentAdapterInstanceId!;

    const dups = violations(k, "duplicate_or_reordered");
    expect(dups).toHaveLength(1);
    expect(dups[0]).toMatchObject({ adapterInstanceId: aid, adapterSequence: 1, lastAdapterSequence: 1, type: "heartbeat" });
    expect(dups[0]!.frameHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    // The duplicate was dropped: exactly one stored event holds (aid, 1), and it is run.started.
    const atOne = adapterEvents(k.store.readFromDisk(), aid).filter((e) => e.adapterSequence === 1);
    expect(atOne.map((e) => e.type)).toEqual(["run.started"]);
    expect(k.store.ofType("heartbeat")).toHaveLength(0);
    // Counter was not disturbed: run.finished at seq 2 is accepted without a gap.
    expect(violations(k, "event_gap")).toHaveLength(0);
  });

  it("allows the same adapterSequence from a new adapterInstanceId after restart", async () => {
    k = makeKernel("c06-restart");
    const a = await runScenario(k, "happy");
    expect(a.status).toBe("finished");
    const aidA = k.currentAdapterInstanceId!;

    await k.shutdown();
    k.restartAdapter();
    const aidB = k.currentAdapterInstanceId!;
    expect(aidB).not.toBe(aidA);

    const b = await runOnCurrent(k, "happy");
    expect(b.status).toBe("finished");

    const disk = k.store.readFromDisk();
    expect(spawnedIds(disk)).toEqual([aidA, aidB]);
    const seqA = adapterEvents(disk, aidA).map((e) => e.adapterSequence);
    const seqB = adapterEvents(disk, aidB).map((e) => e.adapterSequence);
    expect(contiguous(seqA)).toBe(true);
    expect(seqB).toEqual(seqA); // same sequence numbers, different instance — accepted

    // No ordering violations of any kind, including per-actor (actor_root reused across instances).
    expect(violations(k)).toHaveLength(0);

    // (adapterInstanceId, adapterSequence) is unique; adapterSequence alone is not.
    const keys = adapterRecords(disk).filter((e) => e.adapterSequence !== undefined).map((e) => `${e.adapterInstanceId}#${e.adapterSequence}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Global order across instances is kernelSequence: every A event precedes every B event.
    const lastA = Math.max(...adapterEvents(disk, aidA).map((e) => e.kernelSequence));
    const firstB = Math.min(...adapterEvents(disk, aidB).map((e) => e.kernelSequence));
    expect(lastA).toBeLessThan(firstB);
  });

  it("restart after an adapter crash: old run stays failed, new instance starts clean at sequence 1", async () => {
    k = makeKernel("c06-crash-restart");
    const a = await runScenario(k, "crash");
    expect(a.status).toBe("failed");
    await k.waitClosed(5_000);
    const aidA = k.currentAdapterInstanceId!;

    k.restartAdapter();
    const b = await runOnCurrent(k, "happy");
    expect(b.status).toBe("finished");
    expect(k.runStatus(a.id.runId)).toBe("failed"); // the new instance cannot resurrect the old run

    const aidB = k.currentAdapterInstanceId!;
    expect(contiguous(adapterEvents(k.store.all(), aidB).map((e) => e.adapterSequence))).toBe(true);
    expect(violations(k)).toHaveLength(0);
    const exited = k.store.ofType("kernel.adapter_exited").map((e) => e.payload as { adapterInstanceId: string; code: number });
    expect(exited[0]).toMatchObject({ adapterInstanceId: aidA, code: 137 });
  });

  it("a new instance whose first event is not sequence 1 is recorded as an event_gap for that instance", async () => {
    k = makeKernel("c06-first-seq");
    await runScenario(k, "happy");
    await k.shutdown();
    k.restartAdapter();
    await runOnCurrent(k, "starts-at-seven");
    const gaps = violations(k, "event_gap");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ adapterInstanceId: k.currentAdapterInstanceId, expected: 1, got: 7 });
  });

  it("refuses restart while the instance is live, and requires a fresh handshake per instance", async () => {
    k = makeKernel("c06-guards");
    await runScenario(k, "happy");
    expect(() => k!.restartAdapter()).toThrow(/still running/);
    await k.shutdown();
    k.restartAdapter();
    expect(k.capabilities).toBeNull();
    await expect(k.startRun({ role: "builder", goal: "x", acceptanceCriteria: [], scope: [] })).rejects.toThrow(/describe/);
  });

  it("an adapter-claimed adapterInstanceId is never trusted", async () => {
    k = makeKernel("c06-forged");
    const { status } = await runScenario(k, "forged-instance-id");
    expect(status).toBe("finished");
    const aid = k.currentAdapterInstanceId!;
    const v = violations(k, "adapter_instance_mismatch");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ adapterInstanceId: aid, claimed: "ainst_forged" });
    // Stored as a violation under the Kernel's id; nothing is attributed to the forged id.
    expect(k.store.all().some((e) => e.adapterInstanceId === "ainst_forged")).toBe(false);
    expect(k.store.ofType("heartbeat")[0]!.trust).toBe("protocol_violation");
    // Sequence accounting continued: no spurious gap after the rejected frame.
    expect(violations(k, "event_gap")).toHaveLength(0);
  });

  it("replay from JSONL preserves per-instance identity; legacy lines without an id still load", async () => {
    k = makeKernel("c06-replay");
    await runScenario(k, "happy");
    await k.shutdown();
    k.restartAdapter();
    await runOnCurrent(k, "happy");
    await k.shutdown();
    const root = k.store.eventsPath.replace(/[/\\].dvl[/\\]events[/\\]events\.jsonl$/, "");
    const [aidA, aidB] = spawnedIds(k.store.all());

    // Append a pre-H1 style adapter line (no adapterInstanceId) plus a torn line.
    const nextSeq = k.store.all().length + 1;
    const legacy = { eventId: "evt_legacy", kernelSequence: nextSeq, origin: "adapter", trust: "untrusted_observation", type: "heartbeat", receivedAt: new Date().toISOString(), adapterSequence: 1 };
    fs.appendFileSync(k.store.eventsPath, JSON.stringify(legacy) + "\n" + '{"eventId":"evt_torn","kernelSeq');

    const k2 = kernelOn(root); // the host hands the same project key to the new Kernel
    const replayed = k2.store.all();
    const replA = adapterEvents(replayed, aidA!).map((e) => e.adapterSequence);
    expect(contiguous(replA)).toBe(true);
    expect(adapterEvents(replayed, aidB!).map((e) => e.adapterSequence)).toEqual(replA);
    // Blocker 1: an unauthenticated (pre-integrity / hand-appended) line is quarantined — it
    // is never loaded, never merged into an instance, never trusted. The torn tail is a
    // crash artifact and is simply skipped.
    expect(replayed.some((e) => e.eventId === "evt_legacy")).toBe(false);
    expect(k2.store.integrity.events.rejected).toEqual([expect.objectContaining({ eventId: "evt_legacy", reason: "missing_mac" })]);
    expect(replayed.some((e) => e.eventId === "evt_torn")).toBe(false);

    // A Kernel restarted on the same root gets an instance id never seen in the log.
    k = k2;
    k2.start();
    const aidC = k2.currentAdapterInstanceId!;
    expect([aidA, aidB]).not.toContain(aidC);
    await runOnCurrent(k2, "happy");
    expect(contiguous(adapterEvents(k2.store.all(), aidC).map((e) => e.adapterSequence))).toBe(true);
    expect(violations(k2)).toHaveLength(0);
  });

  it("two runs in the same adapter process keep one increasing adapterSequence", async () => {
    k = makeKernel("c06-two-runs");
    const r1 = await runScenario(k, "happy");
    const r2 = await (async () => {
      const id = await k!.startRun({ role: "builder", goal: "second run", acceptanceCriteria: ["mock"], scope: ["src/**"], scenario: "happy" });
      const status = await k!.waitForRunEnd(id.runId, 20_000);
      await k!.settle();
      return { id, status };
    })();
    expect([r1.status, r2.status]).toEqual(["finished", "finished"]);

    const aid = k.currentAdapterInstanceId!;
    const evs = adapterEvents(k.store.readFromDisk(), aid);
    const seq1 = evs.filter((e) => e.runId === r1.id.runId).map((e) => e.adapterSequence!);
    const seq2 = evs.filter((e) => e.runId === r2.id.runId).map((e) => e.adapterSequence!);
    expect(contiguous(seq1)).toBe(true);
    expect(seq2[0]).toBe(seq1.at(-1)! + 1); // no reset at the run boundary
    expect(contiguous(evs.map((e) => e.adapterSequence))).toBe(true); // one sequence across the process
    // actorSequence is per run, so actor_root restarting at 1 in run 2 is not a violation.
    expect(violations(k)).toHaveLength(0);
  });

  it("fences a retired adapter instance: its late events are rejected and cannot complete its run", async () => {
    let hold = false;
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    k = makeKernel("c06-fence", {
      // Hold the old instance's event frames in the queue (responses pass, so run.start is acked).
      frameGate: async (type) => {
        if (hold && !["command.ack", "adapter.described", "adapter.pong"].includes(type)) await released;
      },
    });
    k.start();
    await k.describe();
    const aidA = k.currentAdapterInstanceId!;
    hold = true;
    const runA = await k.startRun({ role: "builder", goal: "fenced", acceptanceCriteria: ["mock"], scope: ["src/**"], scenario: "happy" });

    // Wait until A has written its whole scenario: frames are drained into the queue
    // (framesReceived) but held unprocessed behind the gate.
    let last = -1;
    for (let stableSince = Date.now(), deadline = Date.now() + 5_000; Date.now() < deadline; ) {
      const n = k.transportStats!.framesReceived;
      if (n !== last) [last, stableSince] = [n, Date.now()];
      else if (n > 2 && Date.now() - stableSince > 200) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(last).toBeGreaterThan(2); // described + ack + queued events

    // Retire A while its events (incl. run.finished) are still queued behind the gate.
    k.restartAdapter({ force: true });
    const aidB = k.currentAdapterInstanceId!;
    expect(aidB).not.toBe(aidA);
    expect(k.runStatus(runA.runId)).toBe("failed");
    hold = false;
    release();
    await waitForEvent(k, (e) => e.type === "kernel.adapter_exited" && (e.payload as { stale?: boolean }).stale === true);

    const all = k.store.all();
    const retiredAt = all.find((e) => e.type === "kernel.adapter_instance_retired")!.kernelSequence;
    const stale = violations(k, "stale_adapter_instance");
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.every((v) => v.adapterInstanceId === aidA && v.currentAdapterInstanceId === aidB)).toBe(true);
    // Every A record after retirement is a fenced violation — nothing applied as an observation.
    const lateA = all.filter((e) => e.origin === "adapter" && e.adapterInstanceId === aidA && e.kernelSequence > retiredAt);
    expect(lateA.length).toBe(stale.length);
    expect(lateA.every((e) => e.trust === "protocol_violation")).toBe(true);
    // A's late run.finished could not produce a false completion.
    expect(lateA.some((e) => e.type === "run.finished")).toBe(true);
    expect(k.runStatus(runA.runId)).toBe("failed");
    expect(all.some((e) => e.type === "kernel.run_finished" && e.runId === runA.runId)).toBe(false);

    // The live instance is unaffected by A's late frames and late exit.
    const b = await runOnCurrent(k, "happy");
    expect(b.status).toBe("finished");
    expect(violations(k).filter((v) => v.kind !== "stale_adapter_instance")).toHaveLength(0);
  });

  it("adapter crash with an active child actor and action does not deadlock the snapshot gate", async () => {
    k = makeKernel("c06-orphans", { quiescenceMs: 100 });
    const { id, status } = await runScenario(k, "crash-with-child");
    expect(status).toBe("failed");
    await k.waitClosed(5_000);

    // Orphans are terminated with abort semantics, never success.
    const abortedActions = k.store.ofType("kernel.action_aborted").map((e) => e.payload as Record<string, unknown>);
    expect(abortedActions).toEqual([expect.objectContaining({ actionId: "act_orphan", actorId: "actor_child" })]);
    const abortedActors = k.store.ofType("kernel.actor_aborted").map((e) => (e.payload as { actorId: string }).actorId).sort();
    expect(abortedActors).toEqual(["actor_child", "actor_root"]);
    expect(k.store.all().some((e) => e.type === "action.finished" || e.type === "actor.finished")).toBe(false);
    expect(k.store.ofType("kernel.run_finished")).toHaveLength(0);

    // Gate opens: no unresolved writers remain, so the Kernel can snapshot what the dead adapter left.
    expect(k.noWriterReasons(id.runId).filter((r) => !r.startsWith("filesystem not quiescent"))).toEqual([]);
    const snap = await k.awaitSnapshot(id.runId, 5_000);
    expect(snap.status).toBe("SNAPSHOT_TAKEN");
    expect(snap.evidence!.statusReason).toMatch(/run status failed, actors aborted by adapter termination: .*actor_child/);
    expect(k.runStatus(id.runId)).toBe("failed");
  });

  it("actorSequence is scoped per adapterInstanceId: B restarts worker-main at 1 after A crashed", async () => {
    k = makeKernel("c06-actor-scope");
    // Instance A: actor.started worker-main with actorSequence 1, then crash.
    const a = await runScenario(k, "worker-start-crash");
    expect(a.status).toBe("failed");
    await k.waitClosed(5_000);
    const aidA = k.currentAdapterInstanceId!;

    // Instance B: its own worker-main stream, again starting at actorSequence 1.
    k.restartAdapter();
    const b = await runOnCurrent(k, "worker-start-finish");
    expect(b.status).toBe("finished");
    const aidB = k.currentAdapterInstanceId!;

    const started = k.store
      .readFromDisk()
      .filter((e) => e.type === "actor.started" && e.actorId === "worker-main")
      .map((e) => ({ aid: e.adapterInstanceId, seq: e.actorSequence, trust: e.trust }));
    expect(started).toEqual([
      { aid: aidA, seq: 1, trust: "untrusted_observation" },
      { aid: aidB, seq: 1, trust: "untrusted_observation" },
    ]);
    expect(violations(k, "actor_sequence_gap")).toHaveLength(0);
    expect(violations(k)).toHaveLength(0);
    // A's worker-main was aborted when A died, never reported finished by A.
    expect(k.store.ofType("kernel.actor_aborted").map((e) => e.payload)).toContainEqual(expect.objectContaining({ actorId: "worker-main", adapterInstanceId: aidA }));
  });

  it("kill is never sent to an adapter process that has already exited", async () => {
    k = makeKernel("c06-safe-kill");
    await runScenario(k, "crash");
    await k.waitClosed(5_000);
    const child = (k as unknown as { child: import("node:child_process").ChildProcess }).child;
    expect(child.exitCode ?? child.signalCode).not.toBeNull();
    const realKill = process.kill;
    const calls: unknown[] = [];
    process.kill = ((pid: number, sig?: string | number) => (calls.push([pid, sig]), true)) as typeof process.kill;
    const childKill = child.kill.bind(child);
    child.kill = ((sig?: NodeJS.Signals | number) => (calls.push(["child", sig]), childKill(sig))) as typeof child.kill;
    try {
      // Every Kernel path that can kill: forced restart is not reachable (closed), so drive kill() directly.
      (k as unknown as { kill: (s: NodeJS.Signals) => void }).kill("SIGKILL");
      await k.shutdown();
    } finally {
      process.kill = realKill;
      child.kill = childKill;
    }
    expect(calls).toEqual([]);
  });
});
