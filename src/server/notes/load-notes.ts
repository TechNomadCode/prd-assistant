import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ProfileItem } from "../../lib/transcripts.ts";
import type { Embedder } from "../ai/embedder.ts";
import { parseInterview } from "./parse-interview.ts";

// The notes loader, the only way notes get into the database. It reads every
// .md file in the notes folder, splits each into passages, embeds the passages
// that are new or changed, and makes the database match the folder: interviews
// and passages that are gone from the files are removed.
//
// Unchanged passages keep their embedding, so running it again costs nothing.
// The same code runs locally with the fake embedder and on staging and
// production with the real one.

export type InterviewRow = {
  slug: string;
  title: string;
  participant: string;
  notice: string | null;
  profile: ProfileItem[];
};

export type PassageRow = {
  interviewId: number;
  position: number;
  question: string;
  answer: string;
  contentHash: string;
  embeddingModel: string;
  embedding: number[];
};

/** Where the loader keeps its data. The real one is in src/server/db. */
export type NotesStore = {
  fetchState(): Promise<{
    interviews: { id: number; slug: string }[];
    passages: { interviewId: number; position: number; contentHash: string }[];
  }>;
  /** Inserts or updates the interview by slug and returns its id. */
  saveInterview(interview: InterviewRow): Promise<number>;
  /** Inserts or updates passages by interview and position. */
  savePassages(passages: PassageRow[]): Promise<void>;
  /** Removes an interview's passages after `lastPosition`; returns how many. */
  deletePassagesAfter(
    interviewId: number,
    lastPosition: number,
  ): Promise<number>;
  /** Removes every interview whose slug isn't listed; returns how many. */
  deleteInterviewsExcept(slugs: string[]): Promise<number>;
};

export type LoadSummary = {
  interviews: number;
  passages: number;
  embedded: number;
  removedPassages: number;
  removedInterviews: number;
  model: string;
};

/** The text that gets embedded: the question gives the answer its context. */
export function embeddingInput(question: string, answer: string) {
  return `${question}\n${answer}`;
}

export function contentHash(model: string, question: string, answer: string) {
  return createHash("sha256")
    .update(JSON.stringify([model, question, answer]))
    .digest("hex");
}

export async function loadNotes({
  dir,
  embedder,
  store,
}: {
  dir: string;
  embedder: Embedder;
  store: NotesStore;
}): Promise<LoadSummary> {
  const files = (await readdir(dir))
    .filter((file) => file.endsWith(".md"))
    .sort();
  if (files.length === 0) {
    throw new Error(
      `No notes found in ${dir}: add one .md file per interview.`,
    );
  }

  // Parse every file before writing anything, so one bad file changes nothing.
  const interviews = await Promise.all(
    files.map(async (file) =>
      parseInterview(file, await readFile(path.join(dir, file), "utf8")),
    ),
  );

  const state = await store.fetchState();
  const storedHashes = new Map(
    state.passages.map((passage) => [
      `${passage.interviewId}:${passage.position}`,
      passage.contentHash,
    ]),
  );

  const changed: Omit<PassageRow, "embedding">[] = [];
  let removedPassages = 0;

  for (const interview of interviews) {
    const interviewId = await store.saveInterview({
      slug: interview.slug,
      title: interview.title,
      participant: interview.participant,
      notice: interview.notice,
      profile: interview.profile,
    });

    for (const passage of interview.passages) {
      const hash = contentHash(
        embedder.model,
        passage.question,
        passage.answer,
      );
      if (storedHashes.get(`${interviewId}:${passage.position}`) === hash)
        continue;
      changed.push({
        interviewId,
        position: passage.position,
        question: passage.question,
        answer: passage.answer,
        contentHash: hash,
        embeddingModel: embedder.model,
      });
    }

    removedPassages += await store.deletePassagesAfter(
      interviewId,
      interview.passages.length,
    );
  }

  const embeddings = await embedder.embed(
    changed.map((passage) => embeddingInput(passage.question, passage.answer)),
  );
  await store.savePassages(
    changed.map((passage, index) => {
      const embedding = embeddings[index];
      if (embedding?.length !== embedder.dimensions) {
        throw new Error(
          `The embedder returned ${embedding?.length ?? 0} numbers for a passage; the database stores ${embedder.dimensions}.`,
        );
      }
      return { ...passage, embedding };
    }),
  );

  const removedInterviews = await store.deleteInterviewsExcept(
    interviews.map((interview) => interview.slug),
  );

  return {
    interviews: interviews.length,
    passages: interviews.reduce(
      (sum, interview) => sum + interview.passages.length,
      0,
    ),
    embedded: changed.length,
    removedPassages,
    removedInterviews,
    model: embedder.model,
  };
}
