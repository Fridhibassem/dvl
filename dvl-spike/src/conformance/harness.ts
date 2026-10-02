/** Shared conformance-test harness. Not a test file itself. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Kernel, type KernelOptions } from "../kernel/kernel.js";
import { mockProviderCommand } from "../kernel/mock-launch.js";
import type { StoredEvent } from "../kernel/types.js";

export function tempRoot(tag: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `dvl-${tag}-`));
}

export function makeKernel(tag: string, extra: Partial<KernelOptions> = {}): Kernel {
  return new Kernel({ root: tempRoot(tag), adapterCommand: mockProviderCommand(), requestTimeoutMs: 5_000, ...extra });
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
