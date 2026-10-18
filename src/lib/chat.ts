import type { UIDataTypes, UIMessage } from "ai";
import type { CheckedSection, SectionDraft, SectionName } from "./prd.ts";
import type { PassageMatch } from "./transcripts.ts";

// The chat as the browser and the server both see it. The assistant has two
// tools: `searchNotes` finds passages, and `saveSection` saves a drafted
// section, whose quotes the app's code checks. The browser shows each call as
// one line that opens to what it found or saved.

/** The longest message a visitor may send. The server refuses longer ones. */
export const MAX_MESSAGE_LENGTH = 2000;

export type SearchNotesInput = { query: string };

/** The closest passages, closest first. */
export type SearchNotesOutput = { passages: PassageMatch[] };

export type ChatTools = {
  searchNotes: { input: SearchNotesInput; output: SearchNotesOutput };
  saveSection: { input: SectionDraft; output: CheckedSection };
};

export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;

export type ChatMessagePart = ChatMessage["parts"][number];

export type SearchNotesPart = Extract<
  ChatMessagePart,
  { type: "tool-searchNotes" }
>;

export type SaveSectionPart = Extract<
  ChatMessagePart,
  { type: "tool-saveSection" }
>;

/** A tool call the app couldn't read, such as a section in the wrong form. */
export type FailedToolPart = Extract<
  ChatMessagePart,
  { type: "dynamic-tool"; state: "output-error" }
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

/** A section as the PRD shows it: its latest save, and when that came. */
export type SavedSection = {
  section: CheckedSection;
  /** The save's place among all saves, oldest first, from 0. */
  order: number;
};

/**
 * The PRD so far, built from the conversation: the latest save of each
 * section. A section saved again in a later answer replaces the earlier one.
 */
export function savedSections(
  messages: readonly Pick<ChatMessage, "role" | "parts">[],
): Map<SectionName, SavedSection> {
  const sections = new Map<SectionName, SavedSection>();
  let order = 0;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (
        part.type === "tool-saveSection" &&
        part.state === "output-available"
      ) {
        sections.set(part.output.section, { section: part.output, order });
        order += 1;
      }
    }
  }
  return sections;
}

/** The section saved last, if any. */
export function latestSave(
  sections: ReadonlyMap<SectionName, SavedSection>,
): SavedSection | undefined {
  let latest: SavedSection | undefined;
  for (const saved of sections.values()) {
    if (latest === undefined || saved.order > latest.order) latest = saved;
  }
  return latest;
}
