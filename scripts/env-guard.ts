// The environment guard. package.json runs it before every dev, build, test
// and database command. It stops the command when any env file or the shell
// points at a hosted database or API, picks a real adapter, or holds a real
// provider key anywhere but `.env.development.local` (src/lib/env-guard.ts).
// With `--real-chat` (`npm run dev:real`) or `--measure` (`npm run measure`)
// it also insists that this machine's token is there. Hosted builds run `next build` directly (vercel.json), so it
// never blocks staging or production.

import { readdirSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import {
  checkEnvironment,
  PROVIDER_KEY_FILE,
  type EnvSource,
} from "../src/lib/env-guard.ts";

const measure = process.argv.includes("--measure");
const realChat = measure || process.argv.includes("--real-chat");

const envFiles = readdirSync(".").filter(
  (file) => file.startsWith(".env") && file !== ".env.example",
);

const sources: EnvSource[] = [
  { name: "the shell", values: process.env },
  ...envFiles.map((file) => ({
    name: file,
    // A Windows editor may start the file with a byte-order mark; Next's own
    // loader skips it, so this does too, or the first variable goes unseen.
    values: parseEnv(readFileSync(file, "utf8").replace(/^\uFEFF/, "")),
  })),
];

const problems = checkEnvironment(sources, { realChat });

if (problems.length > 0) {
  const onlyTheToken = problems.every((problem) => problem.missing);
  console.error(
    onlyTheToken
      ? `Environment guard: stopped. ${measure ? "The measurement" : "The real chat model"} needs this machine's own token in ${PROVIDER_KEY_FILE}.`
      : "Environment guard: stopped. This machine runs the local stack and the fakes; the real model only through `npm run dev:real` and `npm run measure`.",
  );
  for (const { source, variable, reason } of problems) {
    console.error(`  - ${variable} in ${source} ${reason}`);
  }
  console.error(
    onlyTheToken
      ? `Create ${PROVIDER_KEY_FILE} with your own account ID and token, as the README explains.`
      : "Fix the value, or run `npm run env:local` to write local settings.",
  );
  process.exit(1);
}
