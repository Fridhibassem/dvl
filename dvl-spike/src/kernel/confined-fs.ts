/**
 * H2 — confined filesystem access to Kernel-owned paths under the project root.
 *
 * Threat: the adapter runs as the same OS user and can replace any directory or file under
 * the root by a symlink, a hard link, or a moved/renamed inode, at any moment — including
 * between a Kernel check and the Kernel's open.
 *
 * Node has no openat()/O_BENEATH. Two modes:
 *   - "procfd" (Linux): every Kernel-owned directory is opened component-by-component from a
 *     root directory fd, each step via /proc/self/fd/<parentFd>/<component> with
 *     O_DIRECTORY|O_NOFOLLOW. The final syscall (open/mkdir/rename/lstat) is also issued
 *     relative to the directory fd. This is directory-relative confinement: a symlink in any
 *     component is refused, and a swap AFTER the walk cannot redirect the operation — it
 *     still lands in the directory inode the Kernel opened.
 *   - "path" (fallback / non-Linux): the same walk by path with lstat checks, realpath
 *     equality and inode re-checks. This NARROWS the check/use window; it does not close it.
 *
 * In both modes `verify()` re-walks the canonical path and requires it to still lead to the
 * held directory inode, so a directory that was moved away (possibly outside the root) is
 * refused before anything is written into it.
 */
import fs from "node:fs";
import path from "node:path";

const { O_RDONLY, O_DIRECTORY, O_NOFOLLOW } = fs.constants;

export type SpoolIntegrityCode = "symlink" | "missing" | "not_dir" | "replaced" | "root_replaced" | "unsafe_file" | "exists" | "io";

/**
 * A Kernel-owned file or directory is not where the Kernel expects it (symlinked component,
 * non-regular file, extra hard link, swapped inode, pre-existing entry). The operation is
 * refused; nothing is written outside the Kernel-owned area.
 */
export class SpoolIntegrityError extends Error {
  constructor(
    message: string,
    readonly code: SpoolIntegrityCode = "io",
    /** Index of the offending component in the walked relative path (directory walks). */
    readonly at?: number,
  ) {
    super(`spool integrity: ${message}`);
    this.name = "SpoolIntegrityError";
  }
}

/** Test-only probe points: a hook may mutate the filesystem here to force a race deterministically. */
export type FsStage =
  | "dir:after-walk"
  | "log:before-open"
  | "log:after-open"
  | "artifact:before-open"
  | "diagnostic:before-open"
  | "import:after-area-check"
  | "import:before-open";
export type FsProbe = (stage: FsStage, target: string) => void;
export type ConfinementMode = "procfd" | "path";

export const sameInode = (a: fs.Stats, b: fs.Stats) => a.dev === b.dev && a.ino === b.ino;

/** True when /proc/self/fd/<dirfd>/<name> resolves relative to the open directory (Linux). */
function procFdSupported(): boolean {
  if (process.platform !== "linux") return false;
  let fd: number | undefined;
  try {
    fd = fs.openSync("/", O_RDONLY | O_DIRECTORY);
    return fs.statSync(`/proc/self/fd/${fd}/.`).ino === fs.statSync("/").ino;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
const PROCFD = procFdSupported();

/** An open Kernel-owned directory, bound to its inode. Always close(). */
export class DirHandle {
  private open = true;
  constructor(
    private readonly c: Confinement,
    readonly rel: readonly string[],
    readonly abs: string,
    readonly fd: number,
    readonly st: fs.Stats,
  ) {}

  /** Path to use in a syscall for `name` inside this directory (directory-relative in procfd mode). */
  entry(name: string): string {
    if (!isPlainName(name)) throw new SpoolIntegrityError(`unsafe entry name ${JSON.stringify(name)}`, "unsafe_file");
    return this.c.mode === "procfd" ? `/proc/self/fd/${this.fd}/${name}` : path.join(this.abs, name);
  }

  /** The Kernel path of `name` (for messages/refs, never for syscalls in procfd mode). */
  kernelPath(name: string): string {
    return path.join(this.abs, name);
  }

  /** The canonical path must still lead to exactly the held directory inode. */
  verify(): void {
    let again: DirHandle;
    try {
      again = this.c.openDir(this.rel);
    } catch (e) {
      // Whatever the walk now finds (symlink, missing, file), the held directory is no longer
      // at its canonical path.
      throw new SpoolIntegrityError(`${this.c.relOf(this.abs)} was replaced or moved (${(e as Error).message})`, "replaced");
    }
    try {
      if (!sameInode(again.st, this.st)) throw new SpoolIntegrityError(`${this.c.relOf(this.abs)} was replaced or moved`, "replaced");
    } finally {
      again.close();
    }
  }

  close(): void {
    if (this.open) {
      this.open = false;
      fs.closeSync(this.fd);
    }
  }
}

export class Confinement {
  readonly mode: ConfinementMode;
  /** Canonical root, fixed at construction. */
  readonly realRoot: string;
  private readonly rootSt: fs.Stats;

  constructor(
    /** The root as the host named it (public paths are derived from it). */
    readonly root: string,
    opts: { mode?: "auto" | "path"; probe?: FsProbe } = {},
  ) {
    this.mode = opts.mode === "path" || !PROCFD ? "path" : "procfd";
    this.probeFn = opts.probe;
    this.realRoot = fs.realpathSync(root);
    this.rootSt = fs.statSync(this.realRoot);
  }

  private readonly probeFn?: FsProbe;
  probe(stage: FsStage, target: string): void {
    this.probeFn?.(stage, target);
  }

  relOf(abs: string): string {
    return path.relative(this.root, abs);
  }

  /** Open the Kernel-owned directory <root>/<rel...>; refuses any symlinked or non-directory component. */
  openDir(rel: readonly string[], create = false): DirHandle {
    for (const c of rel) if (!isPlainName(c)) throw new SpoolIntegrityError(`unsafe path component ${JSON.stringify(c)}`, "not_dir");
    const abs = path.join(this.root, ...rel);
    let fd = this.openRoot();
    try {
      if (this.mode === "procfd") {
        rel.forEach((comp, i) => {
          const p = `/proc/self/fd/${fd}/${comp}`;
          if (create) mkdirIfMissing(p);
          let next: number;
          try {
            next = fs.openSync(p, O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
          } catch (e) {
            throw this.walkError(e, rel, i);
          }
          fs.closeSync(fd);
          fd = next;
        });
      } else {
        fs.closeSync(fd);
        fd = -1;
        let cur = this.realRoot;
        rel.forEach((comp, i) => {
          cur = path.join(cur, comp);
          if (create) mkdirIfMissing(cur);
          let st: fs.Stats;
          try {
            st = fs.lstatSync(cur);
          } catch (e) {
            throw this.walkError(e, rel, i);
          }
          if (st.isSymbolicLink()) throw new SpoolIntegrityError(`${path.join(...rel.slice(0, i + 1))} is a symlink`, "symlink", i);
          if (!st.isDirectory()) throw new SpoolIntegrityError(`${path.join(...rel.slice(0, i + 1))} is not a directory`, "not_dir", i);
        });
        if (fs.realpathSync(cur) !== cur) throw new SpoolIntegrityError(`${this.relOf(abs)} resolves elsewhere`, "symlink", rel.length - 1);
        try {
          fd = fs.openSync(cur, O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
        } catch (e) {
          throw this.walkError(e, rel, rel.length - 1);
        }
        if (!sameInode(fs.fstatSync(fd), fs.lstatSync(cur))) throw new SpoolIntegrityError(`${this.relOf(abs)} was replaced`, "replaced", rel.length - 1);
      }
      const st = fs.fstatSync(fd);
      const h = new DirHandle(this, rel, abs, fd, st);
      fd = -1; // owned by the handle now
      this.probe("dir:after-walk", abs);
      return h;
    } finally {
      if (fd !== -1) fs.closeSync(fd);
    }
  }

  private openRoot(): number {
    const fd = fs.openSync(this.realRoot, O_RDONLY | O_DIRECTORY);
    if (!sameInode(fs.fstatSync(fd), this.rootSt)) {
      fs.closeSync(fd);
      throw new SpoolIntegrityError("project root was replaced", "root_replaced");
    }
    return fd;
  }

  private walkError(e: unknown, rel: readonly string[], i: number): SpoolIntegrityError {
    if (e instanceof SpoolIntegrityError) return e;
    const code = (e as NodeJS.ErrnoException).code;
    const at = path.join(...rel.slice(0, i + 1));
    // O_DIRECTORY|O_NOFOLLOW on a symlink yields ENOTDIR (or ELOOP); either way: not followed.
    if (code === "ELOOP" || code === "ENOTDIR") return new SpoolIntegrityError(`${at} is not a real directory (symlink or file)`, "symlink", i);
    if (code === "ENOENT") return new SpoolIntegrityError(`${at} is missing`, "missing", i);
    return new SpoolIntegrityError(`${at} unavailable (${code})`, "io", i);
  }
}

/** Single path component: no separators, not "." / "..", no NUL. */
function isPlainName(s: string): boolean {
  return s.length > 0 && s !== "." && s !== ".." && !/[/\\\0]/.test(s);
}

function mkdirIfMissing(p: string): void {
  try {
    fs.mkdirSync(p); // non-recursive: never creates through a symlink further up
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
}

/**
 * Open `name` in `dir` and bind it: regular file, exactly one link, the name still maps to
 * the opened inode, and the directory is still at its canonical path. Closes on failure.
 */
export function openBound(dir: DirHandle, name: string, flags: number, mode = 0o644): { fd: number; st: fs.Stats } {
  let fd: number;
  try {
    fd = fs.openSync(dir.entry(name), flags | O_NOFOLLOW, mode);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    const where = dir.kernelPath(name);
    if (code === "ELOOP") throw new SpoolIntegrityError(`${where} is a symlink`, "symlink");
    if (code === "EEXIST") throw new SpoolIntegrityError(`${where} already exists`, "exists");
    if (code === "ENOENT") throw new SpoolIntegrityError(`${where} is missing`, "missing");
    throw new SpoolIntegrityError(`cannot open ${where} (${code})`, "io");
  }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) throw new SpoolIntegrityError(`${dir.kernelPath(name)} is not a regular file`, "unsafe_file");
    if (st.nlink !== 1) throw new SpoolIntegrityError(`${dir.kernelPath(name)} is hard-linked (nlink=${st.nlink})`, "unsafe_file");
    let now: fs.Stats;
    try {
      now = fs.lstatSync(dir.entry(name));
    } catch {
      throw new SpoolIntegrityError(`${dir.kernelPath(name)} vanished after open`, "replaced");
    }
    if (!sameInode(now, st)) throw new SpoolIntegrityError(`${dir.kernelPath(name)} was swapped after open`, "replaced");
    dir.verify();
    return { fd, st };
  } catch (e) {
    // We created this entry exclusively, and the bind failed: remove it again — but only if
    // the name still maps to OUR inode (never unlink something the adapter put there). In
    // procfd mode the entry is in the held directory; in path mode this narrows, not closes,
    // the window in which an empty file could remain where a swapped path pointed.
    if ((flags & fs.constants.O_EXCL) !== 0) {
      try {
        const held = fs.fstatSync(fd);
        const now = fs.lstatSync(dir.entry(name));
        if (sameInode(now, held)) fs.unlinkSync(dir.entry(name));
      } catch {
        /* nothing to clean up */
      }
    }
    fs.closeSync(fd);
    throw e;
  }
}
