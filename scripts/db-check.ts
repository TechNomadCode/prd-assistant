// The database checks in `npm run verify:db`, after the reset:
// 1. schema lint of the local database;
// 2. migration drift: the schema files must have no changes that aren't in a
//    migration yet (the check writes no migration; it deletes any it creates);
// 3. type drift: the committed types must match the database.

import { execSync, spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = "supabase/migrations";

console.log("Schema lint…");
execSync("npx supabase db lint --local --level warning --fail-on warning", {
  stdio: "inherit",
});

console.log("Migration drift…");
const before = new Set(readdirSync(MIGRATIONS));
const sync = spawnSync(
  "npx supabase db schema declarative sync --no-apply -f drift_check",
  {
    shell: true,
    encoding: "utf8",
  },
);
const output = `${sync.stdout}${sync.stderr}`;
const created = readdirSync(MIGRATIONS).filter((file) => !before.has(file));
for (const file of created) rmSync(path.join(MIGRATIONS, file));

if (sync.status !== 0) {
  console.error(output);
  process.exit(1);
}
if (created.length > 0 || !output.includes("No schema changes found")) {
  console.error(
    "supabase/schemas/ has changes without a migration. " +
      "Run `npm run db:migration -- <name>`, review the file and commit both.",
  );
  process.exit(1);
}
console.log("The migrations match the schema files.");

console.log("Type drift…");
execSync("node scripts/db-types.ts --check", { stdio: "inherit" });
