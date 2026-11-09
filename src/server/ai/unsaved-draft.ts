import { PRD_SECTIONS } from "../../lib/prd.ts";

// Whether a reply is a PRD section written out as text, for a reply that
// called no tool. A reply's quotes alone can't tell: the system prompt gives
// answers about the interviews the same form. So the reply's first line has to
// be nothing but a section's title, or the reply a save written as JSON, and
// it has to quote at least two sources. Checked on the measurement's records
// (2026-11-09: all 5 such replies of 18 without a save, and none of the other
// 13); those were also what the rule was adjusted on.

const MIN_QUOTES = 2;

/** The dashes gpt-oss writes in passage ids, such as the non-breaking one. */
const DASHES = /[‐-—]/g;

const OPENING_QUOTE = `\\\\?["\\u201c]`;

const QUOTED_SOURCES = [
  // sofia-2: "…", also with the name around it or in a table's cell.
  new RegExp(`\\b[a-z]+-\\d+\\b[^"\\u201c\\n]{0,12}${OPENING_QUOTE}`, "gi"),
  // chat: "…", the product manager's own words.
  new RegExp(`\\bchat\\s*:\\s*${OPENING_QUOTE}`, "gi"),
  // A save written as JSON.
  /"source"\s*:\s*"[a-z]+-\d+"/gi,
];

const lettersOf = (text: string) => text.toLowerCase().replace(/[^a-z]/g, "");

const TITLES = new Set(PRD_SECTIONS.map(lettersOf));

function opensWithSectionTitle(text: string): boolean {
  if (/^\s*\{\s*"section"/.test(text)) return true;
  const firstLine = text.trim().split("\n")[0] ?? "";
  const title = lettersOf(firstLine.replace(/\((draft|updated|revised)\)/i, ""))
    .replace(/^(section|draft)/, "")
    .replace(/draft$/, "");
  return TITLES.has(title);
}

export function looksLikeUnsavedDraft(reply: string): boolean {
  const text = reply.replace(DASHES, "-");
  if (!opensWithSectionTitle(text)) return false;
  const quotes = QUOTED_SOURCES.reduce(
    (sum, pattern) => sum + (text.match(pattern)?.length ?? 0),
    0,
  );
  return quotes >= MIN_QUOTES;
}
