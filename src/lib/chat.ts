import type { UIDataTypes, UIMessage } from "ai";
import type { PassageMatch } from "./transcripts.ts";

// The chat as the browser and the server both see it. The assistant has one
// tool, `searchNotes`; the browser shows each call as one line that opens to
// the passages it found.

/** The longest message a visitor may send. The server refuses longer ones. */
export const MAX_MESSAGE_LENGTH = 2000;

export type SearchNotesInput = { query: string };

/** The closest passages, closest first. */
export type SearchNotesOutput = { passages: PassageMatch[] };

export type ChatTools = {
  searchNotes: { input: SearchNotesInput; output: SearchNotesOutput };
};

export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;

export type ChatMessagePart = ChatMessage["parts"][number];

export type SearchNotesPart = Extract<
  ChatMessagePart,
  { type: "tool-searchNotes" }
>;

/** All the text in a message, in order. */
export function textOf(message: Pick<ChatMessage, "parts">): string {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
}

/** Whose words came back, each name once, closest first. */
export function whoseWords(passages: PassageMatch[]): string[] {
  return [...new Set(passages.map((passage) => passage.participant))];
}

const names = new Intl.ListFormat("en-GB", {
  style: "long",
  type: "conjunction",
});

/** "Maya", "Maya and Henk", "Maya, Henk and Daan". */
export function listNames(people: string[]): string {
  return names.format(people);
}
