import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ChatStatus } from "ai";
import { describe, expect, it } from "vitest";
import { Conversation } from "@/features/chat/conversation";
import type { ChatMessage, SaveSectionPart, SearchNotesPart } from "@/lib/chat";
import type { CheckedSection } from "@/lib/prd";
import type { PassageMatch } from "@/lib/transcripts";

const HENK: PassageMatch = {
  id: 1,
  slug: "henk",
  participant: "Henk",
  position: 4,
  question: "How would you want to know when Ineke adds something?",
  answer:
    "I'd like my phone to ping me every time she puts something on the list.",
  distance: 0.3,
};

const DAAN: PassageMatch = {
  id: 2,
  slug: "daan",
  participant: "Daan",
  position: 5,
  question: "How would you want to hear about new items?",
  answer: "Not as they come in.",
  distance: 0.4,
};

const question: ChatMessage = {
  id: "visitor-1",
  role: "user",
  parts: [{ type: "text", text: "Who wants pings?" }],
};

function answer(...parts: ChatMessage["parts"]): ChatMessage {
  return { id: "assistant-1", role: "assistant", parts };
}

function search(
  state: SearchNotesPart["state"],
  extra: Partial<SearchNotesPart> = {},
): SearchNotesPart {
  return {
    type: "tool-searchNotes",
    toolCallId: "call-1",
    state,
    input: { query: "notifications for new items" },
    ...extra,
  } as SearchNotesPart;
}

function show(messages: ChatMessage[], status: ChatStatus = "ready") {
  return render(<Conversation messages={messages} status={status} />);
}

describe("Conversation", () => {
  it("shows each message with who said it", () => {
    show([question, answer({ type: "text", text: "Henk does." })]);

    const [visitor, assistant] = within(
      screen.getByRole("list", { name: "Conversation" }),
    ).getAllByRole("listitem");
    expect(visitor).toHaveTextContent(/^You\s*Who wants pings\?$/);
    expect(assistant).toHaveTextContent(/^Assistant\s*Henk does\.$/);
  });

  it("shows nothing before the first message", () => {
    const { container } = show([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a search as it runs", () => {
    show([question, answer(search("input-available"))], "streaming");

    expect(
      screen.getByText(
        "Searching the interviews for “notifications for new items”…",
      ),
    ).toBeInTheDocument();
  });

  it("shows a finished search as one line naming whose passages came back, which opens to them", () => {
    show([
      question,
      answer(
        search("output-available", { output: { passages: [HENK, DAAN] } }),
        { type: "text", text: "Henk does." },
      ),
    ]);

    const line = screen.getByRole("button", {
      name: "Searched the interviews for “notifications for new items”: closest passages from Henk and Daan",
    });
    const controlled = document.getElementById(
      line.getAttribute("aria-controls") ?? "",
    );
    expect(line).toHaveAttribute("aria-expanded", "false");
    expect(controlled).not.toBeVisible();

    fireEvent.click(line);

    expect(line).toHaveAttribute("aria-expanded", "true");
    const passages = screen.getByRole("list", {
      name: "Passages found for “notifications for new items”",
    });
    expect(passages).toBe(controlled);
    const [first, second] = within(passages).getAllByRole("listitem");
    expect(first).toHaveTextContent(
      /^Researcher:\s*How would you want to know when Ineke adds something\?\s*I'd like my phone to ping me.*\s*Henk$/,
    );
    expect(second).toHaveTextContent(/Not as they come in\.\s*Daan$/);
  });

  it("names each person once, closest first", () => {
    show([
      question,
      answer(
        search("output-available", {
          output: { passages: [DAAN, HENK, { ...DAAN, id: 3, position: 6 }] },
        }),
      ),
    ]);

    expect(
      screen.getByRole("button", {
        name: /closest passages from Daan and Henk$/,
      }),
    ).toBeInTheDocument();
  });

  it("shows a failed search in plain words", () => {
    show([
      question,
      answer(
        search("output-error", {
          errorText: "The search didn't work this time.",
        }),
      ),
    ]);

    expect(
      screen.getByText(
        "Searching the interviews for “notifications for new items” didn't work. The search didn't work this time.",
      ),
    ).toBeInTheDocument();
  });

  it("shows that the assistant is working before its first words arrive", () => {
    show([question], "submitted");

    expect(screen.getByText("Working…")).toBeInTheDocument();
  });

  it("marks an answer that broke off as unfinished", () => {
    show([question, answer({ type: "text", text: "Henk wants" })], "error");

    expect(
      screen.getByText("This answer stopped before it finished."),
    ).toBeInTheDocument();
  });

  it("doesn't mark a whole answer", () => {
    show([question, answer({ type: "text", text: "Henk does." })], "ready");

    expect(
      screen.queryByText("This answer stopped before it finished."),
    ).not.toBeInTheDocument();
  });

  describe("a saved section", () => {
    const SECTION: CheckedSection = {
      section: "Introduction / Overview",
      statements: [
        {
          text: "Henk wants a ping for every item.",
          citations: [
            {
              source: "interview",
              passage: "henk-4",
              interviewee: "Henk",
              quote: "Every single item, yes",
              confirmed: true,
            },
            {
              source: "chat",
              quote: "Users want pings",
              confirmed: true,
              messageId: "visitor-1",
            },
          ],
        },
        {
          text: "Daan wants no pings.",
          citations: [
            {
              source: "interview",
              passage: "daan-5",
              interviewee: "Daan",
              quote: "How would you want to hear about new items?",
              confirmed: false,
            },
            { source: "chat", quote: "nobody wants pings", confirmed: false },
            {
              source: "unknown",
              passage: "grocery-1",
              quote: "deliver it",
              confirmed: false,
            },
          ],
        },
        { text: "The app is a shared household list.", citations: [] },
      ],
    };

    function saved(
      state: SaveSectionPart["state"],
      extra: Partial<SaveSectionPart> = {},
    ): SaveSectionPart {
      return {
        type: "tool-saveSection",
        toolCallId: "save-1",
        state,
        input: { section: "Introduction / Overview", statements: [] },
        ...extra,
      } as SaveSectionPart;
    }

    /** The statements' own items, without the quotes' items inside them. */
    function statementsIn(list: HTMLElement) {
      return within(list)
        .getAllByRole("listitem")
        .filter((item) => item.parentElement === list);
    }

    function showSaved(section: CheckedSection = SECTION) {
      show([question, answer(saved("output-available", { output: section }))]);
      return screen.getByRole("list", {
        name: `Statements in ${section.section}`,
      });
    }

    it("shows one line saying what the check found, open to the statements", () => {
      const statements = showSaved();

      const line = screen.getByRole("button", {
        name: "Saved Introduction / Overview: 2 of 5 quotes confirmed, 1 statement cites nothing",
      });
      expect(line).toHaveAttribute("aria-expanded", "true");
      expect(statements).toBeVisible();
      expect(line.getAttribute("aria-controls")).toBe(statements.id);

      fireEvent.click(line);

      expect(line).toHaveAttribute("aria-expanded", "false");
      expect(statements).not.toBeVisible();
    });

    it("shows every quote next to its statement, with its source by name and whether the check confirmed it", () => {
      const [first, second] = statementsIn(showSaved());

      expect(first).toHaveTextContent(
        /^Henk wants a ping for every item\.\s*“Every single item, yes”\s*Henk, interview · Confirmed\s*“Users want pings”\s*You, in this chat · Confirmed$/,
      );
      expect(second).toHaveTextContent(
        "“How would you want to hear about new items?”Daan, interview · Unverified: these words aren't in the answer it cites",
      );
      expect(second).toHaveTextContent(
        "“nobody wants pings”You, in this chat · Unverified: these words aren't in your messages",
      );
      expect(second).toHaveTextContent(
        "“deliver it”Source “grocery-1” · Unverified: no such passage in the interviews",
      );
    });

    it("flags a statement that cites nothing", () => {
      const statements = statementsIn(showSaved());

      expect(statements.at(-1)).toHaveTextContent(
        /^The app is a shared household list\.\s*Cites nothing: no quote backs this statement\.$/,
      );
    });

    it("doesn't flag an open question that cites nothing", () => {
      showSaved({
        section: "Open Questions / Future Considerations",
        statements: [
          { text: "Open question: which shop comes first?", citations: [] },
        ],
      });

      expect(
        screen.getByRole("button", {
          name: "Saved Open Questions / Future Considerations: no quotes",
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Cites nothing/)).not.toBeInTheDocument();
    });

    it("shows a section while its quotes are checked", () => {
      show([question, answer(saved("input-available"))], "streaming");

      expect(
        screen.getByText("Checking the quotes in Introduction / Overview…"),
      ).toBeInTheDocument();
    });

    it("shows a save that failed in plain words", () => {
      show([
        question,
        answer(
          saved("output-error", {
            errorText:
              "The section couldn't be checked this time, so it wasn't saved.",
          }),
        ),
      ]);

      expect(
        screen.getByText(
          "Saving Introduction / Overview didn't work. The section couldn't be checked this time, so it wasn't saved.",
        ),
      ).toBeInTheDocument();
    });

    it("shows a section the app couldn't read in plain words", () => {
      show([
        question,
        answer({
          type: "dynamic-tool",
          toolName: "saveSection",
          toolCallId: "save-1",
          state: "output-error",
          input: { section: "Executive Summary" },
          errorText:
            "The drafted section wasn't in the form the check reads, so it wasn't saved.",
        }),
      ]);

      expect(
        screen.getByText(
          "Saving the section didn't work. The drafted section wasn't in the form the check reads, so it wasn't saved.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows nothing for an answer that failed before its first words", () => {
    show([question, answer()], "error");

    expect(screen.queryByText("Assistant")).not.toBeInTheDocument();
    expect(
      screen.queryByText("This answer stopped before it finished."),
    ).not.toBeInTheDocument();
  });
});
