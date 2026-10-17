import type { Embedder } from "./embedder.ts";
import { EMBEDDING_DIMENSIONS } from "./models.ts";

// The fake embedder used locally and in CI. It counts words: every word lands
// in one of the vector's slots, so texts that share words get similar vectors
// and the search tests mean something. Deterministic and free.

const STOP_WORDS = new Set(
  (
    "a about after all also am an and any are as at be because been but by can " +
    "could did do does doing don't for from get got had has have he her him his " +
    "how i i'd i'll i'm i've if in into is it it's its just me more most my no not " +
    "of on one or our out over she so some than that that's the their them then " +
    "there they this to too up us very was we were what when where which who why " +
    "will with would you your"
  ).split(" "),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/** FNV-1a: a small, stable string hash. */
function hash(word: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < word.length; index++) {
    value ^= word.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

export function embedText(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const words = tokenize(text);
  // A text without content words still needs a direction: cosine similarity
  // is undefined for an all-zero vector.
  if (words.length === 0) {
    vector[0] = 1;
    return vector;
  }
  for (const word of words) {
    const slot = hash(word) % dimensions;
    vector[slot] = (vector[slot] ?? 0) + 1;
  }
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}

export function createFakeEmbedder(
  dimensions: number = EMBEDDING_DIMENSIONS,
): Embedder {
  return {
    model: "fake-word-overlap",
    dimensions,
    async embed(texts) {
      return texts.map((text) => embedText(text, dimensions));
    },
  };
}
