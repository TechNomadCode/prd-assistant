// The PRD as the browser and the server both see it. The model drafts each
// section as statements with citations (`SectionDraft`) and saves it with
// `saveSection`; the app's code checks every quote and returns the section
// with the results (`CheckedSection`), which the chat shows.

/** The PRD's nine sections, in the order the assistant drafts them. */
export const PRD_SECTIONS = [
  "Introduction / Overview",
  "Goals / Objectives",
  "Target Audience / User Personas",
  "User Stories / Use Cases",
  "Functional Requirements",
  "Non-Functional Requirements",
  "Design Considerations / Mockups",
  "Success Metrics",
  "Open Questions / Future Considerations",
] as const;

export type SectionName = (typeof PRD_SECTIONS)[number];

/** The one section whose statements may cite nothing: a question needs no source. */
export const OPEN_QUESTIONS: SectionName =
  "Open Questions / Future Considerations";

/** A citation's `source` when it quotes the visitor's own words in this chat. */
export const CHAT_SOURCE = "chat";

export type CitationDraft = {
  /** A passage id, such as henk-4, or `CHAT_SOURCE`. */
  source: string;
  quote: string;
};

export type StatementDraft = { text: string; citations: CitationDraft[] };

export type SectionDraft = {
  section: SectionName;
  statements: StatementDraft[];
};

/** A citation after the check: whose words, and whether the check found them. */
export type CheckedCitation =
  | {
      source: "interview";
      /** The passage id, such as henk-4. */
      passage: string;
      /** Whose answer the passage holds, from the database. */
      interviewee: string;
      /** The researcher's question and the answer, for the pop-over. */
      question: string;
      answer: string;
      quote: string;
      confirmed: boolean;
    }
  | {
      source: "chat";
      quote: string;
      confirmed: boolean;
      /** The visitor's message the words come from, once confirmed. */
      messageId?: string;
    }
  | {
      /** A source that names no passage in the interviews. */
      source: "unknown";
      /** The source as the model wrote it. */
      passage: string;
      quote: string;
      confirmed: false;
    };

export type CheckedStatement = { text: string; citations: CheckedCitation[] };

export type CheckedSection = {
  section: SectionName;
  statements: CheckedStatement[];
};

/** A statement that cites nothing, outside Open Questions. */
export function isFlagged(
  section: SectionName,
  statement: { citations: readonly unknown[] },
): boolean {
  return statement.citations.length === 0 && section !== OPEN_QUESTIONS;
}

/** What the check found in a section, counted. */
export function tally(section: CheckedSection) {
  const citations = section.statements.flatMap(
    (statement) => statement.citations,
  );
  return {
    quotes: citations.length,
    confirmed: citations.filter((citation) => citation.confirmed).length,
    flagged: section.statements.filter((statement) =>
      isFlagged(section.section, statement),
    ).length,
  };
}

/** Written out under a statement that cites nothing outside Open Questions. */
export const NO_QUOTE = "No quote backs this statement.";

/**
 * An unverified quote, written out with its words and the reason, as the PRD
 * shows it under its statement; the measurement's report prints the same.
 */
export function objection(citation: CheckedCitation): string {
  switch (citation.source) {
    case "interview":
      return `Unverified quote from ${citation.interviewee}: “${citation.quote}” These words aren't in the answer it cites.`;
    case "chat":
      return `Unverified quote from you: “${citation.quote}” These words aren't in your messages.`;
    case "unknown":
      return `Unverified quote: “${citation.quote}” There's no passage “${citation.passage}” in the interviews.`;
  }
}

/** The section after this one, or none after the last. */
export function nextSection(section: SectionName): SectionName | undefined {
  return PRD_SECTIONS[PRD_SECTIONS.indexOf(section) + 1];
}

/**
 * A statement whose quotes all come from the visitor's own chat messages: the
 * visitor's decision, not a finding from the interviews, whatever the model
 * wrote. The code decides this from the citations, never the prompt.
 */
export function isVisitorDecision(statement: CheckedStatement): boolean {
  return (
    statement.citations.length > 0 &&
    statement.citations.every((citation) => citation.source === "chat")
  );
}

/** One name at the end of a statement, with the quotes it stands for. */
export type StatementSource = {
  /** "Maya", or "You, in this chat". */
  name: string;
  citations: Exclude<CheckedCitation, { source: "unknown" }>[];
};

/** The name the PRD shows for the visitor's own words. */
export const VISITOR_NAME = "You, in this chat";

/**
 * Whose words a statement rests on, each name once, in the order cited. A
 * source that names no passage has no name: it's written out as unverified.
 */
export function sourcesOf(statement: CheckedStatement): StatementSource[] {
  const sources = new Map<string, StatementSource>();
  for (const citation of statement.citations) {
    if (citation.source === "unknown") continue;
    const name =
      citation.source === "chat" ? VISITOR_NAME : citation.interviewee;
    const source = sources.get(name) ?? { name, citations: [] };
    source.citations.push(citation);
    sources.set(name, source);
  }
  return [...sources.values()];
}

/**
 * The section to draft next: the first in the PRD's order that isn't drafted
 * yet, or none once all nine are.
 */
export function firstUndrafted(
  drafted: ReadonlySet<SectionName>,
): SectionName | undefined {
  return PRD_SECTIONS.find((section) => !drafted.has(section));
}

/** A stable id for a section in the PRD, such as prd-goals-objectives. */
export function sectionAnchor(section: SectionName): string {
  return `prd-${section
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}
