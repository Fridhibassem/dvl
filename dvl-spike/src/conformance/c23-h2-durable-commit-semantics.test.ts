/**
 * C23 — H2 durable commit semantics (Option A: "refused means not committed").
 *
 * Model under test:
 *   - COMMITTED = write + optional fsync + post-write integrity re-check all succeeded; only
 *     then do head, history and the host-published commit boundary (onCommit) advance.
 *   - Any error after a durable write begins is UNCERTAIN: not committed, the store seals
 *     before any later append (no append from the old head → no chain fork), an incident is
 *     reported to the host and persisted best-effort as an authenticated seal marker.
 *   - Same-instance disk reads return committed records only.
 *   - Replay never goes beyond the commit boundary (host anchors, else the seal marker):
 *     the tail is quarantined, never authoritative (history, evidence, artifact registry), and
 *     the store opens RECOVERY_REQUIRED until the host calls recover().
 *   - Without host anchors AND without the marker (deleted by a same-user process), a
 *     complete signed tail record cannot be told apart from a committed one — asserted as a
 *     documented limitation. A torn fragment is always quarantined.
 *   - Validation observes current state only: a transient alias created and removed around
 *     the write is NOT detected (asserted as a documented limitation).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FsProbe } from "../kernel/confined-fs.js";
import type { LogKind } from "../kernel/event-store.js";
import type { Kernel, KernelOptions } from "../kernel/kernel.js";
import type { ArtifactRef, EvidenceRecord } from "../kernel/types.js";
import { anchorsFor, integrityCode, kernelOn, makeKernel, runScenario } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown().catch(() => undefined)));
  kernels = [];
});
const track = (k: Kernel) => (kernels.push(k), k);
const rootOf = (k: Kernel) => path.dirname(k.store.dvlDir);
const outsideDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dvl-c23-outside-"));
const size = (p: string) => fs.statSync(p).size;
const markerPath = (k: Kernel) => path.join(k.store.dvlDir, "integrity", "sealed.json");
const quarantineFiles = (k: Kernel) => fs.readdirSync(path.join(k.store.dvlDir, "integrity")).filter((f) => f.startsWith("quarantine-"));
const evidenceRec = (id: string, extra: Partial<EvidenceRecord> = {}): EvidenceRecord =>
  ({ evidenceId: id, runId: "run_x", attempt: 1, evidenceType: "TEST_RESULT", source: "PROVIDER_HARNESS_RECORD", validationStatus: "PERSISTED", artifactRefs: [], ...extra }) as unknown as EvidenceRecord;
const logPath = (k: Kernel, kind: LogKind) => (kind === "events" ? k.store.eventsPath : k.store.evidencePath);

/** One fault on the first record of `kind` matching `pick`, at `phase`. */
function faultOnce(kind: LogKind, phase: "write" | "fsync", fault: "fail" | "partial", pick: (r: Record<string, unknown>) => boolean): NonNullable<KernelOptions["ioFaults"]> & { state: { armed: boolean; fired: boolean } } {
  const state = { armed: false, fired: false };
  return {
    state,
    log: (k, ph, r) => {
      if (state.armed && !state.fired && k === kind && ph === phase && pick(r)) {
        state.fired = true;
        return fault;
      }
      return undefined;
    },
  };
}

/** Append one probe record to `kind` (events: Kernel record; evidence: a record with id). */
function writeOne(k: Kernel, kind: LogKind, id: string) {
  if (kind === "events") return k.store.append({ origin: "kernel", trust: "kernel_truth", type: "kernel.probe", payload: { id } });
  return k.store.putEvidence(evidenceRec(id));
}
const has = (k: Kernel, kind: LogKind, id: string, source: "memory" | "disk") => {
  if (kind === "events") return (source === "memory" ? k.store.all() : k.store.readFromDisk()).some((e) => (e.payload as { id?: string } | undefined)?.id === id);
  return (source === "memory" ? k.store.allEvidence() : k.store.readEvidenceFromDisk()).some((e) => e.evidenceId === id);
};

describe("C23 H2 durable commit semantics (Option A)", () => {
  for (const kind of ["events", "evidence"] as const) {
    for (const [phase, fault, label] of [
      ["fsync", "fail", "full write then fsync error"],
      ["write", "partial", "partial write then I/O error"],
    ] as const) {
      it(`1. ${kind}: ${label} → not committed, sealed, no fork; replay quarantines it (host anchors / seal marker)`, () => {
        const io = faultOnce(kind, phase, fault, (r) => JSON.stringify(r).includes("uncertain"));
        const k = track(makeKernel(`c23-${kind}-${phase}`, { fsync: true, ioFaults: io }));
        const root = rootOf(k);
        writeOne(k, kind, "committed_before");
        const head0 = k.store.heads();
        const n0 = kind === "events" ? k.store.all().length : k.store.allEvidence().length;
        io.state.armed = true;

        // The uncertain write.
        expect(integrityCode(() => writeOne(k, kind, "uncertain"))).toBe("uncommitted");
        expect(io.state.fired).toBe(true);
        expect(k.store.sealed).not.toBeNull();
        expect(k.store.heads()).toEqual(head0); // head not advanced
        expect(kind === "events" ? k.store.all().length : k.store.allEvidence().length).toBe(n0);
        expect(has(k, kind, "uncertain", "memory")).toBe(false);
        // Same-instance disk reads: committed records only, never the possibly-written one.
        expect(has(k, kind, "uncertain", "disk")).toBe(false);
        expect(has(k, kind, "committed_before", "disk")).toBe(true);
        if (fault === "fail") expect(fs.readFileSync(logPath(k, kind), "utf8")).toContain("uncertain"); // it IS on disk
        // No later append is acknowledged from the old head — in either log.
        const sizeAfter = { events: size(k.store.eventsPath), evidence: size(k.store.evidencePath) };
        expect(integrityCode(() => writeOne(k, "events", "later_ev"))).toBe("sealed");
        expect(integrityCode(() => writeOne(k, "evidence", "later_evd"))).toBe("sealed");
        expect({ events: size(k.store.eventsPath), evidence: size(k.store.evidencePath) }).toEqual(sizeAfter);
        expect(k.store.incident).toMatchObject({ log: kind, code: "uncommitted", markerPersisted: true });
        expect(fs.existsSync(markerPath(k))).toBe(true);

        // Restart WITH host anchors: quarantined, recovery required, nothing authoritative.
        const r1 = track(kernelOn(root, { expectedHeads: anchorsFor(root) }));
        expect(r1.store.recovery).toMatchObject({ source: "host_anchor" });
        expect(r1.store.recovery!.uncommitted[kind].bytes).toBeGreaterThan(0);
        expect(has(r1, kind, "uncertain", "memory")).toBe(false);
        expect(has(r1, kind, "committed_before", "memory")).toBe(true);
        expect(integrityCode(() => r1.start())).toBe("recovery_required");
        expect(integrityCode(() => writeOne(r1, kind, "blocked"))).toBe("recovery_required");

        // Restart WITHOUT host anchors: the authenticated seal marker is the boundary.
        const r2 = track(kernelOn(root));
        expect(r2.store.integrity.marker).toBe("valid");
        expect(r2.store.recovery).toMatchObject({ source: "seal_marker" });
        expect(has(r2, kind, "uncertain", "memory")).toBe(false);

        // Explicit recovery: tail quarantined, logs truncated to the boundary, appends resume.
        const rep = r2.recoverDurableTail();
        expect(rep.quarantined[kind].bytes).toBeGreaterThan(0);
        expect(quarantineFiles(r2).length).toBeGreaterThan(0);
        expect(fs.existsSync(markerPath(r2))).toBe(false);
        writeOne(r2, kind, "after_recovery");
        // Every acknowledged record replays; the uncertain one never does; no mac_mismatch.
        const r3 = track(kernelOn(root, { expectedHeads: anchorsFor(root) }));
        expect(r3.store.integrity[kind]).toMatchObject({ ok: true, rejected: [] });
        expect(r3.store.recovery).toBeNull();
        for (const id of ["committed_before", "after_recovery"]) expect(has(r3, kind, id, "memory")).toBe(true);
        expect(has(r3, kind, "uncertain", "memory")).toBe(false);
      });
    }
  }

  it("2. Codex fork scenario: write+fsync error, later append attempt, restart — no acknowledged record is ever unreplayable", () => {
    const io = faultOnce("events", "fsync", "fail", (r) => JSON.stringify(r).includes("first"));
    const k = track(makeKernel("c23-fork", { fsync: true, ioFaults: io }));
    const acknowledged: string[] = [];
    acknowledged.push((writeOne(k, "events", "pre") as { eventId: string }).eventId);
    io.state.armed = true;
    expect(integrityCode(() => writeOne(k, "events", "first"))).toBe("uncommitted");
    // Previously this second append was acknowledged from the old head and later failed replay.
    expect(integrityCode(() => writeOne(k, "events", "second"))).toBe("sealed");
    const root = rootOf(k);
    for (const anchors of [anchorsFor(root), undefined]) {
      const r = track(kernelOn(root, { expectedHeads: anchors }));
      for (const id of acknowledged) expect(r.store.all().some((e) => e.eventId === id)).toBe(true);
      expect(r.store.integrity.events.rejected).toEqual([]); // no mac_mismatch anywhere
      expect(r.store.all().some((e) => (e.payload as { id?: string } | undefined)?.id === "first")).toBe(false);
    }
  });

  it("3. real Kernel snapshot path: an integrity-refused VALIDATED FILE_SNAPSHOT never becomes VALIDATED after restart", async () => {
    const alias = path.join(outsideDir(), "alias.jsonl");
    let armed = false;
    const k = track(
      makeKernel("c23-snapshot", {
        quiescenceMs: 50,
        ioFaults: {
          log: (kind, phase, r) => {
            // Alias the evidence log at the moment the snapshot record is written.
            if (armed && kind === "evidence" && phase === "write" && r.evidenceType === "FILE_SNAPSHOT") {
              armed = false;
              fs.linkSync(k.store.evidencePath, alias);
            }
            return undefined;
          },
        },
      }),
    );
    const { id, status } = await runScenario(k, "happy");
    expect(status).toBe("finished");
    await new Promise((r) => setTimeout(r, 200)); // past the quiescence window
    armed = true;
    await expect(k.trySnapshot(id.runId)).rejects.toMatchObject({ code: "after_write" });
    expect(k.store.sealed).not.toBeNull();
    const validated = (k2: Kernel) => k2.store.allEvidence().filter((e) => e.validationStatus === "VALIDATED");
    expect(validated(k)).toEqual([]);
    // While the alias exists, disk reads refuse the aliased log outright (static hard-link refusal).
    expect(integrityCode(() => k.store.readEvidenceFromDisk())).toBe("hard_link");
    expect(fs.readFileSync(k.store.evidencePath, "utf8")).toContain("FILE_SNAPSHOT"); // on disk, MAC-valid
    await k.shutdown();
    fs.rmSync(alias); // the alias is removed: the path looks normal again
    const root = rootOf(k);
    // Same instance, after alias removal: disk reads still return committed records only.
    expect(k.store.readEvidenceFromDisk().filter((e) => e.validationStatus === "VALIDATED")).toEqual([]);

    const withAnchors = track(kernelOn(root, { expectedHeads: anchorsFor(root) }));
    expect(validated(withAnchors)).toEqual([]);
    expect(withAnchors.store.recovery?.uncommitted.evidence.records).toBe(1);
    const withMarker = track(kernelOn(root));
    expect(validated(withMarker)).toEqual([]);
    expect(withMarker.store.recovery?.source).toBe("seal_marker");
    withMarker.recoverDurableTail();
    const after = track(kernelOn(root, { expectedHeads: anchorsFor(root) }));
    expect(validated(after)).toEqual([]);
    expect(after.store.integrity.evidence.ok).toBe(true);
  });

  it("4. artifact registration: an uncertain registration write never makes the artifact authoritative (live, replay, recovery)", async () => {
    const io = faultOnce("events", "fsync", "fail", (r) => r.type === "kernel.artifact_registered");
    const k = track(makeKernel("c23-registration", { fsync: true, ioFaults: io }));
    k.start();
    await k.describe();
    io.state.armed = true;
    const runId = (await k.startRun({ role: "builder", goal: "x", acceptanceCriteria: [], scope: ["src/**"], scenario: "oversized-spooled" })).runId;
    await new Promise((r) => setTimeout(r, 1_500));
    expect(io.state.fired).toBe(true);
    expect(k.store.sealed).not.toBeNull();
    const reg = fs
      .readFileSync(k.store.eventsPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .find((e) => e.type === "kernel.artifact_registered");
    const ref = reg.payload as ArtifactRef;
    expect(fs.existsSync(path.join(rootOf(k), ref.path))).toBe(true); // bytes written, registration uncertain
    expect((k.store.verifyKernelArtifact(ref) as { reason: string }).reason).toMatch(/not registered/);
    expect(k.store.readEvidenceFromDisk().some((e) => e.relatedActionId === "act_big")).toBe(false);
    expect(k.runStatus(runId)).not.toBe("finished");
    await k.shutdown();
    const root = rootOf(k);
    for (const opts of [{ expectedHeads: anchorsFor(root) }, {}]) {
      const r = track(kernelOn(root, opts));
      expect((r.store.verifyKernelArtifact(ref) as { reason: string }).reason).toMatch(/not registered/);
    }
    const r = track(kernelOn(root));
    r.recoverDurableTail();
    expect((r.store.verifyKernelArtifact(ref) as { reason: string }).reason).toMatch(/not registered/);
  });

  it("5. limitation: without host anchors AND with the seal marker deleted, a complete signed tail record regains authority", () => {
    const io = faultOnce("evidence", "fsync", "fail", (r) => r.evidenceId === "evd_uncertain");
    const k = track(makeKernel("c23-no-boundary", { fsync: true, ioFaults: io }));
    k.store.putEvidence(evidenceRec("evd_committed")); // the host now holds a commit boundary
    io.state.armed = true;
    expect(integrityCode(() => k.store.putEvidence(evidenceRec("evd_uncertain", { validationStatus: "VALIDATED" } as Partial<EvidenceRecord>)))).toBe("uncommitted");
    const root = rootOf(k);
    fs.rmSync(markerPath(k)); // a same-user process deletes the marker
    const r = track(kernelOn(root)); // and the host does not pass its anchors
    // Documented limitation: no boundary survives, so the MAC-valid record is accepted.
    expect(r.store.recovery).toBeNull();
    expect(r.store.allEvidence().some((e) => e.evidenceId === "evd_uncertain")).toBe(true);
    // With the host anchors (the supported configuration) it is quarantined again.
    const anchored = track(kernelOn(root, { expectedHeads: anchorsFor(root) }));
    expect(anchored.store.allEvidence().some((e) => e.evidenceId === "evd_uncertain")).toBe(false);
    expect(anchored.store.recovery?.source).toBe("host_anchor");
  });

  it("6. a torn fragment is always quarantined, even without any boundary, so later appends stay replayable", () => {
    const io = faultOnce("events", "write", "partial", (r) => JSON.stringify(r).includes("torn"));
    const k = track(makeKernel("c23-torn", { ioFaults: io }));
    io.state.armed = true;
    expect(integrityCode(() => writeOne(k, "events", "torn"))).toBe("uncommitted");
    const root = rootOf(k);
    fs.rmSync(markerPath(k));
    const r = track(kernelOn(root)); // no anchors, no marker
    expect(r.store.recovery).toBeNull(); // auto-quarantined: a fragment can never be a record
    expect(quarantineFiles(r)).toHaveLength(1);
    const later = writeOne(r, "events", "later");
    const again = track(kernelOn(root));
    expect(again.store.all().some((e) => e.eventId === (later as { eventId: string }).eventId)).toBe(true);
    expect(again.store.integrity.events.rejected).toEqual([]);
  });

  it("7. limitation: validation observes current state only — a transient alias around the write is NOT detected", () => {
    const alias = path.join(outsideDir(), "alias.jsonl");
    let seenThroughAlias = "";
    let armed = false;
    const probe: FsProbe = (stage, target) => {
      if (!armed || !target.endsWith("events.jsonl")) return;
      if (stage === "log:before-write") fs.linkSync(target, alias);
      if (stage === "log:after-write") {
        seenThroughAlias = fs.readFileSync(alias, "utf8");
        fs.rmSync(alias); // gone before the post-write check
        armed = false;
      }
    };
    const k = track(makeKernel("c23-transient", { fsProbe: probe }));
    armed = true;
    const ev = writeOne(k, "events", "transient") as { eventId: string };
    // Committed, not sealed: the post-write check saw a clean state.
    expect(k.store.sealed).toBeNull();
    expect(k.store.all().some((e) => e.eventId === ev.eventId)).toBe(true);
    // …although an outside name observed the record while the write happened.
    expect(seenThroughAlias).toContain(ev.eventId);
  });
});
