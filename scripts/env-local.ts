// Writes .env.local from the running local Supabase stack: local addresses,
// local keys and the fake adapter, nothing else. It refuses to overwrite an
// .env.local it didn't write, so hand-made settings are never lost.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { checkEnvironment } from "../src/lib/env-guard.ts";

const FILE = ".env.local";
const MARKER = "# Written by `npm run env:local`";

if (existsSync(FILE) && !readFileSync(FILE, "utf8").startsWith(MARKER)) {
  console.error(
    `${FILE} exists and wasn't written by this script, so it stays as it is. ` +
      "Rename or remove it, then run `npm run env:local` again.",
  );
  process.exit(1);
}

let status: Record<string, string>;
try {
  status = JSON.parse(
    execSync("npx supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
} catch {
  console.error(
    "The local database isn't running. Start it with `npm run db:start`, then try again.",
  );
  process.exit(1);
}

const values = {
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  AI_PROVIDER: "fake",
  SITE_URL: "http://localhost:3000",
};

const missing = Object.entries(values).filter(([, value]) => !value);
if (missing.length > 0) {
  console.error(
    `\`supabase status\` didn't report: ${missing.map(([key]) => key).join(", ")}.`,
  );
  process.exit(1);
}

const problems = checkEnvironment([{ name: "supabase status", values }]);
if (problems.length > 0) {
  console.error(
    "`supabase status` reported non-local values; nothing was written.",
  );
  process.exit(1);
}

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
