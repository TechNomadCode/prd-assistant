import type { ReactNode } from "react";
import { listNames, whoseWords, type SearchNotesPart } from "@/lib/chat";
import { cn } from "@/lib/utils";

/** The line shows this much of a query; the search used all of it. */
const SHOWN_QUERY_LENGTH = 80;

/**
 * One search the assistant ran, as a plain line that doesn't open, the way
 * opencode's desktop app shows a search tool: "Search" in medium weight, then
 * the query and what came of it in grey (docs/decisions.md, Design,
 * 2026-10-20). The passages the PRD quotes open from its source names.
 */
export function SearchStep({
  part,
  stopped = false,
  className,
}: {
  part: SearchNotesPart;
  /** Its answer was stopped, so a search still running never finished. */
  stopped?: boolean;
  className?: string;
}) {
  const result = outcome(part, stopped);
  if (result === undefined) return null;
  // The moving band colours the whole line, so "Search" turns white once
  // the search is over.
  const over =
    stopped ||
    (part.state !== "input-streaming" && part.state !== "input-available");
  return (
    <p
      className={cn(
        "text-[0.8125rem] text-muted-foreground",
        // One line, cut off with an ellipsis, as opencode's; a failure keeps
        // its whole reason.
        part.state !== "output-error" && "truncate",
        className,
      )}
    >
      <span className={cn("font-medium", over && "text-foreground")}>
        Search
      </span>{" "}
      “{shorten(part.input?.query ?? "")}”{result}
    </p>
  );
}

/** What came of a search, after its query; nothing for a state it can't be in. */
function outcome(part: SearchNotesPart, stopped: boolean): ReactNode {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return stopped ? <After>stopped</After> : "…";
    case "output-error":
      return <After>didn&apos;t work. {part.errorText}</After>;
    case "output-available": {
      const { passages } = part.output;
      if (passages.length === 0) return <After>no passages</After>;
      return (
        <After>
          <span className="sr-only">passages from </span>
          {listNames(whoseWords(passages))}
        </After>
      );
    }
    default:
      return undefined;
  }
}

/** What follows the query, after a dot that screen readers skip. */
function After({ children }: { children: ReactNode }) {
  return (
    <>
      <span aria-hidden="true"> · </span>
      {children}
    </>
  );
}

function shorten(text: string): string {
  return text.length > SHOWN_QUERY_LENGTH
    ? `${text.slice(0, SHOWN_QUERY_LENGTH).trimEnd()}…`
    : text;
}
