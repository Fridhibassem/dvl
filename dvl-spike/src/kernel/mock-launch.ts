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
