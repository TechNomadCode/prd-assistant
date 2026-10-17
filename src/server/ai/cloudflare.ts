import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

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
    fetch,
  });
}
