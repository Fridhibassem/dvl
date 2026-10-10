import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";

/** Durable Kernel observation of the group created by detached spawn. */
export interface RecoveryExecution {
  adapterInstanceId: string;
  pid?: number;
  processGroupId?: number;
  platform?: string;
  processBirth?: string | null;
}

export interface RecoveryProcessOps {
  readonly platform: NodeJS.Platform;
  birth(pid: number): string | null;
  /** True if any member can still execute, including stopped processes. */
  canMutate(groupId: number): boolean;
  killGroup(groupId: number): void;
}

let native: { processBirth?: (pid: number) => string | null } | undefined;
export const recoveryProcessOps: RecoveryProcessOps = {
  platform: process.platform,
  birth(pid) {
    try {
      if (process.platform === "linux") {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
        const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        const startTicks = fields[19]; // field 22; fields starts at field 3
        if (!startTicks) return null;
        return `${fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}:${startTicks}`;
      }
      if (process.platform === "darwin") {
        native ??= createRequire(import.meta.url)("../../build/Release/dvl_flock.node");
        return native?.processBirth?.(pid) ?? null;
      }
    } catch { /* inability to identify a live group is a HOLD, never permission to signal */ }
    return null;
  },
  canMutate(groupId) {
    // A dead leader does not prove its descendants exited. Inspect the ENTIRE group.
    // Zombies cannot execute or write; stopped and uninterruptible members still can.
    const listing = execFileSync("ps", ["-axo", "pid=,pgid=,stat="], { encoding: "utf8", timeout: 2_000, maxBuffer: 16 * 1024 * 1024 });
    for (const line of listing.trim().split("\n")) {
      if (!line.trim()) continue;
      const fields = line.trim().split(/\s+/);
      if (fields.length !== 3 || !/^\d+$/.test(fields[0]!) || !/^\d+$/.test(fields[1]!)) {
        throw new Error("unable to inspect process groups");
      }
      if (Number(fields[1]) === groupId && !fields[2]!.startsWith("Z")) return true;
    }
    return false;
  },
  killGroup(groupId) { process.kill(-groupId, "SIGKILL"); },
};

/** Never interpret a successful kill syscall as proof of exit. */
export async function stopRecoveredExecution(
  execution: RecoveryExecution,
  ops: RecoveryProcessOps,
  timeoutMs: number,
): Promise<void> {
  if (ops.platform !== "linux" && ops.platform !== "darwin") {
    throw new Error(`process-group recovery unsupported on ${ops.platform}; no verified executor fence`);
  }
  if (execution.platform && execution.platform !== ops.platform) throw new Error("executor platform differs from recovery host");
  const pid = execution.pid;
  // Legacy POSIX adapter_spawned records used detached:true: pgid equals pid.
  const pgid = execution.processGroupId ?? pid;
  if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(pgid) || pid! <= 1 || pgid !== pid) {
    throw new Error("missing or invalid durable detached process-group identity");
  }
  if (!ops.canMutate(pgid!)) return;
  if (!execution.processBirth || ops.birth(pid!) !== execution.processBirth) {
    // Includes a missing/reused leader with surviving children. With no pinned identity,
    // signalling the old numeric pgid would risk killing an unrelated incarnation.
    throw new Error("live executor group cannot be matched to its durable process incarnation");
  }
  try { ops.killGroup(pgid!); } catch (e) {
    // ESRCH is a race only if the entire group is now unable to execute.
    if ((e as NodeJS.ErrnoException).code !== "ESRCH" || ops.canMutate(pgid!)) throw e;
  }
  const deadline = Date.now() + timeoutMs;
  while (ops.canMutate(pgid!)) {
    if (Date.now() >= deadline) throw new Error("executor process group did not terminate before recovery deadline");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
