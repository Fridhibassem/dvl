/**
 * C02 — happy path with ordered events, plus ordering/trust abuse (§19, §46, §6, C13).
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Kernel } from "../kernel/kernel.js";
import { makeKernel, runScenario, violations } from "./harness.js";

let k: Kernel | undefined;
afterEach(async () => {
  await k?.shutdown();
  k = undefined;
});

describe("C02 happy path with ordered events", () => {
  it("receives a gap-free, strictly increasing adapterSequence and persists it to JSONL", async () => {
    k = makeKernel("c02");
    const { status } = await runScenario(k, "happy");
    expect(status).toBe("finished");

    const disk = k.store.readFromDisk();
    const adapterEvents = disk.filter((e) => e.origin === "adapter" && e.adapterSequence !== undefined);
    const seqs = adapterEvents.map((e) => e.adapterSequence!);
    expect(seqs.length).toBeGreaterThan(5);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));

    // kernelSequence is a strict total order over everything on disk.
    const ks = disk.map((e) => e.kernelSequence);
    expect(ks).toEqual(ks.map((_, i) => i + 1));

    // Every adapter event carries the §46 envelope.
    for (const e of adapterEvents) {
      expect(e.actorId).toBeTruthy();
      expect(e.actorSequence).toBeGreaterThan(0);
      expect(e.runId).toBeTruthy();
      expect(e.attempt).toBe(1);
    }
    expect(adapterEvents[0]!.type).toBe("run.started");
    expect(adapterEvents.at(-1)!.type).toBe("run.finished");
    expect(violations(k)).toHaveLength(0);
  });

  it("creates a basic EvidenceRecord from action.finished — bounded trust, never VALIDATED", async () => {
    k = makeKernel("c02-evidence");
    const { id } = await runScenario(k, "happy");
    const ev = k.store.readEvidenceFromDisk();
    const test = ev.find((e) => e.evidenceType === "TEST_RESULT");
    expect(test).toBeDefined();
    expect(test!.runId).toBe(id.runId);
    expect(test!.source).toBe("PROVIDER_HARNESS_RECORD");
    expect(test!.validationStatus).toBe("PERSISTED");
    expect(test!.integrityHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // The provider's "All tests passed. Verified. PASS." message created nothing.
    expect(ev.every((e) => e.validationStatus !== "VALIDATED")).toBe(true);
    expect(k.store.all().some((e) => e.type === "provider.message" && e.trust === "untrusted_observation")).toBe(true);
  });

  it("drops duplicates, records gaps, flags forbidden truth events and unknown types", async () => {
    k = makeKernel("c02-abuse");
    const { status } = await runScenario(k, "protocol-abuse");
    expect(status).toBe("finished");

    expect(violations(k, "duplicate_or_reordered")).toHaveLength(1);
    const gaps = violations(k, "event_gap");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ expected: 2, got: 5, errorClass: "event_gap" });
    expect(violations(k, "missing_envelope_fields")).toHaveLength(1);

    // INV-5: adapter cannot create truth by emission.
    expect(k.store.ofType("kernel.truth_violation")).toHaveLength(1);
    const forged = k.store.ofType("evidence.validated")[0]!;
    expect(forged.trust).toBe("protocol_violation");
    expect(k.store.allEvidence()).toHaveLength(0);

    // §56: unknown events are stored but not trusted.
    const unknown = k.store.ofType("x.provider.custom_thing")[0]!;
    expect(unknown.trust).toBe("protocol_violation");
  });

  it("adapter death mid-run → run failed (provider_unavailable), never finished", async () => {
    k = makeKernel("c02-crash");
    const { status } = await runScenario(k, "crash");
    expect(status).toBe("failed");
    const f = k.store.ofType("kernel.run_failed")[0]!;
    expect((f.payload as { errorClass: string }).errorClass).toBe("provider_unavailable");
    expect(k.store.ofType("kernel.run_finished")).toHaveLength(0);
  });
});
