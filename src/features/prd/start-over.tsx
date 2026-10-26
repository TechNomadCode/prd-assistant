"use client";

import { useEffect, useRef } from "react";
import { growFrom } from "@/components/popover";
import { Button } from "@/components/ui/button";

const START_OVER_ID = "start-over";

/**
 * "Start over", which asks once before it clears the chat and the PRD, in a
 * small pop-over under its button: the source's pop-over in look and
 * behaviour (`.popover` in `src/app/globals.css`), so a click outside or
 * Escape closes it, and the row the button sits in never changes. It opens
 * with focus on "Keep them", the choice that loses nothing; the browser
 * gives focus back to the button when it closes.
 */
export function StartOver({ onConfirm }: { onConfirm: () => void }) {
  const popover = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLButtonElement>(null);

  // React's `autoFocus` focuses on mount, not when the pop-over opens.
  useEffect(() => {
    const element = popover.current;
    if (!element) return;
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "open") keep.current?.focus();
    };
    element.addEventListener("toggle", onToggle);
    return () => element.removeEventListener("toggle", onToggle);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        popoverTarget={START_OVER_ID}
        onClick={(event) => {
          const element = popover.current;
          if (element && !element.matches(":popover-open")) {
            growFrom(element, event.currentTarget);
          }
        }}
      >
        Start over
      </Button>
      <div
        ref={popover}
        id={START_OVER_ID}
        popover="auto"
        role="dialog"
        aria-labelledby="start-over-question"
        className="popover start-over-popover"
      >
        <p id="start-over-question" className="text-sm font-medium">
          Clear the chat and the PRD?
        </p>
        <div className="mt-4 flex items-center justify-end gap-4">
          <Button
            variant="outline"
            onClick={() => {
              popover.current?.hidePopover();
              onConfirm();
            }}
          >
            Clear both
          </Button>
          <Button
            ref={keep}
            variant="quiet"
            className="h-auto px-0"
            popoverTarget={START_OVER_ID}
            popoverTargetAction="hide"
          >
            Keep them
          </Button>
        </div>
      </div>
    </>
  );
}
