"use client";

import { useId, useState } from "react";
import { RollingNumber } from "@/components/rolling-number";
import type { SearchNotesPart } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { SearchStep } from "./search-step";
import { ThoughtLine } from "./thought-line";
import { isThought, type ThoughtPart } from "./thoughts";

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
 */
export function SearchRun({
  parts,
  stopped = false,
  moving = false,
  arriving = false,
  className,
}: {
  parts: Array<SearchNotesPart | ThoughtPart>;
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
  return (
    <div className={cn("text-[0.8125rem]", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={linesId}
        onClick={() => setOpen(!open)}
        className="group flex min-h-6 items-center text-left text-muted-foreground"
      >
        {/* The moving band colours the whole line, so the count turns white once it's still. */}
        <span className={cn(moving && "shimmer")}>
          Used{" "}
          <span className={cn("font-medium", !moving && "text-foreground")}>
            <RollingNumber value={searches} /> searches
          </span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-4 shrink-0 -rotate-90 opacity-45 group-hover:opacity-100 group-aria-expanded:rotate-0 group-aria-expanded:opacity-100 motion-safe:transition-[rotate,opacity] motion-safe:duration-150"
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
    </div>
  );
}
