import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type InferUIMessageChunk,
} from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localTime, nextReset } from "@/features/workspace/quota";
import { STORAGE_KEY } from "@/features/workspace/stored-conversation";
import { Workspace } from "@/features/workspace/workspace";
import { DEMO_BUSY, QUOTA_USED_UP, textOf, type ChatMessage } from "@/lib/chat";
import type { CheckedSection } from "@/lib/prd";
import { site } from "@/lib/site";
import {
  FIRST_SECTION_REQUEST,
  GROCERY_DELIVERY_SUGGESTION,
} from "@/lib/suggestions";
import { stepText } from "./step-line";

// The home page's workspace, with the server's answers stubbed: the chat's
// transport posts to /api/chat with the browser's fetch, so each test decides
// what comes back. The intro's failure is tested here, because the fake chat
// model fails only on its trigger phrases and the intro sends a fixed request
// that can't contain them (tests/e2e/intro.spec.ts intercepts /api/chat too).

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
      ],
    },
  ],
};

function text(id: string, words: string): Chunk[] {
  return [
    { type: "text-start", id },
    { type: "text-delta", id, delta: words },
    { type: "text-end", id },
  ];
}

/** An answer that saves the first section, then says so. */
const SAVES_INTRODUCTION: Chunk[] = [
  {
    type: "tool-input-available",
    toolCallId: "save-1",
    toolName: "saveSection",
    input: {
      section: "Introduction / Overview",
      statements: [
        {
          text: "Henk wants a ping for every item.",
          citations: [{ source: "henk-4", quote: "ping me every time" }],
        },
      ],
    },
  },
  { type: "tool-output-available", toolCallId: "save-1", output: INTRODUCTION },
  ...text("reply-1", "I saved Introduction / Overview."),
];

/** The server's streamed answer, built the way the chat route builds it. */
function answer(chunks: Chunk[]): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<ChatMessage>({
      execute: ({ writer }) => {
        writer.write({ type: "start" });
        for (const chunk of chunks) writer.write(chunk);
        writer.write({ type: "finish" });
      },
    }),
  });
}

/**
 * An answer on its way: these chunks, then nothing more until the browser
 * cancels the request, as the Stop button does.
 */
function answerOnItsWay(
  chunks: Chunk[],
  signal: AbortSignal | null | undefined,
): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<ChatMessage>({
      execute: async ({ writer }) => {
        writer.write({ type: "start" });
        for (const chunk of chunks) writer.write(chunk);
        await new Promise<void>((resolve) =>
          signal?.addEventListener("abort", () => resolve()),
        );
      },
    }),
  });
}

/** The first section saved, the reply begun, and a search still running. */
const SAVED_THEN_SEARCHING: Chunk[] = [
  ...SAVES_INTRODUCTION.slice(0, 2),
  { type: "text-start", id: "reply-1" },
  { type: "text-delta", id: "reply-1", delta: "I saved Introduction" },
  { type: "text-end", id: "reply-1" },
  {
    type: "tool-input-available",
    toolCallId: "search-2",
    toolName: "searchNotes",
    input: { query: "pings" },
  },
];

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The visitor's messages in the latest request to /api/chat. */
function sentByVisitor(): string[] {
  const init = fetchMock.mock.lastCall?.[1];
  const body = JSON.parse(String(init?.body)) as { messages: ChatMessage[] };
  return body.messages
    .filter((message) => message.role === "user")
    .map((message) => textOf(message));
}

function introHeading() {
  return screen.queryByRole("heading", {
    level: 1,
    name: "You're the product manager of a shared grocery list app",
  });
}

function workspaceHeading() {
  return screen.queryByRole("heading", {
    level: 1,
    name: "The chat and your PRD",
  });
}

function draftButton() {
  return screen.getByRole("button", { name: "Draft the first section" });
}

describe("the home page", () => {
  it("opens on the intro: the visitor's role, the interviews as finished records, their job, one filled button that drafts and, quieter, a link to the interviews and a way to ask first", () => {
    render(<Workspace />);

    expect(introHeading()).toBeInTheDocument();
    expect(
      screen.getByText(
        "A researcher already interviewed six households about it. Those transcripts are finished records: the AI reads and quotes them, and never asks their questions again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your job is to turn them into a product requirements document, a PRD. The AI proves every line with a quote, and the app's own code checks each one.",
      ),
    ).toBeInTheDocument();
    // The PRD is the region named after the product; the intro isn't one.
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(draftButton()).toBeEnabled();
    // Exactly one filled button, the one that drafts the first section; the
    // link to the full interviews and the way to ask first are quiet. jsdom
    // loads no styles, so the fill is checked by its class here and by its
    // colour in tests/e2e/intro.spec.ts.
    const interviews = screen.getByRole("link", {
      name: "Read the full interviews",
    });
    const askFirst = screen.getByRole("button", {
      name: "Or ask your own question first",
    });
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(draftButton()).toHaveClass("bg-foreground");
    expect(askFirst).not.toHaveClass("bg-foreground");
    expect(interviews).not.toHaveClass("bg-foreground");
    expect(interviews).toHaveAttribute("href", "/transcripts");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.queryByRole("textbox", { name: "Your message" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drafts the first section with the shared request word for word, and shows the chat with the PRD, focus on them", async () => {
    fetchMock.mockResolvedValueOnce(answer(SAVES_INTRODUCTION));
    render(<Workspace />);

    fireEvent.click(draftButton());

    expect(workspaceHeading()).toHaveFocus();
    expect(introHeading()).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      await screen.findByRole("list", {
        name: "Statements in Introduction / Overview",
      }),
    ).toHaveTextContent("Henk wants a ping for every item.");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.lastCall?.[0]).toBe("/api/chat");
    expect(sentByVisitor()).toEqual([FIRST_SECTION_REQUEST]);
    expect(
      screen.getByRole("textbox", { name: "Your message" }),
    ).toBeInTheDocument();
  });

  it("offers to try to break it only once the first section is saved, sends the claim with one click, focus in the message box, then no longer offers it", async () => {
    let respond: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => (respond = resolve)),
    );
    render(<Workspace />);
    const suggestion = () =>
      screen.queryByRole("button", { name: GROCERY_DELIVERY_SUGGESTION });

    fireEvent.click(draftButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(suggestion()).not.toBeInTheDocument();

    respond(answer(SAVES_INTRODUCTION));

    expect(
      await screen.findByRole("group", { name: /try to break it/ }),
    ).toHaveAccessibleName(
      "Now try to break it. Send a claim that nobody in the interviews made:",
    );
    await waitFor(() => expect(suggestion()).toBeEnabled());

    fetchMock.mockResolvedValueOnce(
      answer(text("reply-2", "No interview mentions grocery delivery.")),
    );
    // A click focuses the button first; fireEvent.click alone doesn't.
    suggestion()!.focus();
    fireEvent.click(suggestion()!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sentByVisitor()).toEqual([
      FIRST_SECTION_REQUEST,
      GROCERY_DELIVERY_SUGGESTION,
    ]);
    expect(suggestion()).not.toBeInTheDocument();
    // The suggestion is gone, so focus waits in the message box, not on the page.
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveFocus();
    expect(
      await screen.findByText("No interview mentions grocery delivery."),
    ).toBeInTheDocument();
    expect(suggestion()).not.toBeInTheDocument();
  });

  it("brings the intro back with a clear message and its button when the first request fails, and the button tries again", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("The provider failed.", { status: 500 }),
    );
    render(<Workspace />);

    fireEvent.click(draftButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "The first section wasn't drafted: something went wrong before the assistant could finish. Try again in a moment.",
    );
    expect(introHeading()).toHaveFocus();
    expect(
      screen.queryByRole("list", { name: "Conversation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Your message" }),
    ).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(answer(SAVES_INTRODUCTION));
    fireEvent.click(draftButton());

    expect(
      await screen.findByRole("list", {
        name: "Statements in Introduction / Overview",
      }),
    ).toBeInTheDocument();
    expect(sentByVisitor()).toEqual([FIRST_SECTION_REQUEST]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("never lets focus fall to the page when the intro comes back after a failed first request", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("The provider failed.", { status: 500 }),
    );
    render(<Workspace />);
    fireEvent.click(draftButton());
    expect(workspaceHeading()).toHaveFocus();
    // Where focus is the moment the intro's heading is back in the page,
    // before React gets to anything it runs later.
    let focusedOnReturn: Element | null | undefined;
    const observer = new MutationObserver(() => {
      if (focusedOnReturn !== undefined || introHeading() === null) return;
      focusedOnReturn = document.activeElement;
    });
    observer.observe(document.body, { childList: true, subtree: true });

    await screen.findByRole("alert");
    observer.disconnect();

    expect(focusedOnReturn).toBe(introHeading());
  });

  it("keeps the first section when the answer breaks off after saving it, with the chat's Try again instead of the intro", async () => {
    // As the server does when the reply after a save hits the output limit,
    // or the provider fails on that last call (src/server/chat.ts).
    fetchMock.mockResolvedValueOnce(
      answer([
        ...SAVES_INTRODUCTION,
        {
          type: "error",
          errorText: "The answer got too long and was cut off.",
        },
      ]),
    );
    render(<Workspace />);

    fireEvent.click(draftButton());

    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeEnabled();
    const chat = screen.getByRole("region", {
      name: "Chat with the assistant",
    });
    expect(within(chat).getByRole("alert")).toHaveTextContent(
      "Something went wrong before the assistant could finish.",
    );
    expect(
      screen.getByRole("list", {
        name: "Statements in Introduction / Overview",
      }),
    ).toHaveTextContent("Henk wants a ping for every item.");
    expect(workspaceHeading()).toBeInTheDocument();
    expect(introHeading()).not.toBeInTheDocument();
    expect(
      screen.queryByText(/The first section wasn't drafted/),
    ).not.toBeInTheDocument();
  });

  it("keeps what the visitor typed while the first request ran, when it fails and the intro comes back", async () => {
    let fail: (error: Error) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((_, reject) => (fail = reject)),
    );
    render(<Workspace />);

    fireEvent.click(draftButton());
    fireEvent.change(screen.getByRole("textbox", { name: "Your message" }), {
      target: { value: "Who wants a ping?" },
    });
    fail(new TypeError("Failed to fetch"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The first section wasn't drafted",
    );

    fetchMock.mockResolvedValueOnce(answer(SAVES_INTRODUCTION));
    fireEvent.click(draftButton());

    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue(
      "Who wants a ping?",
    );
    await screen.findByRole("list", {
      name: "Statements in Introduction / Overview",
    });
  });

  it("keeps a failed question in the chat when the visitor started with their own question", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<Workspace />);

    fireEvent.click(
      screen.getByRole("button", { name: "Or ask your own question first" }),
    );

    const box = screen.getByRole("textbox", { name: "Your message" });
    expect(box).toHaveFocus();
    expect(
      screen.getByRole("region", { name: "Shared grocery list app" }),
    ).toHaveTextContent("0 of 9 sections");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: "Who wants a ping?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const chat = screen.getByRole("region", {
      name: "Chat with the assistant",
    });
    expect(await within(chat).findByRole("alert")).toHaveTextContent(
      "Something went wrong before the assistant could finish.",
    );
    expect(introHeading()).not.toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Conversation" }),
    ).toHaveTextContent("Who wants a ping?");
  });

  it("Start over clears both and brings the intro back, focus on its heading", async () => {
    fetchMock.mockResolvedValueOnce(answer(SAVES_INTRODUCTION));
    render(<Workspace />);
    fireEvent.click(draftButton());
    await screen.findByRole("list", {
      name: "Statements in Introduction / Overview",
    });

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear both" }));

    expect(introHeading()).toHaveFocus();
    expect(workspaceHeading()).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Conversation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(draftButton()).toBeEnabled();
  });
});

describe("the PRD while the assistant works", () => {
  function sectionRegion(section: string) {
    return screen.getByRole("region", { name: new RegExp(`^${section}`) });
  }

  async function openChat() {
    render(<Workspace />);
    fireEvent.click(
      screen.getByRole("button", { name: "Or ask your own question first" }),
    );
  }

  function send(words: string) {
    fireEvent.change(screen.getByRole("textbox", { name: "Your message" }), {
      target: { value: words },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
  }

  it("says Drafting beside a section from the start of its save, and lights it up once saved", async () => {
    fetchMock.mockImplementationOnce(async (_, init) =>
      answerOnItsWay(SAVES_INTRODUCTION.slice(0, 1), init?.signal),
    );
    await openChat();
    send("Draft the first section.");

    const drafting = await within(
      sectionRegion("Introduction / Overview"),
    ).findByText("Drafting…", {}, { timeout: 3000 });
    expect(drafting).toHaveClass("shimmer");
    expect(sectionRegion("Goals / Objectives")).not.toHaveTextContent(
      "Drafting",
    );

    // Stopped mid-save: nothing is being drafted any more.
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() =>
      expect(screen.queryByText("Drafting…")).not.toBeInTheDocument(),
    );
    expect(
      sectionRegion("Introduction / Overview").querySelector(".just-changed"),
    ).toBeNull();

    fetchMock.mockResolvedValueOnce(answer(SAVES_INTRODUCTION));
    send("Draft the first section.");
    await screen.findByText("I saved Introduction / Overview.");
    expect(
      sectionRegion("Introduction / Overview").querySelector(".just-changed"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Drafting…")).not.toBeInTheDocument();
  });

  it("says Drafting beside the section the check-in asked for, from its message, instead of under the one before", async () => {
    fetchMock.mockResolvedValueOnce(answer(SAVES_INTRODUCTION));
    await openChat();
    send("Draft the first section.");
    const checkIn = await screen.findByRole("button", {
      name: "Looks right: draft Goals / Objectives",
    });
    fetchMock.mockImplementationOnce(async (_, init) =>
      answerOnItsWay([], init?.signal),
    );

    fireEvent.click(checkIn);

    expect(
      await within(sectionRegion("Goals / Objectives")).findByText("Drafting…"),
    ).toHaveClass("shimmer");
    expect(sectionRegion("Introduction / Overview")).not.toHaveTextContent(
      "Drafting",
    );
    expect(
      screen.queryByRole("button", { name: /^Looks right/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() =>
      expect(screen.queryByText("Drafting…")).not.toBeInTheDocument(),
    );
  });
});

describe("the Stop button", () => {
  /** Asks a question whose answer saves the first section, then keeps working. */
  async function askAndWait() {
    fetchMock.mockImplementationOnce(async (_, init) =>
      answerOnItsWay(SAVED_THEN_SEARCHING, init?.signal),
    );
    render(<Workspace />);
    fireEvent.click(
      screen.getByRole("button", { name: "Or ask your own question first" }),
    );
    fireEvent.change(messageBox(), {
      target: { value: "Draft the first section." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(stepText("Search “pings”…"), {}, { timeout: 3000 });
  }

  function messageBox() {
    return screen.getByRole("textbox", { name: "Your message" });
  }

  it("takes Send's place while the assistant works, and ends the answer, keeping what it finished, what the visitor typed and the focus", async () => {
    await askAndWait();
    expect(
      screen.queryByRole("button", { name: "Send" }),
    ).not.toBeInTheDocument();
    fireEvent.change(messageBox(), { target: { value: "Who wants pings?" } });

    const stop = screen.getByRole("button", { name: "Stop" });
    stop.focus();
    fireEvent.click(stop);

    expect(
      await screen.findByText("You stopped this answer."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(stepText("Search “pings” · stopped")),
    ).toBeInTheDocument();
    expect(screen.getByText("I saved Introduction")).toBeInTheDocument();
    expect(
      screen.getByRole("list", {
        name: "Statements in Introduction / Overview",
      }),
    ).toHaveTextContent("Henk wants a ping for every item.");
    expect(messageBox()).toHaveValue("Who wants pings?");
    expect(screen.getByRole("button", { name: "Send" })).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Kept by an effect React may run after the stop is painted.
    await waitFor(() => {
      const kept = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) ?? "null",
      ) as { messages: ChatMessage[]; stopped: string[] } | null;
      expect(kept?.stopped).toEqual([kept?.messages[0]?.id]);
    });
  });

  it("keeps focus on the button when an empty message box leaves nothing to send", async () => {
    await askAndWait();
    const stop = screen.getByRole("button", { name: "Stop" });
    stop.focus();
    fireEvent.click(stop);

    await screen.findByText("You stopped this answer.");
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toHaveFocus();
    expect(send).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(send);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends only the stopped answer's finished parts with the next message", async () => {
    await askAndWait();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await screen.findByText("You stopped this answer.");
    fetchMock.mockResolvedValueOnce(answer(text("reply-2", "Noted.")));

    fireEvent.change(messageBox(), { target: { value: "Who wants pings?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Noted.")).toBeInTheDocument();
    const body = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body)) as {
      messages: ChatMessage[];
    };
    expect(body.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    const parts = body.messages[1]?.parts ?? [];
    expect(
      parts
        .filter((part) => part.type !== "step-start")
        .map((part) =>
          part.type === "text"
            ? part.text
            : `${part.type} ${"state" in part ? part.state : ""}`,
        ),
    ).toEqual([
      "data-thought ",
      "tool-saveSection output-available",
      "data-thought ",
      "I saved Introduction",
    ]);
    // The stopped answer still reads as stopped.
    expect(screen.getByText("You stopped this answer.")).toBeInTheDocument();
  });

  it("drops an answer stopped before it finished anything from what goes back", async () => {
    fetchMock.mockImplementationOnce(async (_, init) =>
      answerOnItsWay([], init?.signal),
    );
    render(<Workspace />);
    fireEvent.click(
      screen.getByRole("button", { name: "Or ask your own question first" }),
    );
    fireEvent.change(messageBox(), { target: { value: "Who wants pings?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    await screen.findByText("You stopped this answer.");
    fetchMock.mockResolvedValueOnce(answer(text("reply-2", "Henk does.")));

    fireEvent.change(messageBox(), { target: { value: "And Daan?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Henk does.")).toBeInTheDocument();
    expect(sentByVisitor()).toEqual(["Who wants pings?", "And Daan?"]);
    const body = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body)) as {
      messages: ChatMessage[];
    };
    expect(body.messages.map((message) => message.role)).toEqual([
      "user",
      "user",
    ]);
  });

  it("drops an answer stopped during its first search, though it timed the thinking before it", async () => {
    fetchMock.mockImplementationOnce(async (_, init) =>
      answerOnItsWay(
        [
          {
            type: "tool-input-available",
            toolCallId: "call-1",
            toolName: "searchNotes",
            input: { query: "pings" },
          },
        ],
        init?.signal,
      ),
    );
    render(<Workspace />);
    fireEvent.click(
      screen.getByRole("button", { name: "Or ask your own question first" }),
    );
    fireEvent.change(messageBox(), { target: { value: "Who wants pings?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(stepText("Search “pings”…"));
    expect(screen.getByText("Thought")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await screen.findByText("You stopped this answer.");
    fetchMock.mockResolvedValueOnce(answer(text("reply-2", "Henk does.")));

    fireEvent.change(messageBox(), { target: { value: "And Daan?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Henk does.")).toBeInTheDocument();
    const body = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body)) as {
      messages: ChatMessage[];
    };
    expect(body.messages.map((message) => message.role)).toEqual([
      "user",
      "user",
    ]);
  });

  it("isn't needed by Start over, which still stops and clears without marking anything stopped", async () => {
    await askAndWait();

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear both" }));

    expect(introHeading()).toHaveFocus();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    await waitFor(() =>
      expect(screen.queryByText("You stopped this answer.")).toBeNull(),
    );
  });
});

describe("Jump to latest", () => {
  /**
   * jsdom lays nothing out, so the chat's pane gets a size: 1,000px of
   * conversation in 300px of pane, at its end. `scrollPaneTo` moves it
   * with a scroll event, as the visitor or a smooth scroll's steps do; its
   * `scrollTo` only records the call.
   */
  function sizePane() {
    const pane = screen.getByRole("list", {
      name: "Conversation",
    }).parentElement!;
    let top = 700;
    Object.defineProperties(pane, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 300 },
      scrollTop: {
        configurable: true,
        get: () => top,
        set: (value: number) => (top = Math.min(value, 700)),
      },
    });
    const scrollTo = vi.fn();
    pane.scrollTo = scrollTo;
    return {
      pane,
      scrollTo,
      grow(height: number) {
        Object.defineProperty(pane, "scrollHeight", {
          configurable: true,
          value: height,
        });
      },
      scrollPaneTo(to: number) {
        pane.scrollTop = to;
        fireEvent.scroll(pane);
      },
    };
  }

  function reduceMotion(reduce: boolean) {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: reduce && query === "(prefers-reduced-motion: reduce)",
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList,
    );
  }

  function jumpButton() {
    return screen.queryByRole("button", { name: "Jump to latest" });
  }

  function messageBox() {
    return screen.getByRole("textbox", { name: "Your message" });
  }

  function send(words: string) {
    fireEvent.change(messageBox(), { target: { value: words } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
  }

  /** The chat after one answer, which saved the first section. */
  async function chatWithAnAnswer() {
    fetchMock.mockImplementation(async () => answer(SAVES_INTRODUCTION));
    render(<Workspace />);
    fireEvent.click(
      screen.getByRole("button", { name: "Or ask your own question first" }),
    );
    send("Draft the first section.");
    await screen.findByText(
      "I saved Introduction / Overview.",
      {},
      { timeout: 3000 },
    );
    await screen.findByRole("button", { name: "Send" });
  }

  /** The next answer, held back until the test releases it. */
  function holdNextAnswer() {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    fetchMock.mockImplementationOnce(async () =>
      createUIMessageStreamResponse({
        stream: createUIMessageStream<ChatMessage>({
          execute: async ({ writer }) => {
            writer.write({ type: "start" });
            await held;
            for (const chunk of text("reply-2", "Nobody else asked."))
              writer.write(chunk);
            writer.write({ type: "finish" });
          },
        }),
      }),
    );
    return release;
  }

  it("shows once the visitor scrolls up, and goes when they scroll back down", async () => {
    await chatWithAnAnswer();
    const { scrollPaneTo } = sizePane();
    expect(jumpButton()).not.toBeInTheDocument();

    scrollPaneTo(200);
    expect(jumpButton()).toBeInTheDocument();
    // Within 48px of the end counts as the end.
    scrollPaneTo(660);
    expect(jumpButton()).not.toBeInTheDocument();
  });

  it("scrolls smoothly to the end, goes, hands focus to the message box, and the chat follows the answer on its way", async () => {
    reduceMotion(false);
    await chatWithAnAnswer();
    const release = holdNextAnswer();
    send("Who wants a ping?");
    await screen.findByRole("button", { name: "Stop" });
    const { pane, scrollTo, scrollPaneTo } = sizePane();
    scrollPaneTo(200);

    const jump = jumpButton()!;
    jump.focus();
    fireEvent.click(jump);

    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    expect(jumpButton()).not.toBeInTheDocument();
    expect(messageBox()).toHaveFocus();
    // The smooth scroll's steps on the way down don't bring it back.
    scrollPaneTo(400);
    expect(jumpButton()).not.toBeInTheDocument();

    // Following again: the answer arrives, and the chat goes to its end,
    // even from where a test puts it without a scroll event.
    pane.scrollTop = 0;
    release();
    await screen.findByText("Nobody else asked.");
    expect(pane.scrollTop).toBe(700);
  });

  it("comes back when the visitor scrolls up during the jump", async () => {
    reduceMotion(false);
    await chatWithAnAnswer();
    const { scrollPaneTo } = sizePane();
    scrollPaneTo(200);
    fireEvent.click(jumpButton()!);

    scrollPaneTo(400);
    scrollPaneTo(300);
    expect(jumpButton()).toBeInTheDocument();
  });

  it("shows when the conversation grows without a scroll, as when the visitor opens a search's passages", async () => {
    // jsdom's stand-in never reports a size; this one reports on demand.
    const observed: { callback: ResizeObserverCallback; target: Element }[] =
      [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }
        observe(target: Element) {
          observed.push({ callback: this.callback, target });
        }
        disconnect() {}
      },
    );
    await chatWithAnAnswer();
    const { grow } = sizePane();
    const list = screen.getByRole("list", { name: "Conversation" });
    const reportResize = () =>
      observed
        .filter(({ target }) => target === list)
        .forEach(({ callback }) =>
          act(() => callback([], {} as ResizeObserver)),
        );

    reportResize();
    expect(jumpButton()).not.toBeInTheDocument();
    grow(1400);
    reportResize();
    expect(jumpButton()).toBeInTheDocument();
  });

  it("goes on to the new end when the conversation grows during the jump, as opened searches still sliding open do", async () => {
    reduceMotion(false);
    const observed: { callback: ResizeObserverCallback; target: Element }[] =
      [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }
        observe(target: Element) {
          observed.push({ callback: this.callback, target });
        }
        disconnect() {}
      },
    );
    await chatWithAnAnswer();
    const { scrollTo, scrollPaneTo, grow } = sizePane();
    const list = screen.getByRole("list", { name: "Conversation" });
    const reportResize = () =>
      observed
        .filter(({ target }) => target === list)
        .forEach(({ callback }) =>
          act(() => callback([], {} as ResizeObserver)),
        );
    scrollPaneTo(200);
    fireEvent.click(jumpButton()!);
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 1000,
      behavior: "smooth",
    });

    // A step on the way down, then the conversation grows before the end.
    scrollPaneTo(400);
    grow(1400);
    reportResize();

    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 1400,
      behavior: "smooth",
    });
    expect(jumpButton()).not.toBeInTheDocument();
  });

  it("jumps at once with reduced motion", async () => {
    reduceMotion(true);
    await chatWithAnAnswer();
    const { scrollTo, scrollPaneTo } = sizePane();
    scrollPaneTo(200);

    fireEvent.click(jumpButton()!);

    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "instant" });
  });

  it("hands focus to the chat's heading once the allocation is used up and the message box is gone", async () => {
    reduceMotion(false);
    await chatWithAnAnswer();
    fetchMock.mockImplementation(async () =>
      answer([{ type: "error", errorText: QUOTA_USED_UP }]),
    );
    send("Who wants a ping?");
    expect(
      await screen.findByRole("alert", {}, { timeout: 3000 }),
    ).toHaveTextContent("The demo's free AI allocation for today is used up");
    const { scrollPaneTo } = sizePane();
    scrollPaneTo(200);

    const jump = jumpButton()!;
    jump.focus();
    fireEvent.click(jump);

    expect(
      screen.getByRole("heading", { name: "Chat with the assistant" }),
    ).toHaveFocus();
  });
});

// The server's words for Cloudflare's 429s (src/server/chat.ts, describeError).
describe("the home page when the demo's AI can't answer", () => {
  const usedUp = () => answer([{ type: "error", errorText: QUOTA_USED_UP }]);

  function expectQuotaNotice(notice: HTMLElement) {
    expect(notice).toHaveTextContent(
      "The demo's free AI allocation for today is used up",
    );
    expect(notice).toHaveTextContent(/resets at 00:00 UTC \(.+ your time\)/);
    expect(
      screen.getByRole("link", { name: "README" }).getAttribute("href"),
    ).toBe(`${site.links.repository}#readme`);
    expect(
      screen.getByRole("link", { name: "repository" }).getAttribute("href"),
    ).toBe(site.links.repository);
  }

  it("says on the intro that today's allocation is used up and when it resets, without the ways into the chat", async () => {
    fetchMock.mockResolvedValueOnce(usedUp());
    render(<Workspace />);

    fireEvent.click(draftButton());

    const alert = await screen.findByRole("alert");
    expectQuotaNotice(alert);
    expect(alert).not.toHaveTextContent("Try again");
    expect(introHeading()).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Draft the first section" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Or ask your own question first" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Read the full interviews" }),
    ).toBeInTheDocument();
  });

  it("keeps the chat and the PRD readable once the allocation runs out, with no way to send, through Start over too", async () => {
    fetchMock.mockResolvedValueOnce(answer(SAVES_INTRODUCTION));
    render(<Workspace />);
    fireEvent.click(draftButton());
    await screen.findByRole("list", {
      name: "Statements in Introduction / Overview",
    });

    fetchMock.mockResolvedValueOnce(usedUp());
    fireEvent.change(screen.getByRole("textbox", { name: "Your message" }), {
      target: { value: "Who wants a ping?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const chat = screen.getByRole("region", {
      name: "Chat with the assistant",
    });
    expectQuotaNotice(await within(chat).findByRole("alert"));
    expect(within(chat).getAllByRole("alert")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Your message" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Send" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: GROCERY_DELIVERY_SUGGESTION }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Looks right/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Conversation" }),
    ).toHaveTextContent("Who wants a ping?");
    expect(
      screen.getByRole("list", {
        name: "Statements in Introduction / Overview",
      }),
    ).toHaveTextContent("Henk wants a ping for every item.");

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear both" }));

    expect(introHeading()).toHaveFocus();
    expectQuotaNotice(screen.getByRole("alert"));
    expect(
      screen.queryByRole("button", { name: "Draft the first section" }),
    ).not.toBeInTheDocument();
  });

  it("says the demo is busy when Cloudflare stayed busy, and keeps Try again and the message box", async () => {
    fetchMock.mockResolvedValueOnce(
      answer([{ type: "error", errorText: DEMO_BUSY }]),
    );
    render(<Workspace />);
    fireEvent.click(
      screen.getByRole("button", { name: "Or ask your own question first" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Your message" }), {
      target: { value: "Who wants a ping?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const chat = screen.getByRole("region", {
      name: "Chat with the assistant",
    });
    const alert = await within(chat).findByRole("alert");
    expect(alert).toHaveTextContent(
      "The demo is busy right now. Try again in a minute.",
    );
    expect(alert).not.toHaveTextContent("used up");
    expect(
      within(alert).getByRole("button", { name: "Try again" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("textbox", { name: "Your message" }),
    ).toBeInTheDocument();
  });
});

describe("when the allocation resets", () => {
  it("is the next 00:00 UTC, also late in the UTC day", () => {
    expect(nextReset(new Date("2026-10-20T06:22:00Z")).toISOString()).toBe(
      "2026-10-21T00:00:00.000Z",
    );
    expect(nextReset(new Date("2026-12-31T23:59:59Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
    expect(nextReset(new Date("2026-10-21T00:00:00Z")).toISOString()).toBe(
      "2026-10-22T00:00:00.000Z",
    );
  });

  it("reads in the visitor's own time zone", () => {
    const reset = new Date("2026-10-21T00:00:00Z");
    expect(
      localTime(reset, { locale: "en-GB", timeZone: "Europe/Amsterdam" }),
    ).toBe("02:00");
    expect(
      localTime(reset, { locale: "en-GB", timeZone: "America/New_York" }),
    ).toBe("20:00");
  });
});
