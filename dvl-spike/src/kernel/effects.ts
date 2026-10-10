/**
 * H4 / B4 — durable-before-effect protocol for state-mutating / external actions.
 *
 * An external effect is executable only with a per-action capability, and the Kernel issues
 * that capability only AFTER `kernel.action_prepared` (the action's identity, authority and
 * intent) is durably committed. So a crash at any point after the effect became possible
 * leaves a PREPARED record that replay rebuilds as UNKNOWN.
 *
 * The capability binds (effectId, signature). The resource (here the disposable external
 * ledger, in production a credential broker/proxy) honours it and honours revocation, with
 * revocations and uses in one total order. That makes revoke-then-inspect a proof:
 * after revocation no new use of the capability can take effect, so "absent" is final.
 */
import crypto from "node:crypto";

/**
 * HMAC(capabilityKey, effectId ‖ signature): what the resource checks. Never derivable by the
 * adapter. `effectId` is Kernel-issued and unique per (run, attempt, action): revoking one
 * attempt's capability never voids a later attempt's.
 */
export function capabilityFor(key: Buffer, effectId: string, signature: string): string {
  return crypto.createHmac("sha256", key).update(`${effectId}\n${signature}`).digest("hex");
}

export const effectIdOf = (runId: string, attempt: number, actionId: string) => `${runId}:${attempt}:${actionId}`;

/** Canonical JSON (sorted keys) so the signature of an intent does not depend on key order. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

/** Semantic action signature: the same effect requested again (any attempt) has the same signature. */
export function actionSignature(kind: string, target: string, intent: unknown): string {
  return "sig:" + crypto.createHash("sha256").update(canonical({ kind, target, intent })).digest("hex");
}

export interface PreparedAction {
  actionId: string;
  /** Kernel-issued effect identity (run:attempt:action): what the capability and revocation bind. */
  effectId: string;
  runId: string;
  attempt: number;
  /** Assignment / authority the capability is issued under. */
  taskId: string;
  workerId: string;
  workspaceId: string;
  adapterInstanceId: string;
  actorId: string;
  kind: string;
  target: string;
  intent: unknown;
  signature: string;
  external: boolean;
  /** Who performs the effect: the provider (with the capability) or the Kernel itself. Exactly one. */
  executor: "provider" | "kernel";
}

export interface EffectBroker {
  capabilityKey: Buffer;
  /** Kernel-owned execution (harness = execution). Gets the capability; the provider never does. */
  execute?(action: PreparedAction, capability: string): Promise<unknown>;
  /**
   * Revoke the action's capability at the resource, THEN report whether the resource holds its
   * effect. Must be linearizable: once it returns, the answer cannot change.
   */
  revokeAndInspect?(action: PreparedAction): Promise<"DONE" | "NOT_DONE">;
}
