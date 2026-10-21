import { cn } from "@/lib/utils";
import { thoughtTime, type ThoughtPart } from "./thoughts";

// opencode's lines for the model's reasoning, at 50c5fce (docs/decisions.md,
// Design, 2026-10-21): "Thinking" while it thinks, then "Thought" with the
// time in grey, at 13px with a 16px line height, the form of the search
// lines. Unlike opencode's, the line doesn't open: the reasoning's words
// never reach the browser.

/** "Thinking", with the moving band (`.shimmer` in `src/app/globals.css`). */
export function ThinkingLine({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "shimmer text-[0.8125rem] leading-4 font-medium text-muted-foreground",
        className,
      )}
    >
      Thinking
    </p>
  );
}

/** How long the model thought before a reply, as "Thought 8s". */
export function ThoughtLine({
  part,
  className,
}: {
  part: ThoughtPart;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[0.8125rem] leading-4 text-muted-foreground",
        className,
      )}
    >
      <span className="font-medium text-foreground">Thought</span>{" "}
      <span className="tabular-nums">{thoughtTime(part.data.ms)}</span>
    </p>
  );
}
