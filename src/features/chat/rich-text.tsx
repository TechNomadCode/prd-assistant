"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  parseMarkdown,
  type Block,
  type Cell,
  type Inline,
  type Table,
} from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { useMotion } from "./use-reduced-motion";

/**
 * The assistant's text with its formatting: bold, inline code, lists and
 * tables are shown as such, `<br>` as a line break, and every other mark is
 * removed (src/lib/markdown.ts). A table is opencode's (`markdown.css`,
 * *Tables*, at 50c5fce): its header's cells in medium weight over a stronger
 * hairline, faint hairlines between the rows, no vertical lines, its cells
 * top-aligned with even padding; one wider than the chat scrolls sideways in
 * its own box.
 *
 * Text still `arriving` comes in word by word, as in the README's video
 * (`.word-arrive` in `src/app/globals.css`): what it mounts with, which is all
 * of a reply that arrives in one piece, and then only the words each update
 * adds, the newest update's one after another. Once the last of them has
 * arrived, the text is plain again, one text node per run, as tests and
 * screen readers read it. Text that was there before, such as a finished
 * answer or one brought back after a reload, and everything under reduced
 * motion, shows at once. A table that arrives rises in as a block (`.arrive`)
 * as it takes shape.
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
  const characters = shownText(blocks);
  const length = characters.length;
  // Where each update's words begin, counted in shown characters, and how
  // far the text is plain again (React's "storing information from previous
  // renders" pattern).
  const [shown, setShown] = useState({ text, length, starts: [0], settled: 0 });
  if (shown.text !== text) {
    const grew = length > shown.length && shown.starts.at(-1)! < shown.length;
    // An update without a word, such as a space, brings nothing in: once
    // everything before it has arrived, it's plain at once.
    const plain =
      grew &&
      shown.settled >= shown.length &&
      !/\S/.test(characters.slice(shown.length));
    setShown({
      text,
      length,
      starts: grew && !plain ? [...shown.starts, shown.length] : shown.starts,
      settled: plain ? length : Math.min(shown.settled, length),
    });
  }
  const moves = useMotion();
  const words: Words | undefined =
    arriving && moves
      ? {
          starts: shown.starts,
          settled: shown.settled,
          newest: Math.max(shown.starts.at(-1)!, shown.settled),
          at: 0,
          index: 0,
          count: 0,
        }
      : undefined;

  // Once no word is still on its way, the text is plain again: looked at
  // once a frame, however many words ended in it, as a long reply's hundreds
  // end within a few frames.
  const looking = useRef(false);
  function settle(event: AnimationEvent<HTMLDivElement>) {
    if (event.animationName !== "word-arrive" || looking.current) return;
    looking.current = true;
    const box = event.currentTarget;
    requestAnimationFrame(() => {
      looking.current = false;
      const onTheirWay = box
        .getAnimations({ subtree: true })
        .some(
          (animation) =>
            (animation as CSSAnimation).animationName === "word-arrive" &&
            animation.playState !== "finished",
        );
      if (!onTheirWay) setShown((now) => ({ ...now, settled: now.length }));
    });
  }

  return (
    <div
      className={cn("space-y-3 leading-relaxed", className)}
      onAnimationEnd={words && settle}
    >
      {blocks.map((block, index) => {
        beginBlock(block, words);
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
            {block.items.map((item, number) => {
              // Read before its words are laid out, which counts them.
              const marker = markerOf(words);
              return (
                <ListItem key={number} marker={marker}>
                  {runs(item, words)}
                </ListItem>
              );
            })}
          </List>
        );
      })}
    </div>
  );
}

/**
 * The words being laid out while they arrive: `starts` holds where each
 * update's words begin, the newest last, the text before `settled` is plain
 * again, and the newest update's words still on their way begin at
 * `newest`; `at` counts the characters laid out so far, in the order they're
 * rendered, and `index` the newest update's words laid out so far in the
 * paragraph, list or table being laid out, of `count`. Absent when nothing
 * moves.
 */
type Words = {
  starts: number[];
  settled: number;
  newest: number;
  at: number;
  index: number;
  count: number;
};

/**
 * Each paragraph, list or table spaces its own words: they all begin at once,
 * so what shows of a long reply, its end, needn't wait for the rest.
 */
function beginBlock(block: Block, words: Words | undefined) {
  if (!words) return;
  words.index = 0;
  words.count = wordsIn(block, words.at, words.newest);
}

/**
 * Where a list item's bullet or number arrives: with its first word, when
 * the item comes with the newest update.
 */
type Marker = { word: number; of: number };

function markerOf(words: Words | undefined): Marker | undefined {
  return words && words.at >= words.newest
    ? { word: words.index, of: words.count }
    : undefined;
}

/**
 * A list item whose bullet or number, when it comes with the newest update,
 * fades in with its first word (`.marker-arrive`), so it doesn't show before
 * its words. Kept from its mount, as a word's place is.
 */
function ListItem({
  marker,
  children,
}: {
  marker: Marker | undefined;
  children: ReactNode;
}) {
  const [arrival] = useState(marker);
  return (
    <li
      className={arrival && "marker-arrive"}
      style={
        arrival &&
        ({ "--word": arrival.word, "--words": arrival.of } as CSSProperties)
      }
    >
      {children}
    </li>
  );
}

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

/** The characters the text shows, in the order they're rendered; a line break counts as one. */
function shownText(blocks: Block[]): string {
  let shown = "";
  for (const line of runsOf(blocks))
    for (const run of line) shown += run.type === "break" ? "\n" : run.text;
  return shown;
}

/** A text's words and the spaces between them, in order. */
function tokens(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token !== "");
}

function isSpace(token: string): boolean {
  return /^\s/.test(token);
}

/**
 * How many words, and pieces of inline code, a paragraph, list or table that
 * begins at the offset `at` shows from the offset `from` on, counted as
 * `wordsOf` and `runs` lay them out: a word cut by `from` counts once, after
 * it.
 */
function wordsIn(block: Block, at: number, from: number): number {
  let count = 0;
  for (const line of runsOf([block]))
    for (const run of line) {
      if (run.type === "break") {
        at += 1;
        continue;
      }
      const end = at + run.text.length;
      if (run.type === "code") {
        if (at >= from) count += 1;
      } else if (end > from) {
        count += tokens(run.text.slice(Math.max(from - at, 0))).filter(
          (token) => !isSpace(token),
        ).length;
      }
      at = end;
    }
  return count;
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
        const start = words.at;
        words.at += run.text.length;
        if (start < words.settled)
          return <Fragment key={index}>{code}</Fragment>;
        // Inline code arrives as one word, with the update it began in.
        const newest =
          updateAt(words.starts, start) === words.starts.length - 1;
        const first = words.index;
        if (newest) words.index += 1;
        return (
          <Arrival key={index} enter={newest} first={first} of={words.count}>
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
 * The text as it is, or, while its words arrive, what's plain again, then
 * each update's words, the newest update's one after another.
 */
function wordsOf(text: string, words: Words | undefined): ReactNode {
  if (!words) return text;
  const { starts, settled } = words;
  const from = words.at;
  const to = from + text.length;
  words.at = to;
  if (to <= settled) return text;
  const pieces: ReactNode[] = [];
  if (settled > from)
    pieces.push(
      <Fragment key="settled">{text.slice(0, settled - from)}</Fragment>,
    );
  for (
    let update = updateAt(starts, Math.max(from, settled));
    update < starts.length && starts[update]! < to;
    update++
  ) {
    const begin = Math.max(starts[update]!, from, settled) - from;
    const end = Math.min(starts[update + 1] ?? to, to) - from;
    if (end <= begin) continue;
    const piece = text.slice(begin, end);
    const newest = update === starts.length - 1;
    const first = words.index;
    if (newest) words.index += tokens(piece).filter((t) => !isSpace(t)).length;
    pieces.push(
      <Arrival key={update} enter={newest} first={first} of={words.count}>
        {piece}
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
 * At most this many pieces of a paragraph, list or table arrive one after
 * another: their 0.2s holds about twelve frames, so more would start in the
 * same frames anyway. Past it, a few words arrive together, which keeps a
 * long reply's render light.
 */
const MOST_PIECES = 16;

/**
 * The words of one update in one run, or a piece of inline code, which
 * arrive when they're the newest update's: each word a span in its place
 * among them (`--word`, from `first`), of how many (`--words`), the spaces
 * between them plain; in a long paragraph, list or table a few words share a
 * span, which begins at a place that's a multiple of how many (`together`).
 * It keeps what it was given when it mounted, so the next update doesn't cut
 * an arrival short or move it, and words shown before never arrive again,
 * even when a change in the text's form, such as a table taking shape, mounts
 * them anew.
 */
function Arrival({
  enter,
  first,
  of,
  children,
}: {
  enter: boolean;
  first: number;
  of: number;
  children: string | ReactElement;
}) {
  const [place] = useState(enter ? { first, of } : undefined);
  if (!place) return children;
  const piece = (index: number, content: ReactNode, key?: number) => (
    <span
      key={key}
      className="word-arrive"
      style={{ "--word": index, "--words": place.of } as CSSProperties}
    >
      {content}
    </span>
  );
  if (typeof children !== "string") return piece(place.first, children);
  const together = Math.max(Math.ceil(place.of / MOST_PIECES), 1);
  const pieces: ReactNode[] = [];
  // The span being filled: its first word's place, where it starts in the
  // text, and its words so far; and the spaces after it, until the next word
  // says whether they're inside it.
  let open: { index: number; at: number; text: string } | undefined;
  let space = "";
  let index = place.first;
  let at = 0;
  for (const token of tokens(children)) {
    if (isSpace(token)) {
      space += token;
    } else if (open && index % together !== 0) {
      open.text += space + token;
      space = "";
      index += 1;
    } else {
      if (open) pieces.push(piece(open.index, open.text, open.at));
      if (space) pieces.push(space);
      open = { index, at, text: token };
      space = "";
      index += 1;
    }
    at += token.length;
  }
  if (open) pieces.push(piece(open.index, open.text, open.at));
  if (space) pieces.push(space);
  return pieces;
}
