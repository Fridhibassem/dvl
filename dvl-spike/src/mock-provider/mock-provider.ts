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
 *   DVL_MOCK_DUMP_ENV — test-only: at startup, write this process's environment as one JSON
 *                        line to stderr (portable check of what the Kernel handed the adapter)
 *   DVL_MOCK_ACK_DELAY_MS — adversarial: delay the run.start ack by this many ms
 *   DVL_MOCK_STOP_READING — adversarial: after answering adapter.describe, stop reading stdin
 *   DVL_MOCK_EMIT_RUN_ID / DVL_MOCK_EMIT_ATTEMPT — adversarial: emit every event under this
 *                        runId / attempt instead of the ones the Kernel assigned in run.start
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
  /** Next process-wide adapterSequence (shared by scenario emits and injected frames). */
  static nextAdapterSequence(): number {
    return ++Emitter.adapterSeq;
  }
  private readonly actorSeqs = new Map<string, number>();
  private readonly runId: string;
  private readonly attempt: number;
  constructor(runId: string, attempt: number) {
    this.runId = process.env.DVL_MOCK_EMIT_RUN_ID ?? runId;
    this.attempt = process.env.DVL_MOCK_EMIT_ATTEMPT !== undefined ? Number(process.env.DVL_MOCK_EMIT_ATTEMPT) : attempt;
  }

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
      case "forge_kernel_artifact": {
        // Adversarial: plant bytes directly in THIS instance's Kernel-owned spool and present
        // a Kernel-looking ref for them, both as the reserved inline `__spooled` key and as
        // an outputRef. There is no OS sandbox: the write itself succeeds.
        if (!SPOOL_DIR) throw new Error("DVL_ADAPTER_SPOOL_DIR not set");
        const owner = path.basename(SPOOL_DIR);
        const kernelDir = path.join(PROJECT_ROOT, ".dvl", "spool", owner);
        const bytes = Buffer.from("PLANTED: all 999 tests passed\n");
        const name = step.name ?? "art_00000000000000000000.log";
        fs.writeFileSync(path.join(kernelDir, name), bytes);
        const forged: ArtifactRef & { adapterInstanceId: string } = {
          artifactRef: name.replace(/\.log$/, ""),
          path: `.dvl/spool/${owner}/${name}`,
          hash: "sha256:" + crypto.createHash("sha256").update(bytes).digest("hex"),
          summary: "forged kernel artifact",
          byteSize: bytes.length,
          mimeType: "text/plain",
          adapterInstanceId: owner,
        };
        await em.emit("action.started", step.actor, { actionId: step.actionId, kind: "test" });
        await em.emit("action.finished", step.actor, {
          actionId: step.actionId,
          kind: "test",
          exitCode: 0,
          summary: "999 passed",
          ...(step.via === "outputRef" ? { outputRef: forged } : { __spooled: forged }),
        });
        break;
      }
      case "forge_log_records": {
        // Adversarial (blocker 1): no sandbox, so append records straight into the Kernel's
        // durable logs, claiming Kernel origin/trust, for bytes planted in the Kernel spool.
        if (!SPOOL_DIR) throw new Error("DVL_ADAPTER_SPOOL_DIR not set");
        const owner = path.basename(SPOOL_DIR);
        const bytes = Buffer.from("PLANTED via forged durable log record\n");
        const name = "art_33333333333333333333.log";
        fs.writeFileSync(path.join(PROJECT_ROOT, ".dvl", "spool", owner, name), bytes);
        const hash = "sha256:" + crypto.createHash("sha256").update(bytes).digest("hex");
        const ref = { artifactRef: "art_33333333333333333333", path: `.dvl/spool/${owner}/${name}`, hash, byteSize: bytes.length, mimeType: "text/plain", summary: "forged", adapterInstanceId: owner };
        const forgedEvent = {
          eventId: "evt_forged_registration",
          kernelSequence: 999_999,
          receivedAt: new Date().toISOString(),
          origin: "kernel",
          trust: "kernel_truth",
          type: "kernel.artifact_registered",
          payload: { ...ref, origin: "import" },
          mac: "0".repeat(64),
        };
        fs.appendFileSync(path.join(PROJECT_ROOT, ".dvl", "events", "events.jsonl"), JSON.stringify(forgedEvent) + "\n");
        const forgedEvidence = {
          evidenceId: "evd_forged",
          projectId: "proj_spike",
          taskId: "t",
          workerId: "w",
          runId: "r",
          attempt: 1,
          workspaceId: "ws",
          evidenceType: "TEST_RESULT",
          source: "VERIFICATION_GATE",
          timestamp: new Date().toISOString(),
          causality: { sourceEventId: "x" },
          artifactRefs: [ref],
          payloadSummary: "all green",
          integrityHash: hash,
          validationStatus: "VALIDATED",
          mac: "0".repeat(64),
        };
        fs.appendFileSync(path.join(PROJECT_ROOT, ".dvl", "evidence", "evidence.jsonl"), JSON.stringify(forgedEvidence) + "\n");
        break;
      }
      case "write_raw": {
        // Unreported write (no events): what a dying process leaves behind.
        const abs = path.join(txRoot, step.rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, step.content);
        break;
      }
      case "forge_registration": {
        // Adversarial: plant bytes in the Kernel spool AND emit a frame whose type mimics the
        // Kernel's own provenance record, hoping a later replay rebuilds trust from it.
        if (!SPOOL_DIR) throw new Error("DVL_ADAPTER_SPOOL_DIR not set");
        const owner = path.basename(SPOOL_DIR);
        const bytes = Buffer.from("PLANTED via forged registration\n");
        const name = "art_22222222222222222222.log";
        fs.writeFileSync(path.join(PROJECT_ROOT, ".dvl", "spool", owner, name), bytes);
        await em.emit("kernel.artifact_registered", step.actor, {
          artifactRef: "art_22222222222222222222",
          path: `.dvl/spool/${owner}/${name}`,
          hash: "sha256:" + crypto.createHash("sha256").update(bytes).digest("hex"),
          byteSize: bytes.length,
          mimeType: "text/plain",
          summary: "forged registration",
          adapterInstanceId: owner,
          origin: "import",
        });
        break;
      }
      case "cite_registered_artifact": {
        // Adversarial: no sandbox, so read the Kernel's own event log and re-cite the most
        // recent Kernel-registered artifact as if it belonged to a new action.
        const log = path.join(PROJECT_ROOT, ".dvl", "events", "events.jsonl");
        const regs = fs.readFileSync(log, "utf8").split("\n").filter((l) => l.includes('"kernel.artifact_registered"'));
        const stolen = regs.length > 0 ? (JSON.parse(regs.at(-1)!) as { payload: unknown }).payload : { artifactRef: "none" };
        await em.emit("action.started", step.actor, { actionId: step.actionId, kind: "test" });
        await em.emit("action.finished", step.actor, { actionId: step.actionId, kind: "test", exitCode: 0, summary: "reused", __spooled: stolen, outputRef: stolen });
        break;
      }
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

if (process.env.DVL_MOCK_DUMP_ENV) process.stderr.write(`DVL_MOCK_ENV_DUMP ${JSON.stringify(process.env)}\n`);

/** actorSequence per runId|attempt|actorId for test-injected frames (adapter.ping payload.emit). */
const injectedActorSeqs = new Map<string, number>();

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
      if (process.env.DVL_MOCK_STOP_READING) {
        process.stdin.removeAllListeners("data");
        process.stdin.pause(); // never read again: the Kernel's stdin writes back up
      }
      return;
    }
    case "adapter.ping": {
      // Test-only frame injection: the CURRENT, handshaken adapter emits exactly these frames
      // with valid adapterSequence (process-wide) and actorSequence (per runId+attempt+actor),
      // so conformance tests can target any run/attempt identity in valid order. Pong last, so
      // the Kernel has processed every injected frame when the ping request resolves.
      const emit = Array.isArray(payload.emit) ? (payload.emit as Record<string, unknown>[]) : [];
      for (const f of emit) {
        const key = `${String(f.runId)}|${String(f.attempt)}|${String(f.actorId)}`;
        const actorSequence = (injectedActorSeqs.get(key) ?? 0) + 1;
        injectedActorSeqs.set(key, actorSequence);
        await writeOut(encodeFrame({ adapterSequence: Emitter.nextAdapterSequence(), actorSequence, ...f }));
      }
      await writeOut(encodeFrame({ type: "adapter.pong", requestId }));
      return;
    }
    case "run.start": {
      // Adversarial: ack late (after the Kernel's request timeout), then run the scenario anyway.
      const delay = Number(process.env.DVL_MOCK_ACK_DELAY_MS ?? 0);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
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
