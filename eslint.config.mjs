import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import eslintConfigPrettier from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      "next-env.d.ts",
      ".next/**",
      "out/**",
      "build/**",
      "storybook-static/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "node_modules/**",
      // Vendored agent skills & tooling — matches .prettierignore.
      ".claude/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Must come last: disables ESLint rules that conflict with Prettier.
  eslintConfigPrettier,
];

export default eslintConfig;
