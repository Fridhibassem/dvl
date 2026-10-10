/**
 * Builds the argv for launching the Mock Provider as a child process.
 *
 * The child's cwd is the (temporary) project root, which has no node_modules, so
 * the tsx loader is passed as an absolute file URL resolved from THIS package.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function mockProviderCommand(): string[] {
  const require = createRequire(import.meta.url);
  const tsxLoader = pathToFileURL(require.resolve("tsx")).href;
  const entry = path.resolve(here, "..", "mock-provider", "mock-provider.ts");
  return [process.execPath, "--import", tsxLoader, entry];
}

/** Host-owned automatic boundary for this shipped deterministic adapter, not a capability claim. */
export function isMockProviderCommand(command: string[]): boolean {
  return JSON.stringify(command) === JSON.stringify(mockProviderCommand());
}
export function mockProviderReadPaths(): string[] {
  const require = createRequire(import.meta.url);
  return [path.resolve(here, "../mock-provider"), path.resolve(here, "frame.ts"), path.resolve(here, "types.ts"),
    path.resolve(here, "../../package.json"), path.dirname(path.dirname(path.dirname(require.resolve("tsx"))))];
}
