/**
 * `npm run spike` — end-to-end demonstration of the Phase 1 contract loop.
 *
 * For each scenario: spawn Mock Provider → adapter.describe → run.start →
 * drain/ingest → (snapshot under no-writer rule) → shutdown → print summary.
 * Artifacts are kept under ./.spike-runs/<timestamp>/<scenario>/.dvl for inspection.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Kernel } from "./kernel/kernel.js";
import { mockProviderCommand } from "./kernel/mock-launch.js";

const SCENARIOS = ["happy", "noisy", "oversized-spooled", "oversized-inline", "corrupted-artifact", "actor-lifecycle", "protocol-abuse", "crash"];

async function runOne(base: string, scenario: string) {
  const root = path.join(base, scenario);
  fs.mkdirSync(root, { recursive: true });
  const k = new Kernel({ root, adapterCommand: mockProviderCommand(), fsync: true, integrityKey: crypto.randomBytes(32), onCommit: () => {} });
  const t0 = Date.now();
  k.start();
  const caps = await k.describe();
  const id = await k.startRun({ role: "builder", goal: `spike ${scenario}`, acceptanceCriteria: ["mock"], scope: ["src/**"], scenario });

  let snapshot = "-";
  if (scenario === "actor-lifecycle") {
    // Probe immediately: the Kernel must refuse while actors may write.
    await new Promise((r) => setTimeout(r, 150));
    const early = await k.trySnapshot(id.runId);
    const late = await k.awaitSnapshot(id.runId, 10_000);
    snapshot = `${early.status} → ${late.status}`;
  }
  const status = await k.waitForRunEnd(id.runId, 20_000);
  await k.settle();
  await k.shutdown();

  const events = k.store.readFromDisk();
  const evidence = k.store.readEvidenceFromDisk();
  const viol = events.filter((e) => e.type === "kernel.protocol_violation" || e.type === "kernel.truth_violation");
  const spoolFiles = fs.readdirSync(k.store.spoolDir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;
  const s = k.transportStats!;
  return {
    scenario,
    adapter: `${caps.adapterId}/${caps.commandExecutionMode}/${caps.eventFidelity}`,
    run: status,
    events: events.length,
    evidence: evidence.map((e) => `${e.evidenceType}:${e.validationStatus}`).join(", ") || "-",
    violations: viol.length,
    noise: s.noiseLines,
    stderrKB: Math.round(s.stderrBytes / 1024),
    spool: spoolFiles,
    snapshot,
    ms: Date.now() - t0,
  };
}

async function main() {
  const base = path.resolve(".spike-runs", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(base, { recursive: true });
  console.log(`DVL Phase 1 Spike — contract dvl.provider-core/0.3.2`);
  console.log(`output: ${path.relative(process.cwd(), base)}\n`);
  const rows = [];
  let failed = 0;
  for (const sc of SCENARIOS) {
    try {
      rows.push(await runOne(base, sc));
    } catch (e) {
      failed++;
      console.error(`✗ ${sc}: ${(e as Error).message}`);
    }
  }
  console.table(rows);

  const expected: Record<string, string> = { crash: "failed" };
  const wrong = rows.filter((r) => r.run !== (expected[r.scenario] ?? "finished"));
  const lifecycle = rows.find((r) => r.scenario === "actor-lifecycle");
  if (lifecycle && lifecycle.snapshot !== "DEFERRED → SNAPSHOT_TAKEN") wrong.push(lifecycle);
  if (failed || wrong.length) {
    console.error(`\nSPIKE FAILED: ${failed} errors, ${wrong.length} unexpected outcomes`);
    process.exit(1);
  }
  console.log("\nSPIKE OK — every scenario reached its expected terminal state.");
  console.log(`Inspect: ${path.relative(process.cwd(), base)}/<scenario>/.dvl/{events,evidence,spool}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
