// Loads notes/*.md into the database (see src/server/notes/load-notes.ts).
// Locally `npm run notes:load` runs it with the fake embedder; the staging and
// production workflows run it with that environment's keys.

import path from "node:path";
import { createEmbedder } from "../src/server/ai/providers.ts";
import { createWriteClient } from "../src/server/db/clients.ts";
import { createNotesStore } from "../src/server/db/notes-store.ts";
import { readLoaderEnv } from "../src/server/env.ts";
import { loadNotes } from "../src/server/notes/load-notes.ts";

const env = readLoaderEnv();
const embedder = createEmbedder({
  provider: env.AI_PROVIDER,
  mistralApiKey: env.MISTRAL_API_KEY,
});

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
