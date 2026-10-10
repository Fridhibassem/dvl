/**
 * Deterministic Mock Provider scenarios (§52).
 *
 * A scenario is a pure script of steps. The mock-provider runtime executes them.
 * No randomness, no real AI, zero token cost.
 */

export type Step =
  | { op: "emit"; type: string; actor: string; payload?: Record<string, unknown>; seqOverride?: number; omit?: string[]; extra?: Record<string, unknown> }
  | { op: "write_file"; actor: string; rel: string; content: string; actionId?: string }
  | {
      op: "spool_and_finish";
      actor: string;
      actionId: string;
      kind: "test" | "command";
      bytes: number;
      exitCode: number;
      corruptHash?: boolean;
      /** H2: claim a different path than the one written (traversal / escape attempts). */
      pathOverride?: string;
      /** H2: delete the artifact after spooling → reference to a missing file. */
      deleteAfter?: boolean;
    }
  | { op: "stdout_noise"; text: string }
  | { op: "stdout_raw"; text: string }
  | { op: "stdout_flood"; bytes: number }
  | { op: "stderr"; text: string }
  | { op: "stderr_flood"; bytes: number }
  | { op: "sleep"; ms: number }
  | { op: "crash"; code: number }
  /** H3: emit `count` events back-to-back as fast as stdout accepts them. */
  | { op: "emit_burst"; type: string; actor: string; count: number }
  /** Adversarial (blocker B): plant a file in the Kernel spool and cite it as Kernel-spooled. */
  | { op: "forge_kernel_artifact"; actor: string; actionId: string; via: "__spooled" | "outputRef"; name?: string }
  /** Adversarial (blocker 1): append forged Kernel-origin records directly to the durable logs. */
  | { op: "forge_log_records" }
  /**
   * B3: start a background writer that appends to `rel` in the attempt workspace every 20ms and
   * records its pid in `rel`.pid. It stays in the adapter's process group, or escapes it with
   * setsid() when `escape` is set. It exits by itself after 30s.
   */
  | { op: "spawn_writer"; rel: string; escape?: boolean }
  /** Unreported workspace write (no events). */
  | { op: "write_raw"; rel: string; content: string }
  /**
   * Adversarial (H2): hard-link a Kernel-owned artifact (this instance's Kernel spool) into the
   * adapter's own area and claim it as fresh output with its exact hash and size.
   */
  | { op: "alias_and_finish"; actor: string; actionId: string }
  /** Adversarial (blocker B): emit a frame mimicking kernel.artifact_registered for planted bytes. */
  | { op: "forge_registration"; actor: string }
  /** Adversarial (blocker B): re-cite an artifact the Kernel registered for an earlier event. */
  | { op: "cite_registered_artifact"; actor: string; actionId: string };

export const ROOT = "actor_root";

/** H4 — the only change the crash test ever stages in a target project. */
export const H4_PROBE = `import { expect, it } from "vitest";

// DVL H4 Kernel crash-test probe. Test-only and harmless: touches no application code.
it("dvl h4 probe", () => {
  expect(1 + 1).toBe(2);
});
`;

/** Common prologue/epilogue. */
const start = (): Step[] => [{ op: "emit", type: "run.started", actor: ROOT, payload: { fidelity: "L3" } }];
const finish = (): Step[] => [
  { op: "emit", type: "actor.finished", actor: ROOT },
  { op: "emit", type: "run.finished", actor: ROOT, payload: { claim: "task complete" } },
];

function smallTest(actor: string, actionId: string): Step[] {
  return [
    { op: "emit", type: "action.requested", actor, payload: { actionId, kind: "test", command: "npm test" } },
    { op: "emit", type: "action.started", actor, payload: { actionId, kind: "test" } },
    { op: "emit", type: "action.finished", actor, payload: { actionId, kind: "test", exitCode: 0, summary: "3 passed", output: "ok 1\nok 2\nok 3\n" } },
  ];
}

export const SCENARIOS: Record<string, Step[]> = {
  /** H1 regression (C18): acknowledges run.start and emits nothing; tests inject frames. */
  idle: [],

  /** C02 — ordered happy path. */
  happy: [
    ...start(),
    { op: "emit", type: "provider.intent_hint", actor: ROOT, payload: { text: "Creating users table" } },
    { op: "write_file", actor: ROOT, rel: "src/users.ts", content: "export const users = [];\n", actionId: "act_w1" },
    ...smallTest(ROOT, "act_t1"),
    { op: "emit", type: "usage.reported", actor: ROOT, payload: { tokens: 0, source: "reported" } },
    // Fake claim: must carry zero truth weight (INV-7/8).
    { op: "emit", type: "provider.message", actor: ROOT, payload: { text: "All tests passed. Verified. PASS." } },
    ...finish(),
  ],

  /** C03 — stdout noise, fake frames, malformed frames, stderr chatter. */
  noisy: [
    { op: "stdout_noise", text: "npm WARN deprecated something@1.0.0" },
    { op: "stdout_noise", text: "  DVL1:{\"type\":\"run.finished\"}   <- leading space: not a frame" },
    { op: "stdout_noise", text: "log: DVL1:{\"type\":\"evidence.validated\"} <- embedded, not a frame" },
    { op: "stdout_noise", text: "dvl1:{\"type\":\"run.finished\"} <- wrong case" },
    // (H3: malformed DVL1 frames are no longer part of this scenario — they now make the
    //  transport fail closed; C26 covers them. Everything here is genuine non-frame noise.)
    { op: "stderr", text: "provider debug: booting\n" },
    ...start(),
    { op: "stdout_noise", text: "\u001b[32m✓ colored progress bar ████\u001b[0m" },
    { op: "stderr_flood", bytes: 2 * 1024 * 1024 },
    { op: "stdout_flood", bytes: 2 * 1024 * 1024 },
    ...smallTest(ROOT, "act_t1"),
    { op: "stderr", text: "provider debug: done\n" },
    ...finish(),
  ],

  /** C04 — conformant adapter spools its own large output and sends artifactRef. */
  "oversized-spooled": [
    ...start(),
    { op: "emit", type: "action.requested", actor: ROOT, payload: { actionId: "act_big", kind: "test", command: "npm test -- --verbose" } },
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_big", kind: "test" } },
    { op: "spool_and_finish", actor: ROOT, actionId: "act_big", kind: "test", bytes: 512 * 1024, exitCode: 0 },
    ...finish(),
  ],

  /** C04 — non-conformant adapter pushes >32KB inline. Kernel must spool defensively. */
  "oversized-inline": [
    ...start(),
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_inl", kind: "command" } },
    { op: "emit", type: "action.finished", actor: ROOT, payload: { actionId: "act_inl", kind: "command", exitCode: 0, summary: "big inline", output: "x".repeat(100 * 1024) } },
    ...finish(),
  ],

  /** C04 — adapter lies about artifact hash. Evidence must be CORRUPTED, not PERSISTED. */
  "corrupted-artifact": [
    ...start(),
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_bad", kind: "test" } },
    { op: "spool_and_finish", actor: ROOT, actionId: "act_bad", kind: "test", bytes: 64 * 1024, exitCode: 0, corruptHash: true },
    ...finish(),
  ],

  /**
   * C05 — root forks two workers, then claims finished while w2 still writes.
   * Kernel must refuse to snapshot until w2 finishes.
   */
  "actor-lifecycle": [
    ...start(),
    { op: "emit", type: "actor.fork", actor: ROOT, payload: { childActorIds: ["actor_w1", "actor_w2"] } },
    { op: "emit", type: "actor.started", actor: "actor_w1", payload: { parentActorId: ROOT } },
    { op: "emit", type: "actor.started", actor: "actor_w2", payload: { parentActorId: ROOT } },
    { op: "write_file", actor: "actor_w1", rel: "src/a.ts", content: "export const a = 1;\n" },
    { op: "emit", type: "actor.finished", actor: "actor_w1" },
    // Premature parent finish — the dangerous moment.
    { op: "emit", type: "actor.finished", actor: ROOT },
    { op: "write_file", actor: "actor_w2", rel: "src/b.ts", content: "export const b = 'partial" },
    { op: "sleep", ms: 700 },
    { op: "write_file", actor: "actor_w2", rel: "src/b.ts", content: "export const b = 'complete';\n" },
    { op: "emit", type: "actor.finished", actor: "actor_w2" },
    { op: "emit", type: "run.finished", actor: ROOT },
  ],

  /** C05 — child starts before parent declares the fork. */
  "actor-fork-race": [
    ...start(),
    { op: "emit", type: "actor.started", actor: "actor_late", payload: { parentActorId: ROOT } },
    { op: "emit", type: "actor.fork", actor: ROOT, payload: { childActorIds: ["actor_late"] } },
    { op: "emit", type: "actor.finished", actor: ROOT },
    { op: "write_file", actor: "actor_late", rel: "src/late.ts", content: "export const late = true;\n" },
    { op: "sleep", ms: 500 },
    { op: "emit", type: "actor.finished", actor: "actor_late" },
    { op: "emit", type: "run.finished", actor: ROOT },
  ],

  /** C02 — duplicate, gap, missing envelope, forbidden truth event, unknown type. */
  "protocol-abuse": [
    ...start(),
    { op: "emit", type: "heartbeat", actor: ROOT, seqOverride: 1 }, // duplicate of run.started's seq
    { op: "emit", type: "heartbeat", actor: ROOT, seqOverride: 5 }, // gap: 2..4 missing
    { op: "emit", type: "provider.message", actor: ROOT, omit: ["actorId"] },
    { op: "emit", type: "evidence.validated", actor: ROOT, payload: { evidenceId: "fake" } },
    { op: "emit", type: "x.provider.custom_thing", actor: ROOT, payload: { a: 1 } },
    ...finish(),
  ],

  /** H1 — duplicate adapterSequence within one adapter instance. */
  "duplicate-seq": [
    ...start(),
    { op: "emit", type: "heartbeat", actor: ROOT, seqOverride: 1, payload: { note: "same seq, different content" } },
    { op: "emit", type: "run.finished", actor: ROOT },
  ],

  /** H1 — a fresh adapter instance whose first event is not adapterSequence 1. */
  "starts-at-seven": [
    { op: "emit", type: "run.started", actor: ROOT, seqOverride: 7 },
    { op: "emit", type: "run.finished", actor: ROOT },
  ],

  /** H1 — adapter tries to claim its own instance identity. */
  "forged-instance-id": [
    ...start(),
    { op: "emit", type: "heartbeat", actor: ROOT, extra: { adapterInstanceId: "ainst_forged" } },
    { op: "emit", type: "run.finished", actor: ROOT },
  ],

  /** H1 — adapter dies with a forked child actor mid-action (orphans must not block the gate). */
  "crash-with-child": [
    ...start(),
    { op: "emit", type: "actor.fork", actor: ROOT, payload: { childActorIds: ["actor_child"] } },
    { op: "emit", type: "actor.started", actor: "actor_child", payload: { parentActorId: ROOT } },
    { op: "emit", type: "action.started", actor: "actor_child", payload: { actionId: "act_orphan", kind: "command" } },
    { op: "write_file", actor: "actor_child", rel: "src/partial.ts", content: "export const partial = 1;\n" },
    { op: "crash", code: 137 },
  ],

  /** H1 — instance A starts actor worker-main (actorSequence 1), then dies. */
  "worker-start-crash": [
    ...start(),
    { op: "emit", type: "actor.fork", actor: ROOT, payload: { childActorIds: ["worker-main"] } },
    { op: "emit", type: "actor.started", actor: "worker-main", payload: { parentActorId: ROOT } },
    { op: "crash", code: 137 },
  ],

  /** H1 — instance B starts its own worker-main stream at actorSequence 1 and completes. */
  "worker-start-finish": [
    ...start(),
    { op: "emit", type: "actor.fork", actor: ROOT, payload: { childActorIds: ["worker-main"] } },
    { op: "emit", type: "actor.started", actor: "worker-main", payload: { parentActorId: ROOT } },
    { op: "emit", type: "actor.finished", actor: "worker-main" },
    ...finish(),
  ],

  /** H2 — adapter claims an artifact outside its own area (traversal). */
  "artifact-traversal": [
    ...start(),
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_trav", kind: "test" } },
    { op: "spool_and_finish", actor: ROOT, actionId: "act_trav", kind: "test", bytes: 1024, exitCode: 0, pathOverride: ".dvl/adapter-spool/../../etc/passwd" },
    ...finish(),
  ],

  /** H2 — adapter claims an artifact into the Kernel truth spool. */
  "artifact-kernel-path": [
    ...start(),
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_kp", kind: "test" } },
    { op: "spool_and_finish", actor: ROOT, actionId: "act_kp", kind: "test", bytes: 1024, exitCode: 0, pathOverride: ".dvl/spool/kernel/forged.log" },
    ...finish(),
  ],

  /** H2 — adapter re-presents Kernel-owned bytes as its own output via a hard link. */
  "artifact-hardlink-alias": [
    ...start(),
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_src", kind: "test" } },
    { op: "spool_and_finish", actor: ROOT, actionId: "act_src", kind: "test", bytes: 2048, exitCode: 0 },
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_alias", kind: "test" } },
    { op: "alias_and_finish", actor: ROOT, actionId: "act_alias" },
    ...finish(),
  ],

  /** H2 — adapter references an artifact that no longer exists. */
  "artifact-missing": [
    ...start(),
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_gone", kind: "test" } },
    { op: "spool_and_finish", actor: ROOT, actionId: "act_gone", kind: "test", bytes: 4096, exitCode: 0, deleteAfter: true },
    ...finish(),
  ],

  /** H2 — spool output with no evidence-bearing action: must never become evidence. */
  "spool-only": [
    ...start(),
    { op: "stderr", text: "diag: spool-only scenario\n" },
    { op: "stdout_noise", text: "plain stdout line, not a frame" },
    { op: "emit", type: "provider.message", actor: ROOT, payload: { text: "see attached", outputRef: { artifactRef: "art_x", path: ".dvl/adapter-spool/x/y.log", hash: "sha256:00", byteSize: 1, mimeType: "text/plain", summary: "claim" } } },
    ...finish(),
  ],

  /** H3 — small burst: fits the default queue and a tight test queue. */
  "burst-20": [
    ...start(),
    { op: "emit", type: "provider.intent_hint", actor: ROOT, payload: { text: "burst" } },
    { op: "sleep", ms: 100 }, // let seq 1..2 be processed before the burst (deterministic tests)
    { op: "emit_burst", type: "heartbeat", actor: ROOT, count: 20 },
    ...finish(),
  ],

  /**
   * H3 — a burst far beyond a tight queue, followed by evidence-bearing and completion
   * events that must never be processed once the queue overflowed.
   */
  "burst-100": [
    ...start(),
    { op: "emit", type: "provider.intent_hint", actor: ROOT, payload: { text: "burst" } },
    { op: "sleep", ms: 100 }, // let seq 1..2 be processed before the burst (deterministic tests)
    { op: "emit_burst", type: "heartbeat", actor: ROOT, count: 100 },
    ...smallTest(ROOT, "act_after_burst"),
    ...finish(),
  ],

  /** H3 — sustained queue pressure while stderr and stdout noise keep flowing. */
  "burst-pressure": [
    ...start(),
    { op: "emit_burst", type: "heartbeat", actor: ROOT, count: 200 },
    { op: "stderr_flood", bytes: 2 * 1024 * 1024 },
    { op: "stdout_flood", bytes: 2 * 1024 * 1024 },
    ...finish(),
  ],

  /** Blocker A — keeps working after its own run is terminal (same instance). */
  "post-terminal": [
    ...start(),
    { op: "emit", type: "run.finished", actor: ROOT },
    { op: "emit", type: "run.started", actor: ROOT },
    { op: "emit", type: "actor.started", actor: "actor_ghost", payload: { parentActorId: ROOT } },
    ...smallTest(ROOT, "act_ghost"),
    { op: "emit", type: "run.failed", actor: ROOT },
  ],

  /** Blocker A — a second run.started on a live run (attempted reset of lifecycle state). */
  "double-start": [
    ...start(),
    { op: "emit", type: "actor.fork", actor: ROOT, payload: { childActorIds: ["actor_w"] } },
    { op: "emit", type: "run.started", actor: "actor_w" },
    { op: "emit", type: "actor.started", actor: "actor_w", payload: { parentActorId: ROOT } },
    { op: "emit", type: "actor.finished", actor: "actor_w" },
    ...finish(),
  ],

  /** Blocker B — forged Kernel artifact via the reserved inline key. */
  "forge-spooled": [...start(), { op: "forge_kernel_artifact", actor: ROOT, actionId: "act_forge", via: "__spooled" }, ...finish()],
  /** Blocker B — forged Kernel artifact via outputRef. */
  "forge-outputref": [...start(), { op: "forge_kernel_artifact", actor: ROOT, actionId: "act_forge", via: "outputRef" }, ...finish()],

  /** Blocker B — legit Kernel-spooled payload, then re-cite that registered artifact. */
  "reuse-registered": [
    ...start(),
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_inl", kind: "command" } },
    { op: "emit", type: "action.finished", actor: ROOT, payload: { actionId: "act_inl", kind: "command", exitCode: 0, summary: "big inline", output: "x".repeat(100 * 1024) } },
    { op: "sleep", ms: 300 },
    { op: "cite_registered_artifact", actor: ROOT, actionId: "act_reuse" },
    ...finish(),
  ],

  /** Duration re-arm — a run that outlives a short maxDurationMs. */
  slow: [...start(), { op: "sleep", ms: 4_000 }, ...finish()],

  /** Blocker B — adapter forges a provenance record for planted bytes. */
  "forge-registration": [...start(), { op: "forge_registration", actor: ROOT }, ...finish()],

  /** Blocker 1 — forged durable authority records. */
  "forge-log": [...start(), { op: "forge_log_records" }, ...finish()],

  /** Blocker 2 — action.finished with no action.started (evidence-bearing). */
  "finish-before-start": [
    ...start(),
    { op: "emit", type: "action.finished", actor: ROOT, payload: { actionId: "act_x", kind: "test", exitCode: 0, summary: "never started" } },
    ...finish(),
  ],
  /** Blocker 2 — the same action finished twice. */
  "duplicate-finish": [
    ...start(),
    ...smallTest(ROOT, "act_dup"),
    { op: "emit", type: "action.finished", actor: ROOT, payload: { actionId: "act_dup", kind: "test", exitCode: 0, summary: "again" } },
    ...finish(),
  ],
  /** Blocker 2 — action.updated before action.started. */
  "update-before-start": [
    ...start(),
    { op: "emit", type: "action.updated", actor: ROOT, payload: { actionId: "act_u", progress: 0.5 } },
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_u", kind: "test" } },
    { op: "emit", type: "action.finished", actor: ROOT, payload: { actionId: "act_u", kind: "test", exitCode: 0, summary: "ok" } },
    ...finish(),
  ],
  /** Blocker 2 — run.finished as the very first event (never running). */
  "early-finish": [
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_pre", kind: "test" } },
    { op: "emit", type: "action.finished", actor: ROOT, payload: { actionId: "act_pre", kind: "test", exitCode: 0, summary: "pre" } },
    { op: "emit", type: "run.finished", actor: ROOT },
  ],
  /** Blocker 2 — an actor keeps acting after it finished. */
  "actor-after-finish": [
    ...start(),
    { op: "emit", type: "actor.fork", actor: ROOT, payload: { childActorIds: ["actor_w"] } },
    { op: "emit", type: "actor.started", actor: "actor_w", payload: { parentActorId: ROOT } },
    { op: "emit", type: "actor.finished", actor: "actor_w" },
    ...smallTest("actor_w", "act_zombie"),
    { op: "emit", type: "actor.finished", actor: "actor_w" },
    ...finish(),
  ],

  /** Blocker 2 — one actor completes another actor's action. */
  "steal-action": [
    ...start(),
    { op: "emit", type: "actor.fork", actor: ROOT, payload: { childActorIds: ["actor_w1", "actor_w2"] } },
    { op: "emit", type: "actor.started", actor: "actor_w1", payload: { parentActorId: ROOT } },
    { op: "emit", type: "actor.started", actor: "actor_w2", payload: { parentActorId: ROOT } },
    { op: "emit", type: "action.started", actor: "actor_w1", payload: { actionId: "act_s", kind: "test" } },
    { op: "emit", type: "action.finished", actor: "actor_w2", payload: { actionId: "act_s", kind: "test", exitCode: 0, summary: "stolen" } },
    { op: "emit", type: "action.finished", actor: "actor_w1", payload: { actionId: "act_s", kind: "test", exitCode: 1, summary: "real" } },
    { op: "emit", type: "actor.finished", actor: "actor_w1" },
    { op: "emit", type: "actor.finished", actor: "actor_w2" },
    ...finish(),
  ],

  /** Blocker 3 — attempt writes partial work, then dies. */
  "crash-after-write": [
    ...start(),
    { op: "write_file", actor: ROOT, rel: "src/partial.ts", content: "export const partial = 'half';\n", actionId: "act_p" },
    { op: "crash", code: 137 },
  ],
  /** Blocker 3 — reaches a no-writer checkpoint, then leaves unreported dirt and dies. */
  "checkpoint-then-crash": [
    ...start(),
    { op: "write_file", actor: ROOT, rel: "src/a.ts", content: "export const a = 1;\n", actionId: "act_a" },
    { op: "emit", type: "actor.finished", actor: ROOT },
    { op: "sleep", ms: 1_200 },
    { op: "write_raw", rel: "src/partial.ts", content: "export const partial = 'half';\n" },
    { op: "crash", code: 137 },
  ],

  /** Blocker C — non-DVL1 stdout volume with almost no protocol frames. */
  "stdout-noise-flood": [...start(), { op: "stdout_flood", bytes: 1024 * 1024 }, ...finish()],
  /** Blocker C — stderr volume with almost no protocol frames. */
  "stderr-flood": [...start(), { op: "stderr_flood", bytes: 1024 * 1024 }, ...finish()],

  /**
   * H4 — stages one harmless, test-only file in the attempt workspace of a REAL target project
   * (a new probe test; no application code, config, secrets, database or network), then stays
   * busy so the host can kill the KERNEL mid-run. Never reaches run.finished on its own in time.
   */
  "h4-target-probe": [
    ...start(),
    { op: "write_file", actor: ROOT, rel: "tests/dvl-h4-probe.test.ts", content: H4_PROBE, actionId: "act_h4_probe" },
    { op: "sleep", ms: 60_000 },
    ...finish(),
  ],
  /** H4 — exact UNKNOWN window: durable action.started, then hold before any side effect closure. */
  "h4-action-started-hold": [
    ...start(),
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_h4_probe", kind: "file_write", target: "tests/dvl-h4-probe.test.ts" } },
    { op: "sleep", ms: 60_000 },
  ],

  /** B3 — a group-member writer keeps mutating the workspace; durable action.started once it runs. */
  "h4-action-started-writer": [
    ...start(),
    { op: "spawn_writer", rel: "late-write.log" },
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_h4_probe", kind: "file_write", target: "late-write.log" } },
    { op: "sleep", ms: 60_000 },
  ],
  /** B3 — same, but the writer leaves the process group (setsid): not killable via the group. */
  "h4-action-started-escapee": [
    ...start(),
    { op: "spawn_writer", rel: "late-write.log", escape: true },
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_h4_probe", kind: "file_write", target: "late-write.log" } },
    { op: "sleep", ms: 60_000 },
  ],
  /** H4 — the same harmless probe, run to completion (retry after recovery, in-process windows). */
  "h4-target-probe-finish": [
    ...start(),
    { op: "write_file", actor: ROOT, rel: "tests/dvl-h4-probe.test.ts", content: H4_PROBE, actionId: "act_h4_probe" },
    ...finish(),
  ],

  /** Adapter death mid-run. */
  crash: [
    ...start(),
    { op: "emit", type: "action.started", actor: ROOT, payload: { actionId: "act_c", kind: "command" } },
    { op: "stderr", text: "FATAL: segfault simulated\n" },
    { op: "crash", code: 137 },
  ],
};
