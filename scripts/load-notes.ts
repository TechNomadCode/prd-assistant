// Loads notes/*.md into the database (see src/server/notes/load-notes.ts).
//
// - With --local (`npm run notes:load`, `db:start`, `db:reset`): the running
//   local stack and the fake embedder, read from `supabase status`.
// - Without it (the staging and production workflows): the settings in the
//   environment, which hold that environment's keys.

import path from "node:path";
import { createEmbedder } from "../src/server/ai/providers.ts";
import { createWriteClient } from "../src/server/db/clients.ts";
import { createNotesStore } from "../src/server/db/notes-store.ts";
import { providerSettings, readLoaderEnv } from "../src/server/env.ts";
import { loadNotes } from "../src/server/notes/load-notes.ts";
import { readLocalStack } from "./local-stack.ts";

try {
  const env = readLoaderEnv(
    process.argv.includes("--local")
      ? { ...readLocalStack(), AI_PROVIDER: "fake" }
      : process.env,
  );
  const embedder = createEmbedder(providerSettings(env));

  const summary = await loadNotes({
    dir: path.resolve("notes"),
    embedder,
    store: createNotesStore(createWriteClient(env)),
  });

  console.log(
    `Notes loaded: ${summary.interviews} interviews, ${summary.passages} passages. ` +
      `Embedded ${summary.embedded} with ${summary.model}; removed ` +
      `${summary.removedPassages} passages and ${summary.removedInterviews} interviews.`,
  );
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
