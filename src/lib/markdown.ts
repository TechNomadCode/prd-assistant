// The model's formatting, read by a small parser of our own, so the chat needs
// no Markdown library. It keeps bold, inline code and lists, shows a table as
// one line per row (the chat is too narrow for a grid), and removes every other
// mark (headings, italics, links, quotes, rules, strikethrough), so no `**`,
// `#` or table pipe is ever shown as typed. It returns plain data, never HTML.

/** A run of text inside a line. */
export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "code"; text: string };

export type Block =
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

const BULLET = /^\s*[-*+•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^\s*#{1,6}\s+/;
const BLOCKQUOTE = /^\s*>\s?/;
/** A table's separator row: cells of dashes, with optional alignment colons. */
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
/** Between the cells of a row shown as one line. */
const CELL_SEPARATOR = " · ";

/** The text as paragraphs and lists, with its inline marks read. */
export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] = [];
  let list: Extract<Block, { type: "list" }> | undefined;
  /** The rows of the table being read, each already one line. */
  let table: Inline[][] | undefined;

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
    if (table && table.length > 0)
      blocks.push({ type: "paragraph", lines: table });
    table = undefined;
  }

  const lines = text.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = unmarked(raw);
    if (table) {
      if (isTableSeparator(line)) continue;
      if (continuesTable(raw, line)) {
        const row = tableRow(line, false);
        if (row.length > 0) table.push(row);
        continue;
      }
      endTable();
    }
    if (RULE.test(line) || isTableSeparator(line)) {
      endParagraph();
      endList();
      continue;
    }
    if (line.trim() === "") {
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
        const row = tableRow(line, headed);
        table = row.length > 0 ? [row] : [];
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

/** A row as one line, its cells apart; a header has its words in bold. */
function tableRow(line: string, header: boolean): Inline[] {
  const cells = tableCells(line).join(CELL_SEPARATOR);
  return header ? parseBold(cells) : parseInline(cells);
}

/** A row's cells, without the outer pipes and the empty cells. */
function tableCells(row: string): string[] {
  // An escaped pipe (`\|`) belongs to its cell.
  let inner = row.replaceAll("\\|", "\u0000").trim();
  if (inner.startsWith("|")) inner = inner.slice(1);
  if (inner.endsWith("|")) inner = inner.slice(0, -1);
  return inner
    .split("|")
    .map((cell) => cell.replaceAll("\u0000", "|").trim())
    .filter((cell) => cell !== "");
}

/** A header row: all its words bold, its code kept. */
function parseBold(line: string): Inline[] {
  const runs: Inline[] = [];
  for (const run of parseInline(line)) {
    const next: Inline =
      run.type === "code" ? run : { type: "bold", text: run.text };
    const last = runs.at(-1);
    if (last?.type === "bold" && next.type === "bold") last.text += next.text;
    else runs.push(next);
  }
  return runs;
}

/** `code`, **bold** or __bold__, in that order of precedence. */
const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__/g;

/** One line's runs: bold and code kept, the other marks removed. */
export function parseInline(line: string): Inline[] {
  const runs: Inline[] = [];
  let at = 0;
  for (const match of line.matchAll(INLINE)) {
    if (match.index > at) {
      pushText(runs, line.slice(at, match.index));
    }
    if (match[1] !== undefined) runs.push({ type: "code", text: match[1] });
    else {
      const bold = stripMarks(match[2] ?? match[3] ?? "");
      if (bold !== "") runs.push({ type: "bold", text: bold });
    }
    at = match.index + match[0].length;
  }
  if (at < line.length) pushText(runs, line.slice(at));
  return runs;
}

function pushText(runs: Inline[], text: string) {
  const plain = stripMarks(text);
  if (plain !== "") runs.push({ type: "text", text: plain });
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
