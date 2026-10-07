/**
 * C25 — H2 zero-count host anchors and committed-prefix verification during recovery.
 *
 *   Z — a host anchor with count 0 is still authoritative: it must carry the log's genesis MAC.
 *       A wrong MAC is an anchor mismatch (fail closed: nothing installed, start/append/
 *       ordinary recovery refused, host boundary not replaced) — never "no anchor". A correct
 *       count-0 anchor keeps its meaning: everything on disk is an uncommitted tail.
 *   P — recovery verifies the committed prefix CONTENT (hash of the exact bytes validated
 *       against the commit head/MAC chain), not only its size: same-size corruption of
 *       committed bytes before recovery, before truncation, or before clearing refuses
 *       recovery and keeps seal, marker and blocks — an explicit host decision is required.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FsProbe, FsStage } from "../kernel/confined-fs.js";
import type { CommitHeads, LogKind } from "../kernel/event-store.js";
import type { Kernel } from "../kernel/kernel.js";
import type { ArtifactRef, EvidenceRecord } from "../kernel/types.js";
import { anchorsFor, integrityCode, kernelOn, makeKernel, runScenario } from "./harness.js";

let kernels: Kernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.map((x) => x.shutdown().catch(() => undefined)));
  kernels = [];
});
const track = (k: Kernel) => (kernels.push(k), k);
const rootOf = (k: Kernel) => path.dirname(k.store.dvlDir);
const logFile = (root: string, kind: LogKind) => path.join(root, kind === "events" ? ".dvl/events/events.jsonl" : ".dvl/evidence/evidence.jsonl");
const markerPath = (root: string) => path.join(root, ".dvl/integrity/sealed.json");
const evidenceRec = (id: string, summary = ""): EvidenceRecord =>
  ({ evidenceId: id, runId: "run_x", attempt: 1, evidenceType: "TEST_RESULT", source: "PROVIDER_HARNESS_RECORD", validationStatus: "PERSISTED", artifactRefs: [], payloadSummary: summary }) as unknown as EvidenceRecord;
const writeOne = (k: Kernel, kind: LogKind, id: string) =>
  kind === "events" ? k.store.append({ origin: "kernel", trust: "kernel_truth", type: "kernel.probe", payload: { id, text: "abcdef" } }) : k.store.putEvidence(evidenceRec(id, "abcdef"));
/** Same-size corruption of committed bytes: flip one character inside the first "abcdef". */
function corruptCommitted(file: string) {
  const b = fs.readFileSync(file);
  const i = b.indexOf("abcdef");
  expect(i).toBeGreaterThanOrEqual(0);
  const size = b.length;
  b[i] = b[i] === 0x58 ? 0x59 : 0x58;
  fs.writeFileSync(file, b);
  expect(fs.statSync(file).size).toBe(size);
}

async function committedProject(tag: string) {
  const k = track(makeKernel(tag));
  await runScenario(k, "oversized-spooled");
  await k.shutdown();
  const root = rootOf(k);
  const ref = k.store.readEvidenceFromDisk().find((e) => e.relatedActionId === "act_big")!.artifactRefs[0]!;
  return { root, ref, anchors: anchorsFor(root)! };
}

function expectMismatchClosed(r: Kernel, root: string, ref: ArtifactRef, anchorsBefore: CommitHeads) {
  const bytes = { events: fs.readFileSync(logFile(root, "events")), evidence: fs.readFileSync(logFile(root, "evidence")) };
  expect(r.store.recovery?.source).toBe("anchor_mismatch");
  expect(r.store.all()).toEqual([]);
  expect(r.store.allEvidence()).toEqual([]);
  expect((r.store.verifyKernelArtifact(ref) as { reason: string }).reason).toMatch(/not registered/);
  expect(integrityCode(() => r.start())).toBe("anchor_mismatch");
  expect(integrityCode(() => writeOne(r, "events", "x"))).toBe("anchor_mismatch");
  expect(integrityCode(() => writeOne(r, "evidence", "x"))).toBe("anchor_mismatch");
  expect(integrityCode(() => r.recoverDurableTail())).toBe("anchor_mismatch");
  expect(fs.readFileSync(logFile(root, "events"))).toEqual(bytes.events);
  expect(fs.readFileSync(logFile(root, "evidence"))).toEqual(bytes.evidence);
  expect(anchorsFor(root)).toEqual(anchorsBefore);
}

describe("C25 H2 zero-count anchors", () => {
  for (const kind of ["events", "evidence"] as const) {
    it(`Z1. wrong zero-count ${kind} anchor over valid disk records → anchor mismatch, fail closed`, async () => {
      const { root, ref, anchors } = await committedProject(`c25-zero-${kind}`);
      const wrong: CommitHeads = { ...anchors, [kind]: { count: 0, mac: "0".repeat(64) } };
      const r = track(kernelOn(root, { expectedHeads: wrong }));
      expect(r.store.integrity[kind].rejected).toEqual([]); // every disk record is MAC-valid
      expect(r.store.recovery?.mismatch?.[kind]).toMatchObject({ expected: { count: 0 }, boundary: "host_anchor" });
      expectMismatchClosed(r, root, ref, anchors);
    });
  }

  it("Z2. wrong zero-count anchors on BOTH logs → fail closed; explicit rollback decision is the only way to accept disk", async () => {
    const { root, ref, anchors } = await committedProject("c25-zero-both");
    const wrong: CommitHeads = { events: { count: 0, mac: "1".repeat(64) }, evidence: { count: 0, mac: "2".repeat(64) } };
    expectMismatchClosed(track(kernelOn(root, { expectedHeads: wrong })), root, ref, anchors);
    const decided = track(kernelOn(root, { expectedHeads: wrong, hostDecision: "accept_disk_rollback" }));
    expect(decided.store.recovery).toBeNull();
    expect(decided.store.rollbackAccepted?.previous).toEqual(wrong);
    expect(decided.store.verifyKernelArtifact(ref)).toEqual({ ok: true });
    expect(decided.store.ofType("kernel.anchor_rollback_accepted")).toHaveLength(1);
  });

  it("Z3. a CORRECT zero-count anchor keeps its meaning: empty log opens cleanly; disk records beyond it are an uncommitted tail", () => {
    const k = track(makeKernel("c25-zero-correct"));
    const genesis = k.store.heads(); // count 0, genesis MACs (nothing committed yet)
    expect(genesis.events.count).toBe(0);
    const root = rootOf(k);
    const clean = track(kernelOn(root, { expectedHeads: genesis }));
    expect(clean.store.recovery).toBeNull();
    expect(clean.store.integrity.events.ok).toBe(true);
    writeOne(clean, "events", "after_genesis");
    const tail = track(kernelOn(root, { expectedHeads: genesis }));
    expect(tail.store.recovery?.source).toBe("host_anchor");
    expect(tail.store.recovery?.uncommitted.events.records).toBe(1);
    expect(tail.store.all()).toEqual([]);
  });
});

describe("C25 H2 committed-prefix verification during recovery", () => {
  /** Sealed store: committed records in both logs (containing "abcdef"), uncertain tail in events. */
  function sealed(tag: string) {
    let probe: FsProbe = () => {};
    let fail = false;
    const k = track(
      makeKernel(tag, {
        fsync: true,
        fsProbe: (s, t) => probe(s, t),
        ioFaults: { log: (kind, ph) => (fail && kind === "events" && ph === "fsync" ? "fail" : undefined) },
      }),
    );
    writeOne(k, "events", "c1");
    writeOne(k, "evidence", "v1");
    fail = true;
    expect(integrityCode(() => writeOne(k, "events", "uncertain"))).toBe("uncommitted");
    fail = false;
    fs.appendFileSync(k.store.evidencePath, '{"junk":true}\n'); // a tail in evidence too, so truncation touches both
    return { k, root: rootOf(k), setProbe: (f: FsProbe) => (probe = f) };
  }
  function expectStillBlocked(k: Kernel, root: string, anchorsBefore: CommitHeads | undefined, history: number) {
    expect(k.store.sealed).not.toBeNull();
    expect(fs.existsSync(markerPath(root))).toBe(true);
    expect(integrityCode(() => writeOne(k, "events", "blocked"))).toBe("sealed");
    expect(integrityCode(() => writeOne(k, "evidence", "blocked"))).toBe("sealed");
    expect(integrityCode(() => k.start())).toBe("sealed");
    expect(k.store.all()).toHaveLength(history); // no authority restored or added
    expect(anchorsFor(root)).toEqual(anchorsBefore); // host boundary not replaced
  }

  for (const kind of ["events", "evidence"] as const) {
    for (const stage of [null, "recover:before-truncate", "recover:before-clear"] as const) {
      const when = stage === null ? "before recovery" : `at ${stage}`;
      it(`P1. same-size corruption of committed ${kind} bytes ${when} → recovery refused, seal/marker kept, blocked; host decision required`, () => {
        const { k, root, setProbe } = sealed(`c25-prefix-${kind}-${stage ?? "pre"}`);
        const anchorsBefore = anchorsFor(root);
        const history = k.store.all().length;
        if (stage === null) corruptCommitted(logFile(root, kind));
        else {
          let once = true;
          setProbe((s: FsStage) => {
            if (once && s === stage) {
              once = false;
              corruptCommitted(logFile(root, kind));
            }
          });
        }
        expect(integrityCode(() => k.recoverDurableTail())).toBe("recovery_failed");
        expectStillBlocked(k, root, anchorsBefore, history);
        // Retrying ordinary recovery cannot bless the corrupted prefix either.
        setProbe(() => {});
        expect(integrityCode(() => k.recoverDurableTail())).toBe("recovery_failed");
        expectStillBlocked(k, root, anchorsBefore, history);
        // On restart the corruption breaks the host boundary: anchor mismatch, nothing installed.
        const r = track(kernelOn(root, { expectedHeads: anchorsFor(root) }));
        expect(r.store.recovery?.source).toBe("anchor_mismatch");
        expect(r.store.all()).toEqual([]);
        expect(r.store.allEvidence()).toEqual([]);
        expect(integrityCode(() => r.recoverDurableTail())).toBe("anchor_mismatch");
        expect(integrityCode(() => r.start())).toBe("anchor_mismatch");
        // Only an explicit host decision proceeds (adopting the authenticated disk chain).
        const decided = track(kernelOn(root, { expectedHeads: anchorsFor(root), hostDecision: "accept_disk_rollback" }));
        expect(decided.store.rollbackAccepted).not.toBeNull();
        expect(decided.store.integrity[kind].rejected.length).toBeGreaterThan(0); // the corrupted record is not adopted
      });
    }
  }

  it("P2. control: uncorrupted committed prefix → recovery succeeds and clears seal and marker", () => {
    const { k, root } = sealed("c25-prefix-control");
    k.recoverDurableTail();
    expect(k.store.sealed).toBeNull();
    expect(fs.existsSync(markerPath(root))).toBe(false);
    writeOne(k, "events", "after");
    expect(track(kernelOn(root, { expectedHeads: anchorsFor(root) })).store.integrity.events).toMatchObject({ ok: true, rejected: [] });
  });
});
