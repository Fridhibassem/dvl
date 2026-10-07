/**
 * H4 — exclusive single-Kernel ownership of a project root.
 *
 * The lock is a Linux abstract-namespace Unix socket bound by the owning Kernel process:
 *   - exclusive: a second bind of the same name fails with EADDRINUSE, from any process
 *     (and from a second Kernel in the same process);
 *   - OS-backed: the kernel drops the binding when the process dies, by SIGKILL included;
 *     there is no lock file, so nothing can go stale;
 *   - survives a paused owner: a SIGSTOPped Kernel still holds it, so a takeover is refused
 *     until the owner is actually dead;
 *   - never inherited: libuv opens sockets close-on-exec, so the adapter child cannot keep a
 *     dead Kernel's root locked.
 * The name is derived from the root directory's (dev, inode), not its path, so path aliases
 * (symlinks, `..`, trailing slashes) of one directory map to one lock.
 *
 * Node binds sockets asynchronously while Kernel.start() is synchronous: the bind (and the
 * release) runs on a worker thread and the caller blocks on an Atomics wait for it (bounded).
 *
 * Scope: one host network namespace. Kernels in different network namespaces (e.g. two
 * containers sharing a volume) do not see each other's lock. Non-Linux platforms fail closed.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { Worker } from "node:worker_threads";

const ACQUIRE_TIMEOUT_MS = 5_000;
const OK = 1;
const IN_USE = 2;
const FAILED = 3;
const RELEASED = 4;

// Plain JS (eval'd worker): no loader needed. Holds the bound server until told to release.
const WORKER_SOURCE = `
const { workerData, parentPort } = require("node:worker_threads");
const net = require("node:net");
const flag = new Int32Array(workerData.sab);
const report = (v) => { Atomics.store(flag, 0, v); Atomics.notify(flag, 0); };
const server = net.createServer((c) => c.destroy());
server.once("error", (e) => { report(e.code === "EADDRINUSE" ? ${IN_USE} : ${FAILED}); parentPort.close(); });
server.listen(workerData.name, () => report(${OK}));
parentPort.on("message", () => server.close(() => { report(${RELEASED}); parentPort.close(); }));
`;

/** The root could not be owned. Nothing was written; the caller must not act as owner. */
export class RootLockError extends Error {
  constructor(
    message: string,
    readonly code: "root_locked" | "root_lock_failed" | "root_lock_unsupported" | "stale_replay",
  ) {
    super(`root lock: ${message}`);
    this.name = "RootLockError";
  }
}

export function rootLockName(root: string): string {
  const st = fs.statSync(root);
  const id = crypto.createHash("sha256").update(`${st.dev}:${st.ino}`).digest("hex").slice(0, 32);
  return `\0dvl-kernel-root-${id}`;
}

export class RootLock {
  private constructor(
    private worker: Worker | null,
    private readonly flag: Int32Array,
  ) {}

  /** Take exclusive ownership of `root`, or throw RootLockError "root_locked". Never waits for the owner. */
  static acquire(root: string): RootLock {
    if (process.platform !== "linux") throw new RootLockError(`root ownership lock is not supported on ${process.platform}: refusing to start`, "root_lock_unsupported");
    const sab = new SharedArrayBuffer(4);
    const flag = new Int32Array(sab);
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { sab, name: rootLockName(root) } });
    worker.unref(); // the lock never keeps the process alive; process death releases it
    Atomics.wait(flag, 0, 0, ACQUIRE_TIMEOUT_MS);
    const result = Atomics.load(flag, 0);
    if (result === OK) return new RootLock(worker, flag);
    void worker.terminate();
    if (result === IN_USE) throw new RootLockError(`project root ${root} is owned by another live Kernel`, "root_locked");
    throw new RootLockError(`could not acquire the root ownership lock for ${root} (${result === FAILED ? "bind failed" : "timed out"})`, "root_lock_failed");
  }

  get held(): boolean {
    return this.worker !== null;
  }

  /** Give up ownership. Returns once the binding is gone, so a new owner can bind right away. */
  release(): void {
    const w = this.worker;
    if (!w) return;
    this.worker = null;
    w.postMessage("release");
    Atomics.wait(this.flag, 0, OK, ACQUIRE_TIMEOUT_MS);
    if (Atomics.load(this.flag, 0) !== RELEASED) void w.terminate(); // closes the handle regardless
  }
}
