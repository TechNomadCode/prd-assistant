"use client";

import { useEffect, useRef, useState } from "react";
import type { SavedSection } from "@/lib/chat";
import type { SectionName } from "@/lib/prd";
import { sectionMarkdown } from "./prd-markdown";

/** How long "Copied" or "Couldn't copy" stays before the button is back. */
export const COPY_OUTCOME_MS = 2000;

type Outcome = "copied" | "refused";

const SAID: Record<Outcome, string> = {
  copied: "Copied",
  refused: "Couldn't copy",
};

/**
 * Beside a saved section's tally: opencode's copy button (docs/decisions.md,
 * Design, 2026-10-21). It copies the section as Markdown in the download's
 * form, then shows a check mark and is named "Copied" for two seconds, or
 * "Couldn't copy" when the browser refuses the clipboard. On a screen with
 * hover it shows while the pointer is over the section or focus is inside it;
 * on a touch screen it always shows. Its label is CSS (`.copy-tip`).
 */
export function CopySection({
  name,
  saved,
}: {
  name: SectionName;
  saved: SavedSection;
}) {
  const [outcome, setOutcome] = useState<Outcome>();
  // Pressing closes the label until the pointer leaves the button.
  const [pressed, setPressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    setPressed(true);
    let result: Outcome;
    try {
      // Rejects when the browser refuses (MDN, `Clipboard.writeText()`); an
      // insecure page has no `navigator.clipboard` at all, which throws here.
      await navigator.clipboard.writeText(sectionMarkdown(name, saved));
      result = "copied";
    } catch {
      result = "refused";
    }
    clearTimeout(timer.current);
    setOutcome(result);
    timer.current = setTimeout(() => setOutcome(undefined), COPY_OUTCOME_MS);
  }

  const label = outcome ? SAID[outcome] : "Copy section";
  return (
    <span className="relative self-center opacity-100 transition-opacity duration-150 group-focus-within/section:opacity-100 group-hover/section:opacity-100 [@media(hover:hover)]:opacity-0">
      <button
        type="button"
        aria-label={outcome ? label : `Copy section: ${name}`}
        data-pressed={pressed || undefined}
        onClick={copy}
        onPointerLeave={() => setPressed(false)}
        className="copy-button flex size-6 items-center justify-center rounded-(--radius-control) text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground active:bg-foreground/20"
      >
        {outcome === "copied" ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span
        aria-hidden
        data-open={outcome === "refused" || undefined}
        className="copy-tip"
      >
        {label}
      </span>
      {/* The button's new name, said once. */}
      <span aria-live="polite" className="sr-only">
        {outcome ? label : ""}
      </span>
    </span>
  );
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinejoin="round"
      className="size-3.5"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
    >
      <path d="M3 8.5l3.25 3.25L13 5" />
    </svg>
  );
}
