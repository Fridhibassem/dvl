import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import readline from "node:readline";
import { Kernel } from "../kernel/kernel.js";
import { ExternalLedgerExecutor } from "../kernel/spike-action-protocol.js";

const out = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
readline.createInterface({ input: process.stdin }).once("line", (line) => {
  void (async () => {
    const cfg = JSON.parse(line);
    let k: Kernel;
    k = new Kernel({ root: cfg.root, integrityKey: Buffer.from(cfg.keyHex, "hex"), fsync: true,
      adapterCommand: cfg.command,
      providerConfinement: { codeReadPaths: [path.join(path.dirname(fileURLToPath(import.meta.url)), "../../package.json"), path.dirname(fileURLToPath(import.meta.url)), path.join(path.dirname(fileURLToPath(import.meta.url)), "../kernel/types.ts"), path.dirname(path.dirname(path.dirname(createRequire(import.meta.url).resolve("tsx"))))], publicEnv: cfg.adapterEnv },
      spikeEffectExecutor: new ExternalLedgerExecutor(cfg.ledger), onCommit: (commit) => out({ commit }),
      // Negative control reproduces effect-before-durable-action by gating the observation.
      frameGate: cfg.unmediated ? async (type) => {
        if (type !== "action.requested") return;
        // The confined provider attempted and was denied the direct effect before proposing.
        if (fs.existsSync(cfg.ledger)) throw new Error("provider escaped confinement");
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
