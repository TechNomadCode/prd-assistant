// Writes .env.local from the running local Supabase stack: local addresses,
// local keys and the fake adapter, nothing else. It refuses to overwrite an
// .env.local it didn't write, so hand-made settings are never lost.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readLocalStack } from "./local-stack.ts";

const FILE = ".env.local";
const MARKER = "# Written by `npm run env:local`";

if (existsSync(FILE) && !readFileSync(FILE, "utf8").startsWith(MARKER)) {
  console.error(
    `${FILE} exists and wasn't written by this script, so it stays as it is. ` +
      "Rename or remove it, then run `npm run env:local` again.",
  );
  process.exit(1);
}

let stack;
try {
  stack = readLocalStack();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const values = {
  ...stack,
  AI_PROVIDER: "fake",
  SITE_URL: "http://localhost:3000",
};

writeFileSync(
  FILE,
  [
    `${MARKER} from the running local stack.`,
    "# Local values only. Don't edit by hand: run the script again instead.",
    ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n"),
);
console.log(`Wrote ${FILE} for the local stack at ${values.SUPABASE_URL}.`);
