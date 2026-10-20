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
    fetch: refusingQuota(fetch),
  });
}

/**
 * The day's free allocation is used up: 429 with code 3036 on Cloudflare's
 * errors page, or 4006 as the `/ai/v1` endpoint sent it on 2026-10-20, with
 * the same message (https://developers.cloudflare.com/workers-ai/platform/errors/).
 * It resets at 00:00 UTC.
 */
const QUOTA_CODES: readonly number[] = [3036, 4006];

/**
 * The longest wait between tries that Cloudflare's retry headers may ask of
 * the AI SDK. A longer one is dropped, so the SDK's own backoff (2 seconds,
 * then 4) applies and an answer stays well inside the chat route's 60 seconds.
 */
export const MAX_RETRY_WAIT_MS = 5000;

/**
 * Cloudflare's daily free allocation is used up. Thrown from `fetch`, so the
 * AI SDK passes it on instead of retrying a request that can't work before
 * 00:00 UTC (`handleFetchError` in `@ai-sdk/provider-utils`), as it does the
 * measurement's `BudgetExceededError`.
 */
export class QuotaExceededError extends Error {
  /** Cloudflare's error code, 3036 or 4006. */
  readonly cloudflareCode: number;

  constructor(cloudflareCode: number) {
    super(
      `Cloudflare's daily free allocation is used up (429, code ${cloudflareCode}).`,
    );
    this.name = "QuotaExceededError";
    this.cloudflareCode = cloudflareCode;
  }
}

/**
 * Cloudflare's replies as the AI SDK should see them: a quota 429 becomes
 * `QuotaExceededError`, which the SDK doesn't retry. Any other 429 (the
 * per-minute limit, or code 3040, out of capacity) goes on to the SDK, which
 * retries it twice, waiting at most `MAX_RETRY_WAIT_MS` between tries. The
 * requests themselves are unchanged.
 */
function refusingQuota(inner: typeof fetch | undefined): typeof fetch {
  const refusing = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await (inner ?? globalThis.fetch)(input, init);
    if (response.status !== 429) return response;
    const code = errorCode(await response.clone().text());
    if (code !== null && QUOTA_CODES.includes(code)) {
      await response.body?.cancel();
      throw new QuotaExceededError(code);
    }
    return withShortRetryWait(response);
  };
  return refusing as typeof fetch;
}

/** Cloudflare's error code in a reply, from its own format or OpenAI's. */
function errorCode(text: string): number | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: a quota code as plain text, such as "AiError: 3036: …".
    const match = /\b(3036|4006)\b/.exec(text);
    return match ? Number(match[1]) : null;
  }
  if (typeof body !== "object" || body === null) return null;
  const { errors, error } = body as { errors?: unknown; error?: unknown };
  const candidates = [...(Array.isArray(errors) ? errors : []), error];
  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown } | null | undefined)?.code;
    if (typeof code === "number") return code;
    if (typeof code === "string" && /^\d+$/.test(code)) return Number(code);
  }
  return null;
}

/**
 * The reply without retry headers that ask for a longer wait than
 * `MAX_RETRY_WAIT_MS`, read as the AI SDK reads them (`getRetryDelayInMs` in
 * `ai`): `retry-after-ms` in milliseconds, else `retry-after` in seconds or
 * as a date.
 */
function withShortRetryWait(response: Response): Response {
  const ms = response.headers.get("retry-after-ms");
  const after = response.headers.get("retry-after");
  let wait: number | undefined;
  if (ms !== null && !Number.isNaN(parseFloat(ms))) {
    wait = parseFloat(ms);
  } else if (after !== null) {
    wait = Number.isNaN(parseFloat(after))
      ? Date.parse(after) - Date.now()
      : parseFloat(after) * 1000;
  }
  if (wait === undefined || Number.isNaN(wait) || wait <= MAX_RETRY_WAIT_MS) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.delete("retry-after-ms");
  headers.delete("retry-after");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
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
