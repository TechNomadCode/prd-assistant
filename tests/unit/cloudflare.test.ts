import { streamText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudflare } from "@/server/ai/cloudflare";
import { createCloudflareEmbedder } from "@/server/ai/cloudflare-embedder";
import { CHAT_MODEL, EMBEDDING_MODEL } from "@/server/ai/models";

// The Cloudflare adapter against a recorded fetch: the requests it sends and
// how it reads the replies. Cloudflare itself is checked on staging.

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1`;

type Sent = { url: string; headers: Headers; body: Record<string, unknown> };

function recordingFetch(reply: (body: Record<string, unknown>) => Response) {
  const sent: Sent[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    sent.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body,
    });
    return reply(body);
  };
  return { sent, fetch: fetch as typeof globalThis.fetch };
}

/** An OpenAI-style embeddings reply: one short vector per text. */
function embeddingsReply(body: Record<string, unknown>) {
  const input = body.input as string[];
  return Response.json({
    object: "list",
    data: input.map((_, index) => ({
      object: "embedding",
      index,
      embedding: [index, 1],
    })),
    model: body.model,
    usage: { prompt_tokens: input.length * 3, total_tokens: input.length * 3 },
  });
}

describe("the Cloudflare embedder", () => {
  it("sends the pinned model to the account's endpoint with the token", async () => {
    const { sent, fetch } = recordingFetch(embeddingsReply);
    const embedder = createCloudflareEmbedder({
      accountId: ACCOUNT,
      apiToken: "test-token",
      fetch,
    });

    expect(await embedder.embed(["milk", "bread"])).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(`${BASE}/embeddings`);
    expect(sent[0]?.headers.get("authorization")).toBe("Bearer test-token");
    expect(sent[0]?.body).toMatchObject({
      model: EMBEDDING_MODEL,
      input: ["milk", "bread"],
    });
  });

  it("sends at most 100 texts a call, and keeps their order", async () => {
    const { sent, fetch } = recordingFetch(embeddingsReply);
    const embedder = createCloudflareEmbedder({
      accountId: ACCOUNT,
      apiToken: "test",
      fetch,
    });
    const texts = Array.from({ length: 230 }, (_, index) => `text ${index}`);

    const vectors = await embedder.embed(texts);

    expect(sent.map((call) => (call.body.input as string[]).length)).toEqual([
      100, 100, 30,
    ]);
    expect(vectors).toHaveLength(230);
    expect(vectors[100]).toEqual([0, 1]);
    expect(vectors[229]).toEqual([29, 1]);
  });

  it("refuses a text that may be too long before sending anything", async () => {
    const { sent, fetch } = recordingFetch(embeddingsReply);
    const embedder = createCloudflareEmbedder({
      accountId: ACCOUNT,
      apiToken: "test",
      fetch,
    });

    await expect(embedder.embed(["short", "x".repeat(511)])).rejects.toThrow(
      /1 of 2 texts may be longer than the embedding model's 512 tokens/,
    );
    expect(sent).toHaveLength(0);
  });

  it("sends nothing for no texts", async () => {
    const { sent, fetch } = recordingFetch(embeddingsReply);
    const embedder = createCloudflareEmbedder({
      accountId: ACCOUNT,
      apiToken: "test",
      fetch,
    });

    expect(await embedder.embed([])).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  describe("logging the tokens", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    function embedder({ reportsTokens }: { reportsTokens: boolean }) {
      const { fetch } = recordingFetch((body) =>
        reportsTokens
          ? embeddingsReply(body)
          : Response.json({ data: [{ embedding: [0, 1] }] }),
      );
      return createCloudflareEmbedder({
        accountId: ACCOUNT,
        apiToken: "test",
        fetch,
      });
    }

    it("logs the tokens Cloudflare reports, summed over the calls", async () => {
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      const texts = Array.from({ length: 101 }, (_, index) => `text ${index}`);

      await embedder({ reportsTokens: true }).embed(texts);

      expect(info).toHaveBeenCalledWith(
        `Embedded 101 texts with ${EMBEDDING_MODEL}: 303 tokens.`,
      );
    });

    it("says so when Cloudflare reports no token count, instead of NaN", async () => {
      const info = vi.spyOn(console, "info").mockImplementation(() => {});

      await embedder({ reportsTokens: false }).embed(["milk"]);

      expect(info).toHaveBeenCalledWith(
        `Embedded 1 texts with ${EMBEDDING_MODEL}: Cloudflare reported no token count.`,
      );
    });
  });
});

/** A streamed chat completion: one word, then the token count. */
function chatStreamReply() {
  const chunk = (value: object) => `data: ${JSON.stringify(value)}\n\n`;
  const base = { id: "c1", object: "chat.completion.chunk", created: 0 };
  return new Response(
    chunk({
      ...base,
      model: CHAT_MODEL,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "Hello" },
          finish_reason: null,
        },
      ],
    }) +
      chunk({
        ...base,
        model: CHAT_MODEL,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 },
      }) +
      "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } },
  );
}

describe("the Cloudflare chat model", () => {
  it("streams from the account's endpoint and reports the tokens", async () => {
    const { sent, fetch } = recordingFetch(chatStreamReply);
    const model = createCloudflare({
      accountId: ACCOUNT,
      apiToken: "test",
      fetch,
    }).chatModel(CHAT_MODEL);

    const result = streamText({ model, prompt: "Hi" });

    expect(await result.text).toBe("Hello");
    expect((await result.usage).totalTokens).toBe(13);
    expect(sent[0]?.url).toBe(`${BASE}/chat/completions`);
    expect(sent[0]?.body).toMatchObject({
      model: CHAT_MODEL,
      stream: true,
      stream_options: { include_usage: true },
    });
  });
});
