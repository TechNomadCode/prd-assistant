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

  describe("a table", () => {
    it("shows each row as its own line, the header in bold", () => {
      expect(
        parseMarkdown(
          [
            "Goals:",
            "",
            "| Goal | Metric |",
            "| --- | :---: |",
            "| Fewer forgotten items | Items forgotten a week |",
            "| Faster lists | Minutes per list |",
            "",
            "Which numbers?",
          ].join("\n"),
        ),
      ).toEqual([
        { type: "paragraph", lines: [[{ type: "text", text: "Goals:" }]] },
        {
          type: "paragraph",
          lines: [
            [{ type: "bold", text: "Goal · Metric" }],
            [
              {
                type: "text",
                text: "Fewer forgotten items · Items forgotten a week",
              },
            ],
            [{ type: "text", text: "Faster lists · Minutes per list" }],
          ],
        },
        {
          type: "paragraph",
          lines: [[{ type: "text", text: "Which numbers?" }]],
        },
      ]);
    });

    it("reads rows without outer pipes, keeps the marks in cells and drops empty cells", () => {
      expect(
        parseMarkdown(
          "Goal | Target\n--- | ---\n**Speed** | `X` minutes\nReach | |\nA \\| B | 10",
        ),
      ).toEqual([
        {
          type: "paragraph",
          lines: [
            [{ type: "bold", text: "Goal · Target" }],
            [
              { type: "bold", text: "Speed" },
              { type: "text", text: " · " },
              { type: "code", text: "X" },
              { type: "text", text: " minutes" },
            ],
            [{ type: "text", text: "Reach" }],
            [{ type: "text", text: "A | B · 10" }],
          ],
        },
      ]);
    });

    it("shows rows with no separator as plain lines", () => {
      expect(parseMarkdown("| Henk | every ping |\n| Daan | none |")).toEqual([
        {
          type: "paragraph",
          lines: [
            [{ type: "text", text: "Henk · every ping" }],
            [{ type: "text", text: "Daan · none" }],
          ],
        },
      ]);
    });

    it("leaves a pipe inside a sentence alone", () => {
      expect(parseMarkdown("Henk | Daan\nagree on one list")).toEqual([
        {
          type: "paragraph",
          lines: [
            [{ type: "text", text: "Henk | Daan" }],
            [{ type: "text", text: "agree on one list" }],
          ],
        },
      ]);
    });

    it("drops a separator row that follows nothing", () => {
      expect(parseMarkdown("| --- | --- |\nAfter")).toEqual([
        { type: "paragraph", lines: [[{ type: "text", text: "After" }]] },
      ]);
    });

    const TABLE = {
      type: "paragraph",
      lines: [
        [{ type: "bold", text: "a · b" }],
        [{ type: "text", text: "1 · 2" }],
      ],
    };
    const table = "| a | b |\n|---|---|\n| 1 | 2 |\n";

    it("ends at a list item, a heading or a quote, even one with a pipe", () => {
      expect(parseMarkdown(table + "- Note: A | B\n- second")).toEqual([
        TABLE,
        {
          type: "list",
          ordered: false,
          items: [
            [{ type: "text", text: "Note: A | B" }],
            [{ type: "text", text: "second" }],
          ],
        },
      ]);
      expect(parseMarkdown(table + "## Risks | Mitigations")).toEqual([
        TABLE,
        {
          type: "paragraph",
          lines: [[{ type: "text", text: "Risks | Mitigations" }]],
        },
      ]);
      expect(parseMarkdown(table + "> A | B")).toEqual([
        TABLE,
        { type: "paragraph", lines: [[{ type: "text", text: "A | B" }]] },
      ]);
    });

    it("keeps the text around it in order, and ends an open list", () => {
      expect(parseMarkdown("Intro:\n" + table + "After")).toEqual([
        { type: "paragraph", lines: [[{ type: "text", text: "Intro:" }]] },
        TABLE,
        { type: "paragraph", lines: [[{ type: "text", text: "After" }]] },
      ]);
      expect(parseMarkdown("- one\n" + table + "- two")).toEqual([
        {
          type: "list",
          ordered: false,
          items: [[{ type: "text", text: "one" }]],
        },
        TABLE,
        {
          type: "list",
          ordered: false,
          items: [[{ type: "text", text: "two" }]],
        },
      ]);
    });

    it("drops a separator row between data rows, and a row of empty cells", () => {
      expect(parseMarkdown(table + "|---|---|\n| | |\n| 3 | 4 |")).toEqual([
        {
          type: "paragraph",
          lines: [...TABLE.lines, [{ type: "text", text: "3 · 4" }]],
        },
      ]);
    });

    it("keeps code in a bold header, and takes a single dash as a separator", () => {
      expect(
        parseMarkdown("| Goal | `id` | Metric |\n|-|-|-|\n| x | y | z |"),
      ).toEqual([
        {
          type: "paragraph",
          lines: [
            [
              { type: "bold", text: "Goal · " },
              { type: "code", text: "id" },
              { type: "bold", text: " · Metric" },
            ],
            [{ type: "text", text: "x · y · z" }],
          ],
        },
      ]);
    });

    it("doesn't take a rule under a sentence with a pipe for a table", () => {
      expect(parseMarkdown("Henk | Daan\n---\nBelow")).toEqual([
        { type: "paragraph", lines: [[{ type: "text", text: "Henk | Daan" }]] },
        { type: "paragraph", lines: [[{ type: "text", text: "Below" }]] },
      ]);
    });

    it("reads a quoted table with Windows line endings", () => {
      expect(
        parseMarkdown("> | a | b |\r\n> |---|---|\r\n> | 1 | 2 |"),
      ).toEqual([TABLE]);
    });

    it("keeps a list item with a pipe a list item, even above a separator", () => {
      expect(parseMarkdown("- Price | Qty\n---|---\n| 1 | 2 |")).toEqual([
        {
          type: "list",
          ordered: false,
          items: [[{ type: "text", text: "Price | Qty" }]],
        },
        { type: "paragraph", lines: [[{ type: "text", text: "1 · 2" }]] },
      ]);
    });
  });
});
