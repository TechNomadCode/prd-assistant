import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no ResizeObserver, and nothing there has a size that changes.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  cleanup();
  // The workspace keeps the conversation in the browser; no test inherits one.
  if (typeof window !== "undefined") window.localStorage.clear();
});
