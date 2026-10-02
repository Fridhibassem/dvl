import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/conformance/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Each test spawns a real child process; keep files isolated but allow parallel files.
    pool: "forks",
  },
});
