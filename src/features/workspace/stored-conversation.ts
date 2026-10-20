import { z } from "zod";
import type { ChatMessage, SearchNotesOutput } from "@/lib/chat";
import {
  PRD_SECTIONS,
  type CheckedCitation,
  type CheckedSection,
} from "@/lib/prd";
import type { PassageMatch } from "@/lib/transcripts";

// The conversation kept in the visitor's browser, so the PRD survives a
// reload: the PRD is built from the conversation, and its chat quotes point
// at the visitor's messages in it. Nothing about it reaches the server until
// the visitor sends the next message, which carries the conversation as
// before; the server checks it then as it checks every request.

/** Where the conversation is kept, in `localStorage`. */
export const STORAGE_KEY = "prd-assistant:conversation";

/**
 * The stored form's version. Raise it whenever a stored conversation could
 * stop fitting the code: a change to `ChatMessage`, to the checked section or
 * to the parts the chat shows, or an upgrade of `ai`. An older one is then
 * discarded with a notice, not shown broken.
 */
export const STORED_FORMAT = 2;

/** The conversation as it was last kept. */
export type StoredConversation = {
  messages: ChatMessage[];
  /** The last answer broke off, so the chat offers "Try again". */
  interrupted: boolean;
  /** The questions whose answers the visitor stopped, by message id. */
  stopped: string[];
};

/** What the page found in storage when it opened. */
export type RestoredConversation =
  | { status: "none" }
  | { status: "restored"; conversation: StoredConversation }
  | { status: "discarded" };

// The schemas check the stored form as the browser reads it. Each schema that
// has a type in `src/lib` is held to it with `satisfies`, so a change there
// fails the typecheck until the schema, and `STORED_FORMAT`, follow.

const passageMatchSchema = z.object({
  id: z.number(),
  slug: z.string(),
  participant: z.string(),
  position: z.number(),
  question: z.string(),
  answer: z.string(),
  distance: z.number(),
}) satisfies z.ZodType<PassageMatch>;

const searchNotesOutputSchema = z.object({
  passages: z.array(passageMatchSchema),
}) satisfies z.ZodType<SearchNotesOutput>;

const checkedCitationSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("interview"),
    passage: z.string(),
    interviewee: z.string(),
    question: z.string(),
    answer: z.string(),
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

const checkedSectionSchema = z.object({
  section: z.enum(PRD_SECTIONS),
  statements: z.array(
    z.object({ text: z.string(), citations: z.array(checkedCitationSchema) }),
  ),
}) satisfies z.ZodType<CheckedSection>;

/**
 * A call of one of the chat's tools, in each of its states. Only a finished
 * call's output is read, so only that is checked to the letter; the server
 * checks the inputs when the conversation goes back to it.
 */
function toolPart<Type extends string, Output extends z.ZodType>(
  type: Type,
  output: Output,
) {
  const call = { type: z.literal(type), toolCallId: z.string() };
  return z.discriminatedUnion("state", [
    z.looseObject({ ...call, state: z.literal("input-streaming") }),
    z.looseObject({ ...call, state: z.literal("input-available") }),
    z.looseObject({ ...call, state: z.literal("output-available"), output }),
    z.looseObject({
      ...call,
      state: z.literal("output-error"),
      errorText: z.string(),
    }),
  ]);
}

/** The parts the server's answers hold (`src/server/chat.ts`). */
const partSchema = z.union([
  z.looseObject({ type: z.literal("text"), text: z.string() }),
  z.looseObject({ type: z.literal("step-start") }),
  toolPart("tool-searchNotes", searchNotesOutputSchema),
  toolPart("tool-saveSection", checkedSectionSchema),
  z.looseObject({
    type: z.literal("dynamic-tool"),
    toolName: z.string(),
    toolCallId: z.string(),
    state: z.string(),
  }),
]);

const messageSchema = z.looseObject({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(partSchema),
});

const storedSchema = z.object({
  format: z.literal(STORED_FORMAT),
  messages: z.array(messageSchema),
  interrupted: z.boolean(),
  stopped: z.array(z.string()),
});

/**
 * Reads the kept conversation. One that no longer fits the stored form is
 * removed, and the visitor is told; storage the browser refuses counts as
 * empty.
 */
export function restoreConversation(): RestoredConversation {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { status: "none" };
  }
  if (stored === null) return { status: "none" };

  const result = storedSchema.safeParse(parseJson(stored));
  if (!result.success || result.data.messages.length === 0) {
    forgetConversation();
    return { status: "discarded" };
  }
  return {
    status: "restored",
    conversation: {
      // The schema checks what the browser reads; the parts it lets through
      // loosely are the server's own, and the server checks them again.
      messages: result.data.messages as ChatMessage[],
      interrupted: result.data.interrupted,
      stopped: result.data.stopped,
    },
  };
}

/**
 * Keeps the conversation, or forgets it once it's empty. A browser that
 * refuses, or has no room, keeps nothing: the PRD then lasts until a reload,
 * as before.
 */
export function keepConversation({
  messages,
  interrupted,
  stopped,
}: StoredConversation) {
  if (messages.length === 0) {
    forgetConversation();
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ format: STORED_FORMAT, messages, interrupted, stopped }),
    );
  } catch {
    // Nothing to do: the conversation on screen is unaffected.
  }
}

function forgetConversation() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage the browser refuses holds nothing to forget.
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
