import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Kernel } from "../kernel/kernel.js";

const out = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
readline.createInterface({ input: process.stdin }).once("line", (line) => {
  void (async () => {
    const cfg = JSON.parse(line);
    const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
    const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "h4-surviving-adapter.ts");
    const k = new Kernel({ root: cfg.root, integrityKey: Buffer.from(cfg.keyHex, "hex"),
      adapterCommand: [process.execPath, "--import", loader, entry], onCommit: (commit) => out({ commit }) });
    k.start();
    await k.describe();
    const run = await k.startRun({ role: "builder", goal: "recovery survival", acceptanceCriteria: [], scope: ["**"], scenario: cfg.scenario });
    while (!k.store.ofType("action.started").length) await new Promise((r) => setTimeout(r, 10));
    out({ ready: true, run, adapterPid: k.store.ofType("kernel.adapter_spawned")[0]!.payload });
  })().catch((e) => { process.stderr.write(String(e)); process.exit(1); });
});
setInterval(() => {}, 1000);
