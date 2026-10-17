import { isStepCount, streamText, tool } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCloudflareChatModel } from "@/server/ai/cloudflare";
import { createCloudflareEmbedder } from "@/server/ai/cloudflare-embedder";
import { CHAT_MODEL, EMBEDDING_MODEL } from "@/server/ai/models";
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
