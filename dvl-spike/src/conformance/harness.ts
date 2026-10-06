/** Shared conformance-test harness. Not a test file itself. */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Kernel, type KernelOptions } from "../kernel/kernel.js";
import { mockProviderCommand } from "../kernel/mock-launch.js";
import type { StoredEvent } from "../kernel/types.js";

export function tempRoot(tag: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `dvl-${tag}-`));
}

/**
 * Blocker 1 — the HOST holds each project's integrity key and hands it to every Kernel it
 * creates for that root (never via env, never on disk, never to the adapter). Tests play
 * the host: one key per temp root.
 */
const hostKeys = new Map<string, Buffer>();
export function keyFor(root: string): Buffer {
  let k = hostKeys.get(root);
  if (!k) hostKeys.set(root, (k = crypto.randomBytes(32)));
  return k;
}

export function makeKernel(tag: string, extra: Partial<KernelOptions> = {}): Kernel {
  const root = tempRoot(tag);
  return new Kernel({ root, adapterCommand: mockProviderCommand(), requestTimeoutMs: 5_000, integrityKey: keyFor(root), ...extra });
}

/** Another Kernel on an existing root, as the host would create it (same integrity key). */
export function kernelOn(root: string, extra: Partial<KernelOptions> = {}): Kernel {
  return new Kernel({ root, adapterCommand: mockProviderCommand(), requestTimeoutMs: 5_000, integrityKey: keyFor(root), ...extra });
}

/** Spawn + describe + run a scenario to completion. */
export async function runScenario(k: Kernel, scenario: string, timeoutMs = 20_000) {
  k.start();
  await k.describe();
  const id = await k.startRun({ role: "builder", goal: `scenario ${scenario}`, acceptanceCriteria: ["mock"], scope: ["src/**"], scenario });
  const status = await k.waitForRunEnd(id.runId, timeoutMs);
  await k.settle();
  return { id, status };
}

export async function waitForEvent(k: Kernel, pred: (e: StoredEvent) => boolean, timeoutMs = 5_000): Promise<StoredEvent> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = k.store.all().find(pred);
    if (hit) return hit;
    if (Date.now() > deadline) throw new Error("waitForEvent timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

export function violations(k: Kernel, kind?: string) {
  return k.store
    .ofType("kernel.protocol_violation")
    .map((e) => e.payload as Record<string, unknown>)
    .filter((p) => !kind || p.kind === kind);
}

/**
 * Start a run without requiring run.start to be acknowledged. When a safety limit can halt
 * the instance before the Kernel processes the ack, startRun() rightly rejects ("adapter
 * instance terminated before replying") while the run itself exists and ends `halted`.
 * kernel.run_created is appended synchronously inside startRun, before its first await.
 */
export function startRunLenient(k: Kernel, scenario: string): { runId: string; acked: Promise<boolean> } {
  const before = k.store.all().length;
  const acked = k.startRun({ role: "builder", goal: scenario, acceptanceCriteria: ["mock"], scope: ["src/**"], scenario }).then(
    () => true,
    () => false,
  );
  const created = k.store.all().slice(before).find((e) => e.type === "kernel.run_created");
  if (!created?.runId) throw new Error("startRun did not create a run (describe() missing?)");
  return { runId: created.runId, acked };
}

/**
 * Make the CURRENT adapter instance emit exactly `frames` (mock adapter.ping injection), each
 * with a valid adapterSequence/actorSequence, and wait until the Kernel processed all of them.
 * Lets tests target any run/attempt identity from the live, correctly sequenced adapter.
 */
export async function injectFrames(k: Kernel, frames: Record<string, unknown>[]): Promise<void> {
  await (k as unknown as { request: (t: string, p: unknown) => Promise<unknown> }).request("adapter.ping", { emit: frames });
  await k.settle();
}

/** A frame for injectFrames(). */
export function frame(type: string, runId: string, attempt: number, actorId: string, payload?: Record<string, unknown>): Record<string, unknown> {
  return payload ? { type, runId, attempt, actorId, payload } : { type, runId, attempt, actorId };
}
