import { streamText, type UIMessageChunk } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCloudflareChatModel } from "@/server/ai/cloudflare";
import { CHAT_MODEL } from "@/server/ai/models";
import { looksLikeUnsavedDraft } from "@/server/ai/unsaved-draft";
import { streamAnswer } from "@/server/chat";

// gpt-oss can write a section into its reply instead of saving it. The replies
// here are the model's own: the owner's screenshot of 2026-11-09 and the
// measurement's records of 2026-10-20 and 2026-10-22.

const SCREENSHOT = `Section: Introduction / Overview

- Many households experience confusion and duplicate purchases. (Sofia, sofia-2: "Someone posts \\"we're out of dish soap\\" in the house chat")
- Residents want a shared list that updates instantly. (Maya, maya-3: "The moment one of us puts something on it, the other should know")

Check: Does this Introduction capture the core problems? If so, I'll move on to Goals / Objectives.`;

/** Written with the non-breaking hyphens gpt-oss-120b puts in passage ids. */
const TABLE = `**Non‑Functional Requirements (draft)**

| # | Requirement | Source |
|---|---|---|
| 1 | Large text | (Henk, henk‑3: “Big letters. Black on white or white on black”) |
| 2 | Few controls | (Daan, daan‑5: “Just a list”) |`;

const SAVE_AS_TEXT = `{"section":"Non-Functional Requirements","statements":[{"text":"Works offline.","citations":[{"source":"maya-4","quote":"it has to disappear"},{"source":"henk-2","quote":"no signal"}]}]}`;

describe("telling a section written as text", () => {
  it.each([
    ["the owner's screenshot", SCREENSHOT],
    ["a table with non-breaking hyphens", TABLE],
    ["a save written as JSON", SAVE_AS_TEXT],
    [
      "a heading that starts with Draft, as in the owner's screenshot",
      `**Draft – Introduction / Overview**\n- Lists get lost. (Ravi, ravi-3: "otherwise it's chaos")\n- Fast. (Maya, maya-3: "straight away")`,
    ],
    [
      "the product manager's words among the quotes",
      `**Goals / Objectives**\n- Offline. (chat: "It must work without signal")\n- Fast. (Maya, maya-3: "straight away")`,
    ],
  ])("recognises %s", (_, reply) => {
    expect(looksLikeUnsavedDraft(reply)).toBe(true);
  });

  it.each([
    [
      "an answer about the interviews",
      `- Maya wants a ping. (Maya, maya-3: "I want my phone to tell me")\n- Sofia keeps items apart. (Sofia, sofia-4: "My own shopping is my business")`,
    ],
    [
      "an answer that names a section in its first sentence",
      `For Functional Requirements, the interviews say:\n- Maya wants a ping. (Maya, maya-3: "I want my phone to tell me")\n- Ravi sorts. (Ravi, ravi-3: "By section of the shop")`,
    ],
    [
      "questions for the product manager",
      `**Non-Functional Requirements**\nThe interviews don't cover signal. Should the list work offline?`,
    ],
    [
      "a heading with one quote",
      `**Success Metrics**\n- Fewer duplicates. (Sofia, sofia-3: "save a lot of arguing")`,
    ],
    ["an empty reply", ""],
  ])("leaves %s alone", (_, reply) => {
    expect(looksLikeUnsavedDraft(reply)).toBe(false);
  });
});

function chatReply(message: object, finishReason: string) {
  return () =>
    Response.json({
      id: "c1",
      object: "chat.completion",
      created: 0,
      model: CHAT_MODEL,
      choices: [{ index: 0, message, finish_reason: finishReason }],
      usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
    });
}

const words = (content: string) =>
  chatReply({ role: "assistant", content }, "stop");

const draft = words(SCREENSHOT);

const save = chatReply(
  {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call-1",
        type: "function",
        function: {
          name: "saveSection",
          arguments: JSON.stringify({
            section: "Introduction / Overview",
            statements: [
              {
                text: "Households buy things twice.",
                citations: [{ source: "sofia-2", quote: "Someone posts" }],
              },
            ],
          }),
        },
      },
    ],
  },
  "tool_calls",
);

const search = chatReply(
  {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call-2",
        type: "function",
        function: {
          name: "searchNotes",
          arguments: JSON.stringify({ query: "the list" }),
        },
      },
    ],
  },
  "tool_calls",
);

const checkedIn = words(
  "The check confirmed the quotes. Does this capture it?",
);

type Sent = { messages: Array<{ role: string; content: unknown }> };

/** The model behind a fetch that plays the replies; the last one repeats. */
function replaying(replies: (() => Response)[], onCall?: () => void) {
  const sent: Sent[] = [];
  const model = createCloudflareChatModel({
    accountId: "0123456789abcdef0123456789abcdef",
    apiToken: "test",
    fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as Sent);
      onCall?.();
      const reply = replies[Math.min(sent.length, replies.length) - 1];
      return reply!();
    }) as typeof fetch,
  });
  return { sent, model };
}

async function answerTo(model: ReturnType<typeof replaying>["model"]) {
  const chunks: UIMessageChunk[] = [];
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
    chunks.push(chunk);
  }
  return {
    text: chunks
      .flatMap((c) => (c.type === "text-delta" ? [c.delta] : []))
      .join(""),
    errors: chunks.filter((c) => c.type === "error"),
    saved: chunks.some(
      (c) => c.type === "tool-input-available" && c.toolName === "saveSection",
    ),
  };
}

describe("the chat when the model writes a section instead of saving it", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gets it saved, and the visitor never sees the unsaved draft", async () => {
    const { sent, model } = replaying([draft, save, checkedIn]);

    expect(await answerTo(model)).toEqual({
      text: "The check confirmed the quotes. Does this capture it?",
      errors: [],
      saved: true,
    });
    expect(sent).toHaveLength(3);
  });

  it("shows the model its draft and tells it to save that", async () => {
    const { sent, model } = replaying([draft, save, checkedIn]);

    await answerTo(model);

    const retry = sent[1]!.messages;
    expect(retry).toHaveLength(sent[0]!.messages.length + 2);
    expect(retry.at(-2)).toMatchObject({
      role: "assistant",
      content: SCREENSHOT,
    });
    expect(retry.at(-1)?.role).toBe("user");
    expect(JSON.stringify(retry.at(-1))).toContain("saveSection");
  });

  it("asks again when the first reminder doesn't save it", async () => {
    const { sent, model } = replaying([
      draft,
      words("I have saved it."),
      save,
      checkedIn,
    ]);

    expect(await answerTo(model)).toEqual({
      text: "The check confirmed the quotes. Does this capture it?",
      errors: [],
      saved: true,
    });
    expect(sent).toHaveLength(4);
  });

  it("doesn't count another search as saving", async () => {
    const { sent, model } = replaying([draft, search, save, checkedIn]);

    expect((await answerTo(model)).saved).toBe(true);
    expect(sent).toHaveLength(4);
  });

  it("stops after two reminders and quietly keeps the draft", async () => {
    const { sent, model } = replaying([draft, words("I have saved it.")]);

    expect(await answerTo(model)).toEqual({
      text: SCREENSHOT,
      errors: [],
      saved: false,
    });
    expect(sent).toHaveLength(3);
  });

  it("starts no reminder late in an answer, to stay inside the time limit", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { sent, model } = replaying([draft, save, checkedIn], () => {
      now += 100_000;
    });

    expect((await answerTo(model)).text).toBe(SCREENSHOT);
    expect(sent).toHaveLength(1);
  });

  it("still reminds after a slow first reply", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { sent, model } = replaying([draft, save, checkedIn], () => {
      now += 30_000;
    });

    expect((await answerTo(model)).saved).toBe(true);
    expect(sent).toHaveLength(3);
  });

  it("logs what it did, without the reply's words", async () => {
    const { model } = replaying([draft, save, checkedIn]);

    await answerTo(model);

    expect(vi.mocked(console.warn).mock.calls).toEqual([
      ["The chat model wrote a section without saving it; reminding it."],
      ["The reminder got the section saved."],
    ]);
  });

  it("counts the tokens of every call", async () => {
    const { model } = replaying([draft, save, checkedIn]);

    await answerTo(model);

    expect(vi.mocked(console.info).mock.calls.at(-1)?.[0]).toContain(
      "330 tokens (300 input, 30 output) in 2 model calls",
    );
  });

  it("doesn't ask again after an ordinary reply", async () => {
    const { sent, model } = replaying([words("Which section next?")]);

    await answerTo(model);

    expect(sent).toHaveLength(1);
  });

  it("doesn't ask again when saving isn't on offer", async () => {
    const { sent, model } = replaying([draft]);

    expect(await streamText({ model, prompt: "Hi" }).text).toBe(SCREENSHOT);
    expect(sent).toHaveLength(1);
  });
});
