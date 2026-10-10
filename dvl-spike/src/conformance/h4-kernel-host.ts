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
import readline from "node:readline";
import { Kernel } from "../kernel/kernel.js";
import { mockProviderCommand } from "../kernel/mock-launch.js";

const out = (o: unknown) => process.stdout.write(JSON.stringify(o) + "\n");

const rl = readline.createInterface({ input: process.stdin });
rl.once("line", (line) => {
  const cfg = JSON.parse(line) as { root: string; keyHex: string; scenario: string };
  void main(cfg).catch((e) => {
    process.stderr.write(`h4 host: ${(e as Error).stack}\n`);
    process.exit(1);
  });
});

async function main(cfg: { root: string; keyHex: string; scenario: string }): Promise<void> {
  const k = new Kernel({
    root: cfg.root,
    adapterCommand: mockProviderCommand(),
    requestTimeoutMs: 5_000,
    integrityKey: Buffer.from(cfg.keyHex, "hex"),
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
    const ready =
      cfg.scenario === "h4-action-started-hold"
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
  await k.settle();
  out({ ready: true });
  // Stay alive mid-run until the test kills this process.
  setInterval(() => {}, 60_000);
}
