import { createCloudflare, type CloudflareSettings } from "./cloudflare.ts";
import { createCloudflareEmbedder } from "./cloudflare-embedder.ts";
import type { ChatModel } from "./chat-model.ts";
import type { Embedder } from "./embedder.ts";
import { createFakeChatModel } from "./fake-chat-model.ts";
import { createFakeEmbedder } from "./fake-embedder.ts";
import { CHAT_MODEL } from "./models.ts";

// AI_PROVIDER picks the implementation: "fake" on development machines and in
// CI, "cloudflare" on staging and production. Anything else is an error, so a
// typo can't quietly fall back to a provider nobody chose.

export const AI_PROVIDERS = ["fake", "cloudflare"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export type ProviderSettings = {
  provider: string | undefined;
  cloudflareAccountId?: string | undefined;
  cloudflareApiToken?: string | undefined;
};

export function createEmbedder(settings: ProviderSettings): Embedder {
  switch (settings.provider) {
    case "fake":
      return createFakeEmbedder();
    case "cloudflare":
      return createCloudflareEmbedder(requireCloudflare(settings));
    default:
      throw unknownProvider(settings.provider);
  }
}

export function createChatModel(settings: ProviderSettings): ChatModel {
  switch (settings.provider) {
    case "fake":
      return createFakeChatModel();
    case "cloudflare":
      return createCloudflare(requireCloudflare(settings)).chatModel(
        CHAT_MODEL,
      );
    default:
      throw unknownProvider(settings.provider);
  }
}

function requireCloudflare({
  cloudflareAccountId,
  cloudflareApiToken,
}: ProviderSettings): CloudflareSettings {
  const missing = [
    ...(cloudflareAccountId ? [] : ["CLOUDFLARE_ACCOUNT_ID"]),
    ...(cloudflareApiToken ? [] : ["CLOUDFLARE_API_TOKEN"]),
  ];
  if (!cloudflareAccountId || !cloudflareApiToken) {
    throw new Error(
      `AI_PROVIDER is "cloudflare", but ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} empty.`,
    );
  }
  return { accountId: cloudflareAccountId, apiToken: cloudflareApiToken };
}

function unknownProvider(provider: string | undefined): Error {
  return new Error(
    `Unknown AI_PROVIDER "${provider ?? ""}". Use one of: ${AI_PROVIDERS.join(", ")}.`,
  );
}
