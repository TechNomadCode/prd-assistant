"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { nextScenario, playedScenarios, SCENARIOS } from "@/lib/scenarios";
import { cn } from "@/lib/utils";

/**
 * The scenario tour's panel (docs/plan.md, slice 24), shown only with `npm
 * run dev:replay`: the steps in order, what to watch for in the next one, and
 * "Play next", which sends its words as the visitor's message. A step counts
 * as played once its words are in the conversation, so the tour picks up
 * where it was after a reload. Any step can be played on its own from the
 * list. It sits over the page's corner, never in its layout.
 */
export function ScenarioTour({
  sent,
  working,
  onPlay,
}: {
  /** The visitor's messages so far. */
  sent: readonly string[];
  working: boolean;
  onPlay: (words: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const panelId = useId();
  const listId = useId();
  const played = playedScenarios(sent);
  const next = nextScenario(played);
  const step = next === undefined ? undefined : SCENARIOS[next];
  const count = SCENARIOS.length;

  return (
    <aside
      aria-label="Scenario tour"
      className="fixed right-4 bottom-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-(--radius-control) border border-border-strong bg-background text-sm shadow-lg"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left font-medium"
      >
        <span>Scenario tour</span>
        <span className="text-muted-foreground tabular-nums">
          {played.size} of {count} played
        </span>
      </button>
      <div id={panelId} hidden={!open} className="space-y-3 px-4 pb-4">
        {step === undefined ? (
          <p className="text-muted-foreground">
            The tour is done. Reload the page, then “Start over” begins it
            again.
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-muted-foreground tabular-nums">
              Step {(next ?? 0) + 1} of {count}
            </p>
            <p className="font-medium">{step.title}</p>
            <p className="text-muted-foreground">{step.watch}</p>
          </div>
        )}
        <div className="flex items-center gap-4">
          {step !== undefined && (
            <Button
              disabled={working}
              onClick={() => onPlay(step.words)}
              className="h-8 px-3"
            >
              Play next
            </Button>
          )}
          <Button
            variant="quiet"
            aria-expanded={listOpen}
            aria-controls={listId}
            onClick={() => setListOpen((value) => !value)}
            className="h-auto px-0"
          >
            All steps
          </Button>
        </div>
        <ol
          id={listId}
          hidden={!listOpen}
          className="max-h-64 space-y-0.5 overflow-y-auto"
        >
          {SCENARIOS.map((scenario, index) => (
            <li key={scenario.id}>
              <button
                type="button"
                disabled={working}
                onClick={() => onPlay(scenario.words)}
                className={cn(
                  "flex w-full gap-2 rounded-(--radius-control) px-2 py-1 text-left hover:bg-foreground/10 disabled:opacity-50",
                  index === next && "bg-foreground/10",
                )}
              >
                <span className="w-5 shrink-0 text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className="flex-1">{scenario.title}</span>
                {played.has(scenario.id) && (
                  <span className="text-muted-foreground">played</span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
