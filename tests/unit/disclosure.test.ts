import { describe, expect, it } from "vitest";
import {
  offeredSuggestion,
  conversationStarted,
} from "@/features/workspace/disclosure";
import type { ChatMessage } from "@/lib/chat";
import type { CheckedSection, SectionDraft } from "@/lib/prd";
import {
  FIRST_SECTION_REQUEST,
  GROCERY_DELIVERY_SUGGESTION,
} from "@/lib/suggestions";

const DRAFT: SectionDraft = {
  section: "Introduction / Overview",
  statements: [
    {
      text: "Henk wants a ping for every item.",
      citations: [{ source: "henk-4", quote: "ping me every time" }],
    },
  ],
};

const CHECKED: CheckedSection = {
  section: "Introduction / Overview",
  statements: [
    {
      text: "Henk wants a ping for every item.",
      citations: [
        {
          source: "interview",
          passage: "henk-4",
          interviewee: "Henk",
          question: "How would you want to know when Ineke adds something?",
          answer:
            "I'd like my phone to ping me every time she puts something on the list.",
          quote: "ping me every time",
          confirmed: true,
        },
      ],
    },
  ],
};

function visitor(id: string, text: string): ChatMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function reply(id: string, text: string): ChatMessage {
  return { id, role: "assistant", parts: [{ type: "text", text }] };
}

/** An answer that saved the first section. */
const SAVED: ChatMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [
    {
      type: "tool-saveSection",
      toolCallId: "save-1",
      state: "output-available",
      input: DRAFT,
      output: CHECKED,
    },
    { type: "text", text: "I saved Introduction / Overview." },
  ],
};

/** An answer whose save is still on its way. */
const SAVING: ChatMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [
    {
      type: "tool-saveSection",
      toolCallId: "save-1",
      state: "input-available",
      input: DRAFT,
    },
  ],
};

describe("conversationStarted", () => {
  it("is false for an empty conversation, so the home page opens on the intro", () => {
    expect(conversationStarted([])).toBe(false);
  });

  it("is true once the conversation holds a message, saved section or not", () => {
    expect(
      conversationStarted([visitor("visitor-1", FIRST_SECTION_REQUEST)]),
    ).toBe(true);
    expect(
      conversationStarted([visitor("visitor-1", FIRST_SECTION_REQUEST), SAVED]),
    ).toBe(true);
  });
});

describe("offeredSuggestion", () => {
  it("isn't offered before a section is saved", () => {
    expect(offeredSuggestion([])).toBeUndefined();
    expect(
      offeredSuggestion([
        visitor("visitor-1", "Who wants a ping for every item?"),
        reply("assistant-1", "Henk does."),
      ]),
    ).toBeUndefined();
    expect(
      offeredSuggestion([visitor("visitor-1", FIRST_SECTION_REQUEST), SAVING]),
    ).toBeUndefined();
  });

  it("offers the grocery delivery suggestion word for word once the first section is saved", () => {
    expect(
      offeredSuggestion([visitor("visitor-1", FIRST_SECTION_REQUEST), SAVED]),
    ).toBe(GROCERY_DELIVERY_SUGGESTION);
  });

  it("is no longer offered once the visitor has sent it, by the button or typed", () => {
    expect(
      offeredSuggestion([
        visitor("visitor-1", FIRST_SECTION_REQUEST),
        SAVED,
        visitor("visitor-2", GROCERY_DELIVERY_SUGGESTION),
      ]),
    ).toBeUndefined();
    expect(
      offeredSuggestion([
        visitor("visitor-1", FIRST_SECTION_REQUEST),
        SAVED,
        visitor("visitor-2", `  ${GROCERY_DELIVERY_SUGGESTION}\n`),
        reply("assistant-2", "No interview mentions delivery."),
      ]),
    ).toBeUndefined();
  });

  it("stays offered when the assistant, not the visitor, wrote those words", () => {
    expect(
      offeredSuggestion([
        visitor("visitor-1", FIRST_SECTION_REQUEST),
        SAVED,
        reply("assistant-2", GROCERY_DELIVERY_SUGGESTION),
      ]),
    ).toBe(GROCERY_DELIVERY_SUGGESTION);
  });
});
