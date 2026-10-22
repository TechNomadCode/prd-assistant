"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
} from "react";
import { RollingNumber } from "@/components/rolling-number";
import type { SearchNotesPart } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { SearchStep } from "./search-step";
import { ThoughtLine } from "./thought-line";
import { isThought, type ThoughtPart } from "./thoughts";
import { useMotion } from "./use-reduced-motion";

type RunPart = SearchNotesPart | ThoughtPart;

/**
 * Two or more searches in a row, folded into one line that opens to their
 * plain lines, the way opencode's desktop app folds its search tools: "Used
 * 3 searches", its count rolling up as each search starts, then a small
 * triangle that turns down when the line opens (docs/decisions.md, Design,
 * 2026-10-20). The lines slide open (`.fold` in `src/app/globals.css`) and
 * are inert while closed, so screen readers and the keyboard skip them. The
 * times the model thought around the searches fold with them, as opencode
 * folds its reasoning, and the count counts only the searches. Its lines
 * arrive as plain ones do, while they're folded too.
 *
 * When a second search joins plain lines that were showing (`joined`), they
 * draw together into the folded line, as in the README's video: a copy of
 * them, hidden from screen readers, moves up and blurs out while its box
 * closes and "Used 2 searches" settles in over it (`.fold-closes`,
 * `.fold-leaves` and `.fold-settles`).
 */
export function SearchRun({
  parts,
  joined = [],
  stopped = false,
  moving = false,
  arriving = false,
  className,
}: {
  parts: RunPart[];
  /** The plain lines that were showing when it formed, which fold into it. */
  joined?: RunPart[];
  /** Its answer was stopped, so a search still running never finished. */
  stopped?: boolean;
  /** The line in progress carries the moving band (`.shimmer`). */
  moving?: boolean;
  /** Its answer came in after the chat showed. */
  arriving?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const linesId = useId();
  const searches = parts.filter((part) => !isThought(part)).length;
  const moves = useMotion();
  // Kept from its mount, as what folds is what showed then. Should motion be
  // reduced meanwhile, its animations stop without ending, so it goes at once.
  const [joining, setFolding] = useState(
    arriving && moves && joined.length > 0 ? joined : undefined,
  );
  const folding = moves ? joining : undefined;
  const [settles] = useState(joining !== undefined);
  const button = useRef<HTMLButtonElement>(null);
  const leaving = useRef<HTMLDivElement>(null);
  // The lines that fold, measured as they mount, before anything is painted:
  // their box's height, the folded line's, and how far up each line moves to
  // reach the first one's place.
  const [measured, setMeasured] = useState<{
    from: number;
    to: number;
    ys: number[];
  }>();
  useLayoutEffect(() => {
    const lines = leaving.current;
    const line = button.current;
    if (!lines || !line) return;
    const tops = [...lines.children].map(
      (child) => (child as HTMLElement).offsetTop,
    );
    setMeasured({
      from: lines.offsetHeight,
      to: line.offsetHeight,
      ys: tops.map((top) => tops[0]! - top),
    });
  }, []);
  return (
    <div className={cn("relative text-[0.8125rem]", className)}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={linesId}
        onClick={() => setOpen(!open)}
        className={cn(
          "group flex min-h-6 items-center text-left text-muted-foreground",
          settles && "fold-settles",
          // Over the lines that fold, until they're gone.
          folding && "absolute top-0 left-0",
        )}
      >
        {/* The moving band colours the whole line, so the count turns white once it's still. */}
        <span className={cn(moving && "shimmer")}>
          Used{" "}
          <span className={cn("font-medium", !moving && "text-foreground")}>
            <RollingNumber value={searches} /> searches
          </span>
        </span>
        {/* It turns as the lines slide, on the curve of what changes in place. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-4 shrink-0 -rotate-90 opacity-45 group-hover:opacity-100 group-aria-expanded:rotate-0 group-aria-expanded:opacity-100 motion-safe:transition-[rotate,opacity] motion-safe:duration-(--duration-arrive)"
        >
          <path d="M4.5 6.25h7L8 10.25z" fill="currentColor" />
        </svg>
      </button>
      <div
        id={linesId}
        inert={!open}
        data-open={open || undefined}
        className="fold"
      >
        <div>
          <div className="flex flex-col gap-2 pt-1">
            {parts.map((part, index) =>
              isThought(part) ? (
                <ThoughtLine
                  key={index}
                  part={part}
                  arriving={arriving}
                  className="leading-7"
                />
              ) : (
                <SearchStep
                  key={part.toolCallId}
                  part={part}
                  stopped={stopped}
                  arriving={arriving}
                  className="leading-7"
                />
              ),
            )}
          </div>
        </div>
      </div>
      {folding && (
        // The lines as they showed, 8px apart, until they've drawn together.
        <div
          ref={leaving}
          aria-hidden="true"
          className={cn("pointer-events-none", measured && "fold-closes")}
          style={
            measured &&
            ({
              "--fold-from": `${measured.from}px`,
              "--fold-to": `${measured.to}px`,
            } as CSSProperties)
          }
          onAnimationEnd={(event: AnimationEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget) setFolding(undefined);
          }}
        >
          {folding.map((part, index) => (
            <div
              key={index}
              className={cn(index > 0 && "mt-2", measured && "fold-leaves")}
              style={
                measured &&
                ({ "--fold-y": `${measured.ys[index]}px` } as CSSProperties)
              }
            >
              {isThought(part) ? (
                <ThoughtLine part={part} />
              ) : (
                <SearchStep part={part} stopped={stopped} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
