import "server-only";
import {
  CHAT_SOURCE,
  type CheckedCitation,
  type CheckedSection,
  type CitationDraft,
  type SectionDraft,
} from "@/lib/prd";
import type { SourcePassage } from "@/lib/transcripts";
import { createReadClient } from "./db/clients.ts";
import { fetchPassages } from "./db/passages.ts";
import { readAppEnv } from "./env.ts";

// The citation check: the app's code, not the model, decides whether each
// quote in a drafted section is real. An interview quote must appear in the
// answer of the passage it cites, never in the researcher's question; a quote
// from the visitor must appear in one of their own messages, never in the
// assistant's. A quote passes when it has the same words in the same order,
// ignoring letter case, spacing, quote style and punctuation at its ends.
//
// The check proves that the quoted words exist and belong to that person, not
// that the statement reads them fairly.

/** One of the visitor's own messages in this chat. */
export type VisitorMessage = { id: string; text: string };

export type QuoteSources = {
  /** The cited passages that exist, from the database. */
  passages: SourcePassage[];
  /** The visitor's messages, oldest first. Never the assistant's. */
  visitorMessages: VisitorMessage[];
};

/** Every style of quote mark, so “ ” ‘ ’ « » and " ' all count as one. */
const QUOTE_MARKS = /["'`´‘’‚‛“”„‟«»‹›]/gu;

/** Punctuation and spaces at the ends of a quote, which the check ignores. */
const ENDS = /^[\p{P}\s]+|[\p{P}\s]+$/gu;

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/** Letter case, spacing and quote style don't count. */
function normalize(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(QUOTE_MARKS, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Whether `quote` appears in `text` as whole words, in the same order: "ink"
 * isn't in "drink", and "don" isn't in "don't".
 */
export function quoteIsIn(quote: string, text: string): boolean {
  const words = normalize(quote).replace(ENDS, "");
  if (words === "") return false;
  const source = normalize(text);
  for (
    let at = source.indexOf(words);
    at !== -1;
    at = source.indexOf(words, at + 1)
  ) {
    if (startsWord(source, at) && endsWord(source, at + words.length)) {
      return true;
    }
  }
  return false;
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && WORD_CHARACTER.test(character);
}

/** Nothing of a word runs on before `at`, also not across an apostrophe. */
function startsWord(text: string, at: number): boolean {
  const before = text[at - 1];
  if (isWordCharacter(before)) return false;
  // The "t" of "don't": an apostrophe between letters joins one word.
  return !(
    before === "'" &&
    isWordCharacter(text[at - 2]) &&
    isWordCharacter(text[at])
  );
}

/** Nothing of a word runs on from `end`, also not across an apostrophe. */
function endsWord(text: string, end: number): boolean {
  const after = text[end];
  if (isWordCharacter(after)) return false;
  return !(
    after === "'" &&
    isWordCharacter(text[end + 1]) &&
    isWordCharacter(text[end - 1])
  );
}

/** The passages with these ids that exist, read with the app's read key. */
export function findPassages(ids: string[]): Promise<SourcePassage[]> {
  return fetchPassages(createReadClient(readAppEnv()), ids);
}

/** A citation's source as the check reads it: " Henk-4" is henk-4. */
function sourceOf(citation: CitationDraft): string {
  return citation.source.trim().toLowerCase();
}

/** The passage ids a draft cites, each once, for looking them up. */
export function citedPassages(draft: SectionDraft): string[] {
  const ids = draft.statements.flatMap((statement) =>
    statement.citations
      .map(sourceOf)
      .filter((source) => source !== CHAT_SOURCE),
  );
  return [...new Set(ids)];
}

/** The draft with every quote checked against its source. */
export function checkSection(
  draft: SectionDraft,
  sources: QuoteSources,
): CheckedSection {
  const passages = new Map(
    sources.passages.map((passage) => [passage.passage, passage]),
  );
  return {
    section: draft.section,
    statements: draft.statements.map((statement) => ({
      text: statement.text,
      citations: statement.citations.map((citation) =>
        checkCitation(citation, passages, sources.visitorMessages),
      ),
    })),
  };
}

function checkCitation(
  citation: CitationDraft,
  passages: Map<string, SourcePassage>,
  visitorMessages: VisitorMessage[],
): CheckedCitation {
  const { quote } = citation;
  const source = sourceOf(citation);

  if (source === CHAT_SOURCE) {
    // The latest of the visitor's messages that holds the words.
    const message = visitorMessages.findLast(({ text }) =>
      quoteIsIn(quote, text),
    );
    return message
      ? { source: "chat", quote, confirmed: true, messageId: message.id }
      : { source: "chat", quote, confirmed: false };
  }

  const passage = passages.get(source);
  if (passage === undefined) {
    return {
      source: "unknown",
      passage: citation.source.trim(),
      quote,
      confirmed: false,
    };
  }
  return {
    source: "interview",
    passage: passage.passage,
    interviewee: passage.participant,
    question: passage.question,
    answer: passage.answer,
    quote,
    // The answer only: the researcher's question is never the interviewee's.
    confirmed: quoteIsIn(quote, passage.answer),
  };
}
