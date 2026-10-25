"use client";

import { useEffect, useState } from "react";

/**
 * A reply typed out the way opencode's desktop app shows a streaming one
 * (`createPacedValue` in `packages/session-ui/src/message/message-content.tsx`
 * at acdcdb8, read 2026-10-25): a little more of it every 24ms, ending at the
 * end of a word when one ends within 8 characters. The chat model's replies
 * arrive whole (slice 8a), so the pace is the app's own, the owner's choice
 * (docs/decisions.md, Design, 2026-10-25): about 600 characters a second,
 * faster for a long reply, so it's all shown within about 2.5 seconds of
 * arriving.
 */
const TICK_MS = 24;
const PER_SECOND = 600;
const LONGEST_MS = 2500;
const SNAP = /[\s.,!?;:)\]]/;
const SNAP_WITHIN = 8;

/** How many characters each tick shows of what's still to show. */
function stepFor(left: number): number {
  return Math.max(
    Math.ceil((PER_SECOND * TICK_MS) / 1000),
    Math.ceil(left / (LONGEST_MS / TICK_MS)),
  );
}

/** Where the next tick ends: `step` on, or just after a word that ends soon after. */
function nextEnd(text: string, from: number, step: number): number {
  const end = Math.min(text.length, from + step);
  const most = Math.min(text.length, end + SNAP_WITHIN);
  for (let at = end; at < most; at++) {
    if (SNAP.test(text[at]!)) return at + 1;
  }
  return end;
}

/**
 * How many of the text's characters show: while `paced`, its first step as
 * soon as it mounts, growing tick by tick to all of them, and again from
 * where it was whenever the text grows; otherwise all of them at once. The
 * text is what shows, its formatting already read, so a half-shown mark
 * never appears. Mounting empty, a reply took nothing's place for a frame
 * as "Thinking" left, and the chat sank by a line (found 2026-10-25).
 */
export function usePacedLength(text: string, paced: boolean): number {
  const length = text.length;
  const [pace, setPace] = useState(() => ({
    length,
    shown: paced ? nextEnd(text, 0, stepFor(length)) : length,
    step: stepFor(length),
  }));
  // React's "storing information from previous renders" pattern: the step
  // follows how much the text has left to show each time it changes.
  if (pace.length !== length) {
    const shown = Math.min(pace.shown, length);
    setPace({ length, shown, step: stepFor(length - shown) });
  }
  useEffect(() => {
    if (!paced || pace.shown >= pace.length) return;
    const tick = setTimeout(
      () =>
        setPace((now) => ({
          ...now,
          shown: nextEnd(text, now.shown, now.step),
        })),
      TICK_MS,
    );
    return () => clearTimeout(tick);
  }, [paced, pace, text]);
  return paced ? pace.shown : length;
}
