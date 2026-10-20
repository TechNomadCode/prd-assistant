import {
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
import { Workspace } from "@/features/workspace/workspace";
import { DEMO_BUSY, QUOTA_USED_UP, textOf, type ChatMessage } from "@/lib/chat";
import type { CheckedSection } from "@/lib/prd";
import { site } from "@/lib/site";
import {
  FIRST_SECTION_REQUEST,
  GROCERY_DELIVERY_SUGGESTION,
} from "@/lib/suggestions";

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
