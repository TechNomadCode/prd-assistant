import type { MatcherFunction } from "@testing-library/react";

/**
 * Finds a step's line in the chat by its whole text, for `getByText` and
 * `findByText`: its words sit in several elements ("Search" apart from its
 * query), which the default matcher doesn't join.
 */
export function stepText(text: string | RegExp): MatcherFunction {
  return (_, element) => {
    if (element?.tagName !== "P") return false;
    const content = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    return typeof text === "string" ? content === text : text.test(content);
  };
}
