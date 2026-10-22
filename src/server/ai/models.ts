// Pinned Cloudflare Workers AI model names (docs/decisions.md, External
// services). Any change here reruns the quality check; a new embedding model
// also re-embeds every passage.

/**
 * gpt-oss-120b, the larger of OpenAI's two open-weight models on Cloudflare
 * (`docs/decisions.md`, External services). gpt-oss-20b takes the same
 * request format, and the measurement's meter has rates for both.
 */
export const CHAT_MODEL = "@cf/openai/gpt-oss-120b";
export const EMBEDDING_MODEL = "@cf/baai/bge-large-en-v1.5";

/**
 * The search's second step: a cross-encoder that reads the question and each
 * candidate passage together and scores how relevant the passage is, as
 * Cloudflare's AI Search reranks with it (`src/server/AGENTS.md`, *The
 * reranker*).
 */
export const RERANK_MODEL = "@cf/baai/bge-reranker-base";

/** bge-large-en-v1.5 returns 1024 numbers; `passages.embedding` matches it. */
export const EMBEDDING_DIMENSIONS = 1024;

/** The embedding model reads at most this many tokens of one text. */
export const EMBEDDING_MAX_INPUT_TOKENS = 512;

/** Cloudflare embeds at most this many texts in one call. */
export const EMBEDDING_BATCH_SIZE = 100;
