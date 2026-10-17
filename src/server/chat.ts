import "server-only";
import {
  convertToModelMessages,
  createUIMessageStream,
  isStepCount,
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
import { passageAnchor, type PassageMatch } from "@/lib/transcripts";
import type { ChatModel } from "./ai/chat-model.ts";
import { createChatModel } from "./ai/providers.ts";
import { readChatEnv } from "./env.ts";
import {
  MAX_QUERY_LENGTH,
  SearchQueryError,
  searchInterviews,
} from "./search.ts";

// The chat: the visitor's conversation in, the assistant's answer streamed
// out. The model decides when to search the interviews; the app's code runs
// each search and logs the tokens every answer used.

// A short prompt for now. The versioned prompt built from the AI Product
// Development Toolkit replaces it (docs/plan.md, slice 4).
const INSTRUCTIONS = [
  "You help a product manager turn user research into a product requirements document (PRD).",
  "A researcher interviewed six households about a shared household grocery list app. The interviews are finished records: search them, and never ask their questions again.",
  "Before you say what the interviewees think, want or do, call searchNotes. Search with a short question in your own words, one topic at a time.",
  "Each search returns the five closest passages, closest first. They are candidates, not answers: use a passage only if its answer says what you need, and say plainly when none does.",
  "When you use a passage, name the interviewee and quote their words exactly. Never invent what anyone said.",
  "Write a few short paragraphs of plain text, without Markdown.",
].join("\n");

/** At most this many model calls for one answer: its searches and its reply. */
const MAX_STEPS = 5;

/** At most this many messages in one conversation. */
export const MAX_MESSAGES = 200;

const searchNotesInput = z.object({
  query: z
    .string()
    .describe(
      `What to look for, as a short question or topic in plain words. At most ${MAX_QUERY_LENGTH} characters.`,
    ),
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

/** The search broke for a reason the visitor can't fix. The cause is logged. */
class SearchFailedError extends Error {
  constructor() {
    super("The search didn't work this time.");
    this.name = "SearchFailedError";
  }
}

export type ChatDependencies = {
  model: ChatModel;
  search(query: string): Promise<PassageMatch[]>;
};

function createTools(search: ChatDependencies["search"]) {
  return {
    searchNotes: tool({
      description:
        "Searches the six interviews. Returns the five passages closest in meaning to the query, closest first: each is the researcher's question and one interviewee's whole answer. They are candidates, so some may not be about the query at all.",
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
  };
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
  const { model, search } = dependencies ?? connect();
  const tools = createTools(search);
  const steps: LanguageModelUsage[] = [];

  return createUIMessageStream<ChatMessage>({
    async execute({ writer }) {
      try {
        const result = streamText({
          model,
          instructions: INSTRUCTIONS,
          messages: await convertToModelMessages(messages, {
            tools,
            ignoreIncompleteToolCalls: true,
          }),
          tools,
          stopWhen: isStepCount(MAX_STEPS),
          abortSignal,
          onStepEnd: ({ usage }) => {
            steps.push(usage);
          },
          // Errors the provider reports; the stream carries on to its end.
          onError: ({ error }) => {
            console.error("The chat model failed:", error);
          },
        });
        for await (const chunk of toUIMessageStream<typeof tools, ChatMessage>({
          stream: result.stream,
          tools,
          onError: describeError,
        })) {
          writer.write(chunk);
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

/** What the visitor sees when something fails: plain words, no internals. */
function describeError(error: unknown): string {
  if (error instanceof SearchQueryError || error instanceof SearchFailedError) {
    return error.message;
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

/** The real dependencies, from the settings: the chat model and the search. */
function connect(): ChatDependencies {
  const env = readChatEnv();
  return {
    model: createChatModel({
      provider: env.AI_PROVIDER,
      mistralApiKey: env.MISTRAL_API_KEY,
    }),
    search: (query) => searchInterviews(query),
  };
}
