import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type InferUIMessageChunk,
} from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  keepConversation,
  restoreConversation,
  STORAGE_KEY,
  STORED_FORMAT,
} from "@/features/workspace/stored-conversation";
import { Workspace } from "@/features/workspace/workspace";
import { textOf, type ChatMessage } from "@/lib/chat";
import type { CheckedSection } from "@/lib/prd";

// The conversation kept in the browser, so the PRD survives a reload: what's
// kept, what comes back, and what happens to a kept conversation that no
// longer fits. The server's answers are stubbed as in workspace.test.tsx.

type Chunk = InferUIMessageChunk<ChatMessage>;

const INTRODUCTION: CheckedSection = {
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
        {
          source: "chat",
          quote: "Draft the first section.",
          confirmed: true,
          messageId: "visitor-1",
        },
      ],
    },
  ],
};

/** A conversation that drafted the first section, as the chat holds it. */
const DRAFTED: ChatMessage[] = [
  {
    id: "visitor-1",
    role: "user",
    parts: [{ type: "text", text: "Draft the first section. Keep pings on." }],
  },
  {
    id: "answer-1",
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type: "tool-saveSection",
        toolCallId: "save-1",
        state: "output-available",
        input: {
          section: "Introduction / Overview",
          statements: [
            {
              text: "Henk wants a ping for every item.",
              citations: [{ source: "henk-4", quote: "ping me every time" }],
            },
          ],
        },
        output: INTRODUCTION,
      },
      { type: "text", text: "I saved Introduction / Overview.", state: "done" },
    ],
  },
];

function stored(value: unknown) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function kept(): unknown {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === null ? null : JSON.parse(value);
}

function text(id: string, words: string): Chunk[] {
  return [
    { type: "text-start", id },
    { type: "text-delta", id, delta: words },
    { type: "text-end", id },
  ];
}

function answer(chunks: Chunk[], { fails = false } = {}): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<ChatMessage>({
      execute: ({ writer }) => {
        writer.write({ type: "start" });
        for (const chunk of chunks) writer.write(chunk);
        if (fails) writer.write({ type: "error", errorText: "Broke off." });
        else writer.write({ type: "finish" });
      },
    }),
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function introHeading() {
  return screen.queryByRole("heading", {
    level: 1,
    name: "You're the product manager of a shared grocery list app",
  });
}

function introStatements() {
  return screen.queryByRole("list", {
    name: "Statements in Introduction / Overview",
  });
}

const DISCARDED =
  "The PRD you started earlier couldn't be brought back: the demo has changed since. You can start a new one.";

describe("the kept conversation", () => {
  it("comes back as it was kept", () => {
    keepConversation({ messages: DRAFTED, interrupted: true, stopped: [] });

    expect(kept()).toEqual({
      format: STORED_FORMAT,
      messages: DRAFTED,
      interrupted: true,
      stopped: [],
    });
    expect(restoreConversation()).toEqual({
      status: "restored",
      conversation: { messages: DRAFTED, interrupted: true, stopped: [] },
    });
  });

  it("is forgotten once the conversation is empty", () => {
    keepConversation({ messages: DRAFTED, interrupted: false, stopped: [] });
    keepConversation({ messages: [], interrupted: false, stopped: [] });

    expect(kept()).toBeNull();
    expect(restoreConversation()).toEqual({ status: "none" });
  });

  it.each([
    ["an earlier format", { format: 0, messages: DRAFTED, interrupted: false }],
    ["no format", { messages: DRAFTED, interrupted: false }],
    [
      "no list of stopped answers",
      { format: STORED_FORMAT, messages: DRAFTED, interrupted: false },
    ],
    [
      "a saved section in another form",
      {
        format: STORED_FORMAT,
        messages: [
          DRAFTED[0],
          {
            ...DRAFTED[1],
            parts: [
              {
                type: "tool-saveSection",
                toolCallId: "save-1",
                state: "output-available",
                input: {},
                output: { section: "Introduction / Overview", items: [] },
              },
            ],
          },
        ],
        interrupted: false,
        stopped: [],
      },
    ],
    [
      "a section the PRD doesn't have",
      {
        format: STORED_FORMAT,
        messages: [
          DRAFTED[0],
          {
            ...DRAFTED[1],
            parts: [
              {
                type: "tool-saveSection",
                toolCallId: "save-1",
                state: "output-available",
                input: {},
                output: { ...INTRODUCTION, section: "Pricing" },
              },
            ],
          },
        ],
        interrupted: false,
        stopped: [],
      },
    ],
    [
      "a part the chat doesn't know",
      {
        format: STORED_FORMAT,
        messages: [{ ...DRAFTED[0], parts: [{ type: "file", url: "data:," }] }],
        interrupted: false,
        stopped: [],
      },
    ],
    [
      "a role the chat doesn't send",
      {
        format: STORED_FORMAT,
        messages: [{ ...DRAFTED[0], role: "system" }],
        interrupted: false,
        stopped: [],
      },
    ],
    [
      "no messages",
      { format: STORED_FORMAT, messages: [], interrupted: false, stopped: [] },
    ],
  ])("is discarded and removed when it holds %s", (_, value) => {
    stored(value);

    expect(restoreConversation()).toEqual({ status: "discarded" });
    expect(kept()).toBeNull();
  });

  it("is discarded when it isn't JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");

    expect(restoreConversation()).toEqual({ status: "discarded" });
    expect(kept()).toBeNull();
  });

  it("counts as none when the browser refuses its storage, and keeping fails quietly", () => {
    const refuse = () => {
      throw new DOMException("Refused.", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);
    try {
      expect(restoreConversation()).toEqual({ status: "none" });
      expect(() =>
        keepConversation({
          messages: DRAFTED,
          interrupted: false,
          stopped: [],
        }),
      ).not.toThrow();
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("the home page after a reload", () => {
  it("opens on the chat and the PRD when a conversation is kept, without sending anything", () => {
    keepConversation({ messages: DRAFTED, interrupted: false, stopped: [] });
    render(<Workspace />);

    expect(introHeading()).not.toBeInTheDocument();
    expect(introStatements()).toHaveTextContent(
      "Henk wants a ping for every item.",
    );
    expect(
      screen.getByRole("list", { name: "Conversation" }),
    ).toHaveTextContent("Draft the first section.");
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the visitor's own message in a chat quote's pop-over, from the kept conversation", () => {
    keepConversation({ messages: DRAFTED, interrupted: false, stopped: [] });
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "You, in this chat" }));

    // The pop-over shows the whole message the quote comes from.
    expect(document.getElementById("source-popover")).toHaveTextContent(
      "Draft the first section. Keep pings on.",
    );
  });

  it("offers Try again when the kept answer broke off, and retrying replaces it", async () => {
    keepConversation({ messages: DRAFTED, interrupted: true, stopped: [] });
    fetchMock.mockResolvedValueOnce(
      answer(text("reply-2", "Here it is again.")),
    );
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Here it is again.")).toBeInTheDocument();
    const body = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body)) as {
      messages: ChatMessage[];
    };
    expect(body.messages.map((message) => message.id)).toEqual(["visitor-1"]);
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
    expect(kept()).toMatchObject({ interrupted: false });
  });

  it("drops the kept answer that broke off when the visitor sends a new message instead", async () => {
    keepConversation({ messages: DRAFTED, interrupted: true, stopped: [] });
    fetchMock.mockResolvedValueOnce(answer(text("reply-2", "Noted.")));
    render(<Workspace />);

    fireEvent.change(screen.getByRole("textbox", { name: "Your message" }), {
      target: { value: "Who wants pings?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Noted.")).toBeInTheDocument();
    const body = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body)) as {
      messages: ChatMessage[];
    };
    expect(body.messages.map((message) => textOf(message))).toEqual([
      "Draft the first section. Keep pings on.",
      "Who wants pings?",
    ]);
  });

  it("keeps the conversation after an answer, and marks one that broke off", async () => {
    fetchMock.mockResolvedValueOnce(
      answer(text("reply-1", "Half an answer"), { fails: true }),
    );
    render(<Workspace />);
    fireEvent.click(
      screen.getByRole("button", { name: "Or ask your own question first" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Your message" }), {
      target: { value: "Who wants pings?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    const value = kept() as { messages: ChatMessage[]; interrupted: boolean };
    expect(value.interrupted).toBe(true);
    expect(value.messages.map((message) => textOf(message))).toEqual([
      "Who wants pings?",
      "Half an answer",
    ]);
  });

  it("still reads a stopped answer as stopped, with no Try again", () => {
    // The drafted answer, stopped while a second search ran.
    const messages = DRAFTED.map((message) =>
      message.role === "assistant"
        ? {
            ...message,
            parts: [
              ...message.parts,
              {
                type: "tool-searchNotes" as const,
                toolCallId: "search-2",
                state: "input-available" as const,
                input: { query: "pings" },
              },
            ],
          }
        : message,
    );
    keepConversation({
      messages,
      interrupted: false,
      stopped: ["visitor-1"],
    });
    render(<Workspace />);

    expect(screen.getByText("You stopped this answer.")).toBeInTheDocument();
    expect(
      screen.getByText("Stopped searching the interviews for “pings”"),
    ).toBeInTheDocument();
    expect(introStatements()).toHaveTextContent(
      "Henk wants a ping for every item.",
    );
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });

  it("forgets the kept conversation on Start over", () => {
    keepConversation({ messages: DRAFTED, interrupted: false, stopped: [] });
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear both" }));

    expect(introHeading()).toBeInTheDocument();
    expect(kept()).toBeNull();
  });

  it("opens on the intro with a notice when the kept conversation no longer fits, until the visitor goes on", () => {
    stored({ format: 0, messages: DRAFTED, interrupted: false });
    render(<Workspace />);

    expect(introHeading()).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(DISCARDED);
    expect(introStatements()).not.toBeInTheDocument();
    expect(kept()).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Or ask your own question first" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear both" }));

    expect(introHeading()).toBeInTheDocument();
    expect(screen.queryByText(DISCARDED)).not.toBeInTheDocument();
  });
});

describe("the download", () => {
  it("appears once a section is saved and saves the PRD as a Markdown file", async () => {
    // Object URLs are replaced for this test only, and put back after it.
    const own = {
      createObjectURL: URL.createObjectURL,
      revokeObjectURL: URL.revokeObjectURL,
    };
    const createObjectURL = vi.fn<(file: Blob) => string>(() => "blob:prd");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe("shared-grocery-list-app-prd.md");
        expect(this.href).toBe("blob:prd");
      });
    try {
      keepConversation({ messages: DRAFTED, interrupted: false, stopped: [] });
      render(<Workspace />);
      const prd = screen.getByRole("region", {
        name: "Shared grocery list app",
      });

      fireEvent.click(
        within(prd).getByRole("button", { name: "Download as Markdown" }),
      );

      expect(click).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:prd");
      const file = createObjectURL.mock.calls[0]?.[0];
      expect(file?.type).toBe("text/markdown;charset=utf-8");
      const markdown = await file?.text();
      expect(markdown).toContain(
        "- Henk wants a ping for every item. Sources: Henk[^1]; You, in this chat[^2]\n",
      );
      expect(markdown).toContain(
        "[^1]: Henk, interview passage henk-4: “ping me every time”\n",
      );
    } finally {
      Object.assign(URL, own);
      vi.restoreAllMocks();
    }
  });

  it("isn't offered before a section is saved", () => {
    render(<Workspace />);
    fireEvent.click(
      screen.getByRole("button", { name: "Or ask your own question first" }),
    );

    expect(
      screen.queryByRole("button", { name: "Download as Markdown" }),
    ).not.toBeInTheDocument();
  });
});
