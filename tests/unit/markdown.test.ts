import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "@/lib/markdown";

describe("the model's formatting", () => {
  it("keeps bold and inline code", () => {
    expect(parseInline("Henk wants **every** ping, see `henk-4`.")).toEqual([
      { type: "text", text: "Henk wants " },
      { type: "bold", text: "every" },
      { type: "text", text: " ping, see " },
      { type: "code", text: "henk-4" },
      { type: "text", text: "." },
    ]);
  });

  it("reads bullet and numbered lists", () => {
    expect(
      parseMarkdown("Two views:\n- Henk\n* Daan\n\n1. First\n2) Second"),
    ).toEqual([
      { type: "paragraph", lines: [[{ type: "text", text: "Two views:" }]] },
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", text: "Henk" }],
          [{ type: "text", text: "Daan" }],
        ],
      },
      {
        type: "list",
        ordered: true,
        items: [
          [{ type: "text", text: "First" }],
          [{ type: "text", text: "Second" }],
        ],
      },
    ]);
  });

  it("keeps the lines of a paragraph, and splits paragraphs at blank lines", () => {
    expect(parseMarkdown("One\nTwo\n\nThree")).toEqual([
      {
        type: "paragraph",
        lines: [
          [{ type: "text", text: "One" }],
          [{ type: "text", text: "Two" }],
        ],
      },
      { type: "paragraph", lines: [[{ type: "text", text: "Three" }]] },
    ]);
  });

  it.each([
    ["a heading", "## Goals", "Goals"],
    ["italics", "an *important* _point_", "an important point"],
    ["a link", "see [the notes](https://example.com)", "see the notes"],
    ["a quote", "> Henk said so", "Henk said so"],
    ["strikethrough", "~~old~~ new", "old new"],
    ["a stray mark", "half **open", "half open"],
  ])("removes the marks of %s", (_, text, shown) => {
    expect(parseMarkdown(text)).toEqual([
      { type: "paragraph", lines: [[{ type: "text", text: shown }]] },
    ]);
  });

  it("leaves words with underscores or apostrophes alone", () => {
    expect(parseInline("Daan's snake_case list")).toEqual([
      { type: "text", text: "Daan's snake_case list" },
    ]);
  });

  it("drops a horizontal rule", () => {
    expect(parseMarkdown("Above\n---\nBelow")).toEqual([
      { type: "paragraph", lines: [[{ type: "text", text: "Above" }]] },
      { type: "paragraph", lines: [[{ type: "text", text: "Below" }]] },
    ]);
  });
});
