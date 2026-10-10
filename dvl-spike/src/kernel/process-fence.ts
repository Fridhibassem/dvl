/**
 * H4 / B3 — fence a previous attempt's executor before recovery may retry.
 *
 * The adapter is spawned detached, so on POSIX it leads its own process group (pgid == pid),
 * and its children stay in that group unless they call setsid(). The Kernel records the pid
 * and a start-time token in `kernel.adapter_spawned`. On recovery the group is identified,
 * killed and verified empty. Identity rules (Linux and macOS never hand out a pid number that
 * is still in use as a process-group id):
 *   - no live member in group P            → nothing can still mutate: fenced;
 *   - a live leader P with the recorded token → our adapter: kill the group;
 *   - a live leader P with another token    → P was reused, which implies our group emptied
 *                                             first: fenced, and nothing is signalled;
 *   - live members but no leader P          → our group (P cannot be reused while it has
 *                                             members): kill the group;
 *   - identity or membership not provable   → HOLD.
 * Not covered: a process that left the group with setsid() (no group-level handle exists); the
 * caller's workspace-quiescence check is the backstop for workspace writes only. Windows has
 * no process groups on this path: always HOLD.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

export interface ProcessOps {
  platform: NodeJS.Platform;
  /** pids of live (non-zombie) processes whose process group is `pgid`; null = cannot enumerate. */
  groupMembers(pgid: number): number[] | null;
  /** Stable start-time identity of `pid`, or null if it cannot be read. */
  startToken(pid: number): string | null;
  /** SIGKILL the whole group. Throws on failure. */
  killGroup(pgid: number): void;
}

function procStat(pid: number): string[] | null {
  try {
    const s = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return s.slice(s.lastIndexOf(")") + 2).split(" "); // [0]=state (field 3), [2]=pgrp, [19]=starttime
  } catch {
    return null;
  }
}

export const defaultProcessOps: ProcessOps = {
  platform: process.platform,
  groupMembers(pgid) {
    if (process.platform === "linux") {
      let entries: string[];
      try {
        entries = fs.readdirSync("/proc");
      } catch {
        return null;
      }
      const out: number[] = [];
      for (const name of entries) {
        if (!/^\d+$/.test(name)) continue;
        const f = procStat(Number(name));
        if (f && Number(f[2]) === pgid && f[0] !== "Z" && f[0] !== "X") out.push(Number(name));
      }
      return out;
    }
    if (process.platform === "darwin") {
      const r = spawnSync("ps", ["-A", "-o", "pid=,pgid=,stat="], { encoding: "utf8" });
      if (r.status !== 0) return null;
      const out: number[] = [];
      for (const line of r.stdout.split("\n")) {
        const [pid, pg, stat] = line.trim().split(/\s+/);
        if (pid && Number(pg) === pgid && stat && !stat.startsWith("Z")) out.push(Number(pid));
      }
      return out;
    }
    return null;
  },
  startToken(pid) {
    if (process.platform === "linux") return procStat(pid)?.[19] ?? null;
    if (process.platform === "darwin") {
      const r = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" });
      const t = r.status === 0 ? r.stdout.trim() : "";
      return t.length > 0 ? t : null;
    }
    return null;
  },
  killGroup(pgid) {
    process.kill(-pgid, "SIGKILL");
  },
};

export type FenceResult =
  | { fenced: true; outcome: "group_empty" | "killed" | "pid_reused"; killed: number[] }
  | { fenced: false; reason: string; survivors: number[] };

const KILL_WAIT_MS = 3_000;

export async function fenceProcessGroup(spawn: { pid: number; startToken: string | null }, ops: ProcessOps, killWaitMs = KILL_WAIT_MS): Promise<FenceResult> {
  if (ops.platform !== "linux" && ops.platform !== "darwin") return { fenced: false, reason: `process-group fencing is not supported on ${ops.platform}`, survivors: [] };
  const pgid = spawn.pid;
  if (!Number.isInteger(pgid) || pgid <= 1 || pgid === process.pid) return { fenced: false, reason: `refusing to signal process group ${pgid}`, survivors: [] };
  const members = ops.groupMembers(pgid);
  if (members === null) return { fenced: false, reason: `cannot enumerate process group ${pgid}`, survivors: [] };
  if (members.length === 0) return { fenced: true, outcome: "group_empty", killed: [] };
  if (members.includes(pgid)) {
    const token = ops.startToken(pgid);
    if (!spawn.startToken || token === null) return { fenced: false, reason: `cannot verify the identity of live process ${pgid}`, survivors: members };
    if (token !== spawn.startToken) return { fenced: true, outcome: "pid_reused", killed: [] };
  }
  let killError: string | null = null;
  try {
    ops.killGroup(pgid);
  } catch (e) {
    killError = (e as NodeJS.ErrnoException).code ?? (e as Error).message;
  }
  const deadline = Date.now() + killWaitMs;
  for (;;) {
    const left = ops.groupMembers(pgid);
    if (left !== null && left.length === 0) return { fenced: true, outcome: "killed", killed: members };
    if (Date.now() > deadline) {
      return { fenced: false, reason: `process group ${pgid} still alive after SIGKILL${killError ? ` (kill failed: ${killError})` : ""}`, survivors: left ?? members };
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}
