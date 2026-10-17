import { createMistral } from "@ai-sdk/mistral";
import type { ChatModel } from "./chat-model.ts";
import type { Embedder } from "./embedder.ts";
import { createFakeChatModel } from "./fake-chat-model.ts";
import { createFakeEmbedder } from "./fake-embedder.ts";
import { createMistralEmbedder } from "./mistral-embedder.ts";
import { CHAT_MODEL } from "./models.ts";

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
      return createMistralEmbedder(requireMistralKey(mistralApiKey));
    default:
      throw unknownProvider(provider);
  }
}

export function createChatModel({
  provider,
  mistralApiKey,
}: ProviderSettings): ChatModel {
  switch (provider) {
    case "fake":
      return createFakeChatModel();
    case "mistral":
      return createMistral({ apiKey: requireMistralKey(mistralApiKey) }).chat(
        CHAT_MODEL,
      );
    default:
      throw unknownProvider(provider);
  }
}

function requireMistralKey(apiKey: string | undefined): string {
  if (!apiKey) {
    throw new Error('AI_PROVIDER is "mistral", but MISTRAL_API_KEY is empty.');
  }
  return apiKey;
}

function unknownProvider(provider: string | undefined): Error {
  return new Error(
    `Unknown AI_PROVIDER "${provider ?? ""}". Use one of: ${AI_PROVIDERS.join(", ")}.`,
  );
}
