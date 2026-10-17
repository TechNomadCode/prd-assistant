// Pinned Cloudflare Workers AI model names (docs/decisions.md, External
// services). Any change here reruns the quality check; a new embedding model
// also re-embeds every passage.

export const CHAT_MODEL = "@cf/openai/gpt-oss-20b";
export const FALLBACK_CHAT_MODEL = "@cf/openai/gpt-oss-120b";
export const EMBEDDING_MODEL = "@cf/baai/bge-large-en-v1.5";

/** bge-large-en-v1.5 returns 1024 numbers; `passages.embedding` matches it. */
export const EMBEDDING_DIMENSIONS = 1024;

/** The embedding model reads at most this many tokens of one text. */
export const EMBEDDING_MAX_INPUT_TOKENS = 512;

/** Cloudflare embeds at most this many texts in one call. */
export const EMBEDDING_BATCH_SIZE = 100;
