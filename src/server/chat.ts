import "server-only";
import {
  convertToModelMessages,
  createUIMessageStream,
  InvalidToolInputError,
  isStepCount,
  NoSuchToolError,
  safeValidateUIMessages,
  streamText,
  tool,
  toUIMessageStream,
  type LanguageModelUsage,
} from "ai";
import { z } from "zod";
import {
  MAX_MESSAGE_LENGTH,
  textOf,
  type ChatMessage,
  type SearchNotesOutput,
} from "@/lib/chat";
import {
  CHAT_SOURCE,
  isFlagged,
  MAX_QUOTE_LENGTH,
  PRD_SECTIONS,
  tally,
  type CheckedCitation,
  type CheckedSection,
  type CitationDraft,
  type SectionDraft,
} from "@/lib/prd";
import {
  passageAnchor,
  type PassageMatch,
  type SourcePassage,
} from "@/lib/transcripts";
import type { ChatModel } from "./ai/chat-model.ts";
import { createChatModel } from "./ai/providers.ts";
import {
  checkSection,
  citedPassages,
  findPassages,
  type VisitorMessage,
} from "./citations.ts";
import { providerSettings, readChatEnv } from "./env.ts";
import { SYSTEM_PROMPT } from "./prompts/system-prompt.ts";
import { SearchQueryError, searchInterviews } from "./search.ts";

// The chat: the visitor's conversation in, the assistant's answer streamed
// out. The model follows the versioned system prompt, decides when to search
// the interviews and saves each drafted section; the app's code runs each
// search, checks every quote of a saved section, and logs the tokens every
// answer used.

/**
 * At most this many searches for one answer. After them the model is offered
 * no search, so it has to save or write: on staging, gpt-oss searched five
 * times for one section and never replied.
 */
const MAX_SEARCHES = 3;

/**
 * At most this many tries to save the section in one answer: one more when
 * the first wasn't in a form the check reads, or its passages couldn't be
 * read. Once a save works, no tool is offered again.
 */
const MAX_SAVE_TRIES = 2;

/**
 * At most this many model calls for one answer: its searches, its tries to
 * save, and the reply. The last call carries no tools, so the answer ends in
 * words even when the model calls a tool the chat doesn't have.
 */
const MAX_STEPS = MAX_SEARCHES + MAX_SAVE_TRIES + 1;

/**
 * Room for each model call's output, its reasoning included. Cloudflare's
 * default of 256 tokens cut section drafts off on staging.
 */
const MAX_OUTPUT_TOKENS = 4096;

/** At most this many messages in one conversation. */
export const MAX_MESSAGES = 200;

// A drafted section's limits: roomy for a model, tight for a forged request.
// A quote's limit (MAX_QUOTE_LENGTH) is tighter, so a whole answer can't
// pass as one.
const MAX_STATEMENTS = 40;
const MAX_STATEMENT_LENGTH = 1000;
const MAX_CITATIONS = 8;
const MAX_SOURCE_LENGTH = 100;

// What the model reads about each tool is versioned with the prompt.
const WORDING = SYSTEM_PROMPT.tools;

const searchNotesInput = z.object({
  query: z.string().describe(WORDING.searchNotes.query),
});

const passageMatchSchema = z.object({
  id: z.number(),
  slug: z.string(),
  participant: z.string(),
  position: z.number(),
  question: z.string(),
  answer: z.string(),
  distance: z.number(),
}) satisfies z.ZodType<PassageMatch>;

const searchNotesOutput = z.object({
  passages: z.array(passageMatchSchema),
}) satisfies z.ZodType<SearchNotesOutput>;

const citationDraftSchema = z.object({
  source: z
    .string()
    .min(1)
    .max(MAX_SOURCE_LENGTH)
    .describe(WORDING.saveSection.source),
  quote: z
    .string()
    .min(1)
    .max(MAX_QUOTE_LENGTH)
    .describe(WORDING.saveSection.quote),
}) satisfies z.ZodType<CitationDraft>;

const saveSectionInput = z.object({
  section: z.enum(PRD_SECTIONS),
  statements: z
    .array(
      z.object({
        text: z
          .string()
          .min(1)
          .max(MAX_STATEMENT_LENGTH)
          .describe(WORDING.saveSection.statement),
        citations: z
          .array(citationDraftSchema)
          .max(MAX_CITATIONS)
          .describe(WORDING.saveSection.citations),
      }),
    )
    .min(1)
    .max(MAX_STATEMENTS),
}) satisfies z.ZodType<SectionDraft>;

const checkedCitationSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("interview"),
    passage: z.string(),
    interviewee: z.string(),
    quote: z.string(),
    confirmed: z.boolean(),
  }),
  z.object({
    source: z.literal("chat"),
    quote: z.string(),
    confirmed: z.boolean(),
    messageId: z.string().optional(),
  }),
  z.object({
    source: z.literal("unknown"),
    passage: z.string(),
    quote: z.string(),
    confirmed: z.literal(false),
  }),
]) satisfies z.ZodType<CheckedCitation>;

const saveSectionOutput = z.object({
  section: z.enum(PRD_SECTIONS),
  statements: z.array(
    z.object({
      text: z.string(),
      citations: z.array(checkedCitationSchema),
    }),
  ),
}) satisfies z.ZodType<CheckedSection>;

/** The search broke for a reason the visitor can't fix. The cause is logged. */
class SearchFailedError extends Error {
  constructor() {
    super("The search didn't work this time.");
    this.name = "SearchFailedError";
  }
}

/** The cited passages couldn't be read, so nothing was checked or saved. */
class SaveFailedError extends Error {
  constructor() {
    super("The section couldn't be checked this time, so it wasn't saved.");
    this.name = "SaveFailedError";
  }
}

export type ChatDependencies = {
  model: ChatModel;
  search(query: string): Promise<PassageMatch[]>;
  /** The passages with these ids that exist, to check quotes against. */
  findPassages(ids: string[]): Promise<SourcePassage[]>;
};

function createTools(
  { search, findPassages }: Omit<ChatDependencies, "model">,
  visitorMessages: VisitorMessage[],
) {
  return {
    searchNotes: tool({
      description: WORDING.searchNotes.description,
      inputSchema: searchNotesInput,
      outputSchema: searchNotesOutput,
      async execute({ query }) {
        try {
          return { passages: await search(query) };
        } catch (error) {
          // The model can fix a refused query, so it gets the reason.
          if (error instanceof SearchQueryError) throw error;
          console.error("The interview search failed:", error);
          throw new SearchFailedError();
        }
      },
      // The model gets what it needs to quote, without the browser's details.
      toModelOutput: ({ output }) => ({
        type: "json",
        value: {
          passages: output.passages.map((passage) => ({
            passage: passageAnchor(passage.slug, passage.position),
            interviewee: passage.participant,
            question: passage.question,
            answer: passage.answer,
          })),
        },
      }),
    }),
    saveSection: tool({
      description: WORDING.saveSection.description,
      inputSchema: saveSectionInput,
      outputSchema: saveSectionOutput,
      async execute(draft) {
        let passages: SourcePassage[];
        try {
          passages = await findPassages(citedPassages(draft));
        } catch (error) {
          console.error("Reading the cited passages failed:", error);
          throw new SaveFailedError();
        }
        return checkSection(draft, { passages, visitorMessages });
      },
      toModelOutput: ({ output }) => ({
        type: "json",
        value: checkReport(output),
      }),
    }),
  };
}

type ChatTools = ReturnType<typeof createTools>;

/**
 * The tools as they hand earlier answers back to the model: a search there
 * shows only each passage's id and interviewee, so a long conversation doesn't
 * send every passage it ever found with each new message. To quote one of
 * them again, the model searches again; a saved section keeps its quotes in
 * the call itself.
 */
function forEarlierAnswers(tools: ChatTools): ChatTools {
  const searchNotes: ChatTools["searchNotes"] = {
    ...tools.searchNotes,
    toModelOutput: ({ output }) => ({
      type: "json",
      value: {
        passages: output.passages.map((passage) => ({
          passage: passageAnchor(passage.slug, passage.position),
          interviewee: passage.participant,
        })),
      },
    }),
  };
  return { ...tools, searchNotes };
}

/**
 * What the model learns from a save: the counts, every quote the check
 * couldn't confirm, and the statements that cite nothing, numbered from 1.
 */
function checkReport(section: CheckedSection) {
  const { quotes, confirmed } = tally(section);
  return {
    saved: section.section,
    quotes,
    confirmed,
    unverified: section.statements.flatMap((statement, index) =>
      statement.citations
        .filter((citation) => !citation.confirmed)
        .map((citation) => ({
          statement: index + 1,
          source: citation.source === "chat" ? CHAT_SOURCE : citation.passage,
          quote: citation.quote,
          problem: problemWith(citation),
        })),
    ),
    citesNothing: section.statements.flatMap((statement, index) =>
      isFlagged(section.section, statement) ? [index + 1] : [],
    ),
  };
}

function problemWith(citation: CheckedCitation): string {
  switch (citation.source) {
    case "interview":
      return `These words aren't in the answer of ${citation.passage}.`;
    case "chat":
      return "These words aren't in the product manager's messages.";
    case "unknown":
      return `There is no passage ${citation.passage} in the interviews.`;
  }
}

/** A request the chat refuses. Its message says why, in plain words. */
export class ChatRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatRequestError";
  }
}

const NOT_A_CONVERSATION = "The request isn't a conversation.";

const requestSchema = z.object(
  {
    messages: z
      .array(z.unknown(), { error: NOT_A_CONVERSATION })
      .min(1, "The conversation is empty: send a message first.")
      .max(
        MAX_MESSAGES,
        `The conversation is too long: it can hold ${MAX_MESSAGES} messages.`,
      ),
  },
  { error: NOT_A_CONVERSATION },
);

/**
 * The conversation from a request body, once it's sure to be a chat: the
 * AI SDK's message format, text-only visitor messages within the length
 * limit, and the visitor's message last.
 */
export async function readChatRequest(body: unknown): Promise<ChatMessage[]> {
  const request = requestSchema.safeParse(body);
  if (!request.success) {
    throw new ChatRequestError(
      request.error.issues[0]?.message ?? NOT_A_CONVERSATION,
    );
  }

  const validated = await safeValidateUIMessages<ChatMessage>({
    messages: request.data.messages,
    tools: {
      searchNotes: {
        inputSchema: searchNotesInput,
        outputSchema: searchNotesOutput,
      },
      saveSection: {
        inputSchema: saveSectionInput,
        outputSchema: saveSectionOutput,
      },
    },
  });
  if (!validated.success) {
    throw new ChatRequestError(
      "The conversation isn't in the format the chat expects.",
    );
  }

  const messages = validated.data;
  for (const message of messages) {
    if (message.role === "system") {
      throw new ChatRequestError(
        "The conversation can't change the assistant's instructions.",
      );
    }
    if (message.role !== "user") continue;
    if (message.parts.some((part) => part.type !== "text")) {
      throw new ChatRequestError("Your messages can only hold text.");
    }
    if (textOf(message).length > MAX_MESSAGE_LENGTH) {
      throw new ChatRequestError(
        `A message is too long: keep it to ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      );
    }
  }

  const last = messages.at(-1);
  if (last?.role !== "user" || textOf(last).trim() === "") {
    throw new ChatRequestError(
      "The conversation has to end with your message.",
    );
  }
  return messages;
}

/** The visitor's own messages, which their quotes are checked against. */
function visitorMessagesIn(messages: ChatMessage[]): VisitorMessage[] {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => ({ id: message.id, text: textOf(message) }));
}

/**
 * The assistant's answer to the conversation, as a stream of UI message
 * chunks. Whatever fails, the stream ends with an `error` chunk in plain
 * words, the cause is logged, and so is every token the answer used.
 */
export function streamAnswer(
  messages: ChatMessage[],
  {
    abortSignal,
    dependencies,
  }: { abortSignal?: AbortSignal; dependencies?: ChatDependencies } = {},
) {
  const { model, ...sources } = dependencies ?? connect();
  const tools = createTools(sources, visitorMessagesIn(messages));
  const steps: LanguageModelUsage[] = [];
  let lastFinishReason: string | undefined;

  return createUIMessageStream<ChatMessage>({
    async execute({ writer }) {
      let answered = false;
      let failed = false;
      const saves = new Set<string>();
      try {
        const result = streamText({
          model,
          instructions: SYSTEM_PROMPT.text,
          messages: await convertToModelMessages(messages, {
            tools: forEarlierAnswers(tools),
            ignoreIncompleteToolCalls: true,
          }),
          tools,
          stopWhen: isStepCount(MAX_STEPS),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          // Cloudflare's gpt-oss takes no tool choice, only a list of tools,
          // so the budget works by leaving tools out of the list.
          prepareStep: ({ steps, stepNumber }) => {
            const saved = steps.some((step) =>
              step.toolResults.some(
                (result) => result.toolName === "saveSection",
              ),
            );
            // After the save, and on the last call, the model only writes.
            if (saved || stepNumber === MAX_STEPS - 1) {
              return { activeTools: [] };
            }
            const calls = steps.flatMap((step) => step.toolCalls);
            const tries = (name: keyof typeof tools) =>
              calls.filter((call) => call.toolName === name).length;
            const activeTools: Array<keyof typeof tools> = [];
            if (tries("searchNotes") < MAX_SEARCHES) {
              activeTools.push("searchNotes");
            }
            if (tries("saveSection") < MAX_SAVE_TRIES) {
              activeTools.push("saveSection");
            }
            return { activeTools };
          },
          abortSignal,
          onStepEnd: ({ usage, finishReason }) => {
            steps.push(usage);
            lastFinishReason = finishReason;
          },
          // Errors the provider reports; the stream carries on to its end.
          onError: ({ error }) => {
            console.error("The chat model failed:", error);
          },
        });
        for await (const chunk of toUIMessageStream<typeof tools, ChatMessage>({
          stream: result.stream,
          tools,
          // The model's reasoning stays on the server: the visitor doesn't
          // see it, and it isn't sent back with every later message.
          sendReasoning: false,
          onError: describeError,
        })) {
          if (chunk.type === "text-delta" && chunk.delta !== "")
            answered = true;
          // A saved section is an answer too, even without words after it.
          if (
            chunk.type === "tool-input-available" &&
            chunk.toolName === "saveSection"
          )
            saves.add(chunk.toolCallId);
          if (
            chunk.type === "tool-output-available" &&
            saves.has(chunk.toolCallId)
          )
            answered = true;
          if (chunk.type === "error") failed = true;
          writer.write(chunk);
        }
        // A model can stop after only reasoning. Without this, the visitor
        // would see nothing at all, not even an error.
        if (!answered && !failed) {
          console.error(
            `The chat model ended without an answer: finish reason ${lastFinishReason ?? "unknown"}.`,
          );
          writer.write({ type: "error", errorText: NO_ANSWER });
        } else if (!failed && lastFinishReason === "length") {
          // The reply hit the output limit partway. Without this, a draft
          // that stops mid-sentence would look finished.
          console.error(
            "The chat model's answer was cut off: finish reason length.",
          );
          writer.write({ type: "error", errorText: CUT_OFF });
        }
      } finally {
        // Here rather than in `onEnd`, which doesn't run when a stream breaks.
        logUsage(model, steps);
      }
    },
    // Errors that break the stream, such as a dropped connection.
    onError(error) {
      console.error("The answer broke off:", error);
      return describeError(error);
    },
  });
}

const NO_ANSWER = "The assistant ended without an answer.";

const CUT_OFF = "The answer got too long and was cut off.";

/** What the visitor sees when something fails: plain words, no internals. */
function describeError(error: unknown): string {
  if (
    error instanceof SearchQueryError ||
    error instanceof SearchFailedError ||
    error instanceof SaveFailedError
  ) {
    return error.message;
  }
  // The model sees the SDK's own message, which says what to fix.
  if (InvalidToolInputError.isInstance(error)) {
    return error.toolName === "saveSection"
      ? "The drafted section wasn't in the form the check reads, so it wasn't saved."
      : "The assistant's search wasn't in the form the search reads.";
  }
  if (NoSuchToolError.isInstance(error)) {
    return "The assistant tried a step it can't take at this point.";
  }
  return "The assistant couldn't finish its answer.";
}

function logUsage(model: ChatModel, steps: LanguageModelUsage[]) {
  const sum = (count: (step: LanguageModelUsage) => number | undefined) =>
    steps.reduce((total, step) => total + (count(step) ?? 0), 0);
  const calls = steps.length === 1 ? "model call" : "model calls";
  console.info(
    `Chat answer: ${sum((step) => step.totalTokens)} tokens (${sum((step) => step.inputTokens)} input, ${sum((step) => step.outputTokens)} output) in ${steps.length} ${calls} to ${model.modelId}.`,
  );
}

/**
 * The real dependencies, from the settings: the chat model, the search and
 * the cited passages.
 */
function connect(): ChatDependencies {
  return {
    model: createChatModel(providerSettings(readChatEnv())),
    search: (query) => searchInterviews(query),
    findPassages: (ids) => findPassages(ids),
  };
}
