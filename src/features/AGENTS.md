# Browser features: rules for working here

## The chat and the PRD (`workspace/`, `chat/`, `prd/`)
- **One conversation, two panes:** `workspace/workspace.tsx` owns `useChat`. The PRD is built from the conversation, the latest `saveSection` result per section (`savedSections` in `src/lib/chat.ts`); nothing else changes it. "Start over" stops the answer and clears the messages, the error and the check-in.
- **The check-in** sends "<latest section> looks right. Please draft <next>." as the visitor's message, where the next is the first section in the PRD's order not drafted yet. It counts as arrived once a save of that section comes after the message it sent; until then it reads "Drafting…" while the assistant works, and comes back after a failed or empty answer.
- **Desktop layout:** the body takes the viewport height only on pages that hold `[data-workspace]` (`lg:has-[[data-workspace]]:h-dvh` in `src/app/layout.tsx`, Tailwind's `has-*` variant), so the two panes scroll on their own and the transcripts page scrolls as before.
- **Scrolling panes are `relative`:** Tailwind's `sr-only` is `position: absolute`. Inside a scrolling pane that isn't positioned, those labels are placed against the page, stretch it and make the whole page scroll (found 2026-10-18). The PRD pane is also focusable (`tabIndex={0}`), or axe reports `scrollable-region-focusable` before it holds a link.
- **Only "See it" scrolls the PRD.** The chat follows its newest message unless the visitor scrolled up; on a phone, where the panes stack and don't scroll on their own, it doesn't follow.

## The source pop-over (`prd/source-popover.tsx`)
- **No library:** one native `popover="auto"` element serves every name. Each name is its invoker (`popoverTarget`, `popoverTargetAction="show"`), which gives light dismiss (a tap outside, Escape) and makes the name the pop-over's implicit anchor, so the CSS needs no `anchor-name` (MDN, *Using the Popover API*, "Popover anchor positioning", read 2026-10-18 through Context7).
- **Position** (`.source-popover` in `src/app/globals.css`): on a phone it isn't anchored, nearly full width and scrolling inside. From `lg` up it uses `position-area` with `position-try-fallbacks`, inside `@supports (position-area: bottom)`, with `inset` and `margin` reset as MDN advises, so browsers without anchor positioning get the centred box. Support (MDN's compatibility data, read 2026-10-18): Chrome 129, Firefox 147, Safari 26.
- **Highlighting** (`src/lib/highlight.ts`) reads a quote the way the check does, only to mark the words; whether a quote is confirmed is the check's call alone.

## Accessible names
- An `sr-only` span inside a button gets a space before it in Chrome's accessible name ("See it : Goals"), so a button whose name extends its visible text uses `aria-label`, starting with the visible words.
