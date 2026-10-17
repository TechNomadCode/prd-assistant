import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { simulateStreamingMiddleware, wrapLanguageModel } from "ai";
import type { ChatModel } from "./chat-model.ts";
import { CHAT_MODEL } from "./models.ts";

// Cloudflare Workers AI through its OpenAI-compatible endpoint, used only on
// staging and production. The account is on the free plan with no billing,
// so the daily allocation running out fails with 429 instead of charging.

export type CloudflareSettings = {
  accountId: string;
  apiToken: string;
  /** Tests pass their own, so no request leaves the machine. */
  fetch?: typeof fetch;
};

export function createCloudflare({
  accountId,
  apiToken,
  fetch,
}: CloudflareSettings) {
  return createOpenAICompatible({
    name: "cloudflare-workers-ai",
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1`,
    apiKey: apiToken,
    // Without it, a streamed answer reports no tokens.
    includeUsage: true,
    transformRequestBody: withTextContent,
    fetch,
  });
}

/**
 * Cloudflare requires every message's `content` to be text, but the package
 * sends `null` for an assistant message that only calls a tool, as OpenAI
 * allows. Cloudflare refuses that with 400, code 5006 (seen on staging,
 * 2026-10-17), so the follow-up after a search failed. Empty text works.
 */
function withTextContent(body: Record<string, unknown>) {
  if (!Array.isArray(body.messages)) return body;
  return {
    ...body,
    messages: body.messages.map((message: Record<string, unknown>) =>
      message.content === null ? { ...message, content: "" } : message,
    ),
  };
}

/**
 * The chat model, asked for whole replies. Streamed, Cloudflare sends
 * gpt-oss's tool calls as reasoning text without the tool's name and ends
 * with "stop", so the search never runs (seen on staging, 2026-10-17). A
 * whole reply carries a proper tool call; the middleware hands it to
 * `streamText` as a stream of one piece, so each answer appears at once.
 */
export function createCloudflareChatModel(
  settings: CloudflareSettings,
): ChatModel {
  return wrapLanguageModel({
    model: createCloudflare(settings).chatModel(CHAT_MODEL),
    middleware: simulateStreamingMiddleware(),
  });
}
