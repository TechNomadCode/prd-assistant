// Pinned Mistral model names (docs/decisions.md, External services). Never the
// `-latest` aliases: they change without notice. Any change here reruns the
// quality check; a new embedding model also re-embeds every passage.

export const CHAT_MODEL = "mistral-small-2603";
export const FALLBACK_CHAT_MODEL = "mistral-medium-3-5";
export const EMBEDDING_MODEL = "mistral-embed-2312";

/** mistral-embed returns 1024 numbers; `passages.embedding` matches it. */
export const EMBEDDING_DIMENSIONS = 1024;
