/** H4 spike: host-selected macOS Seatbelt boundary, applied before provider code executes.
 * No contract extension. Unsupported hosts refuse launch; there is no native fallback.
 * Code read roots are HOST-trusted runtime assets, never workspace/credential directories.
 */
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "./event-store.js";

export interface ProviderConfinement {
  /** Immutable/trusted code and dependency paths; must contain no effect credentials. */
  codeReadPaths: string[];
  /** Explicit public configuration. Host secrets are never inherited from process.env. */
  publicEnv?: Record<string, string>;
}

export function confinedProviderLaunch(command: string[], root: string, config: ProviderConfinement,
  platform: NodeJS.Platform = process.platform) {
  const refuse = (why: string): never => { throw new Error(`HOLD_PROVIDER_CONFINEMENT_UNAVAILABLE: ${why}; retryAllowed=false`); };
  if (platform !== "darwin") refuse(`no verified provider confinement backend on ${platform}`);
  if (!fs.existsSync("/usr/bin/sandbox-exec")) refuse("Seatbelt launcher unavailable");
  const executable = command[0];
  if (!executable || !path.isAbsolute(executable)) refuse("absolute provider executable required");
  const project = fs.realpathSync(root);
  const code = [fs.realpathSync(executable!), ...config.codeReadPaths.map((p) => fs.realpathSync(p))];
  for (const p of code) {
    if (!path.isAbsolute(p) || p === "/" || project === p || project.startsWith(p + path.sep) || p.startsWith(project + path.sep)) {
      refuse("code read permissions cannot include the project, its ancestors, or its state/credentials");
    }
    // Avoid accidental blanket permissions to user/configuration/temporary trees.
    if (["/Users", "/private", "/private/tmp", "/tmp", "/usr", "/usr/local", "/Library"].includes(p)) refuse("overbroad code read root");
  }
  const filters = code.map((p) => `(${fs.statSync(p).isDirectory() ? "subpath" : "literal"} ${JSON.stringify(p)})`);
  // Literal ancestors permit traversal/getcwd, never contents of child files.
  for (let p = project; ; p = path.dirname(p)) { filters.push(`(literal ${JSON.stringify(p)})`); if (p === "/") break; }
  const profile = `(version 1)
(deny default)
(allow process-fork)
(allow process-exec)
(allow sysctl-read)
(allow file-read-metadata)
(allow signal (target self))
(allow file-read*
  (subpath "/usr/lib") (subpath "/System/Library") (subpath "/System/Volumes/Preboot")
  (subpath "/bin") (subpath "/usr/bin")
  (literal "/dev/null") (literal "/dev/urandom") (literal "/private/etc/localtime")
  (subpath "/private/var/db/timezone") (literal "/private") (literal "/private/var")
  ${filters.join(" ")})`;
  // Deliberately no network, file-write, Mach lookup, task-port, Apple-event or IPC grant.
  // Descendants inherit Seatbelt even after exec/setsid; nested sandboxes cannot relax it.
  const env: Record<string, string> = { PATH: "/usr/bin:/bin", TSX_DISABLE_CACHE: "1", LANG: "C", TMPDIR: "/nonexistent" };
  for (const [name, value] of Object.entries(config.publicEnv ?? {})) {
    if (!/^DVL_PUBLIC_[A-Z0-9_]+$/.test(name)) refuse(`non-public environment name ${name}`);
    env[name] = value;
  }
  return { argv: ["/usr/bin/sandbox-exec", "-p", profile, ...command], env,
    evidence: { mechanism: "macos-seatbelt", policyHash: sha256(profile), codeReadPaths: code,
      filesystemMutation: "denied", network: "denied", credentials: "host-only", subprocesses: "inherited-sandbox" } };
}
