"use client";

import type { SaveSectionPart } from "@/lib/chat";
import { tally, type CheckedSection, type SectionName } from "@/lib/prd";
import { cn } from "@/lib/utils";

/**
 * One section the assistant saved: one line saying what the check found,
 * after a tick, ending in "See it", which brings the section into view in the
 * PRD. In an answer that came in after the chat showed, each of its lines
 * arrives as it appears, the check, then what came of it (keyed by what it
 * says, so the next one is a new line), and the tick draws itself.
 */
export function SectionStep({
  part,
  stopped = false,
  arriving = false,
  onSee,
  className,
}: {
  part: SaveSectionPart;
  /** Its answer was stopped, so a check still running never finished. */
  stopped?: boolean;
  /** Its answer came in after the chat showed. */
  arriving?: boolean;
  onSee?: (section: SectionName) => void;
  className?: string;
}) {
  const name = part.input?.section ?? "the section";
  const line = cn(
    "text-sm text-muted-foreground",
    arriving && "arrive",
    className,
  );

  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return (
        <p key={stopped ? "stopped" : "checking"} className={line}>
          {stopped
            ? `Stopped checking the quotes in ${name}`
            : `Checking the quotes in ${name}…`}
        </p>
      );

    case "output-error":
      return (
        <p key="failed" className={line}>
          Saving {name} didn&apos;t work. {part.errorText}
        </p>
      );

    case "output-available": {
      const section = part.output;
      return (
        <p key="saved" className={line}>
          <Tick drawing={arriving} />
          <span className="text-foreground">Saved</span> {summary(section)}
          {onSee && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => onSee(section.section)}
                aria-label={`See it: ${section.section}`}
                className="text-foreground underline underline-offset-4 hover:no-underline"
              >
                See it
              </button>
            </>
          )}
        </p>
      );
    }

    default:
      return null;
  }
}

/**
 * The tick before a saved section's line: the README video's check in a
 * circle, at half its size. On a line that arrives it draws itself, circle
 * first, with one soft pulse (`.tick-draws` in `src/app/globals.css`);
 * otherwise it's simply there. Decoration: "Saved" says it.
 */
function Tick({ drawing }: { drawing: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative mr-1.75 inline-block size-4 align-[-0.1875rem]",
        drawing && "tick-draws",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        className="size-4 text-foreground"
      >
        <circle cx="8" cy="8" r="6.5" transform="rotate(-90 8 8)" />
        <path
          d="M5 8.25 7.15 10.25 11 6"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** "Goals / Objectives: 4 of 5 quotes confirmed, 1 statement cites nothing". */
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
  return `${section.section}: ${found}${uncited}`;
}
