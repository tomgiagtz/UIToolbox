import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Runs against the production build so axe scans the real output.
    command: "npm run start",
    url: baseURL,
    // Never reuse: `npm run test:e2e` builds first, and a leftover server from an
    // aborted run would serve the *previous* build instead — silently testing
    // stale code. Failing loudly on a busy port is the better trade.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
