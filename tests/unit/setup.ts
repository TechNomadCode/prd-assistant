import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  // The workspace keeps the conversation in the browser; no test inherits one.
  if (typeof window !== "undefined") window.localStorage.clear();
});
