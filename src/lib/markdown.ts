// The model's formatting, read by a small parser of our own, so the chat needs
// no Markdown library. It keeps bold, inline code and lists, and removes every
// other mark (headings, italics, links, quotes, rules, strikethrough), so no
// `**` or `#` is ever shown as typed. It returns plain data, never HTML.

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

/** The text as paragraphs and lists, with its inline marks read. */
export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] = [];
  let list: Extract<Block, { type: "list" }> | undefined;

  function endParagraph() {
    if (paragraph.length > 0)
      blocks.push({ type: "paragraph", lines: paragraph });
    paragraph = [];
  }
  function endList() {
    if (list) blocks.push(list);
    list = undefined;
  }

  for (const raw of text.split(/\r?\n/)) {
    if (RULE.test(raw)) {
      endParagraph();
      endList();
      continue;
    }
    const line = raw.replace(BLOCKQUOTE, "").replace(HEADING, "");
    if (line.trim() === "") {
      endParagraph();
      endList();
      continue;
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
  return blocks;
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
