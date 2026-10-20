"use client";

import { Fragment, useState, type ReactNode } from "react";
import {
  parseMarkdown,
  type Block,
  type Card,
  type Field,
  type Inline,
} from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * The assistant's text with its formatting: bold, inline code and lists are
 * shown as such, `<br>` as a line break, and every other mark is removed
 * (src/lib/markdown.ts). A table shows row by row, with space between the
 * rows: one line per row, or, when its cells hold line breaks, a card per row
 * whose further cells are labelled with their column's names.
 *
 * Text still `arriving` fades in as it comes (opencode's
 * `markdown-word-enter`; `.word-enter` in `src/app/globals.css`): what it
 * mounts with, which is all of a reply that arrives in one piece, and then
 * only the words each update adds, each update's words as one. Text that was
 * there before, such as a finished answer or one brought back after a
 * reload, and everything under reduced motion, shows at once.
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
        if (block.type === "cards") {
          return (
            <div key={index} className="space-y-3">
              {block.cards.map((card, number) => (
                <Fragment key={number}>{tableCard(card, words)}</Fragment>
              ))}
            </div>
          );
        }
        if (block.type === "table") {
          return (
            <div key={index} className="space-y-3">
              {block.rows.map((row, number) => (
                <p key={number}>{runs(row, words)}</p>
              ))}
            </div>
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
 * The text's runs in the order they're rendered: a card's title, then each
 * cell's name and value.
 */
function* runsOf(blocks: Block[]): Generator<Inline[]> {
  for (const block of blocks) {
    if (block.type === "paragraph") yield* block.lines;
    else if (block.type === "list") yield* block.items;
    else if (block.type === "table") yield* block.rows;
    else
      for (const card of block.cards) {
        if (card.title) yield card.title;
        for (const field of card.fields) {
          if (field.label) yield field.label;
          yield field.value;
        }
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

/** A cell's later lines go under its first, indented: a hanging indent. */
const HANGING_INDENT = "pl-4 -indent-4";

/**
 * A table row as a card: its title, then a line per cell. A named cell is a
 * term and its description in a description list, so a screen reader hears
 * each cell with its column's name; consecutive named cells share one list,
 * each pair in a `<div>` for the indent. A cell without a name can't be a
 * description without a term, so it's a line of its own, in its place (MDN,
 * `<dl>`: name-value groups, optionally wrapped in a `<div>`; read 2026-10-20
 * through Context7).
 */
function tableCard(card: Card, words: Words | undefined) {
  const named = (field: Field | undefined) => field?.label !== undefined;
  const groups: Field[][] = [];
  for (const field of card.fields) {
    const group = groups.at(-1);
    if (group && named(group[0]) === named(field)) group.push(field);
    else groups.push([field]);
  }
  return (
    <div>
      {card.title && <p>{runs(card.title, words)}</p>}
      {groups.map((group, index) =>
        group[0]?.label ? (
          <dl key={index}>
            {group.map(({ label = [], value }, number) => (
              <div key={number} className={HANGING_INDENT}>
                <dt className="inline font-semibold">{runs(label, words)}:</dt>{" "}
                <dd className="inline">{runs(value, words)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <Fragment key={index}>
            {group.map(({ value }, number) => (
              <p key={number} className={HANGING_INDENT}>
                {runs(value, words)}
              </p>
            ))}
          </Fragment>
        ),
      )}
    </div>
  );
}

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
