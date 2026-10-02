/**
 * Deterministic Mock Provider + Adapter (§52), run as a child process.
 *
 * stdin  ← DVL1 command frames from the Kernel
 * stdout → DVL1 event frames (+ deliberate noise in some scenarios)
 * stderr → diagnostics (Kernel spools them)
 *
 * Env:
 *   DVL_PROJECT_ROOT   — set by Kernel; spool lives at <root>/.dvl/spool
 *   DVL_MOCK_DESCRIBE  — "incomplete" | "wrong-version" | "silent" to test C01 failure paths
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { encodeFrame, LineSplitter, parseLine } from "../kernel/frame.js";
import { CONTRACT_VERSION, type AdapterCapabilities, type ArtifactRef } from "../kernel/types.js";
import { SCENARIOS, type Step } from "./scenarios.js";

const PROJECT_ROOT = process.env.DVL_PROJECT_ROOT ?? process.cwd();
/** H2: the Kernel-assigned untrusted area for THIS adapter instance. No fallback. */
const SPOOL_DIR = process.env.DVL_ADAPTER_SPOOL_DIR;

const CAPABILITIES: AdapterCapabilities = {
  adapterId: "mock-adapter",
  adapterVersion: "0.1.0",
  providerName: "mock",
  providerEngine: "deterministic-script",
  supportedContractVersions: [CONTRACT_VERSION],
  supportedModels: ["mock-1"],
  authModes: ["none"],
  eventFidelity: "L3",
  approvalSupport: false, // not implemented in Phase 1 — declared honestly (INV-19/20)
  midRunUpdateSupport: false,
  safeStopSupport: false,
  hibernationSupport: false,
  resumeSupport: false,
  subagentBehavior: "contained",
  usageReporting: "reported",
  scopeMapping: "transaction-workspace-only",
  budgetDimensions: ["time"],
  commandExecutionMode: "gated_native",
  runtimeEvidenceObservationSupport: false,
};

// ───────────── output with backpressure ─────────────
// The mock honors stdout backpressure. If the Kernel stopped draining, this would
// block forever — which is exactly what C03/C04 flood tests detect via timeout.

function writeOut(s: string): Promise<void> {
  return new Promise((resolve) => {
    if (process.stdout.write(s)) resolve();
    else process.stdout.once("drain", () => resolve());
  });
}
function writeErr(s: string): Promise<void> {
  return new Promise((resolve) => {
    if (process.stderr.write(s)) resolve();
    else process.stderr.once("drain", () => resolve());
  });
}

// ───────────── event emitter: owns adapterSequence + actorSequence ─────────────

class Emitter {
  /** H1: adapterSequence is monotonic for the whole adapter process, across runs. */
  private static adapterSeq = 0;
  private readonly actorSeqs = new Map<string, number>();
  constructor(
    private readonly runId: string,
    private readonly attempt: number,
  ) {}

  async emit(type: string, actorId: string, payload?: Record<string, unknown>, seqOverride?: number, omit: string[] = [], extra?: Record<string, unknown>): Promise<void> {
    let adapterSequence: number;
    if (seqOverride !== undefined) {
      adapterSequence = seqOverride;
      Emitter.adapterSeq = Math.max(Emitter.adapterSeq, seqOverride);
    } else {
      adapterSequence = ++Emitter.adapterSeq;
    }
    const actorSequence = (this.actorSeqs.get(actorId) ?? 0) + 1;
    this.actorSeqs.set(actorId, actorSequence);
    const frame: Record<string, unknown> = { type, adapterSequence, actorId, actorSequence, runId: this.runId, attempt: this.attempt };
    if (payload) frame.payload = payload;
    for (const k of omit) delete frame[k];
    if (extra) Object.assign(frame, extra);
    await writeOut(encodeFrame(frame));
  }
}

// ───────────── spool (adapter side of §47) ─────────────

function spool(content: Buffer, mimeType: string, summary: string): ArtifactRef {
  if (!SPOOL_DIR) throw new Error("DVL_ADAPTER_SPOOL_DIR not set: refusing to spool outside the Kernel-assigned area");
  const artifactRef = "art_mock_" + crypto.randomBytes(8).toString("hex");
  const ext = mimeType === "application/json" ? "json" : "log";
  const abs = path.join(SPOOL_DIR, `${artifactRef}.${ext}`);
  const rel = path.relative(PROJECT_ROOT, abs).split(path.sep).join("/");
  fs.writeFileSync(abs + ".tmp", content);
  fs.renameSync(abs + ".tmp", abs);
  const hash = "sha256:" + crypto.createHash("sha256").update(content).digest("hex");
  return { artifactRef, path: rel, hash, summary, byteSize: content.length, mimeType };
}

function deterministicTestLog(bytes: number): Buffer {
  const lines: string[] = [];
  let size = 0;
  for (let i = 1; size < bytes; i++) {
    const l = `ok ${i} - suite/case_${i} passes deterministically (${"·".repeat(i % 40)})\n`;
    lines.push(l);
    size += Buffer.byteLength(l);
  }
  return Buffer.from(lines.join("")).subarray(0, bytes);
}

// ───────────── scenario runner ─────────────

async function runScenario(name: string, runId: string, attempt: number, txRoot: string): Promise<void> {
  const steps: Step[] | undefined = SCENARIOS[name];
  const em = new Emitter(runId, attempt);
  if (!steps) {
    await em.emit("run.failed", "actor_root", { error: { class: "internal_adapter_error", message: `unknown scenario ${name}`, retryable: false } });
    return;
  }
  for (const step of steps) {
    switch (step.op) {
      case "emit":
        await em.emit(step.type, step.actor, step.payload, step.seqOverride, step.omit, step.extra);
        break;
      case "write_file": {
        const abs = path.join(txRoot, step.rel);
        if (step.actionId) await em.emit("action.started", step.actor, { actionId: step.actionId, kind: "file_write", target: step.rel });
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, step.content);
        await em.emit("workspace.hint", step.actor, { mutation: "write", path: step.rel, bytes: Buffer.byteLength(step.content) });
        if (step.actionId) await em.emit("action.finished", step.actor, { actionId: step.actionId, kind: "file_write", target: step.rel });
        break;
      }
      case "spool_and_finish": {
        const log = deterministicTestLog(step.bytes);
        const ref = spool(log, "text/plain", `test output, ${step.bytes} bytes`);
        if (step.corruptHash) ref.hash = "sha256:" + "0".repeat(64);
        if (step.deleteAfter) fs.rmSync(path.join(PROJECT_ROOT, ref.path));
        if (step.pathOverride !== undefined) ref.path = step.pathOverride;
        await em.emit("action.finished", step.actor, {
          actionId: step.actionId,
          kind: step.kind,
          exitCode: step.exitCode,
          summary: `${step.kind} finished, output spooled (${step.bytes} bytes)`,
          outputRef: ref,
        });
        break;
      }
      case "stdout_noise":
        await writeOut(step.text + "\n");
        break;
      case "stdout_raw":
        await writeOut(step.text);
        break;
      case "stdout_flood":
        await flood(writeOut, step.bytes, "stdout noise line — not a frame ");
        break;
      case "stderr":
        await writeErr(step.text);
        break;
      case "stderr_flood":
        await flood(writeErr, step.bytes, "stderr diagnostic chatter ");
        break;
      case "sleep":
        await new Promise((r) => setTimeout(r, step.ms));
        break;
      case "crash":
        process.exit(step.code);
      // falls through (unreachable)
      case "emit_burst":
        for (let i = 0; i < step.count; i++) await em.emit(step.type, step.actor, { i });
        break;
    }
  }
}

async function flood(write: (s: string) => Promise<void>, bytes: number, text: string): Promise<void> {
  const line = text.padEnd(120, "#") + "\n";
  const chunk = line.repeat(Math.ceil(16384 / line.length));
  let sent = 0;
  while (sent < bytes) {
    await write(chunk);
    sent += chunk.length;
  }
}

// ───────────── command loop ─────────────

async function handle(cmd: Record<string, unknown>): Promise<void> {
  const requestId = cmd.requestId as string;
  const payload = (cmd.payload ?? {}) as Record<string, unknown>;
  switch (cmd.type) {
    case "adapter.describe": {
      const mode = process.env.DVL_MOCK_DESCRIBE;
      if (mode === "silent") return;
      const caps: Partial<AdapterCapabilities> = { ...CAPABILITIES };
      if (mode === "incomplete") {
        delete caps.commandExecutionMode;
        delete caps.eventFidelity;
      }
      if (mode === "wrong-version") caps.supportedContractVersions = ["dvl.provider-core/9.9.9"];
      await writeOut(encodeFrame({ type: "adapter.described", requestId, payload: { capabilities: caps } }));
      return;
    }
    case "adapter.ping":
      await writeOut(encodeFrame({ type: "adapter.pong", requestId }));
      return;
    case "run.start": {
      await writeOut(encodeFrame({ type: "command.ack", requestId }));
      const scenario = (payload.scenario as string | undefined) ?? "happy";
      void runScenario(scenario, payload.runId as string, payload.attempt as number, payload.transactionWorkspaceRoot as string).catch(async (e) => {
        await writeErr(`scenario error: ${(e as Error).stack}\n`);
        process.exit(70);
      });
      return;
    }
    case "adapter.shutdown":
      await writeOut(encodeFrame({ type: "command.ack", requestId }));
      process.stdout.end(() => process.exit(0));
      return;
    default:
      await writeErr(`unsupported command ${String(cmd.type)}\n`);
  }
}

const splitter = new LineSplitter(
  (line) => {
    const p = parseLine(line);
    if (p.kind === "frame") void handle(p.value);
    else void writeErr(`ignored non-frame stdin line\n`);
  },
  () => void writeErr("stdin line overflow\n"),
);
process.stdin.on("data", (c: Buffer) => splitter.push(c));
process.stdin.on("end", () => process.exit(0));
