/** Host fixture for migration from a historical, unconfined executor.
 * Deliberately seeds OLD durable history; current Kernel launch is always confined.
 * This is not a provider launch option or a production bypass.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Kernel } from "../kernel/kernel.js";
import { mockProviderCommand } from "../kernel/mock-launch.js";
import { recoveryProcessOps } from "../kernel/recovery-process.js";

const out = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
readline.createInterface({ input: process.stdin }).once("line", (line) => {
  void (async () => {
    const cfg = JSON.parse(line);
    const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
    const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "h4-surviving-adapter.ts");
    const k = new Kernel({ root: cfg.root, integrityKey: Buffer.from(cfg.keyHex, "hex"), fsync: true,
      adapterCommand: mockProviderCommand(), onCommit: (commit) => out({ commit }) });
    (k as unknown as { acquireRoot(): void }).acquireRoot(); // seed history under the real exclusive host lock
    const old = spawn(process.execPath, ["--import", loader, entry], { detached: true, stdio: ["pipe", "pipe", "pipe"] });
    let birth = recoveryProcessOps.birth(old.pid!);
    while (!birth) { await new Promise((r) => setTimeout(r, 5)); birth = recoveryProcessOps.birth(old.pid!); }
    const execution = { adapterInstanceId: "historical-survivor", pid: old.pid, processGroupId: old.pid, platform: process.platform, processBirth: birth };
    const run = { projectId: "historical-project", taskId: "historical-task", workerId: "historical-worker", runId: "historical-run", attempt: 1,
      workspaceId: "historical-workspace", decisionSnapshotVersion: 1, decisionSnapshotHash: "historical-decisions" };
    const ws = path.join(cfg.root, ".dvl/tx", run.runId, "attempt-1"); fs.mkdirSync(ws, { recursive: true });
    k.store.append({ origin: "kernel", trust: "kernel_truth", type: "kernel.adapter_spawned", payload: execution });
    k.store.append({ origin: "kernel", trust: "kernel_truth", type: "kernel.run_created", runId: run.runId, attempt: 1,
      payload: { ...run, adapterInstanceId: execution.adapterInstanceId, txWorkspace: path.relative(cfg.root, ws) } });
    readline.createInterface({ input: old.stdout }).on("line", (raw) => {
      const frame = JSON.parse(raw.slice(5));
      if (frame.type !== "run.started" && frame.type !== "action.started") return;
      k.store.append({ origin: "adapter", trust: "untrusted_observation", type: frame.type, runId: run.runId, attempt: 1,
        adapterInstanceId: execution.adapterInstanceId, actorId: "actor_root", actorSequence: frame.actorSequence,
        adapterSequence: frame.adapterSequence, actionId: frame.payload?.actionId, payload: frame.payload });
      if (frame.type === "action.started") out({ ready: true, run, adapterPid: execution });
    });
    old.stdin.write(`DVL1:${JSON.stringify({ type: "run.start", requestId: "historical-start", payload: { ...run, scenario: cfg.scenario, transactionWorkspaceRoot: ws } })}\n`);
  })().catch((e) => { process.stderr.write(String(e)); process.exit(1); });
});
setInterval(() => {}, 1000);
