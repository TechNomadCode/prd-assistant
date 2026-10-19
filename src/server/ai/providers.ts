import {
  createCloudflareChatModel,
  type CloudflareSettings,
} from "./cloudflare.ts";
import { createCloudflareEmbedder } from "./cloudflare-embedder.ts";
import type { ChatModel } from "./chat-model.ts";
import type { Embedder } from "./embedder.ts";
import { createFakeChatModel } from "./fake-chat-model.ts";
import { createFakeEmbedder } from "./fake-embedder.ts";

// AI_PROVIDER picks the implementation: "fake" on development machines and in
// CI, "cloudflare" on staging and production. AI_CHAT_PROVIDER, when set, picks
// the chat model's on its own, so `npm run dev:real` can run the chat on the
// real model while the search keeps the fake embedder. Anything else is an
// error, so a typo can't quietly fall back to a provider nobody chose.

export const AI_PROVIDERS = ["fake", "cloudflare"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export type ProviderSettings = {
  provider: string | undefined;
  /** The chat model's provider, when it differs from `provider`. */
  chatProvider?: string | undefined;
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
  const chosen = settings.chatProvider ?? settings.provider;
  switch (chosen) {
    case "fake":
      return createFakeChatModel();
    case "cloudflare":
      return createCloudflareChatModel(requireCloudflare(settings));
    default:
      throw unknownProvider(
        chosen,
        settings.chatProvider === undefined
          ? "AI_PROVIDER"
          : "AI_CHAT_PROVIDER",
      );
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
      `Cloudflare is the adapter, but ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} empty.`,
    );
  }
  return { accountId: cloudflareAccountId, apiToken: cloudflareApiToken };
}

function unknownProvider(
  provider: string | undefined,
  variable = "AI_PROVIDER",
): Error {
  return new Error(
    `Unknown ${variable} "${provider ?? ""}". Use one of: ${AI_PROVIDERS.join(", ")}.`,
  );
}
