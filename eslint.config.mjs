import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated from the database by `npm run db:types`:
    "src/server/db/database.types.ts",
    // Test output and the starter's own files:
    "playwright-report/**",
    "test-results/**",
    ".kit/**",
    // Claude Code's worktrees for parallel sessions, each its own checkout:
    ".claude/**",
  ]),
]);

export default eslintConfig;
