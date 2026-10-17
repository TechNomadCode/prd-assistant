import { APICallError } from "ai";
import { z } from "zod";
import { listNames } from "../../lib/chat.ts";
import type {
  ChatModel,
  ChatModelCall,
  ChatModelStreamPart,
} from "./chat-model.ts";

// The fake chat model used locally and in CI. It follows a script instead of
// thinking: it searches the interviews with the visitor's own words, then
// answers from the closest passage, quoting it word for word. The chat runs
// end to end with no provider and no key. Deterministic and free.
//
// Two phrases in a visitor's message make it fail on purpose, once for each
// message, so the failure path and the retry can be tested end to end:
// - "fake: fail before answering": the provider call fails before any output.
// - "fake: fail partway": the answer breaks off after a few words.

export const FAKE_CHAT_MODEL = "fake-scripted-chat";

export const FAKE_FAILURES = {
  beforeAnswering: "fake: fail before answering",
  partway: "fake: fail partway",
} as const;

/** A model searches with a short question, not a whole message. */
const MAX_QUERY_LENGTH = 300;

/** How many words of the answer stream before "fail partway" breaks off. */
const WORDS_BEFORE_BREAK = 8;

/** The messages that already failed on purpose in this server process. */
const failedInThisProcess = new Set<string>();

export type FakeChatModelOptions = {
  /** The pause before each streamed part, so text arrives as it would. */
  chunkDelayInMs?: number;
  /** The messages that already failed on purpose. Tests pass their own. */
  failedMessages?: Set<string>;
};

export function createFakeChatModel({
  chunkDelayInMs = 15,
  failedMessages = failedInThisProcess,
}: FakeChatModelOptions = {}): ChatModel {
  /** True once per message that asks for this failure. */
  function failsNow(failure: string, message: string): boolean {
    const key = `${failure}\n${message}`;
    if (!message.toLowerCase().includes(failure) || failedMessages.has(key)) {
      return false;
    }
    failedMessages.add(key);
    return true;
  }

  return {
    specificationVersion: "v4",
    provider: "fake",
    modelId: FAKE_CHAT_MODEL,
    supportedUrls: {},

    async doGenerate() {
      throw new Error("The fake chat model only streams: use streamText.");
    },

    async doStream(call) {
      const message = lastVisitorMessage(call);
      const searchResult = lastSearchResult(call);
      const pacing = { delayInMs: chunkDelayInMs, signal: call.abortSignal };

      if (searchResult === undefined && canSearch(call)) {
        if (failsNow(FAKE_FAILURES.beforeAnswering, message)) {
          // Not retryable, so the failure reaches the visitor instead of
          // being hidden by the AI SDK's automatic retry.
          throw new APICallError({
            message: "The fake provider failed on purpose.",
            url: "fake://chat",
            requestBodyValues: {},
            statusCode: 503,
            isRetryable: false,
          });
        }
        return { stream: streamOf(searchStep(call, message), pacing) };
      }

      const parts = answerStep(call, message, searchResult);
      if (failsNow(FAKE_FAILURES.partway, message)) {
        // Break off after the first words, as a dropped connection would.
        const breakAt = parts.findIndex((part) => part.type === "text-delta");
        return {
          stream: streamOf(parts, {
            ...pacing,
            breakAt: breakAt + WORDS_BEFORE_BREAK,
          }),
        };
      }
      return { stream: streamOf(parts, pacing) };
    },
  };
}

type PromptMessage = ChatModelCall["prompt"][number];

/** The visitor's latest message, as they wrote it. */
function lastVisitorMessage(call: ChatModelCall): string {
  const message = call.prompt.findLast(
    (entry): entry is Extract<PromptMessage, { role: "user" }> =>
      entry.role === "user",
  );
  if (!message) return "";
  return message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
}

function canSearch(call: ChatModelCall): boolean {
  return (call.tools ?? []).some((tool) => tool.name === "searchNotes");
}

/** What the search tool sends a model: see `toModelOutput` in chat.ts. */
const searchOutputSchema = z.object({
  passages: z.array(
    z.object({
      interviewee: z.string(),
      question: z.string(),
      answer: z.string(),
    }),
  ),
});

type SearchResult =
  | { ok: true; passages: z.infer<typeof searchOutputSchema>["passages"] }
  | { ok: false };

/** The result of the search this step answers, if the last step searched. */
function lastSearchResult(call: ChatModelCall): SearchResult | undefined {
  const last = call.prompt.at(-1);
  if (last?.role !== "tool") return undefined;
  const result = last.content.find(
    (part) => part.type === "tool-result" && part.toolName === "searchNotes",
  );
  if (result?.type !== "tool-result" || result.output.type !== "json") {
    return { ok: false };
  }
  const parsed = searchOutputSchema.safeParse(result.output.value);
  return parsed.success
    ? { ok: true, passages: parsed.data.passages }
    : { ok: false };
}

/** The visitor's words, without the phrases that steer the fake. */
function searchQuery(message: string): string {
  let query = message;
  for (const phrase of Object.values(FAKE_FAILURES)) {
    query = query.replace(new RegExp(phrase, "gi"), " ");
  }
  return query.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

function searchStep(
  call: ChatModelCall,
  message: string,
): ChatModelStreamPart[] {
  const input = JSON.stringify({ query: searchQuery(message) });
  return [
    { type: "stream-start", warnings: [] },
    {
      type: "tool-call",
      // The prompt grows with every step, so its length is a unique id.
      toolCallId: `fake-search-${call.prompt.length}`,
      toolName: "searchNotes",
      input,
    },
    {
      type: "finish",
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage: estimatedUsage(call, input),
    },
  ];
}

function answerStep(
  call: ChatModelCall,
  message: string,
  result: SearchResult | undefined,
): ChatModelStreamPart[] {
  const text = answerText(searchQuery(message), result);
  const words = text.match(/\S+\s*/g) ?? [];
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "fake-answer" },
    ...words.map((word): ChatModelStreamPart => ({
      type: "text-delta",
      id: "fake-answer",
      delta: word,
    })),
    { type: "text-end", id: "fake-answer" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage: estimatedUsage(call, text),
    },
  ];
}

function answerText(query: string, result: SearchResult | undefined): string {
  const note =
    "(This is the local fake model: it searches the interviews like the real one, then answers from a script.)";
  if (result === undefined) {
    return `I can only answer from the interviews, and I can't search them right now. ${note}`;
  }
  if (!result.ok) {
    return `The search didn't work, so I can't answer from the interviews yet. ${note}`;
  }
  const [closest] = result.passages;
  if (!closest) {
    return `I searched the interviews for “${query}”, but nothing came back. ${note}`;
  }
  const people = listNames([
    ...new Set(result.passages.map((passage) => passage.interviewee)),
  ]);
  return [
    `I searched the interviews for “${query}”. The closest passages come from ${people}.`,
    `The closest is ${closest.interviewee}'s answer to “${closest.question}”: “${firstSentence(closest.answer)}”`,
    note,
  ].join(" ");
}

function firstSentence(text: string): string {
  return text.match(/^.*?[.!?](?=\s|$)/s)?.[0] ?? text;
}

type FinishPart = Extract<ChatModelStreamPart, { type: "finish" }>;

/** About four characters a token: a rough stand-in for a real count. */
function estimatedUsage(
  call: ChatModelCall,
  output: string,
): FinishPart["usage"] {
  const input = Math.ceil(JSON.stringify(call.prompt).length / 4);
  const generated = Math.ceil(output.length / 4);
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: generated, text: generated, reasoning: 0 },
  };
}

/**
 * Streams the parts one read at a time. Nothing waits in a queue, so when
 * `breakAt` breaks the stream, every part before it has already arrived.
 */
function streamOf(
  parts: ChatModelStreamPart[],
  {
    delayInMs,
    signal,
    breakAt,
  }: { delayInMs: number; signal?: AbortSignal; breakAt?: number },
): ReadableStream<ChatModelStreamPart> {
  let index = 0;
  return new ReadableStream(
    {
      async pull(controller) {
        if (delayInMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayInMs));
        }
        if (signal?.aborted) {
          controller.error(signal.reason);
          return;
        }
        if (index === breakAt) {
          controller.error(
            new Error("The fake provider's connection dropped on purpose."),
          );
          return;
        }
        const part = parts[index++];
        if (part === undefined) controller.close();
        else controller.enqueue(part);
      },
    },
    { highWaterMark: 0 },
  );
}
