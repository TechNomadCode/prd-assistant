import {
  createCloudflareChatModel,
  type CloudflareSettings,
} from "./cloudflare.ts";
import { createCloudflareEmbedder } from "./cloudflare-embedder.ts";
import type { ChatModel } from "./chat-model.ts";
import type { Embedder } from "./embedder.ts";
import { createFakeChatModel } from "./fake-chat-model.ts";
import { createFakeEmbedder } from "./fake-embedder.ts";
import { createReplayChatModel, loadReplays } from "./replay-chat-model.ts";

// AI_PROVIDER picks the implementation: "fake" on development machines and in
// CI, "cloudflare" on staging and production. AI_CHAT_PROVIDER, when set, picks
// the chat model's on its own, so `npm run dev:real` can run the chat on the
// real model while the search keeps the fake embedder, and `npm run
// dev:replay` on the real model's recorded answers ("replay", chat only).
// Anything else is an error, so a typo can't quietly fall back to a provider
// nobody chose.

export const AI_PROVIDERS = ["fake", "cloudflare"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const CHAT_PROVIDERS = [...AI_PROVIDERS, "replay"] as const;

export type ProviderSettings = {
  provider: string | undefined;
  /** The chat model's provider, when it differs from `provider`. */
  chatProvider?: string | undefined;
  cloudflareAccountId?: string | undefined;
  cloudflareApiToken?: string | undefined;
  /** How many times faster than recorded the replay runs. */
  replaySpeed?: number | undefined;
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
    case "replay":
      if (settings.chatProvider === "replay") {
        return createReplayChatModel({
          replays: loadReplays(),
          speed: settings.replaySpeed,
        });
      }
      throw unknownProvider(chosen);
    default:
      throw settings.chatProvider === undefined
        ? unknownProvider(chosen)
        : unknownProvider(chosen, "AI_CHAT_PROVIDER", CHAT_PROVIDERS);
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
  known: readonly string[] = AI_PROVIDERS,
): Error {
  return new Error(
    `Unknown ${variable} "${provider ?? ""}". Use one of: ${known.join(", ")}.`,
  );
}
