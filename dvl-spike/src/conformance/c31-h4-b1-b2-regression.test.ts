/**
 * C31 — H4 review blockers B1 and B2 (regression).
 *
 * B1: an admitted action event whose payload was spooled (>32KB) keeps its action identity in
 *     the Kernel-stamped, integrity-covered envelope, so replay after a Kernel crash or adapter
 *     death still rebuilds the action as UNKNOWN and retry stays held.
 * B2: only the Kernel that owns the root may reconcile; a reader is refused with root_locked
 *     and changes nothing durable.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CommitHeads } from "../kernel/event-store.js";
import type { Kernel } from "../kernel/kernel.js";
import { RootLockError } from "../kernel/root-lock.js";
import { frame, injectFrames, kernelOn, makeKernel, startRunLenient, waitForEvent } from "./harness.js";

let kernels: Kernel[] = [];
const track = (k: Kernel) => (kernels.push(k), k);
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});

const task = (scenario: string) => ({ role: "builder", goal: scenario, acceptanceCriteria: ["mock"], scope: ["src/**"], scenario });
const BIG = "x".repeat(40 * 1024); // above the 32KB inline cap
const rootOf = (k: Kernel) => path.join(k.store.dvlDir, "..");
const logs = (root: string) => ["events/events.jsonl", "evidence/evidence.jsonl"].map((f) => fs.readFileSync(path.join(root, ".dvl", f)));

/** A live run whose admitted action.started carries an oversized (spooled) payload. */
async function spooledStart(tag: string, onCommit?: (h: CommitHeads) => void) {
  const k = track(makeKernel(tag, { onCommit }));
  k.start();
  await k.describe();
  const { runId, acked } = startRunLenient(k, "idle");
  expect(await acked).toBe(true);
  await injectFrames(k, [
    frame("run.started", runId, 1, "actor_root", { fidelity: "L3" }),
    frame("action.started", runId, 1, "actor_root", { actionId: "act_big", kind: "command", command: BIG }),
  ]);
  const stored = k.store.all().find((e) => e.origin === "adapter" && e.type === "action.started" && e.runId === runId)!;
  return { k, runId, root: rootOf(k), stored };
}

describe("C31 H4 B1 structural action identity", () => {
  it("B1.1 spooled action.started keeps its identity in the integrity-covered envelope", async () => {
    const { k, root, stored } = await spooledStart("c31-b1-envelope");
    expect(Object.keys(stored.payload as object)).toEqual(["__spooled", "__note"]); // the payload no longer names the action
    expect(stored.actionId).toBe("act_big"); // the Kernel-stamped envelope does
    await k.shutdown();

    // Durable: the on-disk record carries it, and changing it breaks the HMAC chain.
    const file = path.join(root, ".dvl", "events", "events.jsonl");
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    const idx = lines.findIndex((l) => JSON.parse(l).eventId === stored.eventId);
    expect(JSON.parse(lines[idx]!).actionId).toBe("act_big");
    expect(track(kernelOn(root)).store.integrity.events).toMatchObject({ ok: true, rejected: [] });
    lines[idx] = lines[idx]!.replace('"actionId":"act_big"', '"actionId":"act_other"');
    fs.writeFileSync(file, lines.map((l) => l + "\n").join(""));
    const tampered = track(kernelOn(root));
    expect(tampered.store.integrity.events.ok).toBe(false);
    expect(tampered.store.all().some((e) => e.eventId === stored.eventId)).toBe(false);
  });

  it("B1.2 Kernel crash after a spooled action.started: replay rebuilds act_big as UNKNOWN and retry is held", async () => {
    const commits: CommitHeads[] = [];
    const { k, runId, root, stored } = await spooledStart("c31-b1-crash", (h) => commits.push(h));
    const idx = k.store.all().indexOf(stored);
    await k.shutdown(); // the adapter is gone too
    // Durable state of a Kernel crash right after the admitted action.started.
    const cut = commits.filter((h) => h.events.count === idx + 1).at(-1)!;
    for (const [file, n] of [[k.store.eventsPath, cut.events.count], [k.store.evidencePath, cut.evidence.count]] as const) {
      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      fs.writeFileSync(file, lines.slice(0, n).map((l) => l + "\n").join(""));
    }

    const r = track(kernelOn(root, { expectedHeads: cut }));
    expect(r.store.integrity.events).toMatchObject({ ok: true, truncated: false });
    expect(r.runStatus(runId)).toBe("interrupted");
    r.start();
    await r.describe();
    expect(r.store.ofType("kernel.action_outcome_unknown").map((e) => (e.payload as { actionId: string }).actionId)).toEqual(["act_big"]);
    await expect(r.retryRun(runId, task("happy"))).rejects.toThrow(/unresolved action outcome.*act_big/);
  });

  it("B1.3 adapter death after a spooled action.started (no Kernel crash): after restart retry is still held", async () => {
    const { k, runId, root } = await spooledStart("c31-b1-adapter-death");
    await k.shutdown(); // adapter exits → run failed, act_big aborted
    expect(k.store.ofType("kernel.action_aborted").map((e) => (e.payload as { actionId: string }).actionId)).toContain("act_big");

    const r = track(kernelOn(root));
    expect(r.runStatus(runId)).toBe("failed");
    r.start();
    await r.describe();
    await expect(r.retryRun(runId, task("happy"))).rejects.toThrow(/unresolved action outcome.*act_big/);
  });
});

describe("C31 H4 B2 reconciliation requires root ownership", () => {
  it("B2.1 a reader Kernel beside the live owner is refused with root_locked and writes nothing", async () => {
    const owner = track(makeKernel("c31-b2"));
    const root = rootOf(owner);
    owner.start();
    await owner.describe();
    const id = await owner.startRun(task("h4-action-started-hold"));
    await waitForEvent(owner, (e) => e.origin === "adapter" && e.type === "action.started" && e.runId === id.runId);
    await owner.settle();
    expect(owner.ownsRoot).toBe(true);

    const reader = track(kernelOn(root));
    expect(reader.ownsRoot).toBe(false);
    expect(reader.runStatus(id.runId)).toBe("interrupted"); // its replay view of the live run
    const before = logs(root);
    let code = "";
    try {
      reader.reconcileActionOutcome(id.runId, "act_h4_probe", "CONFIRMED_NOT_DONE");
    } catch (e) {
      if (e instanceof RootLockError) code = e.code;
      else throw e;
    }
    expect(code).toBe("root_locked");
    expect(logs(root)).toEqual(before); // zero bytes in either durable log
    expect(reader.store.ofType("kernel.action_outcome_reconciled")).toHaveLength(0);
    expect(reader.ownsRoot).toBe(false);
    expect(owner.runStatus(id.runId)).toBe("running"); // the owner is unaffected
  });
});
