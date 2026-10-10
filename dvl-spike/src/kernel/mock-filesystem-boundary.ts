/** Certified spike broker for the deterministic mock: no shell/network/DB/credential API.
 * Every mutation is confined to the live attempt or adapter artifact area and follows PREPARED.
 * This is a trusted host tool, never a grant of filesystem authority to the provider.
 */
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "./event-store.js";
export interface MockFilesystemRequest { id: number; runId: string; attempt: number; method: string; args: unknown[]; }
const writes = new Set(["writeFileSync", "appendFileSync", "mkdirSync", "renameSync", "rmSync"]);
export function planMockFilesystem(req: MockFilesystemRequest, root: string, workspace: string, adapterDir: string, kernelDir: string) {
  if (!Number.isSafeInteger(req.id) || req.id < 1 || !Array.isArray(req.args) || req.args.length > 3) throw new Error("invalid filesystem request");
  const mutating = writes.has(req.method);
  if (!mutating && req.method !== "readFileSync" && req.method !== "readdirSync") throw Object.assign(new Error("filesystem operation not authorized"), { code: "EPERM" });
  const paths = req.method === "renameSync" ? [req.args[0], req.args[1]] : [req.args[0]];
  const allowed = mutating ? [workspace, adapterDir] : [workspace, adapterDir, kernelDir, path.join(root, ".dvl/events/events.jsonl")];
  const check = () => {
    for (const raw of paths) {
      if (typeof raw !== "string" || !path.isAbsolute(raw)) throw new Error("absolute scoped filesystem target required");
      const p = path.resolve(raw), scope = allowed.find((s) => p === s || p.startsWith(s + path.sep));
      if (!scope || (mutating && p === scope && req.method !== "mkdirSync")) throw Object.assign(new Error("filesystem target outside scoped capability"), { code: "EPERM" });
      // The provider cannot plant symlinks/hardlinks through this interface or raw syscalls.
      for (let q = p; ; q = path.dirname(q)) {
        try { const st = fs.lstatSync(q); if (st.isSymbolicLink() || (st.isFile() && st.nlink !== 1)) throw Object.assign(new Error("filesystem alias refused"), { code: "EPERM" }); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
        if (q === root) break;
        if (q === "/") throw new Error("filesystem scope escaped project");
      }
    }
    if (req.method === "renameSync" && ![workspace, adapterDir].some((s) => paths.every((p) => typeof p === "string" && path.resolve(p).startsWith(s + path.sep)))) throw new Error("rename crosses capability scope");
  };
  check();
  const args = req.args.map((v) => v && typeof v === "object" && "__bytes" in v ? Buffer.from(String((v as { __bytes: string }).__bytes), "base64") : v);
  // Options cannot turn a read into r+/w/a or select a descriptor instead of a scoped path.
  if (req.method === "readFileSync" && args[1] && typeof args[1] === "object" && "flag" in args[1] && (args[1] as { flag?: string }).flag !== "r") throw new Error("mutating read flag denied");
  return { mutating, target: paths.map((p) => path.relative(root, String(p))).join(" -> "),
    parameters: { method: req.method, argumentsHash: sha256(JSON.stringify(req.args)) },
    execute() {
      check();
      let result: unknown;
      switch (req.method) {
        case "mkdirSync": result = fs.mkdirSync(String(args[0]), { recursive: true }); break;
        case "writeFileSync": case "appendFileSync": {
          const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW | (req.method === "appendFileSync" ? fs.constants.O_APPEND : 0);
          const fd = fs.openSync(String(args[0]), flags, 0o600);
          try { if (fs.fstatSync(fd).nlink !== 1) throw new Error("filesystem alias refused"); if (req.method === "writeFileSync") fs.ftruncateSync(fd); fs.writeFileSync(fd, args[1] as string | Buffer); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
          break;
        }
        case "renameSync": fs.renameSync(String(args[0]), String(args[1])); break;
        case "rmSync": fs.rmSync(String(args[0])); break;
        case "readFileSync": result = fs.readFileSync(String(args[0]), args[1] as BufferEncoding | undefined); break;
        case "readdirSync": result = fs.readdirSync(String(args[0])); break;
      }
      if (mutating) {
        for (const p of paths) { const fd = fs.openSync(path.dirname(String(p)), "r"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
      }
      return Buffer.isBuffer(result) ? { bytes: result.toString("base64") } : { value: result ?? null };
    } };
}
