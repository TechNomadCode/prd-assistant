import "server-only";
import { z } from "zod";
import type { PassageMatch } from "@/lib/transcripts";
import type { Embedder } from "./ai/embedder.ts";
import { EMBEDDING_DIMENSIONS } from "./ai/models.ts";
import { createEmbedder, createReranker } from "./ai/providers.ts";
import type { Reranker } from "./ai/reranker.ts";
import { embeddingInput } from "./notes/load-notes.ts";
import { createReadClient } from "./db/clients.ts";
import { findClosestPassages } from "./db/search.ts";
import { providerSettings, readSearchEnv } from "./env.ts";

// The interview search: a question in, the passages about it out, each with
// the interviewee's name and the researcher's question. It embeds the question
// with the passages' model (fake locally and in CI, Cloudflare Workers AI on
// staging and production), the database ranks the passages by closeness, then
// a reranker reads the question with each of the closest and keeps those
// relevant enough, best first: retrieve, rerank, threshold, as Cloudflare's AI
// Search and Haystack's rankers do (`src/server/AGENTS.md`, *The reranker*).

/** Longer input is usually a whole message, which blurs what to look for. */
export const MAX_QUERY_LENGTH = 500;

/**
 * The most passages one search returns. Without a reranker, always the five
 * closest, even when none of them is close; `distance` says how close each
 * one came.
 */
export const SEARCH_RESULT_COUNT = 5;

/**
 * How many of the closest passages the reranker reads: more than the 42 there
 * are, so it reads every one, for about 1.3 neurons a search, and the
 * embedder's ranking no longer decides which passages it sees. Retrieving more
 * than are returned is the pattern Anthropic's contextual retrieval and
 * Cloudflare's AI Search follow.
 */
export const RERANK_CANDIDATES = 50;

export const searchQuerySchema = z
  .string()
  .trim()
  .min(
    1,
    "The search question is empty: say what to look for in the interviews.",
  )
  .max(
    MAX_QUERY_LENGTH,
    `The search question is too long: keep it to ${MAX_QUERY_LENGTH} characters or fewer.`,
  );

/** A question the search refuses. Its message says why, in plain words. */
export class SearchQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchQueryError";
  }
}

export type SearchDependencies = {
  embedder: Embedder;
  findPassages(embedding: number[], count: number): Promise<PassageMatch[]>;
  /** Tests leave it out unless they test it: the five closest, as before. */
  reranker?: Reranker;
};

/**
 * The passages about `query`, most relevant first: with a reranker, at most
 * five that reach its threshold, maybe none; without one, the five closest.
 */
export async function searchInterviews(
  query: string,
  dependencies?: SearchDependencies,
): Promise<PassageMatch[]> {
  const parsed = searchQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new SearchQueryError(
      parsed.error.issues[0]?.message ?? "The search question isn't valid.",
    );
  }

  const { embedder, findPassages, reranker } = dependencies ?? connect();
  const [embedding] = await embedder.embed([parsed.data]);
  if (!reranker) return findPassages(checked(embedding), SEARCH_RESULT_COUNT);

  const candidates = await findPassages(checked(embedding), RERANK_CANDIDATES);
  // The text the passages were embedded from: the researcher's question, then
  // the answer, as Haystack's rankers put a document's fields before its text.
  const relevance = await reranker.rank(
    parsed.data,
    candidates.map((passage) =>
      embeddingInput(passage.question, passage.answer),
    ),
  );
  if (relevance.length !== candidates.length) {
    throw new Error(
      `The reranker scored ${relevance.length} of ${candidates.length} passages.`,
    );
  }
  return candidates
    .map((passage, index) => ({ ...passage, relevance: relevance[index]! }))
    .filter((passage) => passage.relevance >= reranker.threshold)
    .sort((a, b) => b.relevance - a.relevance || a.distance - b.distance)
    .slice(0, SEARCH_RESULT_COUNT);
}

/**
 * The vector, once it's sure to compare: the database's size, numbers only,
 * not all zeros. Anything else never reaches the database.
 */
function checked(embedding: number[] | undefined): number[] {
  if (embedding?.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `The embedder returned ${embedding?.length ?? 0} numbers for the question; the passages have ${EMBEDDING_DIMENSIONS}.`,
    );
  }
  if (
    !embedding.every(Number.isFinite) ||
    embedding.every((value) => value === 0)
  ) {
    throw new Error(
      "The embedder returned a vector without a direction (zeros, or values that aren't numbers), so it can't be compared.",
    );
  }
  return embedding;
}

/**
 * The real dependencies, from the settings: the read key, the embedder and
 * the reranker.
 */
function connect(): SearchDependencies {
  const env = readSearchEnv();
  const client = createReadClient(env);
  const settings = providerSettings(env);
  return {
    embedder: createEmbedder(settings),
    findPassages: (embedding, count) =>
      findClosestPassages(client, embedding, count),
    reranker: createReranker(settings),
  };
}
