import { createMistral } from "@ai-sdk/mistral";
import { embedMany } from "ai";
import type { Embedder } from "./embedder.ts";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./models.ts";

// The real embedder, used only on staging and production. Mistral runs in EU
// data centres by default; quota exhaustion fails with error 402 because the
// key's account has no billing attached.

export function createMistralEmbedder(apiKey: string): Embedder {
  const model = createMistral({ apiKey }).embedding(EMBEDDING_MODEL);

  return {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts) {
      if (texts.length === 0) return [];
      // embedMany splits large inputs into as many calls as the model allows
      // and returns the vectors in input order.
      const { embeddings, usage } = await embedMany({ model, values: texts });
      console.info(
        `Embedded ${texts.length} texts with ${EMBEDDING_MODEL}: ${usage.tokens} tokens.`,
      );
      return embeddings;
    },
  };
}
