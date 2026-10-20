import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ChatStatus } from "ai";
import { describe, expect, it, vi } from "vitest";
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

  describe("while an answer is on its way, exactly one line moves", () => {
    /** The lines with the moving band (`.shimmer` in `globals.css`). */
    function moving(container: HTMLElement) {
      return container.querySelectorAll(".shimmer");
    }

    it("shows Working… before the first step", () => {
      const { container } = show([question], "submitted");

      expect(moving(container)).toHaveLength(1);
      expect(moving(container)[0]).toHaveTextContent(/^Working…$/);
    });

    it("moves the step in progress, with no Working…", () => {
      const { container } = show(
        [
          question,
          answer(
            search("output-available", { output: { passages: [HENK] } }),
            search("input-available", { toolCallId: "call-2" }),
          ),
        ],
        "streaming",
      );

      expect(screen.queryByText("Working…")).not.toBeInTheDocument();
      expect(moving(container)).toHaveLength(1);
      expect(moving(container)[0]).toHaveTextContent(
        "Searching the interviews for “notifications for new items”…",
      );
    });

    it("moves only the latest of two steps in progress", () => {
      const { container } = show(
        [
          question,
          answer(
            search("input-available"),
            search("input-streaming", {
              toolCallId: "call-2",
              input: { query: "pings" },
            }),
          ),
        ],
        "streaming",
      );

      expect(moving(container)).toHaveLength(1);
      expect(moving(container)[0]).toHaveTextContent(
        "Searching the interviews for “pings”…",
      );
    });

    it("shows Working… at the end of the answer between steps, and the finished step stays still", () => {
      const { container } = show(
        [
          question,
          answer(search("output-available", { output: { passages: [HENK] } })),
        ],
        "streaming",
      );

      const [, assistant] = within(
        screen.getByRole("list", { name: "Conversation" }),
      ).getAllByRole("listitem");
      expect(assistant).toHaveTextContent(/Working…$/);
      expect(moving(container)).toHaveLength(1);
      expect(moving(container)[0]).toHaveTextContent(/^Working…$/);
    });

    it("doesn't flash Working… after the answer's last words while it finishes", () => {
      const { container } = show(
        [question, answer({ type: "text", text: "Henk does.", state: "done" })],
        "streaming",
      );

      expect(screen.queryByText("Working…")).not.toBeInTheDocument();
      expect(moving(container)).toHaveLength(0);
    });

    it("moves nothing while text arrives", () => {
      const { container } = show(
        [
          question,
          answer(search("output-available", { output: { passages: [HENK] } }), {
            type: "text",
            text: "Henk",
            state: "streaming",
          }),
        ],
        "streaming",
      );

      expect(screen.queryByText("Working…")).not.toBeInTheDocument();
      expect(moving(container)).toHaveLength(0);
    });

    it.each(["ready", "error"] as const)(
      "moves nothing once the answer ends (%s)",
      (status) => {
        const { container } = show(
          [
            question,
            answer(search("input-available"), {
              type: "text",
              text: "Henk",
              state: "done",
            }),
          ],
          status,
        );

        expect(screen.queryByText("Working…")).not.toBeInTheDocument();
        expect(moving(container)).toHaveLength(0);
      },
    );
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
              question: HENK.question,
              answer: HENK.answer,
              quote: "ping me every time",
              confirmed: true,
            },
            { source: "chat", quote: "nobody wants pings", confirmed: false },
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

    it("shows one line saying what the check found, ending in See it, which brings the section into view", () => {
      const onSeeSection = vi.fn();
      render(
        <Conversation
          messages={[
            question,
            answer(saved("output-available", { output: SECTION })),
          ]}
          status="ready"
          onSeeSection={onSeeSection}
        />,
      );

      expect(
        screen.getByRole("list", { name: "Conversation" }),
      ).toHaveTextContent(
        "Saved Introduction / Overview: 1 of 2 quotes confirmed, 1 statement cites nothing · See it",
      );
      expect(
        screen.queryByText("Henk wants a ping for every item."),
      ).not.toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "See it: Introduction / Overview" }),
      );

      expect(onSeeSection).toHaveBeenCalledWith("Introduction / Overview");
    });

    it("counts an open question that cites nothing as no quotes, not as a fault", () => {
      show([
        question,
        answer(
          saved("output-available", {
            output: {
              section: "Open Questions / Future Considerations",
              statements: [{ text: "Which shop comes first?", citations: [] }],
            },
          }),
        ),
      ]);

      expect(
        screen.getByRole("list", { name: "Conversation" }),
      ).toHaveTextContent(
        /Saved Open Questions \/ Future Considerations: no quotes$/,
      );
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
