/**
 * Scores how relevant each text is to a question, reading both together. The
 * fake and the real provider both implement it. The search keeps a passage
 * only when its relevance reaches `threshold`, as Haystack's cross-encoder
 * rankers do with `score_threshold` (`src/server/AGENTS.md`, *The reranker*).
 */
export type Reranker = {
  readonly model: string;
  /** The lowest relevance a passage may have and still be returned. */
  readonly threshold: number;
  /** One relevance from 0 to 1 per text, in the texts' order. */
  rank(query: string, texts: string[]): Promise<number[]>;
};
