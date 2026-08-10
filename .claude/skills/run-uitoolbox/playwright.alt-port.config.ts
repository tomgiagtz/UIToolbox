/**
 * The e2e suite on a port other than 3000.
 *
 * `playwright.config.ts` hardcodes 3000 and sets `reuseExistingServer: false` on
 * purpose (a leftover `npm run start` would serve the *previous* build). That is
 * the right default and this config does not weaken it — it only moves the port,
 * so the suite can run while something else, such as a dev server you did not
 * start, is already on 3000.
 *
 *   npx playwright test --config .claude/skills/run-uitoolbox/playwright.alt-port.config.ts
 *
 * Assumes a current production build — run `npm run build` first, since this
 * bypasses the `pretest:e2e` hook.
 */
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = `http://localhost:${PORT}`;
const root = path.resolve(__dirname, "../../..");

export default defineConfig({
  testDir: path.join(root, "e2e"),
  fullyParallel: true,
  reporter: "list",
  use: { baseURL, trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    cwd: root,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
