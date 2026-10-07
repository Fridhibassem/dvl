/**
 * C13 — Blocker 1: untrusted execution can never manufacture durable Kernel authority.
 *
 * Trust boundary (Phase 1, no OS sandbox): the adapter runs as the same OS user and CAN
 * write .dvl/events/events.jsonl and .dvl/evidence/evidence.jsonl. JSON fields such as
 * origin:"kernel" / trust:"kernel_truth", or mere presence in the log, prove nothing.
 * Authority = a record authenticated by the Kernel: an HMAC chain keyed by a secret the
 * HOST hands to the Kernel in memory (never env, disk, or the adapter). Replay accepts
 * only records whose MAC verifies against the previous accepted record.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "../kernel/event-store.js";
import { Kernel } from "../kernel/kernel.js";
import { mockProviderCommand } from "../kernel/mock-launch.js";
import type { ArtifactRef } from "../kernel/types.js";
import { keyFor, kernelOn, makeKernel, runScenario } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown()));
  kernels = [];
});
const track = (k: Kernel) => (kernels.push(k), k);
const rootOf = (k: Kernel) => path.dirname(k.store.dvlDir);
const lines = (file: string) => fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
const writeLines = (file: string, ls: string[]) => fs.writeFileSync(file, ls.join("\n") + "\n");
const integrityEvents = (k: Kernel) => k.store.ofType("kernel.integrity_violation").map((e) => e.payload as Record<string, unknown>);

describe("C13 durable authority is Kernel-authenticated (blocker 1)", () => {
  it("1. adapter-appended forged origin:kernel records (registration + VALIDATED evidence) are rejected on replay", async () => {
    const k = track(makeKernel("c13-forge"));
    const { status } = await runScenario(k, "forge-log");
    expect(status).toBe("finished");
    await k.shutdown();
    const root = rootOf(k);
    const forgedLine = lines(k.store.eventsPath).find((l) => l.includes("evt_forged_registration"))!;
    expect(JSON.parse(forgedLine)).toMatchObject({ origin: "kernel", trust: "kernel_truth", type: "kernel.artifact_registered" });
    const forged = JSON.parse(forgedLine).payload as ArtifactRef;
    expect(sha256(fs.readFileSync(path.join(root, forged.path)))).toBe(forged.hash); // bytes really planted

    const replay = track(kernelOn(root));
    expect((replay.store.verifyKernelArtifact(forged) as { reason: string }).reason).toMatch(/not registered/);
    expect(replay.store.all().some((e) => e.eventId === "evt_forged_registration")).toBe(false);
    expect(replay.store.readEvidenceFromDisk().some((e) => e.evidenceId === "evd_forged")).toBe(false);
    expect(replay.store.allEvidence().some((e) => e.validationStatus === "VALIDATED")).toBe(false);
    const iv = integrityEvents(replay);
    expect(iv).toHaveLength(1);
    expect((iv[0]!.events as { rejected: unknown[] }).rejected).toHaveLength(1);
    expect((iv[0]!.evidence as { rejected: unknown[] }).rejected).toHaveLength(1);
    // Every legitimate record of the run still replays.
    expect(replay.store.all().filter((e) => e.type === "run.finished")).toHaveLength(1);
  });

  it("2. a modified Kernel record is detected and stops conferring authority", async () => {
    const k = track(makeKernel("c13-modify"));
    await runScenario(k, "oversized-spooled");
    await k.shutdown();
    const ref = k.store.readEvidenceFromDisk().find((e) => e.relatedActionId === "act_big")!.artifactRefs[0]!;
    const ls = lines(k.store.eventsPath);
    const i = ls.findIndex((l) => l.includes('"kernel.artifact_registered"'));
    const rec = JSON.parse(ls[i]!);
    rec.payload.summary = "tampered"; // keep the old MAC
    ls[i] = JSON.stringify(rec);
    writeLines(k.store.eventsPath, ls);

    const replay = track(kernelOn(rootOf(k)));
    expect(replay.store.verifyKernelArtifact(ref).ok).toBe(false);
    const rep = replay.store.integrity.events;
    expect(rep.ok).toBe(false);
    expect(rep.rejected[0]).toMatchObject({ line: i + 1, reason: "mac_mismatch" });
    expect(rep.accepted).toBe(i); // fail-closed: nothing after the break is trusted
  });

  it("3. inserted, deleted and reordered records are handled fail-closed", async () => {
    const k = track(makeKernel("c13-shape"));
    await runScenario(k, "happy");
    await k.shutdown();
    const orig = lines(k.store.eventsPath);
    const n = orig.length;
    const root = rootOf(k);
    const attempt = (mutate: (ls: string[]) => string[]) => {
      writeLines(k.store.eventsPath, mutate([...orig]));
      const r = kernelOn(root); // read-only replay: never started
      return r.store;
    };
    // Insert a forged line mid-log: rejected; every legitimate line around it still accepted.
    const ins = attempt((ls) => [...ls.slice(0, 5), JSON.stringify({ eventId: "evt_ins", kernelSequence: 6, origin: "kernel", trust: "kernel_truth", type: "kernel.run_finished", mac: "f".repeat(64) }), ...ls.slice(5)]);
    expect(ins.integrity.events.rejected.map((r) => r.line)).toEqual([6]);
    expect(ins.integrity.events.accepted).toBe(n);
    expect(ins.all().some((e) => e.eventId === "evt_ins")).toBe(false);
    // Delete a middle line: the chain breaks there; the suffix is not trusted.
    const del = attempt((ls) => [...ls.slice(0, 5), ...ls.slice(6)]);
    expect(del.integrity.events.ok).toBe(false);
    expect(del.integrity.events.accepted).toBe(5);
    // Swap two adjacent lines.
    const swp = attempt((ls) => [...ls.slice(0, 5), ls[6]!, ls[5]!, ...ls.slice(7)]);
    expect(swp.integrity.events.ok).toBe(false);
    // The line now at position 6 IS the genuine successor of line 5, so the authentic
    // prefix is 6 records; the displaced line and everything after the break are rejected.
    expect(swp.integrity.events.accepted).toBe(6);
    expect(swp.integrity.events.rejected[0]!.line).toBe(6);
    // Untouched log: everything accepted, no violation.
    const ok = attempt((ls) => ls);
    expect(ok.integrity.events).toMatchObject({ ok: true, accepted: n, rejected: [] });
  });

  it("4. tail truncation / rollback is detected only against a host-held head anchor", async () => {
    const k = track(makeKernel("c13-truncate"));
    await runScenario(k, "happy");
    await k.shutdown();
    const head = k.store.head();
    expect(head.count).toBe(lines(k.store.eventsPath).length);
    writeLines(k.store.eventsPath, lines(k.store.eventsPath).slice(0, -3));
    // Without an anchor, a clean prefix is indistinguishable from a shorter history (documented limit).
    expect(kernelOn(rootOf(k)).store.integrity.events.ok).toBe(true);
    // With the host's anchor, the rollback is detected — and fails closed (H2 commit model):
    // no authority is installed from the shortened chain, and nothing new is appended to it
    // (no diagnostic record that could replace the host checkpoint). Startup is refused.
    const bytesBefore = fs.readFileSync(k.store.eventsPath);
    const anchored = track(kernelOn(rootOf(k), { expectedHead: head }));
    expect(anchored.store.integrity.events).toMatchObject({ ok: false, truncated: true });
    expect(anchored.store.recovery?.source).toBe("anchor_mismatch");
    expect(anchored.store.all()).toEqual([]);
    expect(integrityEvents(anchored)).toHaveLength(0);
    expect(fs.readFileSync(k.store.eventsPath)).toEqual(bytesBefore);
    expect(() => anchored.start()).toThrow(/anchor mismatch/);
  });

  it("5. legitimate Kernel records replay completely; evidence and provenance are rebuilt", async () => {
    const k = track(makeKernel("c13-legit"));
    await runScenario(k, "oversized-spooled");
    await k.shutdown();
    const ref = k.store.readEvidenceFromDisk().find((e) => e.relatedActionId === "act_big")!.artifactRefs[0]!;
    const replay = track(kernelOn(rootOf(k)));
    expect(replay.store.integrity.events).toMatchObject({ ok: true, rejected: [] });
    expect(replay.store.integrity.evidence).toMatchObject({ ok: true, rejected: [] });
    expect(replay.store.all().map((e) => e.eventId)).toEqual(k.store.all().map((e) => e.eventId));
    expect(replay.store.verifyKernelArtifact(ref)).toEqual({ ok: true });
    expect(integrityEvents(replay)).toHaveLength(0);
    // Appending after replay continues the chain: a second replay is still clean.
    replay.start();
    await replay.describe();
    await replay.shutdown();
    expect(kernelOn(rootOf(k)).store.integrity.events).toMatchObject({ ok: true, rejected: [] });
  });

  it("6. the integrity key never reaches the adapter; a Kernel without the host key trusts nothing", async () => {
    const k = track(makeKernel("c13-key", { adapterEnv: { DVL_MOCK_DUMP_ENV: "1" } }));
    k.start();
    await k.describe();
    const key = keyFor(rootOf(k));
    const forms = [key, Buffer.from(key.toString("hex")), Buffer.from(key.toString("base64"))];
    const pid = (k as unknown as { child: { pid: number } }).child.pid;
    // Linux only: the child's environment as the OS sees it.
    if (fs.existsSync(`/proc/${pid}/environ`)) {
      const procEnv = fs.readFileSync(`/proc/${pid}/environ`);
      for (const f of forms) expect(procEnv.includes(f)).toBe(false);
    }
    await k.shutdown(); // closed ⇒ stderr fully drained to the instance's diagnostics spool
    // Portable (Linux and macOS): the adapter's own dump of process.env, drained from stderr.
    const stderr = fs.readFileSync(k.stderrSpoolPath!);
    const dumpLine = stderr.toString("utf8").split("\n").find((l) => l.startsWith("DVL_MOCK_ENV_DUMP "));
    expect(dumpLine).toBeDefined(); // non-vacuous: we really saw the adapter's environment
    const childEnv = JSON.parse(dumpLine!.slice("DVL_MOCK_ENV_DUMP ".length)) as Record<string, string>;
    expect(childEnv.DVL_PROJECT_ROOT).toBe(rootOf(k));
    const dump = Buffer.from(dumpLine!);
    for (const f of forms) expect(dump.includes(f)).toBe(false);
    // Same root, different key (e.g. an attacker's or a misconfigured host): nothing authenticates.
    const stranger = track(new Kernel({ root: rootOf(k), adapterCommand: mockProviderCommand(), integrityKey: Buffer.alloc(32, 7) }));
    expect(stranger.store.integrity.events.accepted).toBe(0);
    expect(stranger.store.all().every((e) => e.type === "kernel.integrity_violation")).toBe(true);
    expect(stranger.store.integrity.events.ok).toBe(false);
  });
});
