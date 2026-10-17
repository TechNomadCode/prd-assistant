// Reads the running local Supabase stack's address and keys from
// `supabase status`. Used by `npm run env:local` and by the notes loader's
// --local mode, so neither depends on a hand-made settings file.

import { execSync } from "node:child_process";
import { checkEnvironment } from "../src/lib/env-guard.ts";

export type LocalStack = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
};

export function readLocalStack(): LocalStack {
  let status: Record<string, string | undefined>;
  try {
    status = JSON.parse(
      execSync("npx supabase status -o json", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    throw new Error(
      "The local database isn't running. Start it with `npm run db:start`.",
    );
  }

  const stack = {
    SUPABASE_URL: status.API_URL,
    SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY,
  };
  const missing = Object.entries(stack).filter(([, value]) => !value);
  if (missing.length > 0) {
    throw new Error(
      `\`supabase status\` didn't report: ${missing.map(([key]) => key).join(", ")}.`,
    );
  }
  if (checkEnvironment([{ name: "supabase status", values: stack }]).length) {
    throw new Error("`supabase status` reported a non-local address.");
  }
  return stack as LocalStack;
}
