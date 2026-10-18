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

/** The section after this one, or none after the last. */
export function nextSection(section: SectionName): SectionName | undefined {
  return PRD_SECTIONS[PRD_SECTIONS.indexOf(section) + 1];
}
