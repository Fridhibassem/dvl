/** H4/B4 experiment only. Does not extend dvl.provider-core/0.3.2. */
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "./event-store.js";

export interface SpikeActionIntent {
  actionId: string;
  kind: string;
  target: string;
  parameters: Record<string, unknown>;
  stateMutating: boolean;
  external: boolean;
  executionOwner: "kernel";
}

export interface PreparedSpikeAction extends SpikeActionIntent {
  runId: string;
  attempt: number;
  actorId: string;
  assignmentId: string;
  adapterInstanceId: string;
  authorityId: string;
  semanticSignature: string;
  /** Host/executor-defined logical operation identity, not inferred by the Kernel. */
  effectOperationId: string;
}

export type SpikeActionBoundary = "before_prepared" | "prepared" | "authorized" | "started" | "effect_returned" | "outcome_committed";
export interface SpikeEffectReceipt { receiptId: string; }
export interface SpikeEffectExecutor {
  /** Host-owned implementation, never supplied by adapter capability claims. No native fallback. */
  validate(intent: SpikeActionIntent): void;
  operationIdentity(intent: Readonly<SpikeActionIntent>, runId: string): string;
  execute(action: Readonly<PreparedSpikeAction>): Promise<SpikeEffectReceipt>;
  inspect(action: Readonly<PreparedSpikeAction>): Promise<"CONFIRMED_DONE" | "CONFIRMED_NOT_DONE" | "UNKNOWN">;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  throw new Error("action intent must contain only JSON values");
}

export function freezeAction<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freezeAction(child); Object.freeze(value); }
  return value;
}

export function normalizeSpikeIntent(raw: unknown): SpikeActionIntent {
  const p = raw as SpikeActionIntent;
  if (!p || typeof p !== "object" || p.executionOwner !== "kernel") throw new Error("B4 requires exactly one execution owner: kernel; provider-native execution denied");
  for (const key of ["actionId", "kind", "target"] as const) {
    if (typeof p[key] !== "string" || p[key].length === 0 || p[key].length > 512) throw new Error(`invalid action ${key}`);
  }
  if (typeof p.stateMutating !== "boolean" || typeof p.external !== "boolean" || !p.parameters || typeof p.parameters !== "object" || Array.isArray(p.parameters)) throw new Error("action effect classification and parameters are required");
  const json = canonical({ actionId: p.actionId, kind: p.kind, target: p.target, parameters: p.parameters,
    stateMutating: p.stateMutating, external: p.external, executionOwner: p.executionOwner });
  if (Buffer.byteLength(json) > 16 * 1024) throw new Error("spike action intent exceeds durable inline limit");
  return freezeAction(JSON.parse(json) as SpikeActionIntent);
}

export function spikeSemanticSignature(intent: SpikeActionIntent): string {
  // Excludes attempt/action/authority IDs: a confirmed semantic effect must survive retry.
  return sha256(canonical({ kind: intent.kind, target: intent.target, parameters: intent.parameters,
    stateMutating: intent.stateMutating, external: intent.external, executionOwner: intent.executionOwner }));
}

/** Disposable external service stand-in. The provider receives a logical target, not this path. */
export class ExternalLedgerExecutor implements SpikeEffectExecutor {
  constructor(private readonly ledgerPath: string) {}
  validate(intent: SpikeActionIntent): void {
    if (intent.kind !== "ledger_append" || intent.target !== "external-ledger" || !intent.external || !intent.stateMutating ||
      typeof intent.parameters.entry !== "string" || Object.keys(intent.parameters).length !== 1) throw new Error("ledger capability does not authorize this intent");
  }
  operationIdentity(intent: Readonly<SpikeActionIntent>, runId: string): string {
    // This service defines one append per (logical run, canonical entry). It is an explicit
    // service operation key, NOT a generic inference that equal commands are interchangeable.
    return `${runId}:${spikeSemanticSignature(intent)}`;
  }
  private rows(): { operationId: string; receiptId: string; entry: string }[] {
    let bytes: string;
    try { bytes = fs.readFileSync(this.ledgerPath, "utf8"); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
    if (bytes && !bytes.endsWith("\n")) throw new Error("external ledger has an uncertain tail");
    return bytes.split("\n").filter(Boolean).map((line) => {
      const row = JSON.parse(line);
      if (typeof row.operationId !== "string" || typeof row.receiptId !== "string" || typeof row.entry !== "string") throw new Error("external ledger is not inspectable");
      return row;
    });
  }
  async execute(action: Readonly<PreparedSpikeAction>): Promise<SpikeEffectReceipt> {
    this.validate(action);
    const operationId = action.effectOperationId;
    if (operationId !== this.operationIdentity(action, action.runId)) throw new Error("ledger authority operation identity mismatch");
    const prior = this.rows().find((row) => row.operationId === operationId);
    if (prior) {
      if (prior.entry !== action.parameters.entry) throw new Error("ledger operation identity has conflicting intent");
      return { receiptId: prior.receiptId };
    }
    const receiptId = sha256(`${operationId}:${action.authorityId}`);
    const fd = fs.openSync(this.ledgerPath, "a", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify({ operationId, receiptId, entry: action.parameters.entry }) + "\n"); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    const dir = fs.openSync(path.dirname(this.ledgerPath), "r");
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    return { receiptId };
  }
  async inspect(action: Readonly<PreparedSpikeAction>): Promise<"CONFIRMED_DONE" | "CONFIRMED_NOT_DONE" | "UNKNOWN"> {
    try {
      this.validate(action);
      if (action.effectOperationId !== this.operationIdentity(action, action.runId)) return "UNKNOWN";
      const prior = this.rows().find((row) => row.operationId === action.effectOperationId);
      if (!prior) return "CONFIRMED_NOT_DONE";
      return prior.entry === action.parameters.entry ? "CONFIRMED_DONE" : "UNKNOWN";
    } catch { return "UNKNOWN"; }
  }
}
