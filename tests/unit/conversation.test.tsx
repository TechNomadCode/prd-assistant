import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ChatStatus } from "ai";
import { describe, expect, it, vi } from "vitest";
import { Conversation } from "@/features/chat/conversation";
import type { ThoughtPart } from "@/features/chat/thoughts";
import type { ChatMessage, SaveSectionPart, SearchNotesPart } from "@/lib/chat";
import type { CheckedSection } from "@/lib/prd";
import type { PassageMatch } from "@/lib/transcripts";
import { stepText } from "./step-line";

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

/** How long the model thought before a reply. */
function thought(ms: number): ThoughtPart {
  return { type: "data-thought", data: { ms } };
}

/** A step's line, by its whole text. */
function stepLine(text: string | RegExp): HTMLElement {
  return screen.getByText(stepText(text));
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
      stepLine("Search “notifications for new items”…"),
    ).toBeInTheDocument();
  });

  it("shows a finished search as one plain line naming whose passages came back", () => {
    show([
      question,
      answer(
        search("output-available", { output: { passages: [HENK, DAAN] } }),
        { type: "text", text: "Henk does." },
      ),
    ]);

    expect(
      stepLine(
        "Search “notifications for new items” · passages from Henk and Daan",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/Researcher:/)).not.toBeInTheDocument();
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

    expect(stepLine(/passages from Daan and Henk$/)).toBeInTheDocument();
  });

  it("says when a search found nothing", () => {
    show([
      question,
      answer(search("output-available", { output: { passages: [] } })),
    ]);

    expect(
      stepLine("Search “notifications for new items” · no passages"),
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
      stepLine(
        "Search “notifications for new items” · didn't work. The search didn't work this time.",
      ),
    ).toBeInTheDocument();
  });

  describe("searches in a row", () => {
    const done = (toolCallId: string, query: string, passages = [HENK]) =>
      search("output-available", {
        toolCallId,
        input: { query },
        output: { passages },
      });

    it("fold into one line that opens to their plain lines", () => {
      show([
        question,
        answer(done("call-1", "pings"), done("call-2", "lists", [DAAN]), {
          type: "text",
          text: "Henk does.",
        }),
      ]);

      const line = screen.getByRole("button", { name: "Used 2 searches" });
      const lines = document.getElementById(
        line.getAttribute("aria-controls") ?? "",
      );
      expect(line).toHaveAttribute("aria-expanded", "false");
      expect(lines).toHaveAttribute("inert");

      fireEvent.click(line);

      expect(line).toHaveAttribute("aria-expanded", "true");
      expect(lines).not.toHaveAttribute("inert");
      expect(lines).toHaveTextContent(
        /^Search “pings” · passages from Henk\s*Search “lists” · passages from Daan$/,
      );

      fireEvent.click(line);

      expect(line).toHaveAttribute("aria-expanded", "false");
      expect(lines).toHaveAttribute("inert");
    });

    it("start a new line after text, and never fold a save", () => {
      show([
        question,
        answer(
          done("call-1", "pings"),
          done("call-2", "lists"),
          { type: "text", text: "Two so far." },
          done("call-3", "apps"),
          {
            type: "tool-saveSection",
            toolCallId: "save-1",
            state: "input-available",
            input: { section: "Goals / Objectives", statements: [] },
          } as SaveSectionPart,
          done("call-4", "phones"),
        ),
      ]);

      expect(screen.getAllByRole("button")).toHaveLength(1);
      expect(
        screen.getByRole("button", { name: "Used 2 searches" }),
      ).toBeInTheDocument();
      expect(
        stepLine("Search “apps” · passages from Henk"),
      ).toBeInTheDocument();
      expect(
        stepLine("Search “phones” · passages from Henk"),
      ).toBeInTheDocument();
    });

    it("count up as each search starts, keeping the line open", () => {
      const first = [done("call-1", "pings"), done("call-2", "lists")];
      const { rerender } = show([question, answer(...first)], "streaming");
      fireEvent.click(screen.getByRole("button", { name: "Used 2 searches" }));

      rerender(
        <Conversation
          messages={[
            question,
            answer(
              ...first,
              search("input-available", {
                toolCallId: "call-3",
                input: { query: "apps" },
              }),
            ),
          ]}
          status="streaming"
        />,
      );

      const line = screen.getByRole("button", { name: "Used 3 searches" });
      expect(line).toHaveAttribute("aria-expanded", "true");
      expect(stepLine("Search “apps”…")).toBeInTheDocument();
    });
  });

  describe("while an answer is on its way, exactly one line moves", () => {
    /** The lines with the moving band (`.shimmer` in `globals.css`). */
    function moving(container: HTMLElement) {
      return container.querySelectorAll(".shimmer");
    }

    it("shows Thinking before the first reply", () => {
      const { container } = show([question], "submitted");

      expect(moving(container)).toHaveLength(1);
      expect(moving(container)[0]).toHaveTextContent(/^Thinking$/);
    });

    it("moves the step in progress, with no Thinking", () => {
      const { container } = show(
        [
          question,
          answer({ type: "text", text: "Looking." }, search("input-available")),
        ],
        "streaming",
      );

      expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
      expect(moving(container)).toHaveLength(1);
      expect(moving(container)[0]).toHaveTextContent(
        "Search “notifications for new items”…",
      );
    });

    it("moves the folded line while a search in it runs", () => {
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

      expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
      expect(moving(container)).toHaveLength(1);
      expect(moving(container)[0]).toHaveTextContent(/^Used 2 searches$/);
    });

    it("moves only the latest of two steps in progress", () => {
      const { container } = show(
        [
          question,
          answer(
            search("input-available"),
            { type: "text", text: "And also" },
            search("input-streaming", {
              toolCallId: "call-2",
              input: { query: "pings" },
            }),
          ),
        ],
        "streaming",
      );

      expect(moving(container)).toHaveLength(1);
      expect(moving(container)[0]).toHaveTextContent("Search “pings”…");
    });

    it("shows Thinking at the end of the answer between steps, and the finished step stays still", () => {
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
      expect(assistant).toHaveTextContent(/Thinking$/);
      expect(moving(container)).toHaveLength(1);
      expect(moving(container)[0]).toHaveTextContent(/^Thinking$/);
    });

    it("doesn't flash Thinking after the answer's last words while it finishes", () => {
      const { container } = show(
        [question, answer({ type: "text", text: "Henk does.", state: "done" })],
        "streaming",
      );

      expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
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

      expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
      expect(moving(container)).toHaveLength(0);
    });

    it("stops Thinking once the reply begins with how long it thought", () => {
      const { container } = show(
        [question, answer(thought(3_000))],
        "streaming",
      );

      expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
      expect(moving(container)).toHaveLength(0);
      expect(screen.getByText("Thought").parentElement).toHaveTextContent(
        /^Thought 3s$/,
      );
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

        expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
        expect(moving(container)).toHaveLength(0);
      },
    );
  });

  describe("how long the model thought", () => {
    const done = (toolCallId: string, query: string) =>
      search("output-available", {
        toolCallId,
        input: { query },
        output: { passages: [HENK] },
      });

    it("shows a line before each reply, which doesn't open", () => {
      show([
        question,
        answer(thought(4_400), done("call-1", "pings"), thought(61_000), {
          type: "text",
          text: "Henk does.",
        }),
      ]);

      const [, assistant] = within(
        screen.getByRole("list", { name: "Conversation" }),
      ).getAllByRole("listitem");
      expect(assistant).toHaveTextContent(
        /^Assistant\s*Thought 4s\s*Search “pings” · passages from Henk\s*Thought 1m 1s\s*Henk does\.$/,
      );
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("shows none for an answer kept from before the times", () => {
      show([question, answer(done("call-1", "pings"))]);

      expect(screen.queryByText("Thought")).not.toBeInTheDocument();
    });

    it("folds the times around searches in a row with them, counting only the searches", () => {
      show([
        question,
        answer(
          thought(2_000),
          done("call-1", "pings"),
          thought(1_000),
          done("call-2", "lists"),
          thought(5_000),
          { type: "text", text: "Henk does." },
        ),
      ]);

      const line = screen.getByRole("button", { name: "Used 2 searches" });
      const lines = document.getElementById(
        line.getAttribute("aria-controls") ?? "",
      );
      expect(lines).toHaveTextContent(
        /^Thought 2s\s*Search “pings” · passages from Henk\s*Thought 1s\s*Search “lists” · passages from Henk\s*Thought 5s$/,
      );
      expect(lines).not.toContainElement(screen.getByText("Henk does."));
    });

    it("keeps the time before a lone search or a save on a line of its own", () => {
      show([
        question,
        answer(thought(2_000), done("call-1", "pings"), thought(3_000), {
          type: "tool-saveSection",
          toolCallId: "save-1",
          state: "input-available",
          input: { section: "Goals / Objectives", statements: [] },
        } as SaveSectionPart),
      ]);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getAllByText("Thought")).toHaveLength(2);
    });
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

  describe("an answer the visitor stopped", () => {
    function stoppedShow(messages: ChatMessage[]) {
      return render(
        <Conversation
          messages={messages}
          status="ready"
          stopped={new Set([question.id])}
        />,
      );
    }

    it("keeps what it finished, reads its unfinished search as stopped, and says so", () => {
      stoppedShow([
        question,
        answer(
          search("output-available", { output: { passages: [HENK] } }),
          { type: "text", text: "Henk wants", state: "streaming" },
          search("input-available", { toolCallId: "call-2" }),
        ),
      ]);

      const [, assistant] = within(
        screen.getByRole("list", { name: "Conversation" }),
      ).getAllByRole("listitem");
      expect(assistant).toHaveTextContent(
        /Search “notifications for new items” · passages from Henk.*Henk wants\s*Search “notifications for new items” · stopped\s*You stopped this answer\.$/,
      );
      expect(screen.queryByText(/Searching/)).not.toBeInTheDocument();
      expect(screen.queryByText(/didn't work/)).not.toBeInTheDocument();
      expect(
        screen.queryByText("This answer stopped before it finished."),
      ).not.toBeInTheDocument();
    });

    it("reads a check of quotes that hadn't finished as stopped", () => {
      stoppedShow([
        question,
        answer({
          type: "tool-saveSection",
          toolCallId: "save-1",
          state: "input-available",
          input: { section: "Goals / Objectives", statements: [] },
        } as SaveSectionPart),
      ]);

      expect(
        screen.getByText("Stopped checking the quotes in Goals / Objectives"),
      ).toBeInTheDocument();
    });

    it("says so under the question when it was stopped before anything arrived", () => {
      stoppedShow([question]);

      const [visitor, assistant] = within(
        screen.getByRole("list", { name: "Conversation" }),
      ).getAllByRole("listitem");
      expect(visitor).toHaveTextContent("Who wants pings?");
      expect(assistant).toHaveTextContent(
        /^Assistant\s*You stopped this answer\.$/,
      );
    });

    it("says so only under the answers that were stopped", () => {
      const later: ChatMessage = {
        id: "visitor-2",
        role: "user",
        parts: [{ type: "text", text: "And Daan?" }],
      };
      render(
        <Conversation
          messages={[
            question,
            answer({ type: "text", text: "Henk wants", state: "streaming" }),
            later,
            {
              id: "assistant-2",
              role: "assistant",
              parts: [{ type: "text", text: "Daan doesn't.", state: "done" }],
            },
          ]}
          status="ready"
          stopped={new Set([question.id])}
        />,
      );

      expect(screen.getAllByText("You stopped this answer.")).toHaveLength(1);
      const items = within(
        screen.getByRole("list", { name: "Conversation" }),
      ).getAllByRole("listitem");
      expect(items[1]).toHaveTextContent(/You stopped this answer\.$/);
      expect(items[3]).toHaveTextContent(/Daan doesn't\.$/);
    });
  });

  it("shows nothing for an answer that failed before its first words", () => {
    show([question, answer()], "error");

    expect(screen.queryByText("Assistant")).not.toBeInTheDocument();
    expect(
      screen.queryByText("This answer stopped before it finished."),
    ).not.toBeInTheDocument();
  });

  describe("new text", () => {
    const followUp: ChatMessage = {
      id: "visitor-2",
      role: "user",
      parts: [{ type: "text", text: "And Daan?" }],
    };
    const reply = (text: string, state: "streaming" | "done"): ChatMessage => ({
      id: "assistant-2",
      role: "assistant",
      parts: [{ type: "text", text, state }],
    });

    function fading(container: HTMLElement): string[] {
      return [...container.querySelectorAll(".word-enter")].map(
        (span) => span.textContent ?? "",
      );
    }

    it("fades in only an answer that arrives after the chat shows, even when it ends as it arrives", () => {
      const shownBefore = [question, answer({ type: "text", text: "Henk." })];
      const { container, rerender } = show(shownBefore);
      expect(fading(container)).toEqual([]);

      rerender(
        <Conversation
          messages={[...shownBefore, followUp, reply("Daan doesn't.", "done")]}
          status="ready"
        />,
      );
      expect(fading(container)).toEqual(["Daan doesn't."]);
    });

    it("fades in an answer's words as they come, and leaves them once it's finished", () => {
      const { container, rerender } = show([question], "submitted");
      rerender(
        <Conversation
          messages={[question, reply("Daan", "streaming")]}
          status="streaming"
        />,
      );
      rerender(
        <Conversation
          messages={[question, reply("Daan doesn't.", "streaming")]}
          status="streaming"
        />,
      );
      expect(fading(container)).toEqual(["Daan", " doesn't."]);

      const before = [...container.querySelectorAll(".word-enter")];
      rerender(
        <Conversation
          messages={[question, reply("Daan doesn't.", "done")]}
          status="ready"
        />,
      );
      expect([...container.querySelectorAll(".word-enter")]).toEqual(before);
    });

    it("shows a conversation brought back after a reload at once", () => {
      const { container } = show([
        question,
        answer({ type: "text", text: "Henk." }),
        followUp,
        reply("Daan doesn't.", "done"),
      ]);
      expect(fading(container)).toEqual([]);
      expect(container.querySelector("li span:not(.sr-only)")).toBeNull();
    });
  });

  // What comes in after the chat showed arrives (`.arrive` in globals.css,
  // slice 25). jsdom runs no animation, so these check which elements carry
  // the classes; tests/e2e/chat.spec.ts checks that they move.
  describe("what arrives", () => {
    const followUp: ChatMessage = {
      id: "visitor-2",
      role: "user",
      parts: [{ type: "text", text: "And Daan?" }],
    };
    const GOALS: CheckedSection = {
      section: "Goals / Objectives",
      statements: [{ text: "Fewer double purchases.", citations: [] }],
    };

    function save(
      state: SaveSectionPart["state"],
      extra: Partial<SaveSectionPart> = {},
    ): SaveSectionPart {
      return {
        type: "tool-saveSection",
        toolCallId: "save-1",
        state,
        input: { section: "Goals / Objectives", statements: [] },
        ...extra,
      } as SaveSectionPart;
    }

    function reply(...parts: ChatMessage["parts"]): ChatMessage {
      return { id: "assistant-2", role: "assistant", parts };
    }

    /** Shows the conversation, then these messages after it. */
    function arrive(
      messages: ChatMessage[],
      status: ChatStatus,
      stopped?: ReadonlySet<string>,
    ) {
      const shown = show([question], "submitted");
      shown.rerender(
        <Conversation messages={messages} status={status} stopped={stopped} />,
      );
      return shown;
    }

    it("brings in the visitor's new message from its corner, and each line of the answer as it appears", () => {
      const before = [question, answer({ type: "text", text: "Henk." })];
      const { rerender } = show(before);
      expect(document.querySelector(".arrive")).toBeNull();

      rerender(
        <Conversation messages={[...before, followUp]} status="submitted" />,
      );
      expect(screen.getByText("And Daan?").closest("li")).toHaveClass(
        "arrive",
        "arrive-message",
      );

      rerender(
        <Conversation
          messages={[
            ...before,
            followUp,
            reply(thought(1200), search("input-available")),
          ]}
          status="streaming"
        />,
      );
      expect(stepLine("Thought 1s")).toHaveClass("arrive");
      expect(stepLine("Search “notifications for new items”…")).toHaveClass(
        "arrive",
        "arrive-search",
      );
      expect(
        screen.getByText("Who wants pings?").closest("li"),
      ).not.toHaveClass("arrive");
    });

    it("keeps still everything in the messages it showed with, as after a reload, its ticks drawn", () => {
      const { container } = show([
        question,
        answer(
          thought(1200),
          search("output-available", { output: { passages: [HENK] } }),
          save("output-available", { output: GOALS }),
          { type: "text", text: "Saved." },
        ),
      ]);

      expect(container.querySelector(".arrive")).toBeNull();
      const line = stepLine(/^Saved Goals \/ Objectives: no quotes/);
      expect(line.querySelector("svg circle")).toBeInTheDocument();
      expect(line.querySelector(".tick-draws")).toBeNull();
    });

    it("brings in a saved section's line anew once its check ends, its tick drawing itself", () => {
      const { rerender } = arrive(
        [question, reply(save("input-available"))],
        "streaming",
      );
      const checking = stepLine("Checking the quotes in Goals / Objectives…");
      expect(checking).toHaveClass("arrive");

      rerender(
        <Conversation
          messages={[
            question,
            reply(save("output-available", { output: GOALS })),
          ]}
          status="streaming"
        />,
      );
      const line = stepLine(/^Saved Goals \/ Objectives: no quotes/);
      expect(line).not.toBe(checking);
      expect(line).toHaveClass("arrive");
      const tick = line.querySelector(".tick-draws");
      expect(tick).toHaveAttribute("aria-hidden", "true");
      expect(tick?.querySelectorAll("circle, path")).toHaveLength(2);
    });

    it("keeps a search's line as it finishes, and its check's line as it fails or is stopped only as a new line", () => {
      const { rerender } = arrive(
        [question, reply(search("input-available"))],
        "streaming",
      );
      const running = stepLine("Search “notifications for new items”…");

      rerender(
        <Conversation
          messages={[
            question,
            reply(search("output-available", { output: { passages: [HENK] } })),
          ]}
          status="streaming"
        />,
      );
      expect(
        stepLine("Search “notifications for new items” · passages from Henk"),
      ).toBe(running);

      rerender(
        <Conversation
          messages={[question, reply(save("input-available"))]}
          status="streaming"
        />,
      );
      const checking = stepLine("Checking the quotes in Goals / Objectives…");
      rerender(
        <Conversation
          messages={[question, reply(save("input-available"))]}
          status="ready"
          stopped={new Set([question.id])}
        />,
      );
      const stopped = stepLine(
        "Stopped checking the quotes in Goals / Objectives",
      );
      expect(stopped).not.toBe(checking);
      expect(stopped).toHaveClass("arrive");
    });

    it("brings in a step that didn't work and the notices of an answer that broke off or was stopped", () => {
      arrive(
        [
          question,
          reply({
            type: "dynamic-tool",
            toolName: "saveSection",
            toolCallId: "save-1",
            state: "output-error",
            input: {},
            errorText: "It wasn't in the form the check reads.",
          }),
        ],
        "error",
      );
      expect(screen.getByText(/^Saving the section didn't work\./)).toHaveClass(
        "arrive",
      );
      expect(
        screen.getByText("This answer stopped before it finished."),
      ).toHaveClass("arrive");
    });

    it("brings in You stopped this answer, under the question too, but not under one it showed with", () => {
      const { rerender } = show([question], "ready");
      rerender(
        <Conversation
          messages={[question, followUp]}
          status="ready"
          stopped={new Set([question.id, followUp.id])}
        />,
      );

      const [shownBefore, arrived] = screen.getAllByText(
        "You stopped this answer.",
      );
      expect(shownBefore).not.toHaveClass("arrive");
      expect(arrived).toHaveClass("arrive");
    });
  });
});
