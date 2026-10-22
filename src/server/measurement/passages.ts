import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  passageAnchor,
  type PassageMatch,
  type SourcePassage,
} from "../../lib/transcripts.ts";
import type { Embedder } from "../ai/embedder.ts";
import { embeddingTokenBound } from "../ai/embedding-input.ts";
import type { Reranker } from "../ai/reranker.ts";
import type { ChatDependencies } from "../chat.ts";
import { contentHash, embeddingInput } from "../notes/load-notes.ts";
import { parseInterview } from "../notes/parse-interview.ts";
import { searchInterviews } from "../search.ts";
import { fingerprint } from "./recorder.ts";

// The measurement's search (docs/plan.md, slice 9b): its own copy of the
// passages in `notes/`, embedded once with the measurement's embedder and
// again only where the notes change, the way the loader embeds them. It ranks
// the copy the way `search_passages` ranks the database (supabase/schemas/
// search.sql): cosine distance, closest first, ties by id. The local database
// and the app's search keep the fake embedder; nothing here touches them.

export type CopiedPassage = Omit<PassageMatch, "distance"> & {
  /** `contentHash` of the loader: the model, the question and the answer. */
  contentHash: string;
  embedding: number[];
};

export type PassageCopy = {
  model: string;
  passages: CopiedPassage[];
  /** Of every passage with its vector, so a new copy shows in the setup. */
  fingerprint: string;
};

type NotePassage = Omit<CopiedPassage, "embedding">;

/** The passages in `notes/`, numbered in file order as the copy's ids. */
export async function readNotes(
  dir: string,
  model: string,
): Promise<NotePassage[]> {
  const files = (await readdir(dir))
    .filter((file) => file.endsWith(".md"))
    .sort();
  if (files.length === 0) throw new Error(`No notes found in ${dir}.`);
  const passages: NotePassage[] = [];
  for (const file of files) {
    const interview = parseInterview(
      file,
      await readFile(join(dir, file), "utf8"),
    );
    for (const passage of interview.passages) {
      passages.push({
        id: passages.length + 1,
        slug: interview.slug,
        participant: interview.participant,
        position: passage.position,
        question: passage.question,
        answer: passage.answer,
        contentHash: contentHash(model, passage.question, passage.answer),
      });
    }
  }
  return passages;
}

/** The copy as stored, or null when there is none for this model. */
async function readCopy(
  file: string,
  model: string,
): Promise<Map<string, CopiedPassage> | null> {
  if (!existsSync(file)) return null;
  const stored = JSON.parse(await readFile(file, "utf8")) as {
    model: string;
    passages: CopiedPassage[];
  };
  if (stored.model !== model) return null;
  return new Map(
    stored.passages.map((passage) => [passage.contentHash, passage]),
  );
}

/** What making the copy would embed, without embedding anything. */
export async function copyPlan({
  notesDir,
  file,
  model,
}: {
  notesDir: string;
  file: string;
  model: string;
}): Promise<{ passages: number; toEmbed: number; tokenBound: number }> {
  const notes = await readNotes(notesDir, model);
  const stored = await readCopy(file, model);
  const missing = notes.filter((passage) => !stored?.has(passage.contentHash));
  return {
    passages: notes.length,
    toEmbed: missing.length,
    tokenBound: missing.reduce(
      (sum, passage) =>
        sum +
        embeddingTokenBound(embeddingInput(passage.question, passage.answer)),
      0,
    ),
  };
}

/**
 * The copy for the notes as they are: stored vectors where a passage is
 * unchanged, new ones for the rest, saved back when anything changed.
 */
export async function makeCopy({
  notesDir,
  file,
  embedder,
}: {
  notesDir: string;
  file: string;
  embedder: Embedder;
}): Promise<{ copy: PassageCopy; embedded: number }> {
  const notes = await readNotes(notesDir, embedder.model);
  const stored = await readCopy(file, embedder.model);
  const missing = notes.filter((passage) => !stored?.has(passage.contentHash));
  const vectors = await embedder.embed(
    missing.map((passage) => embeddingInput(passage.question, passage.answer)),
  );
  const fresh = new Map(
    missing.map((passage, index) => {
      const embedding = vectors[index];
      if (embedding?.length !== embedder.dimensions) {
        throw new Error(
          `The embedder returned ${embedding?.length ?? 0} numbers for a passage; the copy needs ${embedder.dimensions}.`,
        );
      }
      return [passage.contentHash, embedding];
    }),
  );
  const passages: CopiedPassage[] = notes.map((passage) => ({
    ...passage,
    embedding:
      fresh.get(passage.contentHash) ??
      stored?.get(passage.contentHash)?.embedding ??
      [],
  }));
  if (missing.length > 0 || stored?.size !== notes.length) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
      file,
      `${JSON.stringify({ model: embedder.model, passages })}\n`,
    );
  }
  return {
    copy: {
      model: embedder.model,
      passages,
      fingerprint: fingerprint({ model: embedder.model, passages }),
    },
    embedded: missing.length,
  };
}

/** Cosine distance, as pgvector's `<=>`: 0 the same direction, 2 opposite. */
export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index++) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return 1 - dot / Math.sqrt(normA * normB);
}

/** The `count` passages closest to `embedding`, as `search_passages` orders them. */
export function rankPassages(
  passages: CopiedPassage[],
  embedding: number[],
  count: number,
): PassageMatch[] {
  return passages
    .map((passage) => ({
      id: passage.id,
      slug: passage.slug,
      participant: passage.participant,
      position: passage.position,
      question: passage.question,
      answer: passage.answer,
      distance: cosineDistance(passage.embedding, embedding),
    }))
    .sort((a, b) => a.distance - b.distance || a.id - b.id)
    .slice(0, count);
}

/**
 * The chat's search and passage lookup over the copy: the app's own
 * `searchInterviews` with the copy in place of the database, and the cited
 * passages read from the same notes, as the citation check reads the
 * database's.
 */
export function copySources(
  copy: PassageCopy,
  embedder: Embedder,
  reranker?: Reranker,
): Omit<ChatDependencies, "model"> {
  return {
    search: (query) =>
      searchInterviews(query, {
        embedder,
        findPassages: async (embedding, count) =>
          rankPassages(copy.passages, embedding, count),
        ...(reranker ? { reranker } : {}),
      }),
    findPassages: async (ids): Promise<SourcePassage[]> => {
      const wanted = new Set(ids);
      return copy.passages.flatMap((passage) => {
        const id = passageAnchor(passage.slug, passage.position);
        return wanted.has(id)
          ? [
              {
                passage: id,
                participant: passage.participant,
                question: passage.question,
                answer: passage.answer,
              },
            ]
          : [];
      });
    },
  };
}
