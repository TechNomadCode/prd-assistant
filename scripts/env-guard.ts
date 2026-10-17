// The environment guard. package.json runs it before every dev, build, test
// and database command. It stops the command when any env file or the shell
// points at a hosted database or API, picks a real adapter, or holds a real
// provider key. Hosted builds run `next build` directly (vercel.json), so it
// never blocks staging or production.

import { readdirSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { checkEnvironment, type EnvSource } from "../src/lib/env-guard.ts";

const envFiles = readdirSync(".").filter(
  (file) => file.startsWith(".env") && file !== ".env.example",
);

const sources: EnvSource[] = [
  { name: "the shell", values: process.env },
  ...envFiles.map((file) => ({
    name: file,
    values: parseEnv(readFileSync(file, "utf8")),
  })),
];

const problems = checkEnvironment(sources);

if (problems.length > 0) {
  console.error(
    "Environment guard: stopped. This machine runs only the local stack and fakes.",
  );
  for (const { source, variable, reason } of problems) {
    console.error(`  - ${variable} in ${source} ${reason}`);
  }
  console.error(
    "Fix the value, or run `npm run env:local` to write local settings.",
  );
  process.exit(1);
}
