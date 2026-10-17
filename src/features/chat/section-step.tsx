"use client";

import { useId, useState } from "react";
import type { SaveSectionPart } from "@/lib/chat";
import {
  isFlagged,
  tally,
  type CheckedCitation,
  type CheckedSection,
} from "@/lib/prd";
import { cn } from "@/lib/utils";

/**
 * One section the assistant saved: one line saying what the check found,
 * open to the statements, each with its quotes, their source and the result.
 * Unverified quotes and statements that cite nothing stay visible, marked.
 */
export function SectionStep({ part }: { part: SaveSectionPart }) {
  const [open, setOpen] = useState(true);
  const statementsId = useId();
  const name = part.input?.section ?? "the section";

  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return (
        <p className="text-sm text-muted-foreground">
          Checking the quotes in {name}…
        </p>
      );

    case "output-error":
      return (
        <p className="text-sm text-muted-foreground">
          Saving {name} didn&apos;t work. {part.errorText}
        </p>
      );

    case "output-available": {
      const section = part.output;
      return (
        <div className="text-sm">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={statementsId}
            onClick={() => setOpen(!open)}
            className="flex gap-2 text-left text-muted-foreground hover:text-foreground"
          >
            <span aria-hidden="true">{open ? "▾" : "▸"}</span>
            <span>{summary(section)}</span>
          </button>
          <ol
            id={statementsId}
            hidden={!open}
            aria-label={`Statements in ${section.section}`}
            className="mt-4 space-y-5 border-l border-border pl-4 text-base"
          >
            {section.statements.map((statement, index) => (
              <li key={index} className="space-y-2">
                <p className="leading-relaxed">{statement.text}</p>
                {statement.citations.length > 0 && (
                  <ul aria-label="Quotes" className="space-y-2">
                    {statement.citations.map((citation, quote) => (
                      <li key={quote}>
                        <Quote citation={citation} />
                      </li>
                    ))}
                  </ul>
                )}
                {isFlagged(section.section, statement) && (
                  <p className="text-sm font-medium">
                    Cites nothing: no quote backs this statement.
                  </p>
                )}
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

function Quote({ citation }: { citation: CheckedCitation }) {
  return (
    <figure
      className={cn(
        "border-l-2 border-foreground pl-3",
        !citation.confirmed && "border-dashed",
      )}
    >
      <blockquote className="leading-relaxed">“{citation.quote}”</blockquote>
      <figcaption className="mt-1 text-sm text-muted-foreground">
        {sourceOf(citation)} ·{" "}
        {citation.confirmed ? (
          "Confirmed"
        ) : (
          <span className="font-medium text-foreground">
            Unverified: {whyUnverified(citation)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** "Saved Goals / Objectives: 4 of 5 quotes confirmed, 1 statement cites nothing". */
function summary(section: CheckedSection): string {
  const { quotes, confirmed, flagged } = tally(section);
  const found =
    quotes === 0
      ? "no quotes"
      : `${confirmed} of ${quotes} ${quotes === 1 ? "quote" : "quotes"} confirmed`;
  const uncited =
    flagged === 0
      ? ""
      : flagged === 1
        ? ", 1 statement cites nothing"
        : `, ${flagged} statements cite nothing`;
  return `Saved ${section.section}: ${found}${uncited}`;
}

/** Whose words, by name: "Daan, interview" or "You, in this chat". */
function sourceOf(citation: CheckedCitation): string {
  switch (citation.source) {
    case "interview":
      return `${citation.interviewee}, interview`;
    case "chat":
      return "You, in this chat";
    case "unknown":
      return `Source “${citation.passage}”`;
  }
}

function whyUnverified(citation: CheckedCitation): string {
  switch (citation.source) {
    case "interview":
      return "these words aren't in the answer it cites";
    case "chat":
      return "these words aren't in your messages";
    case "unknown":
      return "no such passage in the interviews";
  }
}
