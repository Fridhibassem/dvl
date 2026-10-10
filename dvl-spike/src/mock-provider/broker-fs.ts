/** The mock has no native filesystem authority. A pre-opened pipe proposes scoped IO. */
import nativeFs from "node:fs";
let binding: { runId: string; attempt: number } | null = null;
let sequence = 0, tail = "";
const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
export function bindMockFilesystem(runId: string, attempt: number) { binding = { runId, attempt }; }
function encode(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return { __bytes: value.toString("base64") };
  if (Array.isArray(value)) return value.map(encode);
  return value;
}
export function requestMockFilesystem(method: string, args: unknown[], override?: { runId: string; attempt: number }) {
  if (!binding || !process.env.DVL_PUBLIC_MOCK_BROKER) throw new Error("no durable filesystem broker binding");
  const request = JSON.stringify({ id: ++sequence, ...(override ?? binding), method, args: args.map(encode) }) + "\n";
  const bytes = Buffer.from(request); let sent = 0;
  while (sent < bytes.length) {
    try { sent += nativeFs.writeSync(3, bytes, sent, bytes.length - sent); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "EAGAIN") throw e; pause(); }
  }
  while (!tail.includes("\n")) {
    const buf = Buffer.alloc(64 * 1024);
    try { const n = nativeFs.readSync(4, buf, 0, buf.length, null); if (!n) throw new Error("filesystem broker closed"); tail += buf.subarray(0, n).toString(); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "EAGAIN") throw e; pause(); }
  }
  const i = tail.indexOf("\n"), response = JSON.parse(tail.slice(0, i)); tail = tail.slice(i + 1);
  if (response.id !== sequence) throw new Error("filesystem broker response binding mismatch");
  if (response.error) throw Object.assign(new Error(response.error), { code: response.code });
  return response.bytes !== undefined ? Buffer.from(response.bytes, "base64") : response.value;
}
export default {
  writeFileSync: (...args: unknown[]) => requestMockFilesystem("writeFileSync", args),
  appendFileSync: (...args: unknown[]) => requestMockFilesystem("appendFileSync", args),
  mkdirSync: (...args: unknown[]) => requestMockFilesystem("mkdirSync", args),
  renameSync: (...args: unknown[]) => requestMockFilesystem("renameSync", args),
  rmSync: (...args: unknown[]) => requestMockFilesystem("rmSync", args),
  linkSync: (...args: unknown[]) => requestMockFilesystem("linkSync", args),
  readFileSync: (...args: unknown[]): any => requestMockFilesystem("readFileSync", args),
  readdirSync: (...args: unknown[]): any => requestMockFilesystem("readdirSync", args),
};
