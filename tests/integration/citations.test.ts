import { describe, expect, it } from "vitest";
import type { SectionDraft } from "@/lib/prd";
import { checkSection, findPassages } from "@/server/citations";

// The citation check against the sample notes in the local database, read
// with the app's read key, the way the chat reads them.

describe("finding the cited passages", () => {
  it("reads each passage with whose answer it is, and leaves out ids that name none", async () => {
    const found = await findPassages([
      "henk-4",
      "daan-1",
      "daan-99",
      "nobody-1",
      "not a passage",
    ]);

    expect(
      found.map((passage) => [passage.passage, passage.participant]).sort(),
    ).toEqual([
      ["daan-1", "Daan"],
      ["henk-4", "Henk"],
    ]);
    expect(found.find((passage) => passage.passage === "henk-4")).toEqual({
      passage: "henk-4",
      participant: "Henk",
      question: "How would you want to know when Ineke adds something?",
      answer: expect.stringMatching(
        /^I'd like my phone to ping me every time she puts something on the list\. Every single item, yes\./,
      ),
    });
  });

  it("reads nothing when a section cites no passage", async () => {
    expect(await findPassages([])).toEqual([]);
  });
});

describe("checking quotes against the stored interviews", () => {
  async function check(draft: SectionDraft) {
    const passages = await findPassages(
      draft.statements.flatMap((statement) =>
        statement.citations.map((citation) => citation.source),
      ),
    );
    return checkSection(draft, { passages, visitorMessages: [] });
  }

  it("confirms the interviewee's words, and never the researcher's", async () => {
    const checked = await check({
      section: "Introduction / Overview",
      statements: [
        {
          text: "Henk wants a ping for every item.",
          citations: [{ source: "henk-4", quote: "Every single item, yes." }],
        },
        {
          text: "Henk was asked how he wants to hear about new items.",
          citations: [
            {
              source: "henk-4",
              quote: "How would you want to know when Ineke adds something?",
            },
          ],
        },
        {
          text: "Daan wants a ping for every item too.",
          citations: [
            {
              source: "daan-5",
              quote: "I'd like my phone to ping me every time",
            },
          ],
        },
      ],
    });

    expect(
      checked.statements.map((statement) =>
        statement.citations.map((citation) => citation.confirmed),
      ),
    ).toEqual([[true], [false], [false]]);
  });

  it("confirms words that exist under a statement that reads them unfairly: the check can't judge that", async () => {
    // Henk's words come close to dark mode, but he never asks for it. The
    // quote sits next to the statement so the reader can see the stretch.
    const checked = await check({
      section: "Functional Requirements",
      statements: [
        {
          text: "Henk asked for a dark mode.",
          citations: [
            { source: "henk-3", quote: "Black on white or white on black" },
          ],
        },
      ],
    });

    expect(checked.statements[0]?.citations).toEqual([
      {
        source: "interview",
        passage: "henk-3",
        interviewee: "Henk",
        quote: "Black on white or white on black",
        confirmed: true,
      },
    ]);
  });
});
