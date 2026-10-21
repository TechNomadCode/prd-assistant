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

  describe("a line break", () => {
    it.each(["<br>", "<br/>", "<br />", "<BR>", "<Br />"])(
      "reads %s as a line break",
      (br) => {
        expect(parseMarkdown(`Henk wants pings${br}Daan doesn't`)).toEqual([
          {
            type: "paragraph",
            lines: [
              [
                { type: "text", text: "Henk wants pings" },
                { type: "break" },
                { type: "text", text: "Daan doesn't" },
              ],
            ],
          },
        ]);
      },
    );

    it("breaks a list item and a bold run, without the spaces around the break", () => {
      expect(
        parseMarkdown(
          "- **Henk <br> Ineke** want pings <br/> every time\n- Daan",
        ),
      ).toEqual([
        {
          type: "list",
          ordered: false,
          items: [
            [
              { type: "bold", text: "Henk" },
              { type: "break" },
              { type: "bold", text: "Ineke" },
              { type: "text", text: " want pings" },
              { type: "break" },
              { type: "text", text: "every time" },
            ],
            [{ type: "text", text: "Daan" }],
          ],
        },
      ]);
    });

    it("drops a break at either end of a line, and reads a line of breaks as a blank line", () => {
      expect(parseMarkdown("<br>One<br>\n <br> <br/>\nTwo<br />")).toEqual([
        { type: "paragraph", lines: [[{ type: "text", text: "One" }]] },
        { type: "paragraph", lines: [[{ type: "text", text: "Two" }]] },
      ]);
    });

    it("keeps <br> in inline code as typed", () => {
      expect(parseInline("Write `<br>` for a break")).toEqual([
        { type: "text", text: "Write " },
        { type: "code", text: "<br>" },
        { type: "text", text: " for a break" },
      ]);
    });

    it("shows any other HTML as typed", () => {
      expect(parseInline("<b>Henk</b> said <p>so</p><hr>")).toEqual([
        { type: "text", text: "<b>Henk</b> said <p>so</p><hr>" },
      ]);
    });
  });

  describe("a table", () => {
    /** A cell of plain text, a line break between its lines. */
    const cell = (...lines: string[]) =>
      lines.flatMap((text, index) => [
        ...(index > 0 ? [{ type: "break" }] : []),
        { type: "text", text },
      ]);
    /** A cell of bold text. */
    const bold = (text: string) => [{ type: "bold", text }];

    it("reads its header's cells and its rows' cells, the text around it kept in order", () => {
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
          type: "table",
          header: [cell("Goal"), cell("Metric")],
          rows: [
            [cell("Fewer forgotten items"), cell("Items forgotten a week")],
            [cell("Faster lists"), cell("Minutes per list")],
          ],
        },
        {
          type: "paragraph",
          lines: [[{ type: "text", text: "Which numbers?" }]],
        },
      ]);
    });

    it("reads rows without outer pipes, keeps the marks in cells and keeps an empty cell empty", () => {
      expect(
        parseMarkdown(
          "Goal | Target\n--- | ---\n**Speed** | `X` minutes\nReach | |\nA \\| B | 10",
        ),
      ).toEqual([
        {
          type: "table",
          header: [cell("Goal"), cell("Target")],
          rows: [
            [
              bold("Speed"),
              [
                { type: "code", text: "X" },
                { type: "text", text: " minutes" },
              ],
            ],
            [cell("Reach"), []],
            [cell("A | B"), cell("10")],
          ],
        },
      ]);
    });

    it("reads rows with no separator as a table without a header", () => {
      expect(parseMarkdown("| Henk | every ping |\n| Daan | none |")).toEqual([
        {
          type: "table",
          rows: [
            [cell("Henk"), cell("every ping")],
            [cell("Daan"), cell("none")],
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
      type: "table",
      header: [cell("a"), cell("b")],
      rows: [[cell("1"), cell("2")]],
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
        { ...TABLE, rows: [...TABLE.rows, [cell("3"), cell("4")]] },
      ]);
    });

    it("drops a header without a name, and keeps a header without rows", () => {
      expect(parseMarkdown("| | |\n|---|---|\n| 1 | 2 |")).toEqual([
        { type: "table", rows: [[cell("1"), cell("2")]] },
      ]);
      expect(parseMarkdown("| a | b |\n|---|---|\n| | |")).toEqual([
        { type: "table", header: [cell("a"), cell("b")], rows: [] },
      ]);
      expect(parseMarkdown("| | |\n|---|---|\n| | |\n\nAfter")).toEqual([
        { type: "paragraph", lines: [[{ type: "text", text: "After" }]] },
      ]);
    });

    it("keeps code in a header, and takes a single dash as a separator", () => {
      expect(
        parseMarkdown("| Goal | `id` | Metric |\n|-|-|-|\n| x | y | z |"),
      ).toEqual([
        {
          type: "table",
          header: [
            cell("Goal"),
            [{ type: "code", text: "id" }],
            cell("Metric"),
          ],
          rows: [[cell("x"), cell("y"), cell("z")]],
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
        { type: "table", rows: [[cell("1"), cell("2")]] },
      ]);
    });

    it("reads a table whose cells hold several points, each <br> a line break in its cell (seen on staging, 2026-10-19)", () => {
      expect(
        parseMarkdown(
          [
            "Three personas stand out:",
            "",
            "| Persona | Who they are | Needs | Pain points |",
            "|---|---|---|---|",
            "| **The planner** (Maya) | • Plans the week's meals<br>• Shops once a week | • One shared list<br>• Items in aisle order | • Forgotten items<br>• Buying things twice |",
            "| **The quick adder** (Henk) | • Adds items as he thinks of them | • A ping for every item<br>• Adding in one tap | • Missing what Ineke added |",
          ].join("\n"),
        ),
      ).toEqual([
        {
          type: "paragraph",
          lines: [[{ type: "text", text: "Three personas stand out:" }]],
        },
        {
          type: "table",
          header: [
            cell("Persona"),
            cell("Who they are"),
            cell("Needs"),
            cell("Pain points"),
          ],
          rows: [
            [
              [...bold("The planner"), { type: "text", text: " (Maya)" }],
              cell("• Plans the week's meals", "• Shops once a week"),
              cell("• One shared list", "• Items in aisle order"),
              cell("• Forgotten items", "• Buying things twice"),
            ],
            [
              [...bold("The quick adder"), { type: "text", text: " (Henk)" }],
              cell("• Adds items as he thinks of them"),
              cell("• A ping for every item", "• Adding in one tap"),
              cell("• Missing what Ineke added"),
            ],
          ],
        },
      ]);
    });

    it("keeps an empty cell and an empty header name in their places, and a row's cells beyond the header", () => {
      expect(
        parseMarkdown(
          [
            "| Persona | | Needs |",
            "|---|---|---|",
            "| Maya | Shops weekly | • One shared list<br>• Aisle order | Since 2024 |",
            "| | • A ping for every item | <br> |",
          ].join("\n"),
        ),
      ).toEqual([
        {
          type: "table",
          header: [cell("Persona"), [], cell("Needs")],
          rows: [
            [
              cell("Maya"),
              cell("Shops weekly"),
              cell("• One shared list", "• Aisle order"),
              cell("Since 2024"),
            ],
            [[], cell("• A ping for every item"), []],
          ],
        },
      ]);
    });

    it("keeps a break inside a header's cell, drops one at a cell's edge, and shows <br> in code as typed", () => {
      expect(
        parseMarkdown(
          [
            "| Persona<br>(who) | Needs |",
            "|---|---|",
            "| <br>Maya<br> | <br> |",
            "| Henk | • Quick add<br/> |",
            "| Daan | Write `<br>` for a break |",
          ].join("\n"),
        ),
      ).toEqual([
        {
          type: "table",
          header: [cell("Persona", "(who)"), cell("Needs")],
          rows: [
            [cell("Maya"), []],
            [cell("Henk"), cell("• Quick add")],
            [
              cell("Daan"),
              [
                { type: "text", text: "Write " },
                { type: "code", text: "<br>" },
                { type: "text", text: " for a break" },
              ],
            ],
          ],
        },
      ]);
    });

    it("drops a break at a cell's edge inside its marks, leaving a cell of only a marked break empty", () => {
      expect(
        parseMarkdown(
          [
            "| **Persona<br>** | Needs |",
            "|---|---|",
            "| **Maya<br>** | **<br>One list** |",
            "| *Henk<br>* | A ping |",
            "| Daan | **<br>** |",
          ].join("\n"),
        ),
      ).toEqual([
        {
          type: "table",
          header: [bold("Persona"), cell("Needs")],
          rows: [
            [bold("Maya"), bold("One list")],
            [cell("Henk"), cell("A ping")],
            [cell("Daan"), []],
          ],
        },
      ]);
    });
  });
});
