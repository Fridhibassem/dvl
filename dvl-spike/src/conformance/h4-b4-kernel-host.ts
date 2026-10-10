import fs from "node:fs";
import readline from "node:readline";
import { Kernel } from "../kernel/kernel.js";
import { ExternalLedgerExecutor } from "../kernel/spike-action-protocol.js";

const out = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
readline.createInterface({ input: process.stdin }).once("line", (line) => {
  void (async () => {
    const cfg = JSON.parse(line);
    let k: Kernel;
    k = new Kernel({ root: cfg.root, integrityKey: Buffer.from(cfg.keyHex, "hex"), fsync: true,
      adapterCommand: cfg.command, adapterEnv: cfg.adapterEnv,
      spikeEffectExecutor: new ExternalLedgerExecutor(cfg.ledger), onCommit: (commit) => out({ commit }),
      // Negative control reproduces effect-before-durable-action by gating the observation.
      frameGate: cfg.unmediated ? async (type) => {
        if (type !== "action.requested") return;
        while (!fs.existsSync(cfg.ledger)) await new Promise((r) => setTimeout(r, 10));
        const run = k.store.ofType("kernel.run_created")[0]!;
        out({ ready: true, run: run.payload, execution: k.store.ofType("kernel.adapter_spawned")[0]!.payload });
        await new Promise(() => {});
      } : undefined,
      spikeActionBoundary: async (boundary, action) => {
        if (cfg.boundary !== boundary) return;
        out({ ready: true, action, run: { runId: action.runId, attempt: action.attempt }, execution: k.store.ofType("kernel.adapter_spawned")[0]!.payload });
        await new Promise(() => {});
      },
    });
    k.start(); await k.describe();
    await k.startRun({ role: "builder", goal: "B4 durable-before-effect", acceptanceCriteria: [], scope: ["**"] });
  })().catch((e) => { process.stderr.write(String(e)); process.exit(1); });
});
setInterval(() => {}, 1000);
