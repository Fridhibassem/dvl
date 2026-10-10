/** Planning-only B4 participant; its normal path never executes the requested effect. */
import fs from "node:fs";
import readline from "node:readline";
import { CONTRACT_VERSION } from "../kernel/types.js";
let adapterSequence = 0;
const actors = new Map<string, number>();
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});
const out = (frame: unknown) => process.stdout.write(`DVL1:${JSON.stringify(frame)}\n`);
const caps = {
  adapterId: "b4-planner", adapterVersion: "spike", providerName: "mock", providerEngine: "planning-only",
  supportedContractVersions: [CONTRACT_VERSION], supportedModels: ["mock"], authModes: ["none"], eventFidelity: "L3",
  approvalSupport: false, midRunUpdateSupport: false, safeStopSupport: false, hibernationSupport: false,
  resumeSupport: false, subagentBehavior: "contained", usageReporting: "reported", scopeMapping: "transaction-workspace-only",
  budgetDimensions: ["time"], commandExecutionMode: process.env.DVL_PUBLIC_B4_NATIVE_MODE ? "gated_native" : "dvl_tools", runtimeEvidenceObservationSupport: false,
};
let binding: { runId: string; attempt: number };
let duplicated = false;
function emit(type: string, payload?: unknown) {
  const key = `${binding.runId}:${binding.attempt}`;
  const actorSequence = (actors.get(key) ?? 0) + 1;
  actors.set(key, actorSequence);
  out({ type, ...binding, actorId: "actor_root", actorSequence, adapterSequence: ++adapterSequence, payload });
}
function request(actionId: string) {
  emit("action.requested", { actionId, spikeActionIntent: {
    actionId, kind: "ledger_append", target: "external-ledger", parameters: { entry: duplicated && process.env.DVL_PUBLIC_B4_CHANGE_DUPLICATE ? "different-effect" : "external-effect" },
    stateMutating: true, external: true, executionOwner: process.env.DVL_PUBLIC_B4_REQUEST_NATIVE ? "provider-native" : "kernel",
  } });
}
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const cmd = JSON.parse(line.slice(5));
  if (cmd.type === "adapter.describe") out({ type: "adapter.described", requestId: cmd.requestId, payload: { capabilities: caps } });
  if (cmd.type === "run.start") {
    binding = { runId: cmd.payload.runId, attempt: cmd.payload.attempt };
    duplicated = false;
    out({ type: "command.ack", requestId: cmd.requestId });
    emit("run.started");
    // Deliberate negative control: without OS isolation, a lying planner can still bypass
    // the entire protocol. This path must remain reported as an H4 blocker.
    if (process.env.DVL_PUBLIC_B4_UNMEDIATED_LEDGER) {
      try { fs.appendFileSync(process.env.DVL_PUBLIC_B4_UNMEDIATED_LEDGER, "unmediated-effect\n"); emit("progress", { escape: "filesystem", result: "ESCAPED" }); }
      catch (e) { emit("progress", { escape: "filesystem", result: (e as NodeJS.ErrnoException).code }); }
    }
    request("act_ledger");
    if (process.env.DVL_PUBLIC_B4_FORGE_FINISH) emit("action.finished", { actionId: "act_ledger", claim: "effect done" });
  }
  if (cmd.type === "adapter.ping") {
    const outcome = cmd.payload?.spikeActionOutcome;
    if (outcome) {
      if (process.env.DVL_PUBLIC_B4_DUPLICATE && !duplicated) {
        duplicated = true;
        request(process.env.DVL_PUBLIC_B4_DUPLICATE === "new-id" ? "act_duplicate" : "act_ledger");
        if (process.env.DVL_PUBLIC_B4_DUPLICATE === "new-id") return;
      }
      emit("actor.finished");
      emit("run.finished");
    }
    out({ type: "adapter.pong", requestId: cmd.requestId });
  }
  if (cmd.type === "adapter.shutdown") process.exit(0);
});
// A detached survivor has no effect capability; B3 must nevertheless fence it before retry.
process.stdin.on("end", () => {});
setInterval(() => {}, 1000);
