// Regenerates the TypeScript types from the local database and formats them
// with Prettier. With --check it changes nothing and fails when the committed
// types no longer match the database, which means a schema change was made
// without `npm run db:types`.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import * as prettier from "prettier";

const TARGET = "src/server/db/database.types.ts";

const generated = execSync(
  "npx supabase gen types typescript --local --schema public",
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
);
const formatted = await prettier.format(generated, {
  ...(await prettier.resolveConfig(TARGET)),
  filepath: TARGET,
});

if (process.argv.includes("--check")) {
  if (readFileSync(TARGET, "utf8") !== formatted) {
    console.error(
      `${TARGET} doesn't match the database. Run \`npm run db:types\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log("Database types match the schema.");
} else {
  writeFileSync(TARGET, formatted);
  console.log(`Wrote ${TARGET}.`);
}
