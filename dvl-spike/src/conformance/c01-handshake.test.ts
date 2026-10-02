/**
 * C01 — handshake and capability declaration (§10, §53).
 */
import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { Kernel } from "../kernel/kernel.js";
import { CONTRACT_VERSION, REQUIRED_CAPABILITY_FIELDS } from "../kernel/types.js";
import { makeKernel } from "./harness.js";

let k: Kernel | undefined;
afterEach(async () => {
  await k?.shutdown();
  k = undefined;
});

describe("C01 handshake and capability declaration", () => {
  it("spawns the Mock Provider as a child process and completes adapter.describe", async () => {
    k = makeKernel("c01");
    k.start();
    const caps = await k.describe();

    const spawned = k.store.ofType("kernel.adapter_spawned")[0]!;
    expect((spawned.payload as { pid: number }).pid).toBeGreaterThan(0);
    expect((spawned.payload as { pid: number }).pid).not.toBe(process.pid);

    for (const f of REQUIRED_CAPABILITY_FIELDS) expect(caps[f], `missing ${f}`).toBeDefined();
    expect(caps.supportedContractVersions).toContain(CONTRACT_VERSION);
    expect(caps.commandExecutionMode).toBe("gated_native");
    // Honest declaration: Phase 1 mock does not implement approvals/hibernation.
    expect(caps.approvalSupport).toBe(false);
    expect(caps.hibernationSupport).toBe(false);
  });

  it("persists the handshake to JSONL in causal order (command_sent → described → accepted)", async () => {
    k = makeKernel("c01-persist");
    k.start();
    await k.describe();
    await k.settle();

    expect(fs.existsSync(k.store.eventsPath)).toBe(true);
    const types = k.store.readFromDisk().map((e) => e.type);
    const iSent = types.indexOf("kernel.command_sent");
    const iDescribed = types.indexOf("adapter.described");
    const iAccepted = types.indexOf("kernel.capabilities_accepted");
    expect(iSent).toBeGreaterThanOrEqual(0);
    expect(iSent).toBeLessThan(iDescribed);
    expect(iDescribed).toBeLessThan(iAccepted);
  });

  it("rejects an incomplete capability declaration (unsupported must be reported, not faked)", async () => {
    k = makeKernel("c01-incomplete", { adapterEnv: { DVL_MOCK_DESCRIBE: "incomplete" } });
    k.start();
    await expect(k.describe()).rejects.toThrow(/missing .*eventFidelity|missing .*commandExecutionMode/);
    expect(k.capabilities).toBeNull();
    expect(k.store.ofType("kernel.capabilities_rejected")).toHaveLength(1);
  });

  it("rejects an adapter that does not support the frozen contract version", async () => {
    k = makeKernel("c01-version", { adapterEnv: { DVL_MOCK_DESCRIBE: "wrong-version" } });
    k.start();
    await expect(k.describe()).rejects.toThrow(/does not support/);
  });

  it("times out (normalized 'timeout') when the adapter never answers", async () => {
    k = makeKernel("c01-silent", { adapterEnv: { DVL_MOCK_DESCRIBE: "silent" }, requestTimeoutMs: 500 });
    k.start();
    await expect(k.describe()).rejects.toThrow(/timed out/);
    const t = k.store.ofType("kernel.request_timeout")[0]!;
    expect((t.payload as { errorClass: string }).errorClass).toBe("timeout");
  });

  it("refuses run.start before a successful handshake", async () => {
    k = makeKernel("c01-order");
    k.start();
    await expect(k.startRun({ role: "x", goal: "x", acceptanceCriteria: [], scope: [] })).rejects.toThrow(/describe\(\) must succeed/);
  });
});
