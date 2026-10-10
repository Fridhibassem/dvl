/**
 * H4 / B4 — a disposable EXTERNAL system for crash tests: an append-only ledger outside the
 * project root (think: a payment or deploy API). Appends and revocations are single O_APPEND
 * lines, so they are totally ordered. The effect of the ledger is defined by `effective()`:
 *   - guarded (a capability key is given): an entry takes effect only if it carries the valid
 *     capability for (actionId, signature) and comes before any revocation of that actionId;
 *   - naive (no key): every entry takes effect, as for any external API before B4.
 */
import fs from "node:fs";
import path from "node:path";
import { capabilityFor, type EffectBroker } from "../kernel/effects.js";

export interface LedgerLine {
  t: "entry" | "revoke";
  /** Guarded entries carry the Kernel's effectId here (run:attempt:action). */
  actionId: string;
  signature?: string | null;
  capability?: string | null;
  entry?: unknown;
}

export const ledgerFile = (dir: string) => path.join(dir, "ledger.jsonl");

export function appendLedger(dir: string, line: LedgerLine): void {
  fs.appendFileSync(ledgerFile(dir), JSON.stringify(line) + "\n");
}

export function ledgerLines(dir: string): LedgerLine[] {
  if (!fs.existsSync(ledgerFile(dir))) return [];
  return fs
    .readFileSync(ledgerFile(dir), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LedgerLine);
}

/** The entries that actually took effect. */
export function effective(dir: string, key?: Buffer): LedgerLine[] {
  const revoked = new Set<string>();
  const out: LedgerLine[] = [];
  for (const l of ledgerLines(dir)) {
    if (l.t === "revoke") revoked.add(l.actionId);
    else if (!key) out.push(l);
    else if (!revoked.has(l.actionId) && l.signature && l.capability === capabilityFor(key, l.actionId, l.signature)) out.push(l);
  }
  return out;
}

/** Revoke first, then inspect: entries after the revocation can never take effect. */
export function revokeAndInspect(dir: string, key: Buffer, actionId: string): "DONE" | "NOT_DONE" {
  appendLedger(dir, { t: "revoke", actionId });
  return effective(dir, key).some((l) => l.actionId === actionId) ? "DONE" : "NOT_DONE";
}

/**
 * The broker for this resource. `hangAfterEffect`: Kernel-owned execution performs the effect
 * and then never returns (to crash the Kernel between effect and outcome record).
 */
export function ledgerBroker(dir: string, key: Buffer, opts: { hangAfterEffect?: boolean } = {}): EffectBroker {
  return {
    capabilityKey: key,
    async execute(action, capability) {
      appendLedger(dir, { t: "entry", actionId: action.effectId, signature: action.signature, capability, entry: action.intent });
      if (opts.hangAfterEffect) await new Promise(() => {});
      return { appended: true };
    },
    async revokeAndInspect(action) {
      return revokeAndInspect(dir, key, action.effectId);
    },
  };
}
