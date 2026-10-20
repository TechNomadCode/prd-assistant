import { APICallError } from "ai";
import { z } from "zod";
import { listNames } from "../../lib/chat.ts";
import {
  CHAT_SOURCE,
  nextSection,
  PRD_SECTIONS,
  type SectionDraft,
  type SectionName,
  type StatementDraft,
} from "../../lib/prd.ts";
import type {
  ChatModel,
  ChatModelCall,
  ChatModelStreamPart,
} from "./chat-model.ts";

// The fake chat model used locally and in CI. It follows a script instead of
// thinking: it searches the interviews with the visitor's own words, then
// answers from the closest passage, quoting it word for word. Asked for a
// section (a message with "draft" or "section" in it), it saves the section
// the message names last, or the first, built from the passages it found
// instead, then says what the check found. The chat runs end to end with no
// provider and no key. Deterministic and free.
//
// Phrases in a visitor's message steer it:
// - "fake: fail before answering": the provider call fails before any
//   output, once for each message.
// - "fake: fail partway": the answer breaks off after a few words, once for
//   each message.
// - "fake: flawed section": the saved section also quotes a researcher's
//   question, quotes one passage while citing another, and has a statement
//   that cites nothing, so the check has something to catch.
// - "fake: search again": it searches again with the same words for as long
//   as the search is on offer (three times in all: `MAX_SEARCHES` in
//   chat.ts), then goes on as usual, so the chat has searches in a row.

export const FAKE_CHAT_MODEL = "fake-scripted-chat";

export const FAKE_FAILURES = {
  beforeAnswering: "fake: fail before answering",
  partway: "fake: fail partway",
} as const;

export const FAKE_FLAWED_SECTION = "fake: flawed section";

export const FAKE_SEARCH_AGAIN = "fake: search again";

/** A model searches with a short question, not a whole message. */
const MAX_QUERY_LENGTH = 300;

/** A model quotes a few words up to one sentence. */
const MAX_QUOTE_LENGTH = 300;

/** How many passages a fake section is built from. */
const PASSAGES_PER_SECTION = 3;

/** How many words of the answer stream before "fail partway" breaks off. */
const WORDS_BEFORE_BREAK = 8;

const ASKS_FOR_A_SECTION = /\b(draft|section)/i;

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
      const result = lastResult(call);
      const pacing = { delayInMs: chunkDelayInMs, signal: call.abortSignal };

      if (result === undefined && offers(call, "searchNotes")) {
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

      if (
        result?.toolName === "searchNotes" &&
        offers(call, "searchNotes") &&
        message.toLowerCase().includes(FAKE_SEARCH_AGAIN)
      ) {
        return { stream: streamOf(searchStep(call, message), pacing) };
      }

      if (
        result?.ok &&
        result.toolName === "searchNotes" &&
        result.passages.length > 0 &&
        ASKS_FOR_A_SECTION.test(message) &&
        offers(call, "saveSection")
      ) {
        const draft = draftSection(message, result.passages);
        return { stream: streamOf(saveStep(call, draft), pacing) };
      }

      const parts = answerStep(call, message, result);
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

function offers(call: ChatModelCall, toolName: string): boolean {
  return (call.tools ?? []).some((tool) => tool.name === toolName);
}

/** What the search tool sends a model: see `toModelOutput` in chat.ts. */
const searchOutputSchema = z.object({
  passages: z.array(
    z.object({
      passage: z.string(),
      interviewee: z.string(),
      question: z.string(),
      answer: z.string(),
    }),
  ),
});

type FoundPassage = z.infer<typeof searchOutputSchema>["passages"][number];

/** What the save tool sends a model: see `checkReport` in chat.ts. */
const saveReportSchema = z.object({
  saved: z.enum(PRD_SECTIONS),
  quotes: z.number(),
  confirmed: z.number(),
  citesNothing: z.array(z.number()),
});

type SaveReport = z.infer<typeof saveReportSchema>;

type ToolResult =
  | { toolName: "searchNotes"; ok: true; passages: FoundPassage[] }
  | { toolName: "saveSection"; ok: true; report: SaveReport }
  | { toolName: string; ok: false };

/** The result of the tool the last step called, if it called one. */
function lastResult(call: ChatModelCall): ToolResult | undefined {
  const last = call.prompt.at(-1);
  if (last?.role !== "tool") return undefined;
  const result = last.content.find((part) => part.type === "tool-result");
  if (result?.type !== "tool-result") return { toolName: "", ok: false };
  const { toolName, output } = result;
  if (output.type !== "json") return { toolName, ok: false };

  if (toolName === "searchNotes") {
    const parsed = searchOutputSchema.safeParse(output.value);
    if (parsed.success) {
      return { toolName, ok: true, passages: parsed.data.passages };
    }
  }
  if (toolName === "saveSection") {
    const parsed = saveReportSchema.safeParse(output.value);
    if (parsed.success) return { toolName, ok: true, report: parsed.data };
  }
  return { toolName, ok: false };
}

/** The visitor's words, without the phrases that steer the fake. */
function searchQuery(message: string): string {
  let query = message;
  for (const phrase of [
    ...Object.values(FAKE_FAILURES),
    FAKE_FLAWED_SECTION,
    FAKE_SEARCH_AGAIN,
  ]) {
    query = query.replace(new RegExp(phrase, "gi"), " ");
  }
  return query.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

/**
 * The section the visitor names last, or the first. "Introduction / Overview
 * looks right. Please draft Goals / Objectives." asks for Goals / Objectives.
 */
function requestedSection(message: string): SectionName {
  const text = message.toLowerCase();
  let named: SectionName = PRD_SECTIONS[0];
  let end = -1;
  let length = 0;
  for (const name of PRD_SECTIONS) {
    const words = (name.split(" / ")[0] ?? name).toLowerCase();
    const found = text.lastIndexOf(words);
    if (found === -1) continue;
    // "Non-Functional Requirements" holds "Functional Requirements": where
    // both end at once, the longer name is the one meant.
    const ends = found + words.length;
    if (ends > end || (ends === end && words.length > length)) {
      named = name;
      end = ends;
      length = words.length;
    }
  }
  return named;
}

/**
 * A section built from the closest passages: one statement each, quoting the
 * first sentence of its answer, and one quoting the visitor's request.
 */
function draftSection(message: string, passages: FoundPassage[]): SectionDraft {
  const statements: StatementDraft[] = passages
    .slice(0, PASSAGES_PER_SECTION)
    .map((passage) => ({
      text: `${passage.interviewee} answered the researcher's question “${passage.question}”`,
      citations: [
        { source: passage.passage, quote: firstSentence(passage.answer) },
      ],
    }));

  const request = firstSentence(message.trim());
  if (request.length <= MAX_QUOTE_LENGTH) {
    statements.push({
      text: "You asked for this section.",
      citations: [{ source: CHAT_SOURCE, quote: request }],
    });
  }

  const [first, second] = passages;
  if (first && message.toLowerCase().includes(FAKE_FLAWED_SECTION)) {
    statements.push({
      text: `Quotes the researcher's question as if ${first.interviewee} said it.`,
      citations: [{ source: first.passage, quote: first.question }],
    });
    if (second) {
      statements.push({
        text: `Quotes another passage's answer, but cites ${first.passage}.`,
        citations: [
          { source: first.passage, quote: firstSentence(second.answer) },
        ],
      });
    }
    statements.push({ text: "Cites nothing at all.", citations: [] });
  }

  return { section: requestedSection(message), statements };
}

function searchStep(
  call: ChatModelCall,
  message: string,
): ChatModelStreamPart[] {
  const input = JSON.stringify({ query: searchQuery(message) });
  return toolCallStep(call, "searchNotes", input, "fake-search");
}

function saveStep(
  call: ChatModelCall,
  draft: SectionDraft,
): ChatModelStreamPart[] {
  return toolCallStep(call, "saveSection", JSON.stringify(draft), "fake-save");
}

function toolCallStep(
  call: ChatModelCall,
  toolName: string,
  input: string,
  idPrefix: string,
): ChatModelStreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    {
      type: "tool-call",
      // The prompt grows with every step, so its length is a unique id.
      toolCallId: `${idPrefix}-${call.prompt.length}`,
      toolName,
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
  result: ToolResult | undefined,
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

function answerText(query: string, result: ToolResult | undefined): string {
  const note =
    "(This is the local fake model: it searches the interviews like the real one, then answers from a script.)";
  if (result === undefined) {
    return `I can only answer from the interviews, and I can't search them right now. ${note}`;
  }
  if (!result.ok) {
    return result.toolName === "saveSection"
      ? `The section wasn't saved, so there's nothing to check yet. ${note}`
      : `The search didn't work, so I can't answer from the interviews yet. ${note}`;
  }
  if (result.toolName === "saveSection") {
    return `${checkIn(result.report)} ${note}`;
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

/** What the check found, then the check-in before the next section. */
function checkIn({ saved, quotes, confirmed, citesNothing }: SaveReport) {
  const uncited =
    citesNothing.length === 0
      ? ""
      : citesNothing.length === 1
        ? ", and 1 statement cites nothing"
        : `, and ${citesNothing.length} statements cite nothing`;
  const next = nextSection(saved);
  return [
    `I saved ${saved}. The check confirmed ${confirmed} of ${quotes} ${quotes === 1 ? "quote" : "quotes"}${uncited}.`,
    next
      ? `Does this capture it? If so, shall we move on to ${next}?`
      : "Does this capture it?",
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
