import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, COLLAB_PORT, E2E_DATABASE_URL, PORT } from "./e2e/env";

/**
 * Browser tests (`npm run test:e2e`) for what the vitest suite can't reach:
 * magic-link sign-in, live co-typing, the decision-modal. The app runs as in
 * production — `next build && next start` on Postgres — with emails going to
 * the console. Each test builds its own tournament through the service layer
 * (e2e/tournament.ts), so tests don't share state.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `tsx e2e/reset-db.ts && next build && next start -p ${PORT}`,
    // 200 only once the database answers, the scheduler ticks and the collab server is up.
    url: `${BASE_URL}/healthz`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: process.env.E2E_SERVER_LOG ? "pipe" : "ignore",
    stderr: "pipe",
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else",
      BASE_URL,
      COLLAB_PORT: String(COLLAB_PORT),
      COLLAB_WS_URL: `ws://localhost:${COLLAB_PORT}`,
      // Blank, so a developer's real keys can never send mail from a test run.
      RESEND_API_KEY: "",
      SYSADMIN_EMAIL: "",
      SYSADMIN_TOKEN: "",
    },
  },
});
