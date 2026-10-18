import { describe, expect, it } from "vitest";
import { latestSave, savedSections, type ChatMessage } from "@/lib/chat";
import {
  firstUndrafted,
  isVisitorDecision,
  sectionAnchor,
  sourcesOf,
  type CheckedCitation,
  type CheckedSection,
} from "@/lib/prd";

function interview(interviewee: string, passage: string): CheckedCitation {
  return {
    source: "interview",
    passage,
    interviewee,
    question: "Q?",
    answer: "A.",
    quote: "A",
    confirmed: true,
  };
}

const CHAT: CheckedCitation = {
  source: "chat",
  quote: "my words",
  confirmed: true,
  messageId: "visitor-1",
};

function saving(section: CheckedSection): ChatMessage["parts"][number] {
  return {
    type: "tool-saveSection",
    toolCallId: `save-${section.section}-${section.statements.length}`,
    state: "output-available",
    input: { section: section.section, statements: [] },
    output: section,
  };
}

describe("the PRD from the conversation", () => {
  const first: CheckedSection = {
    section: "Introduction / Overview",
    statements: [{ text: "First save.", citations: [] }],
  };
  const again: CheckedSection = {
    section: "Introduction / Overview",
    statements: [
      { text: "Second save.", citations: [] },
      { text: "With more.", citations: [] },
    ],
  };
  const goals: CheckedSection = {
    section: "Goals / Objectives",
    statements: [{ text: "A goal.", citations: [] }],
  };

  it("shows the latest save of each section", () => {
    const sections = savedSections([
      { role: "user", parts: [{ type: "text", text: "Draft it." }] },
      { role: "assistant", parts: [saving(first)] },
      { role: "assistant", parts: [saving(goals), saving(again)] },
    ]);

    expect(sections.get("Introduction / Overview")?.section).toBe(again);
    expect(sections.get("Goals / Objectives")?.section).toBe(goals);
    expect(latestSave(sections)?.section).toBe(again);
  });

  it("leaves out a save that is still running or failed", () => {
    const sections = savedSections([
      {
        role: "assistant",
        parts: [
          {
            type: "tool-saveSection",
            toolCallId: "save-1",
            state: "input-available",
            input: { section: "Introduction / Overview", statements: [] },
          },
          {
            type: "tool-saveSection",
            toolCallId: "save-2",
            state: "output-error",
            input: { section: "Goals / Objectives", statements: [] },
            errorText: "It wasn't saved.",
          },
        ],
      },
    ]);

    expect(sections.size).toBe(0);
    expect(latestSave(sections)).toBeUndefined();
  });

  it("names the first section in the PRD's order that isn't drafted yet", () => {
    expect(firstUndrafted(new Set())).toBe("Introduction / Overview");
    expect(firstUndrafted(new Set(["Goals / Objectives"]))).toBe(
      "Introduction / Overview",
    );
    expect(
      firstUndrafted(
        new Set(["Introduction / Overview", "Goals / Objectives"]),
      ),
    ).toBe("Target Audience / User Personas");
  });

  it("gives each section a stable anchor", () => {
    expect(sectionAnchor("Target Audience / User Personas")).toBe(
      "prd-target-audience-user-personas",
    );
  });
});

describe("a statement's sources", () => {
  it("names each source once, in the order cited, with all its quotes", () => {
    const maya1 = interview("Maya", "maya-1");
    const daan = interview("Daan", "daan-2");
    const maya3 = interview("Maya", "maya-3");

    expect(
      sourcesOf({ text: "A.", citations: [maya1, daan, CHAT, maya3] }),
    ).toEqual([
      { name: "Maya", citations: [maya1, maya3] },
      { name: "Daan", citations: [daan] },
      { name: "You, in this chat", citations: [CHAT] },
    ]);
  });

  it("gives no name to a source that names no passage", () => {
    expect(
      sourcesOf({
        text: "A.",
        citations: [
          { source: "unknown", passage: "x-1", quote: "q", confirmed: false },
        ],
      }),
    ).toEqual([]);
  });
});

describe("the visitor's decision", () => {
  it("is a statement whose quotes all come from the visitor's messages", () => {
    expect(isVisitorDecision({ text: "A.", citations: [CHAT] })).toBe(true);
    expect(
      isVisitorDecision({
        text: "A.",
        citations: [CHAT, { source: "chat", quote: "x", confirmed: false }],
      }),
    ).toBe(true);
  });

  it("isn't a statement with an interviewee's words, or with no quotes", () => {
    expect(
      isVisitorDecision({
        text: "A.",
        citations: [CHAT, interview("Henk", "henk-4")],
      }),
    ).toBe(false);
    expect(isVisitorDecision({ text: "A.", citations: [] })).toBe(false);
  });
});
