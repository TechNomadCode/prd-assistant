import { z } from "zod";
import { refusingQuota, type CloudflareSettings } from "./cloudflare.ts";
import { RERANK_MODEL } from "./models.ts";
import type { Reranker } from "./reranker.ts";

// The real reranker, on staging and production, and on this machine only in
// the measurement. bge-reranker-base runs on Workers AI's own endpoint
// (`/ai/run`), not the OpenAI-compatible one: the question and the texts go
// in, one score per text comes back, referring to the text by its index
// (https://developers.cloudflare.com/workers-ai/models/bge-reranker-base/,
// schema-input.json and schema-output.json, read 2026-10-22).

/**
 * The lowest relevance, after the sigmoid, that a passage may have and still
 * reach the model. To be set from our own question and passage pairs, as
 * Cohere advises (`src/server/AGENTS.md`, *The reranker*); until that
 * calibration runs, the sigmoid's midpoint, a logit of 0.
 */
export const RERANK_THRESHOLD = 0.5;

const rerankReply = z.object({
  result: z.object({
    response: z.array(z.object({ id: z.number().int(), score: z.number() })),
  }),
});

/**
 * The model's score is a logit, which Cloudflare's model page says "can be
 * mapped to a float value in [0,1] by sigmoid function"; Haystack's
 * cross-encoder rankers do the same before their threshold (`scale_score`).
 */
export function sigmoid(score: number): number {
  return 1 / (1 + Math.exp(-score));
}

export function createCloudflareReranker({
  accountId,
  apiToken,
  fetch,
}: CloudflareSettings): Reranker {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${RERANK_MODEL}`;
  const send = refusingQuota(fetch);

  return {
    model: RERANK_MODEL,
    threshold: RERANK_THRESHOLD,
    async rank(query, texts) {
      if (texts.length === 0) return [];
      const response = await send(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          contexts: texts.map((text) => ({ text })),
          // Every text's score, not only the best ones.
          top_k: texts.length,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Cloudflare's reranker answered ${response.status}: ${(await response.text()).slice(0, 300)}`,
        );
      }
      const reply = rerankReply.parse(await response.json());
      // Filled, so a text without a score counts as missing below.
      const relevance = new Array<number | undefined>(texts.length).fill(
        undefined,
      );
      for (const { id, score } of reply.result.response) {
        if (id >= 0 && id < texts.length) relevance[id] = sigmoid(score);
      }
      const missing = relevance.filter((value) => value === undefined).length;
      if (missing > 0) {
        throw new Error(
          `Cloudflare's reranker scored ${texts.length - missing} of ${texts.length} texts.`,
        );
      }
      return relevance as number[];
    },
  };
}
