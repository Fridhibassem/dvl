/**
 * C28 — H4 split-brain fence: exclusive single-Kernel ownership of a project root.
 *
 * Invariant: at most one live Kernel owns a root. Ownership is an OS-backed lock held by the
 * Kernel PROCESS: a second Kernel is refused while the owner lives, running or paused, and
 * writes nothing (no interruption or recovery record, no byte in either log). The lock goes
 * away with the owner process, so after SIGKILL a freshly opened Kernel takes over.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import type { CommitHeads } from "../kernel/event-store.js";
import type { Kernel } from "../kernel/kernel.js";
import { RootLock, RootLockError } from "../kernel/root-lock.js";
import type { RunIdentity } from "../kernel/types.js";
import { keyFor, kernelOn, makeKernel, tempRoot } from "./harness.js";

const here = path.dirname(fileURLToPath(import.meta.url));

let kernels: Kernel[] = [];
let hosts: ChildProcess[] = [];
const track = (k: Kernel) => (kernels.push(k), k);
afterEach(async () => {
  for (const h of hosts) {
    h.kill("SIGCONT");
    h.kill("SIGKILL");
  }
  hosts = [];
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});

/** A live owner Kernel in its own process, mid-run (h4-kernel-host). */
async function liveOwner(root: string, scenario = "h4-target-probe") {
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
  const host = spawn(process.execPath, ["--import", tsx, path.join(here, "h4-kernel-host.ts")], { stdio: ["pipe", "pipe", "pipe"] });
  hosts.push(host);
  let stderr = "";
  host.stderr.on("data", (d) => (stderr += d));
  host.stdin.write(JSON.stringify({ root, keyHex: keyFor(root).toString("hex"), scenario }) + "\n");
  const state = { heads: undefined as CommitHeads | undefined, run: undefined as RunIdentity | undefined, adapterPid: 0 };
  const lines = readline.createInterface({ input: host.stdout });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`owner never became ready; stderr:\n${stderr}`)), 20_000);
    host.once("exit", (code) => reject(new Error(`owner exited early (${code}); stderr:\n${stderr}`)));
    lines.on("line", (line) => {
      const msg = JSON.parse(line) as { commit?: CommitHeads; run?: RunIdentity; adapterPid?: number; ready?: boolean };
      if (msg.commit) state.heads = msg.commit;
      if (msg.run) ({ run: state.run, adapterPid: state.adapterPid } = msg as Required<typeof msg>);
      if (msg.ready) {
        clearTimeout(t);
        resolve();
      }
    });
  });
  const exited = new Promise<void>((r) => host.once("exit", () => r()));
  return { host, state, exited };
}

const logBytes = (root: string) => ["events/events.jsonl", "evidence/evidence.jsonl"].map((f) => fs.readFileSync(path.join(root, ".dvl", f)));
const lockCode = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof RootLockError) return e.code;
    throw e;
  }
  throw new Error("expected a RootLockError");
};

/** A second Kernel against a live owner: refused for start AND recovery, zero bytes written. */
function expectRefusedWithoutWrites(root: string, heads: CommitHeads | undefined, runId: string) {
  const before = logBytes(root);
  const k = track(kernelOn(root, { expectedHeads: heads }));
  expect(lockCode(() => k.start())).toBe("root_locked");
  expect(lockCode(() => k.recoverDurableTail())).toBe("root_locked");
  expect(k.ownsRoot).toBe(false);
  expect(k.store.ofType("kernel.run_interrupted")).toHaveLength(0);
  expect(k.store.ofType("kernel.durable_recovery")).toHaveLength(0);
  expect(logBytes(root)).toEqual(before);
  // Its replayed view still never claims completion; it simply may not act on it.
  expect(k.runStatus(runId)).toBe("interrupted");
}

describe("C28 H4 single-Kernel root ownership", () => {
  it("1. a started Kernel owns its root; shutdown releases it to a fresh Kernel only", async () => {
    const k = track(makeKernel("c28-owner"));
    const root = path.join(k.store.dvlDir, "..");
    expect(k.ownsRoot).toBe(false); // constructing (replaying) does not take ownership
    const early = track(kernelOn(root)); // replays now, before the owner writes anything
    k.start();
    expect(k.ownsRoot).toBe(true);
    await k.shutdown();
    expect(k.ownsRoot).toBe(false);
    // The owner appended after `early` replayed: continuing from that head would fork the chain.
    const before = logBytes(root);
    expect(lockCode(() => early.start())).toBe("stale_replay");
    expect(logBytes(root)).toEqual(before);
    const next = track(kernelOn(root));
    next.start();
    expect(next.ownsRoot).toBe(true);
  });

  it("2. a second Kernel is refused while the first is alive, and writes nothing", async () => {
    const root = tempRoot("c28-live");
    const owner = await liveOwner(root);
    expectRefusedWithoutWrites(root, owner.state.heads, owner.state.run!.runId);
    // The lock is the file's inode, not the path used to reach it.
    const alias = path.join(tempRoot("c28-alias"), "link");
    fs.symlinkSync(root, alias);
    expect(lockCode(() => RootLock.acquire(alias))).toBe("root_locked");
  });

  it("3. a paused (SIGSTOP) owner still blocks takeover", async () => {
    const root = tempRoot("c28-paused");
    const owner = await liveOwner(root);
    owner.host.kill("SIGSTOP");
    expectRefusedWithoutWrites(root, owner.state.heads, owner.state.run!.runId);
  });

  it("4. after the owner is SIGKILLed a fresh Kernel takes over; the owner's live adapter child holds no lock", async () => {
    const root = tempRoot("c28-takeover");
    const owner = await liveOwner(root);
    const adapter = owner.state.adapterPid;
    process.kill(adapter, "SIGSTOP"); // keep the child alive through the takeover
    owner.host.kill("SIGKILL");
    await owner.exited;
    expect(() => process.kill(adapter, 0)).not.toThrow(); // still alive
    onTestFinished(() => {
      try { process.kill(-adapter, "SIGKILL"); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e; }
    });
    const runId = owner.state.run!.runId;
    const k = track(kernelOn(root, { expectedHeads: owner.state.heads }));
    k.start();
    expect(k.ownsRoot).toBe(true);
    expect(k.runStatus(runId)).toBe("interrupted");
    expect(k.store.ofType("kernel.run_interrupted").filter((e) => e.runId === runId)).toHaveLength(1);
  });

  it("5. a non-owner Kernel cannot reconcile an UNKNOWN action or write Kernel Truth", async () => {
    const root = tempRoot("c28-reconcile-owner");
    const owner = await liveOwner(root, "h4-action-started-hold");

    const runId = owner.state.run!.runId;
    const before = logBytes(root);

    const reader = track(kernelOn(root, { expectedHeads: owner.state.heads }));
    expect(reader.runStatus(runId)).toBe("interrupted");

    expect(
      lockCode(() => reader.reconcileActionOutcome(runId, "act_h4_probe", "CONFIRMED_NOT_DONE")),
    ).toBe("root_locked");

    expect(reader.ownsRoot).toBe(false);
    expect(reader.store.ofType("kernel.action_outcome_reconciled").filter((e) => e.runId === runId)).toHaveLength(0);
    expect(logBytes(root)).toEqual(before);
  });


});
