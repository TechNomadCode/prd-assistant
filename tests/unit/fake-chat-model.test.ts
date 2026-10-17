import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import type {
  ChatModelCall,
  ChatModelStreamPart,
} from "@/server/ai/chat-model";
import {
  createFakeChatModel,
  FAKE_CHAT_MODEL,
  FAKE_FAILURES,
} from "@/server/ai/fake-chat-model";

type Prompt = ChatModelCall["prompt"];
type ToolResult = Extract<
  Extract<Prompt[number], { role: "tool" }>["content"][number],
  { type: "tool-result" }
>;

const SEARCH_TOOL = {
  type: "function",
  name: "searchNotes",
  inputSchema: { type: "object", properties: { query: { type: "string" } } },
} as const;

function visitorSays(text: string): Prompt[number] {
  return { role: "user", content: [{ type: "text", text }] };
}

/** The prompt after the fake searched and the search tool answered. */
function afterSearch(text: string, output: ToolResult["output"]): Prompt {
  return [
    visitorSays(text),
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "fake-search-1",
          toolName: "searchNotes",
          input: { query: text },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "fake-search-1",
          toolName: "searchNotes",
          output,
        },
      ],
    },
  ];
}

const FOUND: ToolResult["output"] = {
  type: "json",
  value: {
    passages: [
      {
        passage: "henk-4",
        interviewee: "Henk",
        question: "How would you want to know when Ineke adds something?",
        answer:
          "I'd like my phone to ping me every time she puts something on the list. Every single item, yes.",
      },
      {
        passage: "maya-3",
        interviewee: "Maya",
        question: "If you had a shared list, how would you want it to work?",
        answer:
          "The moment one of us puts something on it, the other should know.",
      },
      {
        passage: "henk-2",
        interviewee: "Henk",
        question: "Have you used a list app before?",
        answer: "Ineke put one on my phone last year.",
      },
    ],
  },
};

function fake(failedMessages = new Set<string>()) {
  return createFakeChatModel({ chunkDelayInMs: 0, failedMessages });
}

async function partsOf(
  prompt: Prompt,
  model = fake(),
  tools: ChatModelCall["tools"] = [SEARCH_TOOL],
) {
  const { stream } = await model.doStream({ prompt, tools });
  const parts: ChatModelStreamPart[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}

function textOf(parts: ChatModelStreamPart[]): string {
  return parts
    .flatMap((part) => (part.type === "text-delta" ? [part.delta] : []))
    .join("");
}

describe("the fake chat model", () => {
  it("is named as a fake", () => {
    expect(fake().modelId).toBe(FAKE_CHAT_MODEL);
  });

  it("searches with the visitor's own words before it answers", async () => {
    const parts = await partsOf([visitorSays("  Who wants a ping?\n")]);

    expect(parts).toContainEqual({
      type: "tool-call",
      toolCallId: expect.stringMatching(/^fake-search-/),
      toolName: "searchNotes",
      input: JSON.stringify({ query: "Who wants a ping?" }),
    });
    expect(parts.at(-1)).toMatchObject({
      type: "finish",
      finishReason: { unified: "tool-calls" },
    });
  });

  it("answers from the search, naming whose passages came back and quoting the closest", async () => {
    const parts = await partsOf(afterSearch("Who wants a ping?", FOUND));

    expect(textOf(parts)).toBe(
      "I searched the interviews for “Who wants a ping?”. The closest passages come from Henk and Maya. " +
        "The closest is Henk's answer to “How would you want to know when Ineke adds something?”: " +
        "“I'd like my phone to ping me every time she puts something on the list.” " +
        "(This is the local fake model: it searches the interviews like the real one, then answers from a script.)",
    );
    expect(
      parts.filter((part) => part.type === "text-delta").length,
    ).toBeGreaterThan(10);
    expect(parts.at(-1)).toMatchObject({
      type: "finish",
      finishReason: { unified: "stop" },
    });
  });

  it("says so when the search didn't work", async () => {
    const prompt = afterSearch("Who wants a ping?", {
      type: "error-text",
      value: "SearchFailedError: The search didn't work this time.",
    });

    expect(textOf(await partsOf(prompt))).toMatch(
      /^The search didn't work, so I can't answer from the interviews yet\./,
    );
  });

  it("answers without searching when it has no search tool", async () => {
    const parts = await partsOf([visitorSays("Hi")], fake(), []);

    expect(parts.some((part) => part.type === "tool-call")).toBe(false);
    expect(textOf(parts)).toMatch(/^I can only answer from the interviews/);
  });

  it("reports the tokens it estimates for each call", async () => {
    const parts = await partsOf([visitorSays("Who wants a ping?")]);

    const finish = parts.at(-1);
    if (finish?.type !== "finish") throw new Error("No finish part.");
    expect(finish.usage.inputTokens.total).toBeGreaterThan(0);
    expect(finish.usage.outputTokens.total).toBeGreaterThan(0);
  });

  describe("failing on purpose", () => {
    const beforeAnswering = `Who wants a ping? ${FAKE_FAILURES.beforeAnswering}`;
    const partway = `Who wants a ping? ${FAKE_FAILURES.partway}`;

    it("fails before answering once for each message that asks, without a retry hiding it", async () => {
      const model = fake();

      const first = partsOf([visitorSays(beforeAnswering)], model);
      await expect(first).rejects.toThrow(APICallError);
      await expect(first).rejects.toMatchObject({ isRetryable: false });

      const second = await partsOf([visitorSays(beforeAnswering)], model);
      expect(second).toContainEqual(
        expect.objectContaining({
          type: "tool-call",
          input: JSON.stringify({ query: "Who wants a ping?" }),
        }),
      );
    });

    it("breaks off partway once for each message that asks, after the first words arrived", async () => {
      const model = fake();
      const { stream } = await model.doStream({
        prompt: afterSearch(partway, FOUND),
        tools: [SEARCH_TOOL],
      });

      const arrived: ChatModelStreamPart[] = [];
      const reading = (async () => {
        for await (const part of stream) arrived.push(part);
      })();

      await expect(reading).rejects.toThrow(
        "The fake provider's connection dropped on purpose.",
      );
      expect(textOf(arrived)).toBe(
        "I searched the interviews for “Who wants a ",
      );

      const retried = await partsOf(afterSearch(partway, FOUND), model);
      expect(textOf(retried)).toMatch(
        /^I searched the interviews .* script\.\)$/,
      );
    });

    it("keeps the phrases that steer it out of its search", async () => {
      const parts = await partsOf([visitorSays(partway.toUpperCase())]);

      expect(parts).toContainEqual(
        expect.objectContaining({
          type: "tool-call",
          input: JSON.stringify({ query: "WHO WANTS A PING?" }),
        }),
      );
    });
  });
});
