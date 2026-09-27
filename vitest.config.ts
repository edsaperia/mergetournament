import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Several suites each boot an embedded Postgres (PGlite, WASM); running
    // them all at once starves the CPU and times out hooks. Cap the workers
    // and give db boots headroom.
    maxWorkers: 4,
    // e2e/*.spec.ts are the Playwright browser tests (npm run test:e2e).
    exclude: ["**/node_modules/**", "e2e/**/*.spec.ts"],
    hookTimeout: 60000,
    testTimeout: 20000,
  },
});
