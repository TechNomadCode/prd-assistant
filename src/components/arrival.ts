"use client";

import { useState } from "react";

/**
 * Whether what a component shows arrives as it appears (`.arrive` in
 * `src/app/globals.css`): unless it was showing when the component mounted
 * and has stayed since, so what a pane shows with, such as a conversation
 * brought back after a reload, is there at once. `shown` is false or
 * undefined while nothing shows, and may name what shows: a new name
 * arrives too, as when the check-in moves to the next section. Kept from
 * render to render with React's "storing information from previous renders"
 * pattern (https://react.dev/reference/react/useState).
 */
export function useArrival(shown: string | boolean | undefined): boolean {
  const showing = shown === false || shown === "" ? undefined : shown;
  const [atMount, setAtMount] = useState(showing);
  if (atMount !== undefined && showing !== atMount) setAtMount(undefined);
  return showing !== undefined && atMount === undefined;
}
