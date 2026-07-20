import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Several suites each boot an embedded Postgres (PGlite, WASM); running
    // them all at once starves the CPU and times out hooks. Cap the workers
    // and give db boots headroom.
    maxWorkers: 4,
    hookTimeout: 60000,
    testTimeout: 20000,
  },
});
