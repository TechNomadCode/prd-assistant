"use client";

import { useId, useState } from "react";
import { PassageQuote } from "@/features/transcripts/passage-quote";
import { listNames, whoseWords, type SearchNotesPart } from "@/lib/chat";

/** The line shows this much of a query; the search used all of it. */
const SHOWN_QUERY_LENGTH = 80;

/** One search the assistant ran: one line that opens to its passages. */
export function SearchStep({ part }: { part: SearchNotesPart }) {
  const [open, setOpen] = useState(false);
  const passagesId = useId();
  const query = shorten(part.input?.query ?? "");

  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return (
        <p className="text-sm text-muted-foreground">
          Searching the interviews for “{query}”…
        </p>
      );

    case "output-error":
      return (
        <p className="text-sm text-muted-foreground">
          Searching the interviews for “{query}” didn&apos;t work.{" "}
          {part.errorText}
        </p>
      );

    case "output-available": {
      const { passages } = part.output;
      if (passages.length === 0) {
        return (
          <p className="text-sm text-muted-foreground">
            Searched the interviews for “{query}”: no passages came back.
          </p>
        );
      }
      return (
        <div className="text-sm">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={passagesId}
            onClick={() => setOpen(!open)}
            className="flex gap-2 text-left text-muted-foreground hover:text-foreground"
          >
            <span aria-hidden="true">{open ? "▾" : "▸"}</span>
            <span>
              Searched the interviews for “{query}”: closest passages from{" "}
              {listNames(whoseWords(passages))}
            </span>
          </button>
          <ol
            id={passagesId}
            hidden={!open}
            aria-label={`Passages found for “${query}”`}
            className="mt-4 space-y-5 border-l border-border pl-4 text-base"
          >
            {passages.map((passage) => (
              <li key={passage.id} className="space-y-2">
                <PassageQuote
                  question={passage.question}
                  answer={passage.answer}
                  participant={passage.participant}
                />
              </li>
            ))}
          </ol>
        </div>
      );
    }

    default:
      return null;
  }
}

function shorten(text: string): string {
  return text.length > SHOWN_QUERY_LENGTH
    ? `${text.slice(0, SHOWN_QUERY_LENGTH).trimEnd()}…`
    : text;
}
