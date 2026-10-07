/**
 * C24 — H2 anchor mismatch, commit-boundary publication, and recovery safety.
 *
 *   B1 — a host anchor that the log cannot reach (log shorter, MAC differs at the boundary,
 *        or a valid-MAC tail behind a wrong anchor) fails closed: no history, evidence or
 *        artifact registration is installed from either log; start/append/evidence/ordinary
 *        recovery are refused; nothing is written and the host anchor is not replaced — until
 *        an explicit host decision (restore the logs, or reopen with accept_disk_rollback).
 *   B2 — publishing the new boundary (onCommit) is part of the commit. If it throws, the record
 *        is not committed live, the store seals, nothing can be appended across the
 *        unpublished boundary, and on restart the HOST's boundary decides.
 *   B3 — recovery re-binds both logs before quarantine, before and after truncation, and
 *        before clearing; any unsafe state keeps the seal/recovery state and the marker.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FsProbe } from "../kernel/confined-fs.js";
import type { ChainHead, CommitHeads, LogKind } from "../kernel/event-store.js";
import type { Kernel, KernelOptions } from "../kernel/kernel.js";
import type { ArtifactRef, EvidenceRecord, StoredEvent } from "../kernel/types.js";
import { anchorsFor, integrityCode, kernelOn, makeKernel, runScenario } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown().catch(() => undefined)));
  kernels = [];
});
const track = (k: Kernel) => (kernels.push(k), k);
const rootOf = (k: Kernel) => path.dirname(k.store.dvlDir);
const outsideDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dvl-c24-outside-"));
const logOf = (k: Kernel, kind: LogKind) => (kind === "events" ? k.store.eventsPath : k.store.evidencePath);
const markerPath = (k: Kernel) => path.join(k.store.dvlDir, "integrity", "sealed.json");
const lines = (p: string) => fs.readFileSync(p, "utf8").split("\n").filter(Boolean);
const evidenceRec = (id: string): EvidenceRecord =>
  ({ evidenceId: id, runId: "run_x", attempt: 1, evidenceType: "TEST_RESULT", source: "PROVIDER_HARNESS_RECORD", validationStatus: "PERSISTED", artifactRefs: [] }) as unknown as EvidenceRecord;
function writeOne(k: Kernel, kind: LogKind, id: string) {
  return kind === "events" ? k.store.append({ origin: "kernel", trust: "kernel_truth", type: "kernel.probe", payload: { id } }) : k.store.putEvidence(evidenceRec(id));
}
const seqs = (k: Kernel) => k.store.all().map((e: StoredEvent) => e.kernelSequence);
const contiguous = (xs: number[]) => xs.every((x, i) => x === i + 1);

/** A finished oversized-spooled run: committed events, evidence and an artifact registration. */
async function committedProject(tag: string) {
  const k = track(makeKernel(tag));
  await runScenario(k, "oversized-spooled");
  await k.shutdown();
  const root = rootOf(k);
  const ref = k.store.readEvidenceFromDisk().find((e) => e.relatedActionId === "act_big")!.artifactRefs[0]!;
  return { root, ref, anchors: anchorsFor(root)!, k };
}

/** Assert the fail-closed anchor-mismatch state on a freshly opened Kernel. */
function expectMismatchClosed(r: Kernel, ref: ArtifactRef, root: string, before: { events: Buffer; evidence: Buffer; anchors: CommitHeads }) {
  expect(r.store.recovery?.source).toBe("anchor_mismatch");
  expect(r.store.all()).toEqual([]); // no history installed
  expect(r.store.allEvidence()).toEqual([]); // no evidence installed
  expect((r.store.verifyKernelArtifact(ref) as { reason: string }).reason).toMatch(/not registered/); // no registry
  expect(integrityCode(() => r.start())).toBe("anchor_mismatch");
  expect(integrityCode(() => writeOne(r, "events", "x"))).toBe("anchor_mismatch");
  expect(integrityCode(() => writeOne(r, "evidence", "x"))).toBe("anchor_mismatch");
  expect(integrityCode(() => r.recoverDurableTail())).toBe("anchor_mismatch"); // ordinary recovery refused
  expect(r.kernelEvent("kernel.probe", {})).toBeNull();
  // Nothing written; the host checkpoint is not replaced.
  expect(fs.readFileSync(path.join(root, ".dvl/events/events.jsonl"))).toEqual(before.events);
  expect(fs.readFileSync(path.join(root, ".dvl/evidence/evidence.jsonl"))).toEqual(before.evidence);
  expect(anchorsFor(root)).toEqual(before.anchors);
}
const snapshot = (root: string, anchors: CommitHeads) => ({ events: fs.readFileSync(path.join(root, ".dvl/events/events.jsonl")), evidence: fs.readFileSync(path.join(root, ".dvl/evidence/evidence.jsonl")), anchors });

describe("C24 H2 anchor mismatch, publication and recovery", () => {
  // ───────── Blocker 1 ─────────
  for (const kind of ["events", "evidence"] as const) {
    it(`B1a. ${kind} log shorter than the host anchor → fail closed, no authority, no writes, no head replacement`, async () => {
      const { root, ref, anchors } = await committedProject(`c24-short-${kind}`);
      const log = path.join(root, kind === "events" ? ".dvl/events/events.jsonl" : ".dvl/evidence/evidence.jsonl");
      fs.writeFileSync(log, lines(log).slice(0, -1).join("\n") + "\n"); // rollback by one record
      const before = snapshot(root, anchors);
      expectMismatchClosed(track(kernelOn(root, { expectedHeads: anchors })), ref, root, before);
    });

    it(`B1b. ${kind}: count-matched host anchor with a different MAC → fail closed`, async () => {
      const { root, ref, anchors } = await committedProject(`c24-macmismatch-${kind}`);
      const wrong: CommitHeads = { ...anchors, [kind]: { count: anchors[kind].count, mac: "0".repeat(64) } };
      const before = snapshot(root, anchors);
      expectMismatchClosed(track(kernelOn(root, { expectedHeads: wrong })), ref, root, before);
    });

    it(`B1c. ${kind}: valid-MAC records behind a wrong host anchor are not promoted`, async () => {
      const { root, ref, anchors } = await committedProject(`c24-wrongtail-${kind}`);
      // Anchor claims an earlier point on a DIFFERENT chain: every disk record is MAC-valid.
      const wrong: CommitHeads = { ...anchors, [kind]: { count: Math.max(1, anchors[kind].count - 1), mac: "f".repeat(64) } as ChainHead };
      const before = snapshot(root, anchors);
      const r = track(kernelOn(root, { expectedHeads: wrong }));
      expect(r.store.integrity[kind].rejected).toEqual([]); // all MAC-valid…
      expectMismatchClosed(r, ref, root, before); // …and still no authority
    });
  }

  it("B1d. the marker boundary unreachable (log rolled back below it) also fails closed", async () => {
    const k = track(makeKernel("c24-marker-rollback", { fsync: true, ioFaults: { log: (_k, ph, r) => (ph === "fsync" && (r.payload as { id?: string } | undefined)?.id === "uncertain" ? "fail" : undefined) } }));
    writeOne(k, "events", "a");
    writeOne(k, "events", "b");
    expect(integrityCode(() => writeOne(k, "events", "uncertain"))).toBe("uncommitted");
    const root = rootOf(k);
    const log = k.store.eventsPath;
    fs.writeFileSync(log, lines(log).slice(0, 1).join("\n") + "\n"); // below the marker's boundary
    const r = track(kernelOn(root)); // no host anchors: the authenticated marker is the boundary
    expect(r.store.recovery?.source).toBe("anchor_mismatch");
    expect(r.store.recovery?.mismatch?.events?.boundary).toBe("seal_marker");
    expect(r.store.all()).toEqual([]);
    expect(integrityCode(() => r.recoverDurableTail())).toBe("anchor_mismatch");
  });

  it("B1e. only an explicit host decision (accept_disk_rollback) adopts the disk chain, records it, and publishes the new boundary", async () => {
    const { root, ref, anchors } = await committedProject("c24-decision");
    const log = path.join(root, ".dvl/events/events.jsonl");
    fs.writeFileSync(log, lines(log).slice(0, -1).join("\n") + "\n");
    const r = track(kernelOn(root, { expectedHeads: anchors, hostDecision: "accept_disk_rollback" }));
    expect(r.store.recovery).toBeNull();
    expect(r.store.rollbackAccepted?.previous.events).toEqual(anchors.events);
    expect(r.store.all().length).toBeGreaterThan(0);
    expect(r.store.verifyKernelArtifact(ref)).toEqual({ ok: true });
    expect(r.store.ofType("kernel.anchor_rollback_accepted")).toHaveLength(1);
    expect(anchorsFor(root)).toEqual(r.store.heads()); // the host now holds the adopted boundary
    r.start(); // normal operation only after the decision
    await r.describe();
  });

  // ───────── Blocker 2 ─────────
  for (const kind of ["events", "evidence"] as const) {
    it(`B2a. ${kind}: onCommit throws (host did not save) → not committed, sealed, no live/head/disk divergence; old boundary quarantines it; sequence coherent`, () => {
      let failNext = false;
      const k = track(makeKernel(`c24-pub-${kind}`, { onCommit: () => void (failNext && ((failNext = false), (() => { throw new Error("host unavailable"); })())) }));
      writeOne(k, "events", "e1");
      writeOne(k, "evidence", "v1");
      const root = rootOf(k);
      const heads0 = k.store.heads();
      const host0 = anchorsFor(root);
      const n0 = { ev: k.store.all().length, evd: k.store.allEvidence().length };
      failNext = true;
      expect(integrityCode(() => writeOne(k, kind, "unpublished"))).toBe("publication_failed");
      expect(k.store.sealed).not.toBeNull();
      expect(k.store.heads()).toEqual(heads0); // internal head == host boundary == live history
      expect(anchorsFor(root)).toEqual(host0);
      expect({ ev: k.store.all().length, evd: k.store.allEvidence().length }).toEqual(n0);
      // Same-instance disk reads do not expose the unpublished record (it IS on disk).
      expect(fs.readFileSync(logOf(k, kind), "utf8")).toContain("unpublished");
      const onDisk = kind === "events" ? k.store.readFromDisk().some((e) => (e.payload as { id?: string } | undefined)?.id === "unpublished") : k.store.readEvidenceFromDisk().some((e) => e.evidenceId === "unpublished");
      expect(onDisk).toBe(false);
      // No later append crosses the unpublished boundary.
      expect(integrityCode(() => writeOne(k, "events", "later"))).toBe("sealed");
      expect(integrityCode(() => writeOne(k, "evidence", "later"))).toBe("sealed");
      // Restart with the host's (old) boundary: quarantined, not promoted.
      const r = track(kernelOn(root, { expectedHeads: anchorsFor(root) }));
      expect(r.store.recovery).toMatchObject({ source: "host_anchor" });
      expect(r.store.recovery!.uncommitted[kind].records).toBe(1);
      r.recoverDurableTail();
      writeOne(r, "events", "after");
      const again = track(kernelOn(root, { expectedHeads: anchorsFor(root) }));
      expect(again.store.integrity.events).toMatchObject({ ok: true, rejected: [] });
      expect(contiguous(seqs(again))).toBe(true); // kernelSequence coherent, no gap/duplicate
      expect(JSON.stringify(again.store.all())).not.toContain("unpublished");
      expect(again.store.allEvidence().some((e) => e.evidenceId === "unpublished")).toBe(false);
    });

    it(`B2b. ${kind}: host saved the boundary but failed to confirm → live: not committed, sealed; restart: the host's boundary decides (committed)`, () => {
      let saved: CommitHeads | null = null;
      let failNext = false;
      const k = track(
        makeKernel(`c24-pub-saved-${kind}`, {
          onCommit: (h) => {
            if (failNext) {
              failNext = false;
              saved = h; // the host persisted it…
              throw new Error("confirmation lost"); // …but the confirmation never arrived
            }
          },
        }),
      );
      writeOne(k, "events", "e1");
      failNext = true;
      expect(integrityCode(() => writeOne(k, kind, "saved_unconfirmed"))).toBe("publication_failed");
      expect(k.store.sealed).not.toBeNull();
      const root = rootOf(k);
      const r = track(kernelOn(root, { expectedHeads: saved! }));
      // Host boundary includes the record → committed; the seal marker still forces an explicit recovery step.
      const present = kind === "events" ? r.store.all().some((e) => (e.payload as { id?: string } | undefined)?.id === "saved_unconfirmed") : r.store.allEvidence().some((e) => e.evidenceId === "saved_unconfirmed");
      expect(present).toBe(true);
      expect(r.store.recovery?.source).toBe("host_anchor");
      expect(r.recoverDurableTail().quarantined[kind].bytes).toBe(0);
      writeOne(r, "events", "after");
      expect(contiguous(seqs(track(kernelOn(root, { expectedHeads: anchorsFor(root) }))))).toBe(true);
    });
  }

  // ───────── Blocker 3 ─────────

  /** A sealed store with an uncommitted tail in `kind` (fsync error), optionally junk in the other log. */
  function sealedWithTail(tag: string, kind: LogKind, extra: Partial<KernelOptions> = {}, junkInOther = false) {
    let probeFn: FsProbe = () => {};
    let truncateFault: LogKind | null = null;
    const k = track(
      makeKernel(tag, {
        fsync: true,
        fsProbe: (s, t) => probeFn(s, t),
        ioFaults: {
          log: (kk, ph, r) => (kk === kind && ph === "fsync" && JSON.stringify(r).includes("uncertain") ? "fail" : undefined),
          recover: (kk) => (kk === truncateFault ? "fail" : undefined),
        },
        ...extra,
      }),
    );
    writeOne(k, "events", "e1");
    writeOne(k, "evidence", "v1");
    expect(integrityCode(() => writeOne(k, kind, "uncertain"))).toBe("uncommitted");
    const other: LogKind = kind === "events" ? "evidence" : "events";
    if (junkInOther) fs.appendFileSync(logOf(k, other), '{"junk":true}\n'); // inert bytes beyond its boundary
    const sizes = { events: fs.statSync(k.store.eventsPath).size, evidence: fs.statSync(k.store.evidencePath).size };
    return {
      k,
      sizes,
      setProbe: (f: FsProbe) => (probeFn = f),
      setTruncateFault: (x: LogKind | null) => (truncateFault = x),
    };
  }
  const expectStillSealed = (k: Kernel) => {
    expect(k.store.sealed).not.toBeNull();
    expect(fs.existsSync(markerPath(k))).toBe(true);
    expect(integrityCode(() => writeOne(k, "events", "blocked"))).toBe("sealed");
  };

  for (const kind of ["events", "evidence"] as const) {
    it(`B3a. ${kind} log hard-linked during recovery → recovery_failed, seal kept, aliased inode not truncated; retry after removal succeeds`, () => {
      const s = sealedWithTail(`c24-rec-link-${kind}`, kind);
      const alias = path.join(outsideDir(), "victim.jsonl");
      let once = true;
      s.setProbe((stage, t) => {
        if (once && stage === "recover:before-truncate" && t.endsWith(`${kind}.jsonl`)) {
          once = false;
          fs.linkSync(t, alias);
        }
      });
      expect(integrityCode(() => s.k.recoverDurableTail())).toBe("recovery_failed");
      expectStillSealed(s.k);
      expect(fs.statSync(alias).size).toBe(s.sizes[kind]); // outside name: content unchanged, not truncated
      fs.rmSync(alias);
      expect(s.k.recoverDurableTail().quarantined[kind].bytes).toBeGreaterThan(0);
      expect(s.k.store.sealed).toBeNull();
      expect(fs.readFileSync(logOf(s.k, kind), "utf8")).not.toContain("uncertain"); // tail moved to quarantine
    });
  }

  it("B3b. log relocated during recovery → recovery_failed, seal kept, relocated log untouched", () => {
    const s = sealedWithTail("c24-rec-move", "events");
    const moved = path.join(outsideDir(), "moved-events");
    let once = true;
    s.setProbe((stage, t) => {
      if (once && stage === "recover:before-truncate" && t.endsWith("events.jsonl")) {
        once = false;
        fs.renameSync(path.dirname(t), moved);
      }
    });
    expect(integrityCode(() => s.k.recoverDurableTail())).toBe("recovery_failed");
    expectStillSealed(s.k);
    expect(fs.statSync(path.join(moved, "events.jsonl")).size).toBe(s.sizes.events);
  });

  it("B3c. unsafe quarantine destination → recovery_failed, nothing written outside, logs not truncated, seal kept", () => {
    const s = sealedWithTail("c24-rec-quarantine", "evidence");
    const out = outsideDir();
    let once = true;
    s.setProbe((stage, t) => {
      if (once && stage === "recover:before-quarantine") {
        once = false;
        const dir = path.dirname(t);
        fs.renameSync(dir, `${dir}-moved`);
        fs.symlinkSync(out, dir);
      }
    });
    expect(integrityCode(() => s.k.recoverDurableTail())).toBe("recovery_failed");
    expect(s.k.store.sealed).not.toBeNull();
    expect(fs.readdirSync(out)).toEqual([]);
    expect({ events: fs.statSync(s.k.store.eventsPath).size, evidence: fs.statSync(s.k.store.evidencePath).size }).toEqual(s.sizes);
  });

  it("B3d. truncation failure → recovery_failed, seal and exact tail kept; retry without the fault succeeds", () => {
    const s = sealedWithTail("c24-rec-trunc", "events");
    const tailBefore = fs.readFileSync(s.k.store.eventsPath);
    s.setTruncateFault("events");
    expect(integrityCode(() => s.k.recoverDurableTail())).toBe("recovery_failed");
    expectStillSealed(s.k);
    expect(fs.readFileSync(s.k.store.eventsPath)).toEqual(tailBefore);
    s.setTruncateFault(null);
    const rep = s.k.recoverDurableTail();
    expect(rep.quarantined.events.bytes).toBeGreaterThan(0);
    expect(s.k.store.sealed).toBeNull();
  });

  it("B3e. both logs must be safe before the seal clears: second log aliased after the first was truncated → seal kept", () => {
    const s = sealedWithTail("c24-rec-both", "events", {}, true); // tails in BOTH logs
    const alias = path.join(outsideDir(), "victim-evidence.jsonl");
    let once = true;
    s.setProbe((stage, t) => {
      if (once && stage === "recover:before-truncate" && t.endsWith("evidence.jsonl")) {
        once = false;
        fs.linkSync(t, alias);
      }
    });
    expect(integrityCode(() => s.k.recoverDurableTail())).toBe("recovery_failed");
    expectStillSealed(s.k);
    expect(fs.statSync(alias).size).toBe(s.sizes.evidence); // victim unchanged
    // Alias created after both truncations, just before clearing: still refused.
    fs.rmSync(alias);
    let once2 = true;
    s.setProbe((stage) => {
      if (once2 && stage === "recover:before-clear") {
        once2 = false;
        fs.linkSync(s.k.store.eventsPath, alias);
      }
    });
    expect(integrityCode(() => s.k.recoverDurableTail())).toBe("recovery_failed");
    expectStillSealed(s.k);
    fs.rmSync(alias);
    s.setProbe(() => {});
    s.k.recoverDurableTail();
    expect(s.k.store.sealed).toBeNull();
    expect(fs.existsSync(markerPath(s.k))).toBe(false);
  });
});
