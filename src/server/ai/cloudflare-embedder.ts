import { embedMany } from "ai";
import { createCloudflare, type CloudflareSettings } from "./cloudflare.ts";
import type { Embedder } from "./embedder.ts";
import { assertEmbeddable } from "./embedding-input.ts";
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "./models.ts";

// The real embedder, used only on staging and production.

export function createCloudflareEmbedder(
  settings: CloudflareSettings,
): Embedder {
  const model = createCloudflare(settings).embeddingModel(EMBEDDING_MODEL);

  return {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts) {
      assertEmbeddable(texts);
      const vectors: number[][] = [];
      // The AI SDK reports NaN when a reply has no token count.
      let tokens: number | undefined = 0;
      // The package would send up to 2,048 texts in one call; Cloudflare
      // takes 100.
      for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
        const { embeddings, usage } = await embedMany({
          model,
          values: texts.slice(start, start + EMBEDDING_BATCH_SIZE),
        });
        vectors.push(...embeddings);
        tokens =
          tokens !== undefined && Number.isFinite(usage.tokens)
            ? tokens + usage.tokens
            : undefined;
      }
      if (texts.length > 0) {
        console.info(
          `Embedded ${texts.length} texts with ${EMBEDDING_MODEL}: ${tokens === undefined ? "Cloudflare reported no token count" : `${tokens} tokens`}.`,
        );
      }
      return vectors;
    },
  };
}
