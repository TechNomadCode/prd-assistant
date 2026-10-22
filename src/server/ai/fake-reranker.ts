import { embedText } from "./fake-embedder.ts";
import { EMBEDDING_DIMENSIONS } from "./models.ts";
import type { Reranker } from "./reranker.ts";

// The fake reranker used locally and in CI. It scores a text by the fake
// embedder's own similarity to the question (the cosine of their word
// vectors), so it keeps the order the fake search gives and drops only the
// passages that share no word with the question. Deterministic and free.

/** Above 0: a passage that shares any word with the question is kept. */
export const FAKE_RERANK_THRESHOLD = 1e-9;

export function fakeRelevance(query: string, text: string): number {
  const a = embedText(query, EMBEDDING_DIMENSIONS);
  const b = embedText(text, EMBEDDING_DIMENSIONS);
  let dot = 0;
  for (let index = 0; index < a.length; index++) dot += a[index]! * b[index]!;
  return Math.max(0, Math.min(1, dot));
}

export function createFakeReranker(): Reranker {
  return {
    model: "fake-word-overlap",
    threshold: FAKE_RERANK_THRESHOLD,
    async rank(query, texts) {
      return texts.map((text) => fakeRelevance(query, text));
    },
  };
}
