"use client";

import { useState } from "react";

/**
 * A number that rolls to its new value: the old one leaves as the new one
 * comes in, upwards when it grows. Plain text at rest; with reduced motion
 * the CSS changes it at once (`.roll` in `src/app/globals.css`).
 */
export function RollingNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [from, setFrom] = useState<number>();
  if (value !== shown) {
    setShown(value);
    setFrom(shown);
  }
  if (from === undefined) return value;
  return (
    <span
      className="roll tabular-nums"
      data-direction={value > from ? "up" : "down"}
    >
      <span key={`${from}-${value}`} aria-hidden className="roll-out">
        {from}
      </span>
      <span
        key={value}
        className="roll-in"
        onAnimationEnd={() => setFrom(undefined)}
      >
        {value}
      </span>
    </span>
  );
}
