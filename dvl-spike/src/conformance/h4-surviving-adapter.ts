/** Adversarial executor: keeps its process group and an unreported writer after stdin EOF. */
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { CONTRACT_VERSION } from "../kernel/types.js";

let sequence = 0;
let actorSequence = 0;
let exitWithLeader = false;
process.stdout.on("error", () => {}); // losing the dead Kernel's pipe must not kill the executor
process.stderr.on("error", () => {});
const out = (frame: unknown) => process.stdout.write(`DVL1:${JSON.stringify(frame)}\n`);
const caps = {
  adapterId: "surviving-adapter", adapterVersion: "test", providerName: "mock", providerEngine: "adversarial",
  supportedContractVersions: [CONTRACT_VERSION], supportedModels: ["mock"], authModes: ["none"],
  eventFidelity: "L3", approvalSupport: false, midRunUpdateSupport: false, safeStopSupport: false,
  hibernationSupport: false, resumeSupport: false, subagentBehavior: "contained", usageReporting: "reported",
  scopeMapping: "transaction-workspace-only", budgetDimensions: ["time"], commandExecutionMode: "gated_native",
  runtimeEvidenceObservationSupport: false,
};
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const cmd = JSON.parse(line.slice("DVL1:".length));
  if (cmd.type === "adapter.describe") out({ type: "adapter.described", requestId: cmd.requestId, payload: { capabilities: caps } });
  if (cmd.type === "run.start") {
    out({ type: "command.ack", requestId: cmd.requestId });
    const emit = (type: string, payload?: unknown) => out({ type, runId: cmd.payload.runId, attempt: cmd.payload.attempt,
      actorId: "actor_root", actorSequence: ++actorSequence, adapterSequence: ++sequence, payload });
    emit("run.started");
    emit("action.started", { actionId: "act_survivor", kind: "command" });
    exitWithLeader = cmd.payload.scenario === "leader-exits";
    // Inherit the adapter's process group. Killing/checking only the leader misses this writer.
    const writer = spawn(process.execPath, ["-e", `const fs=require('fs'); setInterval(()=>fs.appendFileSync(process.argv[1], 'late\\n'), 25);`,
      path.join(cmd.payload.transactionWorkspaceRoot, "late.txt")], { stdio: "ignore" });
    writer.unref();
  }
  if (cmd.type === "adapter.shutdown") process.exit(0);
});
process.stdin.on("end", () => { if (exitWithLeader) process.exit(0); });
setInterval(() => {}, 1000);
