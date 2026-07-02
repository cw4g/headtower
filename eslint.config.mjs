import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nested build artifacts (e.g. the docs/ subproject) are not top-level,
    // so the bare patterns above miss them — match at any depth.
    "**/.next/**",
    "**/out/**",
    "**/build/**",
  ]),
]);

export default eslintConfig;
