// The model's formatting, read by a small parser of our own, so the chat needs
// no Markdown library. It keeps bold, inline code and lists, reads `<br>` as a
// line break, and removes every other mark (headings, italics, links, quotes,
// rules, strikethrough), so no `**`, `#` or table pipe is ever shown as typed.
// A table is read into its header's cells and its rows' cells, for the chat to
// show as a table. Any other HTML is shown as typed, never interpreted. It
// returns plain data, never HTML. Only the browser uses it: the model never
// sees what it makes of the text.

/** A run of text inside a line, or a line break inside it. */
export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "code"; text: string }
  | { type: "break" };

/** A table's cell: its runs, none when it's empty. */
export type Cell = Inline[];

/**
 * A table: its header's cells, when it has a header with a name in it, and
 * its rows' cells, as many as each row was written with, an empty one kept.
 */
export type Table = { type: "table"; header?: Cell[]; rows: Cell[][] };

export type Block =
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | Table;

const BULLET = /^\s*[-*+•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^\s*#{1,6}\s+/;
const BLOCKQUOTE = /^\s*>\s?/;
/** A table's separator row: cells of dashes, with optional alignment colons. */
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
/** A line break written in HTML: `<br>`, `<br/>` or `<br />`, in any case. */
const BREAK = /<br\s*\/?>/gi;

/** The text as paragraphs, lists and tables, with its inline marks read. */
export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] = [];
  let list: Extract<Block, { type: "list" }> | undefined;
  /** The table being read. */
  let table: Table | undefined;

  function endParagraph() {
    if (paragraph.length > 0)
      blocks.push({ type: "paragraph", lines: paragraph });
    paragraph = [];
  }
  function endList() {
    if (list) blocks.push(list);
    list = undefined;
  }
  function endTable() {
    const block = table && tableBlock(table);
    if (block) blocks.push(block);
    table = undefined;
  }

  const lines = text.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = unmarked(raw);
    if (table) {
      if (isTableSeparator(line)) continue;
      if (continuesTable(raw, line)) {
        table.rows.push(tableCells(line).map((cell) => parseInline(cell)));
        continue;
      }
      endTable();
    }
    if (RULE.test(line) || isTableSeparator(line)) {
      endParagraph();
      endList();
      continue;
    }
    if (isBlank(line)) {
      endParagraph();
      endList();
      continue;
    }
    // A table starts at a line of cells: one that opens with a pipe, or one
    // with a pipe that the separator row follows, which makes it the header.
    // A list item with a pipe in it stays a list item.
    if (line.includes("|") && !BULLET.test(line) && !NUMBERED.test(line)) {
      const headed = isTableSeparator(unmarked(lines[index + 1] ?? ""));
      if (headed || line.trim().startsWith("|")) {
        endParagraph();
        endList();
        const cells = tableCells(line).map((cell) => parseInline(cell));
        table = headed
          ? { type: "table", header: cells, rows: [] }
          : { type: "table", rows: [cells] };
        continue;
      }
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet?.[1] ?? numbered?.[1];
    if (item !== undefined) {
      endParagraph();
      const ordered = numbered !== null;
      if (list && list.ordered !== ordered) endList();
      list ??= { type: "list", ordered, items: [] };
      list.items.push(parseInline(item));
      continue;
    }
    endList();
    paragraph.push(parseInline(line.trim()));
  }
  endParagraph();
  endList();
  endTable();
  return blocks;
}

/** The line without its quote or heading mark. */
function unmarked(raw: string): string {
  return raw.replace(BLOCKQUOTE, "").replace(HEADING, "");
}

/** Whether the line is empty; one of nothing but breaks counts as empty. */
function isBlank(line: string): boolean {
  return line.replace(BREAK, "").trim() === "";
}

/** Whether the line is a table's separator row; a bare rule isn't one. */
function isTableSeparator(line: string): boolean {
  return line.includes("|") && TABLE_SEPARATOR.test(line);
}

/**
 * Inside a table, the next line is a row when it opens with a pipe (even
 * behind a quote mark), or holds one without starting another block: a
 * heading, a quote or a list item ends the table, as it does in GitHub's
 * Markdown.
 */
function continuesTable(raw: string, line: string): boolean {
  if (line.trim().startsWith("|")) return true;
  if (line !== raw || BULLET.test(line) || NUMBERED.test(line)) return false;
  return line.includes("|");
}

/**
 * The table as it shows. Each cell is read on its own, so the breaks at its
 * edges go even inside its marks; an empty cell stays, in its place. A row of
 * nothing but empty cells goes, and so does a header without a name, so the
 * model's spare lines don't show as empty rows; a table left with nothing
 * goes too.
 */
function tableBlock({ header, rows }: Table): Table | undefined {
  const filled = (cells: Cell[]) => cells.some((cell) => cell.length > 0);
  const kept = rows.filter(filled);
  if (header && filled(header)) return { type: "table", header, rows: kept };
  return kept.length > 0 ? { type: "table", rows: kept } : undefined;
}

/** A row's cells, without the outer pipes. */
function tableCells(row: string): string[] {
  // An escaped pipe (`\|`) belongs to its cell.
  let inner = row.replaceAll("\\|", "\u0000").trim();
  if (inner.startsWith("|")) inner = inner.slice(1);
  if (inner.endsWith("|")) inner = inner.slice(0, -1);
  return inner.split("|").map((cell) => cell.replaceAll("\u0000", "|").trim());
}

/** `code`, **bold** or __bold__, in that order of precedence. */
const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__/g;

/**
 * One line's runs: bold and code kept, `<br>` a line break (code shows it as
 * typed), the other marks removed.
 */
export function parseInline(line: string): Inline[] {
  const runs: Inline[] = [];
  let at = 0;
  for (const match of line.matchAll(INLINE)) {
    if (match.index > at) {
      pushRuns(runs, "text", line.slice(at, match.index));
    }
    if (match[1] !== undefined) runs.push({ type: "code", text: match[1] });
    else pushRuns(runs, "bold", match[2] ?? match[3] ?? "");
    at = match.index + match[0].length;
  }
  if (at < line.length) pushRuns(runs, "text", line.slice(at));
  return tidyBreaks(runs);
}

/** Text or bold without its marks, split at its line breaks. */
function pushRuns(runs: Inline[], type: "text" | "bold", text: string) {
  for (const [index, piece] of stripMarks(text).split(BREAK).entries()) {
    if (index > 0) runs.push({ type: "break" });
    if (piece !== "") runs.push({ type, text: piece });
  }
}

/**
 * The runs without the spaces around a break, and without a break at either
 * end, which would only add an empty line.
 */
function tidyBreaks(runs: Inline[]): Inline[] {
  const tidy: Inline[] = [];
  for (const [index, run] of runs.entries()) {
    if (run.type !== "text" && run.type !== "bold") {
      tidy.push(run);
      continue;
    }
    let text = run.text;
    if (runs[index - 1]?.type === "break") text = text.trimStart();
    if (runs[index + 1]?.type === "break") text = text.trimEnd();
    if (text !== "") tidy.push({ ...run, text });
  }
  while (tidy[0]?.type === "break") tidy.shift();
  while (tidy.at(-1)?.type === "break") tidy.pop();
  return tidy;
}

/**
 * The marks the chat doesn't render: links keep their words, and italics,
 * strikethrough and stray asterisks or backticks go.
 */
function stripMarks(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(
      /(^|[^\p{L}\p{N}])[*_](?=\S)(.+?)(?<=\S)[*_](?![\p{L}\p{N}])/gu,
      "$1$2",
    )
    .replace(/\*+|`+/g, "");
}
