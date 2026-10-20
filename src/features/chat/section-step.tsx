"use client";

import type { SaveSectionPart } from "@/lib/chat";
import { tally, type CheckedSection, type SectionName } from "@/lib/prd";
import { cn } from "@/lib/utils";

/**
 * One section the assistant saved: one line saying what the check found,
 * ending in "See it", which brings the section into view in the PRD.
 */
export function SectionStep({
  part,
  stopped = false,
  onSee,
  className,
}: {
  part: SaveSectionPart;
  /** Its answer was stopped, so a check still running never finished. */
  stopped?: boolean;
  onSee?: (section: SectionName) => void;
  className?: string;
}) {
  const name = part.input?.section ?? "the section";
  const line = cn("text-sm text-muted-foreground", className);

  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return (
        <p className={line}>
          {stopped
            ? `Stopped checking the quotes in ${name}`
            : `Checking the quotes in ${name}…`}
        </p>
      );

    case "output-error":
      return (
        <p className={line}>
          Saving {name} didn&apos;t work. {part.errorText}
        </p>
      );

    case "output-available": {
      const section = part.output;
      return (
        <p className={line}>
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
