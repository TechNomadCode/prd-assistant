import { EMBEDDING_MAX_INPUT_TOKENS } from "./models.ts";

// The embedding model reads at most 512 tokens of a text. Cloudflare's docs
// don't say whether a longer text is refused or quietly cut, so every text is
// checked here first, and a long one is refused, never cut.
//
// Counting exactly would need the model's tokenizer. A bound is enough, and
// it's certain: bge's tokenizer (BERT WordPiece) lowercases, then removes accents,
// drops spaces and splits the rest into pieces of at least one character each,
// then adds two markers. So a text never has more tokens than non-space
// characters after that clean-up, plus two.

/** Two markers wrap every text: [CLS] at the start and [SEP] at the end. */
const MARKER_TOKENS = 2;

/** The most tokens the embedding model can make of `text`. */
export function embeddingTokenBound(text: string): number {
  const cleaned = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/\s/gu, "");
  return [...cleaned].length + MARKER_TOKENS;
}

/** True when the embedding model is sure to read the whole text. */
export function fitsEmbeddingModel(text: string): boolean {
  return embeddingTokenBound(text) <= EMBEDDING_MAX_INPUT_TOKENS;
}

/** Refuses texts the embedding model might cut, before any call. */
export function assertEmbeddable(texts: string[]): void {
  const tooLong = texts.filter((text) => !fitsEmbeddingModel(text));
  if (tooLong.length > 0) {
    throw new Error(
      `${tooLong.length} of ${texts.length} texts may be longer than the embedding model's ${EMBEDDING_MAX_INPUT_TOKENS} tokens, so they weren't embedded.`,
    );
  }
}
