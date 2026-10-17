import { describe, expect, it } from "vitest";
import {
  isFlagged,
  nextSection,
  OPEN_QUESTIONS,
  tally,
  type CheckedSection,
  type SectionDraft,
} from "@/lib/prd";
import type { SourcePassage } from "@/lib/transcripts";
import {
  checkSection,
  citedPassages,
  quoteIsIn,
  type QuoteSources,
} from "@/server/citations";

const DAAN_5: SourcePassage = {
  passage: "daan-5",
  participant: "Daan",
  question: "How would you want to hear about new items?",
  answer:
    "Not as they come in. A buzz for every item, with three kids adding things? I'd have it off my phone by the weekend. I look at the list when I'm about to go shopping.",
};

const DAAN_2: SourcePassage = {
  passage: "daan-2",
  participant: "Daan",
  question: "What goes wrong?",
  answer:
    'Forgetting. And "crisps" is on the list every single day. I don\'t know who wrote it.',
};

const HENK_4: SourcePassage = {
  passage: "henk-4",
  participant: "Henk",
  question: "How would you want to know when Ineke adds something?",
  answer:
    "I'd like my phone to ping me every time she puts something on the list. Every single item, yes.",
};

const SOURCES: QuoteSources = {
  passages: [DAAN_5, DAAN_2, HENK_4],
  visitorMessages: [
    { id: "visitor-1", text: "Draft the first section." },
    { id: "visitor-2", text: "Our goal is 500 households in the first year." },
  ],
};

function draft(...statements: SectionDraft["statements"]): SectionDraft {
  return { section: "Introduction / Overview", statements };
}

/** The one citation of a one-statement section, after the check. */
function checkOne(source: string, quote: string) {
  const checked = checkSection(
    draft({ text: "A statement.", citations: [{ source, quote }] }),
    SOURCES,
  );
  return checked.statements[0]?.citations[0];
}

describe("matching a quote", () => {
  const answer = HENK_4.answer;

  it("finds the same words in the same order", () => {
    expect(quoteIsIn("ping me every time she puts something", answer)).toBe(
      true,
    );
  });

  it.each([
    ["letter case", "PING ME every time"],
    ["spacing", "ping  me\nevery   time"],
    ["curly quotes", "I’d like my phone"],
    ["punctuation at the ends", "“…Every single item, yes.”"],
    ["a full stop the source doesn't have there", "ping me every time."],
  ])("ignores %s", (_, quote) => {
    expect(quoteIsIn(quote, answer)).toBe(true);
  });

  it("treats every style of quote mark as one", () => {
    expect(quoteIsIn("And ‘crisps’ is on the list", DAAN_2.answer)).toBe(true);
    expect(quoteIsIn("And “crisps” is on the list", DAAN_2.answer)).toBe(true);
  });

  it.each([
    ["a changed word", "ping me every single time", answer],
    ["a dropped comma inside", "Every single item yes", answer],
    [
      "words left out inside",
      "I'd like my phone to ping me … on the list",
      answer,
    ],
    ["words in another order", "every time ping me", answer],
    ["the end of a word", "ike my phone", answer],
    ["a word cut off", "ping me every tim", answer],
    ["the start of a contraction", "I don", DAAN_2.answer],
    ["the end of a contraction", "t know who wrote it", DAAN_2.answer],
    ["nothing but punctuation", "…", answer],
    ["nothing at all", "   ", answer],
  ])("refuses %s", (_, quote, text) => {
    expect(quoteIsIn(quote, text)).toBe(false);
  });

  it("finds whole words after a word that only looked like a match", () => {
    // The first "list" is part of "lists"; the second stands alone.
    expect(quoteIsIn("list", "Two lists, one list.")).toBe(true);
  });
});

describe("checking a section", () => {
  it("confirms an interview quote from the cited answer, naming the interviewee from the database", () => {
    expect(
      checkOne("daan-5", "I look at the list when I'm about to go shopping"),
    ).toEqual({
      source: "interview",
      passage: "daan-5",
      interviewee: "Daan",
      quote: "I look at the list when I'm about to go shopping",
      confirmed: true,
    });
  });

  it("reads a source in any case, with spaces around it", () => {
    expect(checkOne(" Daan-5 ", "Not as they come in")).toMatchObject({
      source: "interview",
      passage: "daan-5",
      confirmed: true,
    });
  });

  it("marks a quote from the researcher's question unverified, although the passage holds it", () => {
    expect(
      checkOne("daan-5", "How would you want to hear about new items?"),
    ).toMatchObject({
      source: "interview",
      interviewee: "Daan",
      confirmed: false,
    });
  });

  it("marks a quote from another person's answer unverified", () => {
    expect(
      checkOne("daan-5", "ping me every time she puts something on the list"),
    ).toMatchObject({
      source: "interview",
      interviewee: "Daan",
      confirmed: false,
    });
  });

  it("marks a quote from another answer of the same person unverified", () => {
    // The words are Daan's, but from daan-2.
    expect(checkOne("daan-5", "on the list every single day")).toMatchObject({
      passage: "daan-5",
      confirmed: false,
    });
  });

  it("marks a quote unverified when its source names no passage", () => {
    expect(checkOne("grocery-1", "deliver it to my door")).toEqual({
      source: "unknown",
      passage: "grocery-1",
      quote: "deliver it to my door",
      confirmed: false,
    });
  });

  it("confirms a quote from the visitor's own message, with the message it comes from", () => {
    expect(checkOne("chat", "500 households in the first year")).toEqual({
      source: "chat",
      quote: "500 households in the first year",
      confirmed: true,
      messageId: "visitor-2",
    });
  });

  it("takes the latest of the visitor's messages that hold the words", () => {
    const checked = checkSection(
      draft({
        text: "The first section comes first.",
        citations: [{ source: "chat", quote: "the first" }],
      }),
      SOURCES,
    );

    expect(checked.statements[0]?.citations[0]).toMatchObject({
      confirmed: true,
      messageId: "visitor-2",
    });
  });

  it("marks a quote unverified when the visitor never wrote it", () => {
    expect(checkOne("Chat", "users asked for grocery delivery")).toEqual({
      source: "chat",
      quote: "users asked for grocery delivery",
      confirmed: false,
    });
  });

  it("keeps every statement in order, also one that cites nothing", () => {
    const section = draft(
      {
        text: "Daan checks the list before he shops.",
        citations: [{ source: "daan-5", quote: "I look at the list" }],
      },
      { text: "Households want fewer trips.", citations: [] },
    );

    const checked = checkSection(section, SOURCES);

    expect(checked.section).toBe("Introduction / Overview");
    expect(checked.statements.map((statement) => statement.text)).toEqual([
      "Daan checks the list before he shops.",
      "Households want fewer trips.",
    ]);
    expect(checked.statements[1]?.citations).toEqual([]);
  });

  it("carries a contradiction: both views with their citations, and an open question citing both", () => {
    const checked = checkSection(
      draft(
        {
          text: "Henk wants a notification for every item.",
          citations: [{ source: "henk-4", quote: "Every single item, yes" }],
        },
        {
          text: "Daan would turn such notifications off.",
          citations: [
            {
              source: "daan-5",
              quote: "I'd have it off my phone by the weekend",
            },
          ],
        },
        {
          text: "Open question: notify on every item, or not as they come in?",
          citations: [
            { source: "henk-4", quote: "ping me every time" },
            { source: "daan-5", quote: "Not as they come in" },
          ],
        },
      ),
      SOURCES,
    );

    expect(
      checked.statements.map((statement) =>
        statement.citations.map((citation) => citation.confirmed),
      ),
    ).toEqual([[true], [true], [true, true]]);
  });

  it("lists the passages a draft cites once each, without the visitor's words", () => {
    expect(
      citedPassages(
        draft(
          {
            text: "One.",
            citations: [
              { source: "henk-4", quote: "a" },
              { source: "chat", quote: "b" },
            ],
          },
          {
            text: "Two.",
            citations: [
              { source: "Henk-4", quote: "c" },
              { source: "daan-5", quote: "d" },
            ],
          },
        ),
      ),
    ).toEqual(["henk-4", "daan-5"]);
  });
});

describe("what the check found", () => {
  const section: CheckedSection = {
    section: "Goals / Objectives",
    statements: [
      {
        text: "Fewer trips back to the shop.",
        citations: [
          {
            source: "interview",
            passage: "daan-2",
            interviewee: "Daan",
            quote: "Forgetting",
            confirmed: true,
          },
          { source: "chat", quote: "made up", confirmed: false },
        ],
      },
      { text: "Cites nothing.", citations: [] },
    ],
  };

  it("counts the quotes, the confirmed ones and the statements that cite nothing", () => {
    expect(tally(section)).toEqual({ quotes: 2, confirmed: 1, flagged: 1 });
  });

  it("flags a statement that cites nothing, except in Open Questions", () => {
    const uncited = { citations: [] };
    expect(isFlagged("Success Metrics", uncited)).toBe(true);
    expect(isFlagged(OPEN_QUESTIONS, uncited)).toBe(false);
    expect(isFlagged("Success Metrics", { citations: [{}] })).toBe(false);
  });

  it("names the section after each one, and none after the last", () => {
    expect(nextSection("Introduction / Overview")).toBe("Goals / Objectives");
    expect(nextSection(OPEN_QUESTIONS)).toBeUndefined();
  });
});
