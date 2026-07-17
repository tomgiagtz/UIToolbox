import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        // Plain unit/integration tests (Testing Library + jsdom).
        plugins: [tsconfigPaths(), react()],
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
          // Playwright specs live in ./e2e and are run by Playwright, not Vitest.
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: ["node_modules", ".next", "e2e"],
        },
      },
      {
        // Storybook stories run as tests in a real browser via Playwright.
        plugins: [
          tsconfigPaths(),
          storybookTest({ configDir: path.join(dirname, ".storybook") }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: "playwright",
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
