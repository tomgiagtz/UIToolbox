import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: "@storybook/nextjs-vite",
  // Next serves `public/` at the root, and the Glyph faces are registered from
  // `/fonts/<file>` (`bundled-fonts.ts`). Without this the preview canvases
  // would draw every label in the canvas fallback face.
  staticDirs: ["../public"],
};
export default config;
