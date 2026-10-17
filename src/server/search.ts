import "server-only";
import { z } from "zod";
import type { PassageMatch } from "@/lib/transcripts";
import type { Embedder } from "./ai/embedder.ts";
import { EMBEDDING_DIMENSIONS } from "./ai/models.ts";
import { createEmbedder } from "./ai/providers.ts";
import { createReadClient } from "./db/clients.ts";
import { findClosestPassages } from "./db/search.ts";
import { providerSettings, readSearchEnv } from "./env.ts";

// The interview search: a question in, the passages closest in meaning out,
// each with the interviewee's name and the researcher's question. It embeds
// the question with the passages' model (fake locally and in CI, Cloudflare
// Workers AI on staging and production), then the database ranks the passages.

/** Longer input is usually a whole message, which blurs what to look for. */
export const MAX_QUERY_LENGTH = 500;

/**
 * How many passages one search returns: always the five closest, even when
 * none of them is close. `distance` says how close each one came.
 */
export const SEARCH_RESULT_COUNT = 5;

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
};

/** The passages closest to `query`, closest first. */
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

  const { embedder, findPassages } = dependencies ?? connect();
  const [embedding] = await embedder.embed([parsed.data]);
  return findPassages(checked(embedding), SEARCH_RESULT_COUNT);
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

/** The real dependencies, from the settings: the read key and the embedder. */
function connect(): SearchDependencies {
  const env = readSearchEnv();
  const client = createReadClient(env);
  return {
    embedder: createEmbedder(providerSettings(env)),
    findPassages: (embedding, count) =>
      findClosestPassages(client, embedding, count),
  };
}
