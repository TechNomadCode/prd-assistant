import type { Embedder } from "./embedder.ts";
import { createFakeEmbedder } from "./fake-embedder.ts";
import { createMistralEmbedder } from "./mistral-embedder.ts";

// AI_PROVIDER picks the implementation: "fake" on development machines and in
// CI, "mistral" on staging and production. Anything else is an error, so a
// typo can't quietly fall back to a provider nobody chose.

export const AI_PROVIDERS = ["fake", "mistral"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export type ProviderSettings = {
  provider: string | undefined;
  mistralApiKey?: string | undefined;
};

export function createEmbedder({
  provider,
  mistralApiKey,
}: ProviderSettings): Embedder {
  switch (provider) {
    case "fake":
      return createFakeEmbedder();
    case "mistral":
      if (!mistralApiKey) {
        throw new Error(
          'AI_PROVIDER is "mistral", but MISTRAL_API_KEY is empty.',
        );
      }
      return createMistralEmbedder(mistralApiKey);
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${provider ?? ""}". Use one of: ${AI_PROVIDERS.join(", ")}.`,
      );
  }
}
