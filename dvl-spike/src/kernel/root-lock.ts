/**
 * H4 — exclusive single-Kernel ownership of a project root (Linux and macOS).
 *
 * The lock is flock(2) LOCK_EX on `<root>/.dvl/kernel.lock`, held on one fd for as long as the
 * Kernel owns the root:
 *   - exclusive: every other open of the file fails to lock it, in other processes and in this
 *     one (flock belongs to the open file description, not the process);
 *   - OS-backed: the OS drops it when the fd closes, so process death, SIGKILL included,
 *     releases it. The file stays behind and is never deleted (unlinking a locked file lets
 *     the next Kernel lock a fresh inode while the old one still holds the old inode);
 *   - survives a paused owner: a SIGSTOPped Kernel still holds it;
 *   - never inherited: libuv opens files close-on-exec, so the adapter child gets no copy;
 *   - unaffected by other opens/closes of the file (unlike POSIX fcntl locks);
 *   - keyed by the file's inode: every path alias of the root reaches the same lock.
 * Node has no flock binding: native/dvl_flock.c adds exactly that one call.
 *
 * Not covered: network filesystems (NFS emulates flock with fcntl locks, SMB may lock
 * locally only) and VM boundaries (a VM's kernel does not see the host's locks). The lock
 * file can be replaced by a same-user process; acquire() refuses when the name no longer
 * names the locked inode, but replacement after acquisition is not detected here.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

export const ROOT_LOCK_FILE = "kernel.lock";

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

interface FlockAddon {
  tryLockExclusive(fd: number): number;
}
let addon: FlockAddon | null | undefined;
function flockAddon(): FlockAddon | null {
  if (addon === undefined) {
    try {
      addon = createRequire(import.meta.url)("../../build/Release/dvl_flock.node") as FlockAddon;
    } catch {
      addon = null;
    }
  }
  return addon;
}

const { EWOULDBLOCK, EAGAIN, ENOTSUP, EOPNOTSUPP, ENOLCK } = os.constants.errno;

export class RootLock {
  private constructor(private fd: number | null) {}

  /** Take exclusive ownership of `root`, or throw RootLockError. Never waits for the owner. */
  static acquire(root: string): RootLock {
    if (process.platform !== "linux" && process.platform !== "darwin") throw new RootLockError(`root ownership lock is not supported on ${process.platform}: refusing to start`, "root_lock_unsupported");
    const native = flockAddon();
    if (!native) throw new RootLockError("the native flock addon is not built (run `npm rebuild` in dvl-spike): refusing to start", "root_lock_unsupported");
    const file = path.join(root, ".dvl", ROOT_LOCK_FILE);
    let fd: number;
    try {
      fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600);
    } catch (e) {
      throw new RootLockError(`cannot open ${file} (${(e as NodeJS.ErrnoException).code})`, "root_lock_failed");
    }
    const fail = (err: RootLockError): never => {
      fs.closeSync(fd);
      throw err;
    };
    const rc = native.tryLockExclusive(fd);
    if (rc === EWOULDBLOCK || rc === EAGAIN) fail(new RootLockError(`project root ${root} is owned by another live Kernel`, "root_locked"));
    if (rc === ENOTSUP || rc === EOPNOTSUPP || rc === ENOLCK) fail(new RootLockError(`the filesystem of ${root} does not support flock (errno ${rc}): refusing to start`, "root_lock_unsupported"));
    if (rc !== 0) fail(new RootLockError(`flock on ${file} failed (errno ${rc})`, "root_lock_failed"));
    // The name must still be the file we locked: a lock on a replaced (unlinked) inode fences nobody.
    const held = fs.fstatSync(fd);
    const named = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!held.isFile() || !named || named.dev !== held.dev || named.ino !== held.ino) fail(new RootLockError(`${file} was replaced while it was being locked`, "root_lock_failed"));
    return new RootLock(fd);
  }

  get held(): boolean {
    return this.fd !== null;
  }

  /** Give up ownership: closing the fd drops the lock immediately. */
  release(): void {
    if (this.fd === null) return;
    const fd = this.fd;
    this.fd = null;
    fs.closeSync(fd);
  }
}
