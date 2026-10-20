"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** jsdom has no `matchMedia`; there nothing asks for reduced motion. */
function query(): MediaQueryList | undefined {
  return typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY)
    : undefined;
}

function subscribe(onChange: () => void) {
  const list = query();
  list?.addEventListener("change", onChange);
  return () => list?.removeEventListener("change", onChange);
}

/**
 * Whether the visitor asks for reduced motion, kept up to date as the
 * setting changes (React's `useSyncExternalStore`, "Subscribing to a browser
 * API", read 2026-10-20 through Context7). The server's render assumes it
 * does, so nothing it sends moves.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => query()?.matches ?? false,
    () => true,
  );
}
