"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  parseMarkdown,
  type Block,
  type Cell,
  type Inline,
  type Table,
} from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * The assistant's text with its formatting: bold, inline code, lists and
 * tables are shown as such, `<br>` as a line break, and every other mark is
 * removed (src/lib/markdown.ts). A table is opencode's (`markdown.css`,
 * *Tables*, at 50c5fce): its header's cells in medium weight over a stronger
 * hairline, faint hairlines between the rows, no vertical lines, its cells
 * top-aligned with even padding; one wider than the chat scrolls sideways in
 * its own box.
 *
 * Text still `arriving` fades in as it comes (opencode's
 * `markdown-word-enter`; `.word-enter` in `src/app/globals.css`): what it
 * mounts with, which is all of a reply that arrives in one piece, and then
 * only the words each update adds, each update's words as one. Text that was
 * there before, such as a finished answer or one brought back after a
 * reload, and everything under reduced motion, shows at once. A table that
 * arrives rises in as a block (`.arrive`) as it takes shape.
 */
export function RichText({
  text,
  arriving = false,
  className,
}: {
  text: string;
  /** The text came in after the chat showed, so it may still grow. */
  arriving?: boolean;
  className?: string;
}) {
  const blocks = parseMarkdown(text);
  const length = shownLength(blocks);
  // Where each update's words begin, counted in shown characters (React's
  // "storing information from previous renders" pattern).
  const [shown, setShown] = useState({ text, length, starts: [0] });
  if (shown.text !== text) {
    const grew = length > shown.length && shown.starts.at(-1)! < shown.length;
    setShown({
      text,
      length,
      starts: grew ? [...shown.starts, shown.length] : shown.starts,
    });
  }
  const still = useReducedMotion();
  const words: Words | undefined =
    arriving && !still ? { starts: shown.starts, at: 0 } : undefined;

  return (
    <div className={cn("space-y-3 leading-relaxed", className)}>
      {blocks.map((block, index) => {
        if (block.type === "paragraph") {
          return (
            <p key={index}>
              {block.lines.map((line, number) => (
                <Fragment key={number}>
                  {number > 0 && <br />}
                  {runs(line, words)}
                </Fragment>
              ))}
            </p>
          );
        }
        if (block.type === "table") {
          return (
            <SideScroll key={index} arriving={arriving}>
              {table(block, words)}
            </SideScroll>
          );
        }
        const List = block.ordered ? "ol" : "ul";
        return (
          <List
            key={index}
            className={cn(
              "space-y-2 pl-5",
              block.ordered ? "list-decimal" : "list-disc",
            )}
          >
            {block.items.map((item, number) => (
              <li key={number}>{runs(item, words)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

/**
 * The words being laid out, while they fade in: `starts` holds where each
 * update's words begin, the newest last, and `at` counts the characters laid
 * out so far, in the order they're rendered. Absent when nothing fades.
 */
type Words = { starts: number[]; at: number };

/**
 * The text's runs in the order they're rendered: a table's header's cells,
 * then its rows' cells, row by row.
 */
function* runsOf(blocks: Block[]): Generator<Inline[]> {
  for (const block of blocks) {
    if (block.type === "paragraph") yield* block.lines;
    else if (block.type === "list") yield* block.items;
    else {
      if (block.header) yield* block.header;
      for (const row of block.rows) yield* row;
    }
  }
}

/** How many characters the text shows; a line break counts as one. */
function shownLength(blocks: Block[]): number {
  let length = 0;
  for (const line of runsOf(blocks))
    for (const run of line)
      length += run.type === "break" ? 1 : run.text.length;
  return length;
}

/**
 * opencode's cell: 12px of padding all round, top-aligned, a hairline under.
 * Unlike opencode's, at least 144px wide: the chat is narrower than its
 * reading column, and a table squeezed to fit it showed a word per line, so
 * a table with more columns than fit scrolls instead.
 */
const CELL = "min-w-36 border-b-[0.5px] p-3 text-start align-top";

/**
 * The table, every row as wide as its widest row or its header, so the
 * hairlines run the full width. A header's cell with a name is a column
 * header; one without, or one the header lacks, is an empty `<td>`, since it
 * names nothing.
 */
function table({ header, rows }: Table, words: Words | undefined) {
  const columns = Math.max(
    header?.length ?? 0,
    ...rows.map((row) => row.length),
  );
  const padded = (cells: Cell[]) =>
    Array.from({ length: columns }, (_, column) => cells[column] ?? []);
  return (
    <table className="w-full border-collapse">
      {header && (
        <thead>
          <tr>
            {padded(header).map((cell, column) =>
              cell.length > 0 ? (
                <th
                  key={column}
                  scope="col"
                  className={cn(CELL, "border-border-strong font-medium")}
                >
                  {runs(cell, words)}
                </th>
              ) : (
                <td key={column} className={cn(CELL, "border-border-strong")} />
              ),
            )}
          </tr>
        </thead>
      )}
      {rows.length > 0 && (
        <tbody>
          {rows.map((row, number) => (
            <tr key={number}>
              {padded(row).map((cell, column) => (
                <td key={column} className={cn(CELL, "border-border")}>
                  {runs(cell, words)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      )}
    </table>
  );
}

/**
 * A box that scrolls its table sideways when the table is wider than the
 * chat, so the page never does. While it scrolls it's a named region in the
 * tab order, so a keyboard can scroll it too (axe's
 * `scrollable-region-focusable`, which checks only a box that overflows; axe
 * 4.14, read 2026-10-21 through Context7); a table that fits adds no tab stop.
 * A `ResizeObserver` measures it whenever the box or the table changes size,
 * as the chat narrows or an arriving table grows.
 */
function SideScroll({
  arriving,
  children,
}: {
  arriving: boolean;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setScrolls(element.scrollWidth > element.clientWidth),
    );
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={box}
      className={cn("overflow-x-auto", arriving && "arrive arrive-block")}
      {...(scrolls && {
        tabIndex: 0,
        role: "region",
        "aria-label": SCROLLING_TABLE,
      })}
    >
      {children}
    </div>
  );
}

/** The name of a table's box while it scrolls sideways. */
const SCROLLING_TABLE = "Table, scrolls sideways";

function runs(line: Inline[], words: Words | undefined) {
  return line.map((run, index) => {
    switch (run.type) {
      case "text":
        return <Fragment key={index}>{wordsOf(run.text, words)}</Fragment>;
      case "bold":
        return (
          <strong key={index} className="font-semibold">
            {wordsOf(run.text, words)}
          </strong>
        );
      case "code": {
        const code = (
          <code className="rounded-(--radius-control) bg-foreground/10 px-1 py-0.5 text-[0.9em]">
            {run.text}
          </code>
        );
        if (!words) return <Fragment key={index}>{code}</Fragment>;
        // Inline code fades in as one, as in opencode, with the update it
        // began in.
        const update = updateAt(words.starts, words.at);
        words.at += run.text.length;
        return (
          <Arrival key={index} enter={update === words.starts.length - 1}>
            {code}
          </Arrival>
        );
      }
      case "break":
        if (words) words.at += 1;
        return <br key={index} />;
    }
  });
}

/**
 * The text as it is, or, while it fades in, a span for the words of each
 * update it holds.
 */
function wordsOf(text: string, words: Words | undefined): ReactNode {
  if (!words) return text;
  const { starts } = words;
  const from = words.at;
  const to = from + text.length;
  words.at = to;
  const pieces: ReactNode[] = [];
  for (
    let update = updateAt(starts, from);
    update < starts.length && starts[update]! < to;
    update++
  ) {
    const begin = Math.max(starts[update]!, from) - from;
    const end = Math.min(starts[update + 1] ?? to, to) - from;
    if (end > begin)
      pieces.push(
        <Arrival key={update} enter={update === starts.length - 1}>
          {text.slice(begin, end)}
        </Arrival>,
      );
  }
  return pieces;
}

/** The update whose words hold the character at the offset. */
function updateAt(starts: number[], offset: number): number {
  return starts.findLastIndex((start) => start <= offset);
}

/**
 * Words, or a piece of inline code, that fade in when they're the newest. It
 * keeps what it was given when it mounted, so the next update doesn't cut its
 * fade short, and words shown before never fade again, even when a change in
 * the text's form, such as a table taking shape, mounts them anew.
 */
function Arrival({ enter, children }: { enter: boolean; children: ReactNode }) {
  const [entering] = useState(enter);
  return (
    <span className={entering ? "word-enter" : undefined}>{children}</span>
  );
}
