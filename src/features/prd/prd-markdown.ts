import type { SavedSection } from "@/lib/chat";
import {
  isFlagged,
  isVisitorDecision,
  NO_QUOTE,
  objection,
  PRD_SECTIONS,
  sourcesOf,
  type CheckedStatement,
  type SectionName,
  type StatementSource,
} from "@/lib/prd";

// The PRD as a Markdown file, read like the PRD on screen (docs/decisions.md,
// Design, 2026-10-20): each statement ends with its sources by name, each name
// with a footnote that holds its quotes and where they come from, and what the
// code objects to is written out under the statement. Footnotes are GitHub's
// (`[^1]`); a viewer without them shows the notes as plain lines at the end.

/** The product the six interviews are about, as the PRD's title. */
export const PRODUCT = "Shared grocery list app";

/** Written under a statement whose quotes all come from the visitor's chat. */
export const VISITOR_DECISION = "Your decision, not from the interviews.";

/** The downloaded file's name. */
export const PRD_FILE_NAME = "shared-grocery-list-app-prd.md";

/** The explanation under the title, as the file words it. */
const EXPLANATION =
  "The app's code, not the model, checked every quote word for word against its source. Each name after a statement has a footnote with the quotes it stands for; a quote the check couldn't confirm is marked unverified and written out under its statement. A confirmed quote proves the words are there, not that the statement reads them fairly.";

/** The PRD so far, every section in its order, as Markdown. */
export function prdMarkdown(
  sections: ReadonlyMap<SectionName, SavedSection>,
): string {
  const notes: string[] = [];
  const lines = [
    `# ${PRODUCT}`,
    "",
    `Product requirements document · Draft · ${sections.size} of ${PRD_SECTIONS.length} sections · From six household interviews`,
    "",
    EXPLANATION,
  ];

  for (const name of PRD_SECTIONS) {
    lines.push("", `## ${name}`, "");
    const saved = sections.get(name);
    if (saved === undefined) {
      lines.push("Not drafted yet.");
      continue;
    }
    for (const statement of saved.section.statements) {
      lines.push(...statementLines(name, statement, notes));
    }
  }

  return withNotes(lines, notes);
}

/**
 * One saved section as Markdown, in the download's form, for the clipboard:
 * its heading, its statements and its footnotes, numbered within it.
 */
export function sectionMarkdown(
  name: SectionName,
  saved: SavedSection,
): string {
  const notes: string[] = [];
  const lines = [`## ${name}`, ""];
  for (const statement of saved.section.statements) {
    lines.push(...statementLines(name, statement, notes));
  }
  return withNotes(lines, notes);
}

/** The lines, then the footnotes, as one text ending in a line break. */
function withNotes(lines: string[], notes: string[]): string {
  if (notes.length > 0) {
    lines.push("", ...notes.map((note, index) => `[^${index + 1}]: ${note}`));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * A statement as a list item ending in its sources, each with its footnote,
 * and under it, one item each, what the code objects to.
 */
function statementLines(
  section: SectionName,
  statement: CheckedStatement,
  notes: string[],
): string[] {
  const sources = sourcesOf(statement).map((source) => {
    notes.push(footnote(source));
    return `${escape(source.name)}[^${notes.length}]`;
  });
  const item =
    sources.length === 0
      ? escape(statement.text)
      : `${escape(statement.text)} Sources: ${sources.join("; ")}`;

  const remarks = [
    ...statement.citations
      .filter((citation) => !citation.confirmed)
      .map(objection),
    ...(isFlagged(section, statement) ? [NO_QUOTE] : []),
    ...(isVisitorDecision(statement) ? [VISITOR_DECISION] : []),
  ];
  return [
    `- ${startOfLine(item)}`,
    ...remarks.map((remark) => `  - ${startOfLine(escape(remark))}`),
  ];
}

/**
 * A name's footnote: whose words, then each quote with the passage it comes
 * from, an unverified one marked so.
 */
function footnote({ name, citations }: StatementSource): string {
  const quotes = citations.map((citation) => {
    const words = `“${escape(citation.quote)}”${citation.confirmed ? "" : " (unverified)"}`;
    return citation.source === "interview"
      ? `${escape(citation.passage)}: ${words}`
      : words;
  });
  const where =
    citations[0]?.source === "interview" ? ", interview passage " : ": ";
  return `${escape(name)}${where}${quotes.join(" · ")}`;
}

/**
 * Text shown as written: one line, and every mark Markdown would read
 * inside a line escaped. The model writes the statements, so any of them
 * can turn up.
 */
function escape(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\`*_[\]<>|~]/g, "\\$&");
}

/**
 * A list item's text, so its start isn't read as a heading, a quote or
 * another list.
 */
function startOfLine(text: string): string {
  return text.replace(/^(#|[-+](?= )|\d+(?=[.)] ))/, (mark) =>
    mark.startsWith("#") || mark === "-" || mark === "+"
      ? `\\${mark}`
      : `${mark}\\`,
  );
}

/** Saves the PRD as a Markdown file in the visitor's downloads. */
export function downloadPrd(sections: ReadonlyMap<SectionName, SavedSection>) {
  const file = new Blob([prdMarkdown(sections)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(file);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = PRD_FILE_NAME;
    link.click();
  } finally {
    // MDN's example frees the address once the click has started the download.
    URL.revokeObjectURL(url);
  }
}
