import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ChatStatus } from "ai";
import { describe, expect, it } from "vitest";
import { Conversation } from "@/features/chat/conversation";
import type { ChatMessage, SearchNotesPart } from "@/lib/chat";
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

  it("shows nothing for an answer that failed before its first words", () => {
    show([question, answer()], "error");

    expect(screen.queryByText("Assistant")).not.toBeInTheDocument();
    expect(
      screen.queryByText("This answer stopped before it finished."),
    ).not.toBeInTheDocument();
  });
});
