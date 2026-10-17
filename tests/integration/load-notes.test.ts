import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "@/server/ai/fake-embedder";
import { createReadClient, createWriteClient } from "@/server/db/clients";
import { createNotesStore } from "@/server/db/notes-store";
import { fetchTranscripts } from "@/server/db/transcripts";
import { readAppEnv, readLoaderEnv } from "@/server/env";
import { loadNotes } from "@/server/notes/load-notes";
import { NotesFormatError } from "@/server/notes/parse-interview";

// Runs the real loader against the local database. Only the embedder is a
// fake (the AI provider is the external boundary). Every test leaves the
// database holding exactly the sample notes, as `npm run db:reset` does.

const NOTES = path.resolve("notes");
const writeClient = createWriteClient(readLoaderEnv());
const readClient = createReadClient(readAppEnv());
const embedder = createFakeEmbedder();
const store = createNotesStore(writeClient);

function load(dir = NOTES) {
  return loadNotes({ dir, embedder, store });
}

beforeAll(async () => {
  await load();
});

afterAll(async () => {
  await load();
});

describe("loading the notes", () => {
  it("stores every interview, with its passages in order, for the app to read", async () => {
    const transcripts = await fetchTranscripts(readClient);

    expect(transcripts.map((transcript) => transcript.participant)).toEqual([
      "Daan",
      "Henk",
      "Lena",
      "Maya",
      "Ravi",
      "Sofia",
    ]);
    for (const transcript of transcripts) {
      const positions = transcript.passages.map((passage) => passage.position);
      expect(positions).toEqual(positions.map((_, index) => index + 1));
    }
    const daan = transcripts.find((transcript) => transcript.slug === "daan");
    expect(daan?.passages[0]).toMatchObject({
      question: "Tell me about the list on the fridge.",
      answer: expect.stringMatching(/^It's a notepad with a magnet\./),
    });
  });

  it("embeds nothing on a second run when the notes haven't changed", async () => {
    const summary = await load();

    expect(summary).toMatchObject({
      interviews: 6,
      passages: 42,
      embedded: 0,
      removedPassages: 0,
      removedInterviews: 0,
    });
  });

  it("re-embeds only the passage whose text changed", async () => {
    const { error } = await writeClient
      .from("passages")
      .update({ content_hash: "0".repeat(64) })
      .eq("position", 1)
      .eq("interview_id", (await interviewId("maya"))!);
    expect(error).toBeNull();

    expect((await load()).embedded).toBe(1);
  });

  it("removes interviews and passages that are gone from the folder", async () => {
    const staleId = await store.saveInterview({
      slug: "stale",
      title: "Interview: Stale",
      participant: "Stale",
      notice: null,
      profile: [],
    });
    const [vector] = await embedder.embed(["stale"]);
    await store.savePassages([
      {
        interviewId: staleId,
        position: 1,
        question: "Still here?",
        answer: "No.",
        contentHash: "f".repeat(64),
        embeddingModel: embedder.model,
        embedding: vector!,
      },
    ]);

    const summary = await load();

    expect(summary.removedInterviews).toBe(1);
    expect(await interviewId("stale")).toBeUndefined();
  });

  it("changes nothing when one file is malformed", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "notes-"));
    try {
      cpSync(NOTES, dir, { recursive: true });
      writeFileSync(path.join(dir, "broken.md"), "No title, no questions.");

      await expect(load(dir)).rejects.toThrow(NotesFormatError);
      expect((await fetchTranscripts(readClient)).length).toBe(6);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the app's read key", () => {
  it("reads transcript text but never the embeddings", async () => {
    const { error } = await readClient
      .from("passages")
      .select("embedding")
      .limit(1);
    expect(error?.code).toBe("42501");
  });

  it("can't change the data", async () => {
    const { error } = await readClient
      .from("interviews")
      .insert({ slug: "intruder", title: "x", participant: "x" });
    expect(error?.code).toBe("42501");
  });
});

async function interviewId(slug: string) {
  const { data } = await writeClient
    .from("interviews")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id;
}
