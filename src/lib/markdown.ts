// The model's formatting, read by a small parser of our own, so the chat needs
// no Markdown library. It keeps bold, inline code and lists, reads `<br>` as a
// line break, and removes every other mark (headings, italics, links, quotes,
// rules, strikethrough), so no `**`, `#` or table pipe is ever shown as typed.
// The chat is too narrow for a table's grid, so a table shows row by row: one
// line per row, its cells joined with " · " and its header in bold; or, when a
// cell below the header holds a line break, a card per row, its first cell the
// title and each further cell under its column's name. Any other HTML is shown
// as typed, never interpreted. It returns plain data, never HTML.

/** A run of text inside a line, or a line break inside it. */
export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "code"; text: string }
  | { type: "break" };

/**
 * A table's row as a card: its first cell as the title, in bold, then each
 * further cell that isn't empty. A card has no title when its first cell is
 * empty.
 */
export type Card = { title?: Inline[]; fields: Field[] };

/**
 * A cell of a card, under its column's name in bold; without a label when the
 * column has no name (no header, an empty name, or more cells than names).
 */
export type Field = { label?: Inline[]; value: Inline[] };

export type Block =
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; rows: Inline[][] }
  | { type: "cards"; cards: Card[] };

/** A table as read: its header's cells, if it has a header, and its rows'. */
type Table = { header?: Inline[][]; rows: Inline[][][] };

const BULLET = /^\s*[-*+•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^\s*#{1,6}\s+/;
const BLOCKQUOTE = /^\s*>\s?/;
/** A table's separator row: cells of dashes, with optional alignment colons. */
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
/** Between the cells of a row. */
const CELL_SEPARATOR = " · ";
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
        const cells = tableCells(line);
        table = headed
          ? { header: cells.map((cell) => bold(parseInline(cell))), rows: [] }
          : { rows: [cells.map((cell) => parseInline(cell))] };
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
 * The table row by row. Each cell is read on its own, so the breaks at its
 * edges go even inside its marks (they'd only part a cell from the next), and
 * a cell that comes out empty is dropped. When a cell below the header still
 * holds a line break, a row on one line would run its cells' lines together,
 * so every row of the table becomes a card, and the header's names its labels.
 */
function tableBlock({ header, rows }: Table): Block | undefined {
  const breaks = rows.some((row) =>
    row.some((cell) => cell.some((run) => run.type === "break")),
  );
  if (breaks) {
    return {
      type: "cards",
      cards: rows.flatMap((row) => tableCard(row, header) ?? []),
    };
  }
  const lines = [
    ...(header ? [joinCells(header, true)] : []),
    ...rows.map((row) => joinCells(row, false)),
  ].filter((line) => line.length > 0);
  return lines.length > 0 ? { type: "table", rows: lines } : undefined;
}

/** The row on one line, its cells apart; a header's separators are bold. */
function joinCells(cells: Inline[][], header: boolean): Inline[] {
  const line: Inline[] = [];
  for (const runs of cells) {
    if (runs.length === 0) continue;
    if (line.length > 0) {
      appendRun(line, { type: header ? "bold" : "text", text: CELL_SEPARATOR });
    }
    for (const run of runs) appendRun(line, run);
  }
  return line;
}

/** The row as a card, each cell under its column's name; none if it's empty. */
function tableCard(
  row: Inline[][],
  header: Inline[][] | undefined,
): Card | undefined {
  const [first = [], ...rest] = row;
  const fields: Field[] = [];
  for (const [index, value] of rest.entries()) {
    if (value.length === 0) continue;
    const label = header?.[index + 1];
    fields.push(label && label.length > 0 ? { label, value } : { value });
  }
  if (first.length > 0) return { title: bold(first), fields };
  return fields.length > 0 ? { fields } : undefined;
}

/** Adds the run to the row, joined to text or bold of its own kind. */
function appendRun(row: Inline[], run: Inline) {
  const last = row.at(-1);
  if (run.type === "text" && last?.type === "text") last.text += run.text;
  else if (run.type === "bold" && last?.type === "bold") last.text += run.text;
  else row.push({ ...run });
}

/** A row's cells, without the outer pipes. */
function tableCells(row: string): string[] {
  // An escaped pipe (`\|`) belongs to its cell.
  let inner = row.replaceAll("\\|", "\u0000").trim();
  if (inner.startsWith("|")) inner = inner.slice(1);
  if (inner.endsWith("|")) inner = inner.slice(0, -1);
  return inner.split("|").map((cell) => cell.replaceAll("\u0000", "|").trim());
}

/** The runs with all their words bold, their code and breaks kept. */
function bold(runs: Inline[]): Inline[] {
  const bolded: Inline[] = [];
  for (const run of runs) {
    const next: Inline =
      run.type === "text" ? { type: "bold", text: run.text } : { ...run };
    const last = bolded.at(-1);
    if (last?.type === "bold" && next.type === "bold") last.text += next.text;
    else bolded.push(next);
  }
  return bolded;
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
