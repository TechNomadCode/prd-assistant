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
    it("shows each row as its own block, the header in bold", () => {
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
          rows: [
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
          type: "table",
          rows: [
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

    it("shows rows with no separator as plain rows", () => {
      expect(parseMarkdown("| Henk | every ping |\n| Daan | none |")).toEqual([
        {
          type: "table",
          rows: [
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
      type: "table",
      rows: [
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
          type: "table",
          rows: [...TABLE.rows, [{ type: "text", text: "3 · 4" }]],
        },
      ]);
    });

    it("keeps code in a bold header, and takes a single dash as a separator", () => {
      expect(
        parseMarkdown("| Goal | `id` | Metric |\n|-|-|-|\n| x | y | z |"),
      ).toEqual([
        {
          type: "table",
          rows: [
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
        { type: "table", rows: [[{ type: "text", text: "1 · 2" }]] },
      ]);
    });

    /** Bold text, as a card's title or a column's name. */
    const bold = (text: string) => [{ type: "bold", text }];
    /** A cell's text, a line break between its lines. */
    const cell = (...lines: string[]) =>
      lines.flatMap((text, index) => [
        ...(index > 0 ? [{ type: "break" }] : []),
        { type: "text", text },
      ]);

    it("shows a table whose cells hold several points as one card per row, each further cell under its column's name (seen on staging, 2026-10-19)", () => {
      expect(
        parseMarkdown(
          [
            "Three personas stand out:",
            "",
            "| Persona | Who they are | Needs | Pain points |",
            "|---|---|---|---|",
            "| **The planner** (Maya) | • Plans the week's meals<br>• Shops once a week | • One shared list<br>• Items in aisle order | • Forgotten items<br>• Buying things twice |",
            "| **The quick adder** (Henk) | • Adds items as he thinks of them | • A ping for every item<br>• Adding in one tap | • Missing what Ineke added |",
            "| **The quiet one** (Daan) | • Checks the list in the store | • No pings while working | • Too many notifications<br>• Bad signal in the store |",
          ].join("\n"),
        ),
      ).toEqual([
        {
          type: "paragraph",
          lines: [[{ type: "text", text: "Three personas stand out:" }]],
        },
        {
          type: "cards",
          cards: [
            {
              title: bold("The planner (Maya)"),
              fields: [
                {
                  label: bold("Who they are"),
                  value: cell(
                    "• Plans the week's meals",
                    "• Shops once a week",
                  ),
                },
                {
                  label: bold("Needs"),
                  value: cell("• One shared list", "• Items in aisle order"),
                },
                {
                  label: bold("Pain points"),
                  value: cell("• Forgotten items", "• Buying things twice"),
                },
              ],
            },
            {
              title: bold("The quick adder (Henk)"),
              fields: [
                {
                  label: bold("Who they are"),
                  value: cell("• Adds items as he thinks of them"),
                },
                {
                  label: bold("Needs"),
                  value: cell("• A ping for every item", "• Adding in one tap"),
                },
                {
                  label: bold("Pain points"),
                  value: cell("• Missing what Ineke added"),
                },
              ],
            },
            {
              title: bold("The quiet one (Daan)"),
              fields: [
                {
                  label: bold("Who they are"),
                  value: cell("• Checks the list in the store"),
                },
                {
                  label: bold("Needs"),
                  value: cell("• No pings while working"),
                },
                {
                  label: bold("Pain points"),
                  value: cell(
                    "• Too many notifications",
                    "• Bad signal in the store",
                  ),
                },
              ],
            },
          ],
        },
      ]);
    });

    it("shows the staging table as the owner's preview: a card per row, titled by its first cell, each further cell under its column's name (2026-10-20)", () => {
      expect(
        parseMarkdown(
          [
            "| Persona | Who they are | Needs | Pain points |",
            "|---|---|---|---|",
            "| Maya | Parent of two<br>Shops weekly | • One shared list<br>• Aisle order | • Duplicates<br>• Forgotten items |",
            "| Henk | Retired | • A ping for every item | • Missing what Ineke adds |",
          ].join("\n"),
        ),
      ).toEqual([
        {
          type: "cards",
          cards: [
            {
              title: bold("Maya"),
              fields: [
                {
                  label: bold("Who they are"),
                  value: cell("Parent of two", "Shops weekly"),
                },
                {
                  label: bold("Needs"),
                  value: cell("• One shared list", "• Aisle order"),
                },
                {
                  label: bold("Pain points"),
                  value: cell("• Duplicates", "• Forgotten items"),
                },
              ],
            },
            {
              title: bold("Henk"),
              fields: [
                { label: bold("Who they are"), value: cell("Retired") },
                {
                  label: bold("Needs"),
                  value: cell("• A ping for every item"),
                },
                {
                  label: bold("Pain points"),
                  value: cell("• Missing what Ineke adds"),
                },
              ],
            },
          ],
        },
      ]);
    });

    it("leaves an empty cell out with its label, a card's title when its first cell is empty, and a row of empty cells", () => {
      expect(
        parseMarkdown(
          [
            "| Persona | Needs | Pain points |",
            "|---|---|---|",
            "| Maya | | • Duplicates<br>• Forgotten items |",
            "| | • A ping for every item | <br> |",
            "| | | |",
          ].join("\n"),
        ),
      ).toEqual([
        {
          type: "cards",
          cards: [
            {
              title: bold("Maya"),
              fields: [
                {
                  label: bold("Pain points"),
                  value: cell("• Duplicates", "• Forgotten items"),
                },
              ],
            },
            {
              fields: [
                {
                  label: bold("Needs"),
                  value: cell("• A ping for every item"),
                },
              ],
            },
          ],
        },
      ]);
    });

    it("shows a table without a separator row as cards without labels", () => {
      expect(
        parseMarkdown(
          "| Maya | Parent of two<br>Shops weekly | • One shared list |\n| Henk | Retired |",
        ),
      ).toEqual([
        {
          type: "cards",
          cards: [
            {
              title: bold("Maya"),
              fields: [
                { value: cell("Parent of two", "Shops weekly") },
                { value: cell("• One shared list") },
              ],
            },
            { title: bold("Henk"), fields: [{ value: cell("Retired") }] },
          ],
        },
      ]);
    });

    it("shows a cell without a header name without a label: one beyond the header's names, or under an empty name", () => {
      expect(
        parseMarkdown(
          [
            "| Persona | | Needs |",
            "|---|---|---|",
            "| Maya | Shops weekly | • One shared list<br>• Aisle order | Since 2024 |",
          ].join("\n"),
        ),
      ).toEqual([
        {
          type: "cards",
          cards: [
            {
              title: bold("Maya"),
              fields: [
                { value: cell("Shops weekly") },
                {
                  label: bold("Needs"),
                  value: cell("• One shared list", "• Aisle order"),
                },
                { value: cell("Since 2024") },
              ],
            },
          ],
        },
      ]);
    });

    it("switches per table: one with no line break inside a cell below its header stays one line per row", () => {
      expect(
        parseMarkdown(
          [
            "| Persona | Needs |",
            "|---|---|",
            "| Maya | • One shared list<br>• Aisle order |",
            "",
            "| Goal<br>(why) | Metric |",
            "|---|---|",
            "| Fewer forgotten items | Write `<br>` for a break |",
            "| <br>Faster lists<br> | Minutes per list |",
          ].join("\n"),
        ),
      ).toEqual([
        {
          type: "cards",
          cards: [
            {
              title: bold("Maya"),
              fields: [
                {
                  label: bold("Needs"),
                  value: cell("• One shared list", "• Aisle order"),
                },
              ],
            },
          ],
        },
        {
          type: "table",
          rows: [
            [
              { type: "bold", text: "Goal" },
              { type: "break" },
              { type: "bold", text: "(why) · Metric" },
            ],
            [
              { type: "text", text: "Fewer forgotten items · Write " },
              { type: "code", text: "<br>" },
              { type: "text", text: " for a break" },
            ],
            [{ type: "text", text: "Faster lists · Minutes per list" }],
          ],
        },
      ]);
    });

    it("keeps a header bold across a break, and drops a break at a cell's edge and a cell of only a break", () => {
      expect(
        parseMarkdown(
          "| Persona<br>(who) | Needs |\n|---|---|\n| <br>Maya<br> | <br> |\n| Henk | • Quick add<br/> |",
        ),
      ).toEqual([
        {
          type: "table",
          rows: [
            [
              { type: "bold", text: "Persona" },
              { type: "break" },
              { type: "bold", text: "(who) · Needs" },
            ],
            [{ type: "text", text: "Maya" }],
            [{ type: "text", text: "Henk · • Quick add" }],
          ],
        },
      ]);
    });

    it("drops a break at a cell's edge inside its marks, and a cell of only a marked break", () => {
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
          rows: [
            [{ type: "bold", text: "Persona · Needs" }],
            [
              { type: "bold", text: "Maya" },
              { type: "text", text: " · " },
              { type: "bold", text: "One list" },
            ],
            [{ type: "text", text: "Henk · A ping" }],
            [{ type: "text", text: "Daan" }],
          ],
        },
      ]);
    });
  });
});
