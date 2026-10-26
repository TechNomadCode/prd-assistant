"use client";

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
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
import { usePacedLength } from "./paced-text";
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
 * Text still `arriving` is typed out as opencode shows a streaming reply
 * (`paced-text.ts`): what shows grows from the top a few words at a time,
 * its formatting already in place, and the words each step adds fade in
 * together (`.word-arrive` in `src/app/globals.css`). Once the last of them
 * has arrived, the text is plain again, one text node per run, as tests and
 * screen readers read it. Text that was there before, such as a finished
 * answer or one brought back after a reload, and everything under reduced
 * motion, shows at once. A table that arrives rises in as a block (`.arrive`)
 * as it takes shape, row by row.
 */
export function RichText({
  text,
  arriving = false,
  onGrow,
  className,
}: {
  text: string;
  /** The text came in after the chat showed, so it may still grow. */
  arriving?: boolean;
  /** Called, before the paint, each time more of it shows as it's typed out. */
  onGrow?: () => void;
  className?: string;
}) {
  const blocks = parseMarkdown(text);
  const characters = shownText(blocks);
  const moves = useMotion();
  const paced = arriving && moves;
  const length = usePacedLength(characters, paced);
  // The typing can go on after the answer has ended, when nothing else tells
  // the chat it grew.
  useLayoutEffect(() => {
    if (paced) onGrow?.();
  }, [paced, length, onGrow]);
  // Where each step's words begin, counted in shown characters, and how far
  // the text is plain again (React's "storing information from previous
  // renders" pattern).
  const [shown, setShown] = useState({ length, starts: [0], settled: 0 });
  if (shown.length !== length) {
    const grew = length > shown.length && shown.starts.at(-1)! < shown.length;
    // A step without a word, such as a space, brings nothing in: once
    // everything before it has arrived, it's plain at once.
    const plain =
      grew &&
      shown.settled >= shown.length &&
      !/\S/.test(characters.slice(shown.length, length));
    setShown({
      length,
      starts: grew && !plain ? [...shown.starts, shown.length] : shown.starts,
      settled: plain ? length : Math.min(shown.settled, length),
    });
  }
  const words: Words | undefined = paced
    ? {
        starts: shown.starts,
        settled: shown.settled,
        newest: Math.max(shown.starts.at(-1)!, shown.settled),
        shown: length,
        at: 0,
      }
    : undefined;

  // Once no word is still on its way, the text is plain again: looked at
  // once a frame, however many words ended in it.
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
        // Nothing of it typed out yet.
        if (unreached(words)) return null;
        if (block.type === "paragraph") {
          return (
            <p key={index}>
              {block.lines.map((line, number) => (
                <Fragment key={number}>
                  {number > 0 && !unreached(words) && <br />}
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
              if (unreached(words)) return null;
              // Read before its words are laid out, which counts them.
              const marker = words !== undefined && words.at >= words.newest;
              return (
                <ListItem key={number} entering={marker}>
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
 * The words being laid out while the text is typed out: `starts` holds where
 * each step's words begin, the newest last, the text before `settled` is
 * plain again, and the newest step's words still on their way begin at
 * `newest`; `shown` is how many characters show so far, and `at` counts the
 * characters laid out, in the order they're rendered. Absent when nothing
 * moves.
 */
type Words = {
  starts: number[];
  settled: number;
  newest: number;
  shown: number;
  at: number;
};

/** Whatever comes next isn't typed out yet. */
function unreached(words: Words | undefined): boolean {
  return words !== undefined && words.at >= words.shown;
}

/**
 * A list item whose bullet or number, when it comes with the newest step,
 * fades in with its words (`.marker-arrive`), so it doesn't show before
 * them. Kept from its mount.
 */
function ListItem({
  entering,
  children,
}: {
  entering: boolean;
  children: ReactNode;
}) {
  const [arrives] = useState(entering);
  return <li className={cn(arrives && "marker-arrive")}>{children}</li>;
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
 * names nothing. While it's typed out, its rows come one by one, their cells
 * filling in.
 */
function table({ header, rows }: Table, words: Words | undefined) {
  const columns = Math.max(
    header?.length ?? 0,
    ...rows.map((row) => row.length),
  );
  const padded = (cells: Cell[]) =>
    Array.from({ length: columns }, (_, column) => cells[column] ?? []);
  // Laid out in reading order, the header first, since laying out counts
  // the characters typed so far.
  const head = header && (
    <thead>
      <tr>
        {padded(header).map((cell, column) =>
          cell.length > 0 ? (
            <th
              key={column}
              scope="col"
              className={cn(
                CELL,
                "border-border-strong font-medium text-foreground",
              )}
            >
              {runs(cell, words)}
            </th>
          ) : (
            <td key={column} className={cn(CELL, "border-border-strong")} />
          ),
        )}
      </tr>
    </thead>
  );
  const typedRows: ReactNode[] = [];
  for (const [number, row] of rows.entries()) {
    if (unreached(words)) break;
    typedRows.push(
      <tr key={number}>
        {padded(row).map((cell, column) => (
          <td key={column} className={cn(CELL, "border-border")}>
            {runs(cell, words)}
          </td>
        ))}
      </tr>,
    );
  }
  return (
    <table className="w-full border-collapse">
      {head}
      {typedRows.length > 0 && <tbody>{typedRows}</tbody>}
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
        if (unreached(words)) return null;
        return (
          <strong key={index} className="font-semibold text-foreground">
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
        if (unreached(words)) return null;
        const start = words.at;
        words.at += run.text.length;
        if (start < words.settled)
          return <Fragment key={index}>{code}</Fragment>;
        // Inline code arrives whole, with the step it began in.
        return (
          <Arrival
            key={index}
            enter={updateAt(words.starts, start) === words.starts.length - 1}
          >
            {code}
          </Arrival>
        );
      }
      case "break":
        if (unreached(words)) return null;
        if (words) words.at += 1;
        return <br key={index} />;
    }
  });
}

/**
 * The text as it is, or, while it's typed out, as much of it as shows: what's
 * plain again, then each step's words, the newest step's arriving.
 */
function wordsOf(text: string, words: Words | undefined): ReactNode {
  if (!words) return text;
  const { starts, settled } = words;
  const from = words.at;
  const to = Math.min(from + text.length, words.shown);
  words.at = from + text.length;
  if (to <= from) return null;
  if (to <= settled) return text.slice(0, to - from);
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
    pieces.push(
      <Arrival key={update} enter={update === starts.length - 1}>
        {text.slice(begin, end)}
      </Arrival>,
    );
  }
  return pieces;
}

/** The step whose words hold the character at the offset. */
function updateAt(starts: number[], offset: number): number {
  return starts.findLastIndex((start) => start <= offset);
}

/**
 * The words of one step in one run, or a piece of inline code, which fade in
 * together when they're the newest step's, as opencode's do. It keeps what
 * it was given when it mounted, so the next step doesn't cut a fade short,
 * and words shown before never arrive again, even when a change in the
 * text's form, such as a table taking shape, mounts them anew.
 */
function Arrival({
  enter,
  children,
}: {
  enter: boolean;
  children: string | ReactElement;
}) {
  const [entering] = useState(enter);
  if (!entering) return children;
  return <span className="word-arrive">{children}</span>;
}
