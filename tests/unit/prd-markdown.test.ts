import { describe, expect, it } from "vitest";
import { prdMarkdown, sectionMarkdown } from "@/features/prd/prd-markdown";
import type { SavedSection } from "@/lib/chat";
import type { CheckedSection, SectionName } from "@/lib/prd";

// The PRD's download: each statement ends with its sources by name, each name
// with a footnote holding its quotes, and what the code objects to is written
// out under the statement (docs/decisions.md, Design, 2026-10-20).

function prd(...sections: CheckedSection[]) {
  return new Map<SectionName, SavedSection>(
    sections.map((section, order) => [section.section, { section, order }]),
  );
}

const HENK = {
  source: "interview",
  passage: "henk-4",
  interviewee: "Henk",
  question: "How would you want to know when Ineke adds something?",
  answer:
    "I'd like my phone to ping me every time she puts something on the list.",
} as const;

const INTRODUCTION: CheckedSection = {
  section: "Introduction / Overview",
  statements: [
    {
      text: "Henk wants a ping for every item.",
      citations: [
        { ...HENK, quote: "ping me every time", confirmed: true },
        { ...HENK, quote: "on the list", confirmed: true },
        {
          source: "chat",
          quote: "Pings stay on by default.",
          confirmed: true,
          messageId: "visitor-1",
        },
      ],
    },
    {
      text: "Daan keeps the list on paper.",
      citations: [
        {
          ...HENK,
          passage: "daan-2",
          interviewee: "Daan",
          quote: "on a fridge note",
          confirmed: false,
        },
        {
          source: "unknown",
          passage: "daan-9",
          quote: "paper only",
          confirmed: false,
        },
      ],
    },
    { text: "Everyone shops on Saturday.", citations: [] },
    {
      text: "Pings stay on by default.",
      citations: [
        {
          source: "chat",
          quote: "Pings stay on by default.",
          confirmed: true,
          messageId: "visitor-1",
        },
      ],
    },
  ],
};

describe("the PRD as Markdown", () => {
  it("writes every section in order, each statement with its sources' footnotes and what the code objects to under it", () => {
    expect(prdMarkdown(prd(INTRODUCTION))).toBe(
      [
        "# Shared grocery list app",
        "",
        "Product requirements document · Draft · 1 of 9 sections · From six household interviews",
        "",
        "The app's code, not the model, checked every quote word for word against its source. Each name after a statement has a footnote with the quotes it stands for; a quote the check couldn't confirm is marked unverified and written out under its statement. A confirmed quote proves the words are there, not that the statement reads them fairly.",
        "",
        "## Introduction / Overview",
        "",
        "- Henk wants a ping for every item. Sources: Henk[^1]; You, in this chat[^2]",
        "- Daan keeps the list on paper. Sources: Daan[^3]",
        "  - Unverified quote from Daan: “on a fridge note” These words aren't in the answer it cites.",
        "  - Unverified quote: “paper only” There's no passage “daan-9” in the interviews.",
        "- Everyone shops on Saturday.",
        "  - No quote backs this statement.",
        "- Pings stay on by default. Sources: You, in this chat[^4]",
        "  - Your decision, not from the interviews.",
        "",
        "## Goals / Objectives",
        "",
        "Not drafted yet.",
        "",
        "## Target Audience / User Personas",
        "",
        "Not drafted yet.",
        "",
        "## User Stories / Use Cases",
        "",
        "Not drafted yet.",
        "",
        "## Functional Requirements",
        "",
        "Not drafted yet.",
        "",
        "## Non-Functional Requirements",
        "",
        "Not drafted yet.",
        "",
        "## Design Considerations / Mockups",
        "",
        "Not drafted yet.",
        "",
        "## Success Metrics",
        "",
        "Not drafted yet.",
        "",
        "## Open Questions / Future Considerations",
        "",
        "Not drafted yet.",
        "",
        "[^1]: Henk, interview passage henk-4: “ping me every time” · henk-4: “on the list”",
        "[^2]: You, in this chat: “Pings stay on by default.”",
        "[^3]: Daan, interview passage daan-2: “on a fridge note” (unverified)",
        "[^4]: You, in this chat: “Pings stay on by default.”",
        "",
      ].join("\n"),
    );
  });

  it("numbers the footnotes across sections in the PRD's order, not the order they were saved", () => {
    const goals: CheckedSection = {
      section: "Goals / Objectives",
      statements: [
        {
          text: "Fewer double purchases.",
          citations: [{ ...HENK, quote: "on the list", confirmed: true }],
        },
      ],
    };
    const markdown = prdMarkdown(prd(goals, INTRODUCTION));

    expect(markdown).toContain("- Fewer double purchases. Sources: Henk[^5]\n");
    expect(markdown).toContain(
      "[^5]: Henk, interview passage henk-4: “on the list”\n",
    );
    expect(markdown).toContain("2 of 9 sections");
  });

  it("shows the model's words as written: no mark in them is read as Markdown, and a line break becomes a space", () => {
    const markdown = prdMarkdown(
      prd({
        section: "Introduction / Overview",
        statements: [
          { text: "# A *bold* [link](x) <b>tag</b>", citations: [] },
          { text: "1. Not a list\nof two lines", citations: [] },
          { text: "- Not an item | nor_a_cell `code`", citations: [] },
          {
            text: "Quoted",
            citations: [{ ...HENK, quote: "ping *me* [1]", confirmed: true }],
          },
        ],
      }),
    );

    expect(markdown).toContain(
      "- \\# A \\*bold\\* \\[link\\](x) \\<b\\>tag\\</b\\>\n",
    );
    expect(markdown).toContain("- 1\\. Not a list of two lines\n");
    expect(markdown).toContain(
      "- \\- Not an item \\| nor\\_a\\_cell \\`code\\`\n",
    );
    expect(markdown).toContain(
      "[^1]: Henk, interview passage henk-4: “ping \\*me\\* \\[1\\]”\n",
    );
  });

  it("writes an empty PRD as its nine headings, with no footnotes", () => {
    const markdown = prdMarkdown(prd());

    expect(markdown).toContain("0 of 9 sections");
    expect(markdown.match(/^## /gm)).toHaveLength(9);
    expect(markdown.match(/^Not drafted yet\.$/gm)).toHaveLength(9);
    expect(markdown).not.toContain("[^");
  });
});

describe("a section as Markdown, for the clipboard", () => {
  it("writes the heading, each statement with its sources' footnotes and what the code objects to, then the footnotes", () => {
    expect(
      sectionMarkdown("Introduction / Overview", {
        section: INTRODUCTION,
        order: 0,
      }),
    ).toBe(
      [
        "## Introduction / Overview",
        "",
        "- Henk wants a ping for every item. Sources: Henk[^1]; You, in this chat[^2]",
        "- Daan keeps the list on paper. Sources: Daan[^3]",
        "  - Unverified quote from Daan: “on a fridge note” These words aren't in the answer it cites.",
        "  - Unverified quote: “paper only” There's no passage “daan-9” in the interviews.",
        "- Everyone shops on Saturday.",
        "  - No quote backs this statement.",
        "- Pings stay on by default. Sources: You, in this chat[^4]",
        "  - Your decision, not from the interviews.",
        "",
        "[^1]: Henk, interview passage henk-4: “ping me every time” · henk-4: “on the list”",
        "[^2]: You, in this chat: “Pings stay on by default.”",
        "[^3]: Daan, interview passage daan-2: “on a fridge note” (unverified)",
        "[^4]: You, in this chat: “Pings stay on by default.”",
        "",
      ].join("\n"),
    );
  });

  it("numbers the footnotes within the section, whatever comes before it in the PRD", () => {
    const goals: CheckedSection = {
      section: "Goals / Objectives",
      statements: [
        {
          text: "Fewer *double* purchases.",
          citations: [{ ...HENK, quote: "on the list", confirmed: true }],
        },
      ],
    };

    expect(
      sectionMarkdown("Goals / Objectives", { section: goals, order: 1 }),
    ).toBe(
      [
        "## Goals / Objectives",
        "",
        "- Fewer \\*double\\* purchases. Sources: Henk[^1]",
        "",
        "[^1]: Henk, interview passage henk-4: “on the list”",
        "",
      ].join("\n"),
    );
  });

  it("writes a section whose statements cite nothing without footnotes", () => {
    expect(
      sectionMarkdown("Open Questions / Future Considerations", {
        section: {
          section: "Open Questions / Future Considerations",
          statements: [{ text: "Who pays for delivery?", citations: [] }],
        },
        order: 2,
      }),
    ).toBe(
      "## Open Questions / Future Considerations\n\n- Who pays for delivery?\n",
    );
  });
});
