import { APICallError, isStepCount, streamText, tool } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DEMO_BUSY, QUOTA_USED_UP } from "@/lib/chat";
import {
  createCloudflareChatModel,
  DegenerateReplyError,
  QuotaExceededError,
} from "@/server/ai/cloudflare";
import { createCloudflareEmbedder } from "@/server/ai/cloudflare-embedder";
import { createCloudflareReranker } from "@/server/ai/cloudflare-reranker";
import { CHAT_MODEL, EMBEDDING_MODEL, RERANK_MODEL } from "@/server/ai/models";
import { streamAnswer } from "@/server/chat";

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

/** A whole chat completion, as Cloudflare returns it without streaming. */
function chatReply(message: object, finishReason: string) {
  return () =>
    Response.json({
      id: "c1",
      object: "chat.completion",
      created: 0,
      model: CHAT_MODEL,
      choices: [{ index: 0, message, finish_reason: finishReason }],
      usage: { prompt_tokens: 344, completion_tokens: 30, total_tokens: 374 },
    });
}

function chatModel(reply: () => Response) {
  const { sent, fetch } = recordingFetch(reply);
  const model = createCloudflareChatModel({
    accountId: ACCOUNT,
    apiToken: "test",
    fetch,
  });
  return { sent, model };
}

// Cloudflare streams gpt-oss's tool calls as reasoning text, without the
// tool's name, and ends with "stop" (seen on staging, 2026-10-17). Whole
// replies carry proper tool calls, so the chat model asks for those.
describe("the Cloudflare chat model", () => {
  it("asks for a whole reply, never a stream, and passes on its text and tokens", async () => {
    const { sent, model } = chatModel(
      chatReply({ role: "assistant", content: "Hello" }, "stop"),
    );

    const result = streamText({ model, prompt: "Hi" });

    expect(await result.text).toBe("Hello");
    expect((await result.usage).totalTokens).toBe(374);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(`${BASE}/chat/completions`);
    expect(sent[0]?.body).toMatchObject({ model: CHAT_MODEL });
    expect(sent[0]?.body.stream).not.toBe(true);
  });

  it("passes on the search a reply asks for as a tool call", async () => {
    const { model } = chatModel(
      chatReply(
        {
          role: "assistant",
          content: null,
          reasoning_content: "We need to search.",
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "searchNotes",
                arguments: '{"query":"notification for every new item"}',
              },
            },
          ],
        },
        "tool_calls",
      ),
    );

    const result = streamText({
      model,
      prompt: "Who wants a notification for every item someone adds?",
      tools: {
        searchNotes: tool({
          inputSchema: z.object({ query: z.string() }),
        }),
      },
    });

    expect(await result.toolCalls).toEqual([
      expect.objectContaining({
        toolName: "searchNotes",
        input: { query: "notification for every new item" },
      }),
    ]);
    expect(await result.finishReason).toBe("tool-calls");
  });

  it("sends the search back with text in every message, which Cloudflare requires", async () => {
    const replies = [
      chatReply(
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "searchNotes",
                arguments: '{"query":"notifications"}',
              },
            },
          ],
        },
        "tool_calls",
      ),
      chatReply({ role: "assistant", content: "Henk wants a ping." }, "stop"),
    ];
    let call = 0;
    const { sent, model } = chatModel(() => replies[call++]!());

    const result = streamText({
      model,
      prompt: "Who wants a notification for every item someone adds?",
      tools: {
        searchNotes: tool({
          inputSchema: z.object({ query: z.string() }),
          execute: async () => ({ passages: [] }),
        }),
      },
      stopWhen: isStepCount(2),
    });

    expect(await result.text).toBe("Henk wants a ping.");
    expect(sent).toHaveLength(2);
    const messages = sent[1]?.body.messages as Array<Record<string, unknown>>;
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    for (const message of messages) {
      expect(typeof message.content).toBe("string");
    }
    expect(messages[1]).toMatchObject({
      content: "",
      tool_calls: [expect.objectContaining({ id: "call-1" })],
    });
  });

  it("sends the search back as Cloudflare's own provider does: reasoning as reasoning, the tool named", async () => {
    const replies = [
      chatReply(
        {
          ...toolCallMessage("call-1", "searchNotes", {
            query: "notifications",
          }),
          reasoning_content: "We need to search.",
        },
        "tool_calls",
      ),
      chatReply({ role: "assistant", content: "Henk wants a ping." }, "stop"),
    ];
    let call = 0;
    const { sent, model } = chatModel(() => replies[call++]!());

    const result = streamText({
      model,
      prompt: "Who wants a notification for every item someone adds?",
      tools: {
        searchNotes: tool({
          inputSchema: z.object({ query: z.string() }),
          execute: async () => ({ passages: [] }),
        }),
      },
      stopWhen: isStepCount(2),
    });

    expect(await result.text).toBe("Henk wants a ping.");
    const messages = sent[1]?.body.messages as Array<Record<string, unknown>>;
    expect(messages[1]).toMatchObject({ reasoning: "We need to search." });
    expect(messages[1]).not.toHaveProperty("reasoning_content");
    expect(messages[2]).toMatchObject({
      role: "tool",
      tool_call_id: "call-1",
      name: "searchNotes",
    });
  });
});

/** A whole reply that only calls one tool. */
function toolCallMessage(id: string, name: string, input: object) {
  return {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id,
        type: "function",
        function: { name, arguments: JSON.stringify(input) },
      },
    ],
  };
}

/** The names of the tools a request offers the model. */
function toolNames(body: Record<string, unknown>): string[] {
  const tools = (body.tools ?? []) as Array<{ function: { name: string } }>;
  return tools.map((tool) => tool.function.name);
}

async function textOfAnswer(
  model: ReturnType<typeof chatModel>["model"],
  message: string,
) {
  let text = "";
  for await (const chunk of streamAnswer(
    [
      {
        id: "visitor-1",
        role: "user",
        parts: [{ type: "text", text: message }],
      },
    ],
    {
      dependencies: {
        model,
        search: async () => [],
        findPassages: async () => [],
      },
    },
  )) {
    if (chunk.type === "text-delta") text += chunk.delta;
  }
  return text;
}

// On staging (2026-10-17), drafting a section failed twice: gpt-oss searched
// five times and ran out of model calls, or its reply hit Cloudflare's
// default of 256 output tokens, which its reasoning counts against.
describe("the chat's requests to Cloudflare", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leave room for a whole section, and drop the search after three", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    let searches = 0;
    // A model that searches whenever it's offered the search.
    const { sent, model } = chatModel(() => {
      if (!toolNames(sent.at(-1)?.body ?? {}).includes("searchNotes")) {
        return chatReply(
          { role: "assistant", content: "Introduction / Overview" },
          "stop",
        )();
      }
      searches += 1;
      return chatReply(
        toolCallMessage(`call-${searches}`, "searchNotes", {
          query: `topic ${searches}`,
        }),
        "tool_calls",
      )();
    });

    const text = await textOfAnswer(model, "Draft the first section.");

    expect(text).toBe("Introduction / Overview");
    expect(sent.map((request) => request.body.max_tokens)).toEqual([
      4096, 4096, 4096, 4096,
    ]);
    expect(sent.map((request) => toolNames(request.body))).toEqual([
      ["searchNotes", "saveSection"],
      ["searchNotes", "saveSection"],
      ["searchNotes", "saveSection"],
      ["saveSection"],
    ]);
  });

  it("offer no tools at all once the section is saved, so the model writes", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const replies = [
      chatReply(
        toolCallMessage("call-1", "searchNotes", { query: "the paper list" }),
        "tool_calls",
      ),
      chatReply(
        toolCallMessage("call-2", "saveSection", {
          section: "Introduction / Overview",
          statements: [
            {
              text: "Daan's household keeps a paper list on the fridge.",
              citations: [
                { source: "daan-1", quote: "It's a notepad with a magnet." },
              ],
            },
          ],
        }),
        "tool_calls",
      ),
      chatReply(
        { role: "assistant", content: "Does this capture it?" },
        "stop",
      ),
    ];
    let call = 0;
    const { sent, model } = chatModel(() => replies[call++]!());

    const text = await textOfAnswer(model, "Draft the first section.");

    expect(text).toBe("Does this capture it?");
    expect(sent.map((request) => "tools" in request.body)).toEqual([
      true,
      true,
      false,
    ]);
  });
});

/** Cloudflare's reply on 2026-10-20 once the day's free allocation was used up. */
const quota4006 = () =>
  Response.json(
    {
      errors: [
        {
          message:
            "AiError: AiError: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage. (f8fafcc3-d351-41a1-a7ed-9874a985ccfd)",
          code: 4006,
        },
      ],
      success: false,
      result: {},
      messages: [],
    },
    { status: 429 },
  );

/** The same refusal with the code Cloudflare's errors page gives it. */
const quota3036 = () =>
  Response.json(
    {
      errors: [{ message: "daily free allocation used up", code: 3036 }],
      success: false,
      result: {},
      messages: [],
    },
    { status: 429 },
  );

/**
 * The per-minute limit: 429 without a quota code. The header only keeps the
 * AI SDK's retries from waiting seconds in a test.
 */
const perMinute = () =>
  Response.json(
    { errors: [], success: false, result: {}, messages: [] },
    { status: 429, headers: { "retry-after-ms": "1" } },
  );

/** Out of capacity, code 3040. */
const busy = () =>
  Response.json(
    {
      errors: [{ message: "Capacity temporarily exceeded", code: 3040 }],
      success: false,
    },
    { status: 429, headers: { "retry-after-ms": "1" } },
  );

/** The replies in order, one per request. */
function replaying(replies: (() => Response)[]) {
  let call = 0;
  return chatModel(() => {
    const reply = replies[call++];
    if (!reply) throw new Error("No recorded reply left.");
    return reply();
  });
}

/** The text and the errors of the chat's answer to one message. */
async function answerTo(model: ReturnType<typeof chatModel>["model"]) {
  let text = "";
  const errors: string[] = [];
  for await (const chunk of streamAnswer(
    [
      {
        id: "visitor-1",
        role: "user",
        parts: [{ type: "text", text: "Draft the first section." }],
      },
    ],
    {
      dependencies: {
        model,
        search: async () => [],
        findPassages: async () => [],
      },
    },
  )) {
    if (chunk.type === "text-delta") text += chunk.delta;
    if (chunk.type === "error") errors.push(chunk.errorText);
  }
  return { text, errors };
}

// On 2026-10-20 Cloudflare refused the account all morning with code 4006,
// and staging showed the generic error and a "Try again" that couldn't work.
describe("the chat when Cloudflare refuses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["4006, as the /ai/v1 endpoint sent it on 2026-10-20", quota4006],
    ["3036, as Cloudflare's errors page names it", quota3036],
  ])(
    "says the day's allocation is used up, without retrying, at code %s",
    async (_, quota) => {
      vi.spyOn(console, "info").mockImplementation(() => {});
      const failed = vi.spyOn(console, "error").mockImplementation(() => {});
      const { sent, model } = replaying([quota, quota, quota]);

      expect(await answerTo(model)).toEqual({
        text: "",
        errors: [QUOTA_USED_UP],
      });
      expect(sent).toHaveLength(1);
      expect(failed).toHaveBeenCalledWith(
        "The chat model failed:",
        expect.any(QuotaExceededError),
      );
    },
  );

  it.each([
    ["the per-minute limit", perMinute],
    ["Cloudflare out of capacity, code 3040", busy],
  ])("retries twice at %s, then says the demo is busy", async (_, refusal) => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { sent, model } = replaying([refusal, refusal, refusal]);

    expect(await answerTo(model)).toEqual({ text: "", errors: [DEMO_BUSY] });
    expect(sent).toHaveLength(3);
  });

  it("answers as usual when a retry gets past the per-minute limit", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { sent, model } = replaying([
      perMinute,
      chatReply({ role: "assistant", content: "Here's the overview." }, "stop"),
    ]);

    expect(await answerTo(model)).toEqual({
      text: "Here's the overview.",
      errors: [],
    });
    expect(sent).toHaveLength(2);
  });

  it("says the allocation is used up when it runs out during the retries", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { sent, model } = replaying([perMinute, quota4006, quota4006]);

    expect(await answerTo(model)).toEqual({
      text: "",
      errors: [QUOTA_USED_UP],
    });
    expect(sent).toHaveLength(2);
  });

  it("keeps the usual error for any other failure", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { model } = replaying([
      () =>
        Response.json(
          { errors: [{ message: "Bad input", code: 5006 }] },
          { status: 400 },
        ),
    ]);

    expect(await answerTo(model)).toEqual({
      text: "",
      errors: ["The assistant couldn't finish its answer."],
    });
  });

  it("drops a retry header that asks for a longer wait than a few seconds", async () => {
    const { model } = replaying([
      () =>
        Response.json(
          { errors: [] },
          { status: 429, headers: { "retry-after": "60", "x-kept": "yes" } },
        ),
      () =>
        Response.json(
          { errors: [] },
          { status: 429, headers: { "retry-after-ms": "3000" } },
        ),
    ]);
    const headersOf = async () => {
      let refused: unknown;
      const result = streamText({
        model,
        prompt: "Hi",
        maxRetries: 0,
        onError: ({ error }) => {
          refused = error;
        },
      });
      await result.consumeStream();
      if (!APICallError.isInstance(refused)) throw refused;
      return refused.responseHeaders;
    };

    const long = await headersOf();
    expect(long).not.toHaveProperty("retry-after");
    expect(long).toHaveProperty("x-kept", "yes");
    expect(await headersOf()).toHaveProperty("retry-after-ms", "3000");
  });

  it("refuses the search's embedding at the quota without retrying", async () => {
    const { sent, fetch } = recordingFetch(quota4006);
    const embedder = createCloudflareEmbedder({
      accountId: ACCOUNT,
      apiToken: "test",
      fetch,
    });

    await expect(embedder.embed(["milk"])).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    expect(sent).toHaveLength(1);
  });
});

/**
 * Cloudflare's whole reply of 4,096 "!", as recorded in the measurement's
 * records (local): only the id, the time, the prompt's tokens and the neurons
 * differ between the two.
 */
function degenerateReply(
  id: string,
  created: number,
  promptTokens: number,
  neurons: number,
) {
  return () =>
    Response.json({
      id,
      object: "chat.completion",
      created,
      model: CHAT_MODEL,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            refusal: null,
            annotations: null,
            audio: null,
            function_call: null,
            reasoning: null,
            reasoning_content: null,
            content: "!".repeat(4096),
          },
          logprobs: null,
          finish_reason: "length",
          stop_reason: null,
          token_ids: null,
          routed_experts: null,
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: 4096,
        total_tokens: promptTokens + 4096,
        prompt_tokens_details: { cached_tokens: 0 },
        neurons,
      },
    });
}

describe("the chat when Cloudflare's reply is degenerate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      "transport D-3's first call, 2026-10-22",
      degenerateReply("id-1792629162692", 1792629162, 2682, 364.6085205078125),
    ],
    [
      "reasoning-high E-2's fourth call, 2026-10-21",
      degenerateReply("id-1792605486100", 1792605486, 5815, 464.2943115234375),
    ],
  ])(
    "shows the usual error instead of the reply, without retrying: %s",
    async (_, reply) => {
      vi.spyOn(console, "info").mockImplementation(() => {});
      const failed = vi.spyOn(console, "error").mockImplementation(() => {});
      const { sent, model } = replaying([reply, reply, reply]);

      expect(await answerTo(model)).toEqual({
        text: "",
        errors: ["The assistant couldn't finish its answer."],
      });
      expect(sent).toHaveLength(1);
      expect(failed).toHaveBeenCalledWith(
        "The chat model failed:",
        expect.any(DegenerateReplyError),
      );
    },
  );

  it("passes on a reply cut off at the limit when its text is words", async () => {
    const { model } = chatModel(
      chatReply(
        { role: "assistant", content: "The overview covers who!!!!" },
        "length",
      ),
    );

    const result = streamText({ model, prompt: "Hi" });

    expect(await result.text).toBe("The overview covers who!!!!");
    expect(await result.finishReason).toBe("length");
  });
});

describe("the Cloudflare reranker", () => {
  /** Cloudflare's reply format for bge-reranker-base: each score by index. */
  const rerankReply = (response: { id: number; score: number }[]) => () =>
    Response.json({ result: { response }, success: true, errors: [] });

  function reranker(fetch: typeof globalThis.fetch) {
    return createCloudflareReranker({
      accountId: ACCOUNT,
      apiToken: "test-token",
      fetch,
    });
  }

  it("sends the question and every text to the pinned model, and reads each score by its index", async () => {
    const { sent, fetch } = recordingFetch(
      rerankReply([
        { id: 1, score: 2 },
        { id: 0, score: -1 },
      ]),
    );

    const relevance = await reranker(fetch).rank("dark mode", [
      "Black on white or white on black.",
      "Same route every week.",
    ]);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${RERANK_MODEL}`,
    );
    expect(sent[0]?.headers.get("authorization")).toBe("Bearer test-token");
    expect(sent[0]?.body).toEqual({
      query: "dark mode",
      contexts: [
        { text: "Black on white or white on black." },
        { text: "Same route every week." },
      ],
      top_k: 2,
    });
    // The model's logits, mapped to 0 to 1 by the sigmoid.
    expect(relevance[0]).toBeCloseTo(1 / (1 + Math.E));
    expect(relevance[1]).toBeCloseTo(1 / (1 + Math.exp(-2)));
  });

  it("sends nothing for no texts", async () => {
    const { sent, fetch } = recordingFetch(rerankReply([]));

    await expect(reranker(fetch).rank("dark mode", [])).resolves.toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it("fails when a text comes back without a score", async () => {
    const { fetch } = recordingFetch(rerankReply([{ id: 0, score: 1 }]));

    await expect(
      reranker(fetch).rank("lists", ["One.", "Two."]),
    ).rejects.toThrow("Cloudflare's reranker scored 1 of 2 texts.");
  });

  it("stops at the daily quota without retrying", async () => {
    const { sent, fetch } = recordingFetch(quota4006);

    await expect(
      reranker(fetch).rank("lists", ["One."]),
    ).rejects.toBeInstanceOf(QuotaExceededError);
    expect(sent).toHaveLength(1);
  });

  it("fails with Cloudflare's status on any other error", async () => {
    const { fetch } = recordingFetch(() =>
      Response.json({ errors: [{ code: 5007 }] }, { status: 400 }),
    );

    await expect(reranker(fetch).rank("lists", ["One."])).rejects.toThrow(
      /^Cloudflare's reranker answered 400/,
    );
  });
});
