/**
 * H4 — a Kernel in its OWN process, so a test can kill it with SIGKILL (no shutdown, no
 * flush, no finally blocks) and replay its root from a fresh Kernel. Not a test file.
 *
 * Protocol (one JSON object per line):
 *   stdin  ← { root, keyHex, scenario }   the host's config; the integrity key travels in
 *                                          memory over a pipe (never env, never disk)
 *   stdout → { commit: CommitHeads }      after every committed record (the host persists it)
 *   stdout → { run: RunIdentity, adapterPid }
 *   stdout → { ready: true }              once the scenario's probe write is committed
 */
import fs from "node:fs";
import readline from "node:readline";
import { Kernel } from "../kernel/kernel.js";
import { mockProviderCommand } from "../kernel/mock-launch.js";
import { ledgerBroker, ledgerLines } from "../mock-provider/external-ledger.js";

const out = (o: unknown) => process.stdout.write(JSON.stringify(o) + "\n");

interface HostConfig {
  root: string;
  keyHex: string;
  scenario: string;
  adapterEnv?: Record<string, string>;
  /** Ready when this has happened (default: the act_h4_probe rules below). */
  ready?: { kind: "ledger"; ledgerDir: string; actionId: string } | { kind: "event"; type: string; actionId: string } | { kind: "gated"; type: string } | { kind: "file"; path: string };
  /** B4 — effect broker over the disposable ledger (the key travels in memory only). */
  effects?: { ledgerDir: string; capKeyHex: string; hangAfterEffect?: boolean };
  /** B4 — hold this frame type forever before the Kernel processes it (crash before it is durable). */
  gate?: string;
}
let gated: string | null = null;

const rl = readline.createInterface({ input: process.stdin });
rl.once("line", (line) => {
  const cfg = JSON.parse(line) as HostConfig;
  void main(cfg).catch((e) => {
    process.stderr.write(`h4 host: ${(e as Error).stack}\n`);
    process.exit(1);
  });
});

async function main(cfg: HostConfig): Promise<void> {
  const k = new Kernel({
    root: cfg.root,
    adapterCommand: mockProviderCommand(),
    requestTimeoutMs: 5_000,
    integrityKey: Buffer.from(cfg.keyHex, "hex"),
    adapterEnv: cfg.adapterEnv,
    effects: cfg.effects && ledgerBroker(cfg.effects.ledgerDir, Buffer.from(cfg.effects.capKeyHex, "hex"), { hangAfterEffect: cfg.effects.hangAfterEffect }),
    frameGate: cfg.gate
      ? (type) => {
          if (type !== cfg.gate) return Promise.resolve();
          gated = type;
          return new Promise(() => {});
        }
      : undefined,
    limits: { maxDurationMs: 120_000 },
    onCommit: (heads) => out({ commit: heads }),
  });
  k.start();
  await k.describe();
  const run = await k.startRun({ role: "builder", goal: "H4 crash test: stage a harmless probe test", acceptanceCriteria: ["probe staged"], scope: ["tests/**"], scenario: cfg.scenario });
  const spawned = k.store.ofType("kernel.adapter_spawned").at(-1)!.payload as { pid: number };
  out({ run, adapterPid: spawned.pid });
  for (;;) {
    const events = k.store.all();
    const want = cfg.ready;
    const ready = want
      ? want.kind === "gated"
        ? gated === want.type
        : want.kind === "file"
        ? fs.existsSync(want.path)
        : want.kind === "ledger"
        ? ledgerLines(want.ledgerDir).some((l) => l.actionId === want.actionId || l.actionId.endsWith(`:${want.actionId}`))
        : events.some((e) => e.type === want.type && e.runId === run.runId && (e.payload as { actionId?: string } | undefined)?.actionId === want.actionId)
      : cfg.scenario.startsWith("h4-action-started-")
        ? events.some(
            (e) =>
              e.origin === "adapter" &&
              e.type === "action.started" &&
              e.runId === run.runId &&
              (e.payload as { actionId?: string }).actionId === "act_h4_probe",
          )
        : events.some(
            (e) =>
              e.type === "action.finished" &&
              e.runId === run.runId &&
              (e.payload as { actionId?: string }).actionId === "act_h4_probe",
          );

    if (ready) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  if (!gated) await k.settle();
  out({ ready: true });
  // Stay alive mid-run until the test kills this process.
  setInterval(() => {}, 60_000);
}
