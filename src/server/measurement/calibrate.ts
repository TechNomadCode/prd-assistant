import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { passageAnchor } from "../../lib/transcripts.ts";
import type { Embedder } from "../ai/embedder.ts";
import type { Reranker } from "../ai/reranker.ts";
import { embeddingInput } from "../notes/load-notes.ts";
import { RERANK_CANDIDATES } from "../search.ts";
import { rerankTokenBound } from "./budget.ts";
import { rankPassages, type PassageCopy } from "./passages.ts";

// The reranker's calibration (src/server/AGENTS.md, *The reranker*): the
// searches gpt-oss made in the measurements so far, each with the candidates
// the search would rerank, scored by the reranker, so its threshold is set from
// our own question and passage pairs, as Cohere advises for any reranker
// (https://docs.cohere.com/docs/reranking-best-practices, read 2026-10-22). On
// the real reranker only through `npm run measure -- --calibrate-rerank`,
// under the meter and into the ledger.

/** The calibration's folder and its name in the ledger. */
export const CALIBRATION = "rerank-calibration";

export type CalibrationPair = {
  query: string;
  /** The passage id, such as henk-3. */
  passage: string;
  distance: number;
  /** The reranker's relevance, 0 to 1. */
  relevance: number;
};

/** Every distinct query gpt-oss searched with in the records under `root`. */
export async function recordedQueries(root: string): Promise<string[]> {
  const queries = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== "object" || value === null) return;
    const { toolName, input } = value as {
      toolName?: unknown;
      input?: unknown;
    };
    const query = (input as { query?: unknown } | null | undefined)?.query;
    if (toolName === "searchNotes" && typeof query === "string") {
      queries.add(query.trim());
    }
    Object.values(value).forEach(visit);
  };
  for (const measurement of await folders(root)) {
    for (const day of await folders(join(root, measurement))) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const dir = join(root, measurement, day);
      for (const file of await readdir(dir)) {
        if (!file.endsWith(".json")) continue;
        const record = JSON.parse(await readFile(join(dir, file), "utf8")) as {
          answer?: unknown;
        };
        visit(record.answer);
      }
    }
  }
  return [...queries].filter((query) => query.length > 0).sort();
}

async function folders(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((e) => e.name);
}

/**
 * The most tokens the calibration can send the reranker: each query with the
 * longest candidates it could get.
 */
export function calibrationTokenBound(
  queries: string[],
  passages: { question: string; answer: string }[],
): number {
  const longest = passages
    .map((passage) => embeddingInput(passage.question, passage.answer))
    .sort((a, b) => b.length - a.length)
    .slice(0, RERANK_CANDIDATES);
  return queries.reduce(
    (sum, query) => sum + rerankTokenBound(query, longest),
    0,
  );
}

/** Each query's candidates, as the search would read them, with their scores. */
export async function scorePairs(
  queries: string[],
  copy: PassageCopy,
  { embedder, reranker }: { embedder: Embedder; reranker: Reranker },
): Promise<CalibrationPair[]> {
  if (queries.length === 0) return [];
  const embeddings = await embedder.embed(queries);
  const pairs: CalibrationPair[] = [];
  for (const [index, query] of queries.entries()) {
    const candidates = rankPassages(
      copy.passages,
      embeddings[index]!,
      RERANK_CANDIDATES,
    );
    const relevance = await reranker.rank(
      query,
      candidates.map((passage) =>
        embeddingInput(passage.question, passage.answer),
      ),
    );
    for (const [position, passage] of candidates.entries()) {
      pairs.push({
        query,
        passage: passageAnchor(passage.slug, passage.position),
        distance: passage.distance,
        relevance: relevance[position]!,
      });
    }
  }
  return pairs;
}

/** Saves the pairs once: an existing file is an earlier calibration's. */
export async function savePairs(
  root: string,
  reranker: Reranker,
  pairs: CalibrationPair[],
): Promise<string> {
  const dir = join(root, CALIBRATION);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().slice(0, 10)}.json`);
  await writeFile(
    file,
    `${JSON.stringify({ model: reranker.model, pairs }, null, 2)}\n`,
    { flag: "wx" },
  );
  return file;
}
