import { expect, test, type Locator, type Page } from "@playwright/test";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import {
  STORAGE_KEY,
  STORED_FORMAT,
} from "@/features/workspace/stored-conversation";
import { FAKE_FAILURES, FAKE_SEARCH_AGAIN } from "@/server/ai/fake-chat-model";
import { expectNoAccessibilityViolations } from "./accessibility";

// The workspace's spacing and layout (docs/decisions.md, Design, 2026-10-20):
// a chat column of steady width beside a PRD that takes the rest, slim page
// chrome, a question closer to its own answer than to the turn before, and a
// message box that grows with its text. Measured in the browser, since only
// it lays the page out.

/** The fake model ends every answer with this; once it's there, it's done. */
const ANSWER_END = "then answers from a script.)";
const QUESTION = "Who wants a notification for every item someone adds?";

/** The home page opens on the intro; this opens the empty chat from it. */
async function openChat(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Or ask your own question first" })
    .click();
}

async function ask(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Your message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

function chat(page: Page) {
  return page.getByRole("region", { name: "Chat with the assistant" });
}

function prd(page: Page) {
  return page.getByRole("region", { name: "Shared grocery list app" });
}

function conversation(page: Page) {
  return page.getByRole("list", { name: "Conversation" });
}

/** The conversation's own items, without the items of a list inside them. */
function turns(page: Page) {
  return conversation(page).locator(":scope > li");
}

async function width(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  return box!.width;
}

/**
 * The gaps between an element's children, top to bottom, from one layout:
 * each child's top less the bottom of the one before. Children taken out of
 * the flow, such as the screen readers' "Assistant", don't count.
 */
function childGaps(parent: Locator): Promise<number[]> {
  return parent.evaluate((element) => {
    const children = [...element.children].filter(
      (child) => getComputedStyle(child).position !== "absolute",
    );
    return children.slice(1).map((child, index) => {
      const previous = children[index]!.getBoundingClientRect();
      return child.getBoundingClientRect().top - previous.bottom;
    });
  });
}

/** Expects each gap within half a pixel of its figure. */
function expectGaps(gaps: number[], figures: number[]) {
  expect(gaps).toHaveLength(figures.length);
  gaps.forEach((gap, index) => expect(gap).toBeCloseTo(figures[index]!, 0));
}

/** An answer of plain text, streamed the way the chat route streams one. */
async function cannedAnswer(text: string) {
  const response = createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "start" });
        writer.write({ type: "text-start", id: "reply" });
        writer.write({ type: "text-delta", id: "reply", delta: text });
        writer.write({ type: "text-end", id: "reply" });
        writer.write({ type: "finish" });
      },
    }),
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  };
}

test.describe("the workspace on a 1440px-wide laptop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("gives the chat a steady column and the PRD its full page, with slim chrome", async ({
    page,
  }) => {
    await openChat(page);

    const chatWidth = await width(chat(page));
    expect(chatWidth).toBeGreaterThanOrEqual(400);
    expect(chatWidth).toBeLessThanOrEqual(520);
    // The PRD's page reaches its decided 42rem of text (625px before).
    expect(await width(prd(page).locator("article"))).toBeCloseTo(672, 0);

    // The header, the footer and the space around the panes: 150px before.
    const workspace = await page.locator("[data-workspace]").boundingBox();
    expect(900 - workspace!.height).toBeLessThanOrEqual(115);
    await expect(
      page.getByRole("link", { name: "Source code on GitHub" }),
    ).toBeInViewport();
  });

  test("puts a question closer to its own answer than to the turn before, and steps in a row closer than text", async ({
    page,
  }) => {
    await openChat(page);
    await ask(page, "Draft the first section.");
    await expect(turns(page).nth(1)).toContainText(ANSWER_END);
    await ask(page, QUESTION);
    await expect(turns(page).nth(3)).toContainText(ANSWER_END);

    // A question, its answer, the next question and its answer.
    expectGaps(await childGaps(conversation(page)), [16, 32, 16]);
    // The draft: its search and its save, steps in a row with the time the
    // model thought before each reply, then its text.
    expectGaps(await childGaps(turns(page).nth(1)), [8, 8, 8, 8, 16]);
    // The answer: a time, its search, a time, then its text.
    expectGaps(await childGaps(turns(page).nth(3)), [8, 8, 16]);
  });

  test("puts a failure notice 24px under what came before it", async ({
    page,
  }, testInfo) => {
    await openChat(page);
    await ask(
      page,
      `Who wants a ping for every item? ${FAKE_FAILURES.partway} ${testInfo.testId}`,
    );
    await expect(chat(page).getByRole("alert")).toBeVisible();

    const answer = turns(page).nth(1);
    await expect(answer).toContainText(
      "This answer stopped before it finished.",
    );
    // A time, its search, a time, its text so far, then the notice.
    expectGaps(await childGaps(answer), [8, 8, 16, 24]);
    // The conversation, then the alert with "Try again".
    expectGaps(await childGaps(page.locator("#chat-title + div")), [24]);
  });

  test("keeps a question that got no answer a turn apart from the next one", async ({
    page,
  }, testInfo) => {
    await openChat(page);
    await ask(
      page,
      `Who wants a ping for every item? ${FAKE_FAILURES.partway} ${testInfo.testId}`,
    );
    await expect(chat(page).getByRole("alert")).toBeVisible();

    // A new question instead of "Try again" drops the broken answer.
    await ask(page, QUESTION);
    await expect(turns(page).nth(2)).toContainText(ANSWER_END);

    // The first question, the new one, and the new one's answer.
    expectGaps(await childGaps(conversation(page)), [32, 16]);
  });

  test("puts a list's items 8px apart and paragraphs 12px apart", async ({
    page,
  }) => {
    await page.route(
      "**/api/chat",
      async (route) =>
        route.fulfill(
          await cannedAnswer(
            "Three households asked for a ping.\n\nThey were:\n\n- Maya\n- Daan\n- Sofia",
          ),
        ),
      { times: 1 },
    );
    await openChat(page);
    await ask(page, QUESTION);
    const list = turns(page).nth(1).getByRole("list");
    await expect(list.getByRole("listitem")).toHaveCount(3);

    expectGaps(await childGaps(list), [8, 8]);
    // Two paragraphs, then the list.
    expectGaps(await childGaps(list.locator("..")), [12, 12]);
  });

  test("grows the message box with its text to 180px, then scrolls inside it", async ({
    page,
  }) => {
    await openChat(page);
    const box = page.getByRole("textbox", { name: "Your message" });
    const height = () =>
      box.evaluate((element) => element.getBoundingClientRect().height);

    const empty = await height();
    expect(empty).toBeCloseTo(96, 0);

    await box.fill("One\nTwo\nThree\nFour\nFive");
    const five = await height();
    expect(five).toBeGreaterThan(empty);
    expect(five).toBeLessThan(180);

    await box.fill(Array.from({ length: 12 }, (_, line) => line).join("\n"));
    expect(await height()).toBeCloseTo(180, 0);
    expect(
      await box.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);

    await box.fill("");
    expect(await height()).toBeCloseTo(empty, 0);
  });

  test("keeps the chat on its newest line while the message box grows", async ({
    page,
  }) => {
    // Short enough that one answer fills the chat.
    await page.setViewportSize({ width: 1440, height: 480 });
    await openChat(page);
    await ask(page, "Draft the first section.");
    await expect(turns(page).nth(1)).toContainText(ANSWER_END);

    const scroller = page.locator("#chat-title + div");
    const distanceFromEnd = () =>
      scroller.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight,
      );
    expect(
      await scroller.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await expect.poll(distanceFromEnd).toBeLessThan(2);

    await page
      .getByRole("textbox", { name: "Your message" })
      .fill(Array.from({ length: 12 }, (_, line) => line).join("\n"));

    await expect.poll(distanceFromEnd).toBeLessThan(2);
  });

  test("offers Jump to latest while the visitor reads further up during an answer, and the chat follows again after it", async ({
    page,
  }) => {
    // Short enough that one answer fills the chat.
    await page.setViewportSize({ width: 1440, height: 480 });
    await openChat(page);
    await ask(page, "Draft the first section.");
    await expect(turns(page).nth(1)).toContainText(ANSWER_END);

    // The next answer is held, so it's still on its way while the visitor
    // reads.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      "**/api/chat",
      async (route) => {
        await held;
        await route.continue();
      },
      { times: 1 },
    );
    await ask(page, QUESTION);
    const working = conversation(page).getByText("Thinking", { exact: true });
    await expect(working).toBeInViewport();

    const scroller = page.locator("#chat-title + div");
    const distanceFromEnd = () =>
      scroller.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight,
      );
    const jump = page.getByRole("button", { name: "Jump to latest" });
    await expect(jump).toHaveCount(0);

    await scroller.hover();
    await page.mouse.wheel(0, -2000);
    await expect(jump).toBeVisible();
    await expect(working).not.toBeInViewport();
    // Square corners, like the other buttons.
    await expect(jump).toHaveCSS("border-radius", "4px");
    await expectNoAccessibilityViolations(page);

    await jump.click();
    await expect(working).toBeInViewport();
    await expect(jump).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: "Your message" }),
    ).toBeFocused();

    // Following again: the answer arrives, and the chat keeps its end.
    release();
    await expect(turns(page).nth(3)).toContainText(ANSWER_END);
    await expect.poll(distanceFromEnd).toBeLessThan(2);
    await expect(jump).toHaveCount(0);
  });

  test("ends the chat at its last line while an answer ends in folded searches", async ({
    page,
  }) => {
    // The folded lines' labels for screen readers are `absolute`: placed
    // against the chat's pane instead of the fold that clips them, they
    // stretched the pane below its last line, and the chat, following its
    // end, showed blank space under it (found 2026-10-22).
    const search = (id: string, query: string) => ({
      type: "tool-searchNotes",
      toolCallId: id,
      state: "output-available",
      input: { query },
      output: {
        passages: [
          {
            id: 1,
            slug: "henk",
            participant: "Henk",
            position: 4,
            question: "How would you want to know when Ineke adds something?",
            answer: "I'd like my phone to ping me every time.",
            distance: 0.3,
          },
        ],
      },
    });
    await page.setViewportSize({ width: 1440, height: 480 });
    await page.addInitScript(
      ({ key, kept }) => localStorage.setItem(key, JSON.stringify(kept)),
      {
        key: STORAGE_KEY,
        kept: {
          format: STORED_FORMAT,
          messages: [
            {
              id: "question",
              role: "user",
              parts: [{ type: "text", text: QUESTION }],
            },
            {
              id: "answer",
              role: "assistant",
              parts: [
                { type: "step-start" },
                {
                  type: "text",
                  text: Array.from(
                    { length: 12 },
                    () => "Henk wants a ping for every item Ineke adds.",
                  ).join(" "),
                  state: "done",
                },
              ],
            },
            {
              id: "again",
              role: "user",
              parts: [{ type: "text", text: "Search once more." }],
            },
            {
              id: "searches",
              role: "assistant",
              parts: [
                { type: "step-start" },
                search("first", "pings"),
                { type: "step-start" },
                search("second", "notifications"),
              ],
            },
          ],
          interrupted: false,
          stopped: [],
        },
      },
    );
    await page.goto("/");
    await expect(
      turns(page).nth(3).getByRole("button", { name: "Used 2 searches" }),
    ).toBeVisible();

    const { scrollHeight, clientHeight, end } = await page
      .locator("#chat-title + div")
      .evaluate((pane) => {
        const list = pane.querySelector(":scope > ol")!;
        const top = pane.getBoundingClientRect().top - pane.scrollTop;
        return {
          scrollHeight: pane.scrollHeight,
          clientHeight: pane.clientHeight,
          end: list.getBoundingClientRect().bottom - top,
        };
      });
    expect(scrollHeight).toBeGreaterThan(clientHeight);
    expect(Math.abs(scrollHeight - end)).toBeLessThan(1);
  });
  test("offers Jump to latest once opened searches push the chat's end out of view", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 480 });
    await openChat(page);
    await ask(page, `Draft the first section. ${FAKE_SEARCH_AGAIN}`);
    await expect(turns(page).nth(1)).toContainText(ANSWER_END);
    // The answer's last words show before it ends, and until then the chat
    // follows it, which can take it back to its end past the opened searches.
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
    const jump = page.getByRole("button", { name: "Jump to latest" });

    await turns(page)
      .nth(1)
      .getByRole("button", { name: "Used 3 searches" })
      .click();
    await expect(jump).toBeVisible();

    await jump.click();
    await expect(turns(page).nth(1).getByText(ANSWER_END)).toBeInViewport();
    await expect(jump).toHaveCount(0);
  });

  test("keeps the focused skip link inside the slimmer header", async ({
    page,
  }) => {
    // The header is the same on every page; the intro's first Tab reaches it.
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();

    const link = await skip.boundingBox();
    const header = await page.getByRole("banner").boundingBox();
    // The 2px outline sits 2px outside the link.
    expect(link!.y - 4).toBeGreaterThanOrEqual(header!.y);
    expect(link!.y + link!.height + 4).toBeLessThanOrEqual(
      header!.y + header!.height,
    );
  });
});

test.describe("the workspace on a 1024px-wide laptop", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("keeps the chat at least 400px wide and gives the PRD the rest, without scrolling sideways", async ({
    page,
  }) => {
    await openChat(page);
    await ask(page, "Draft the first section.");
    await expect(chat(page)).toContainText(ANSWER_END);

    expect(await width(chat(page))).toBeCloseTo(400, 0);
    const workspace = await page.locator("[data-workspace]").boundingBox();
    // The PRD takes what's left beside the chat and the 32px between them.
    expect(await width(prd(page))).toBeCloseTo(workspace!.width - 400 - 32, 0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expectNoAccessibilityViolations(page);
  });
});

test.describe("the workspace on a wide screen", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("grows the page to 1600px, with the chat still at most 520px wide", async ({
    page,
  }) => {
    await openChat(page);

    // 1600px, less the page's 24px of padding on each side.
    expect(await width(page.locator("[data-workspace]"))).toBeCloseTo(1552, 0);
    expect(await width(chat(page))).toBeCloseTo(520, 0);
  });
});

test.describe("the workspace on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("stacks the chat over the PRD across the screen, without scrolling sideways", async ({
    page,
  }) => {
    await openChat(page);

    const chatBox = await chat(page).boundingBox();
    const prdBox = await prd(page).boundingBox();
    expect(prdBox!.y).toBeGreaterThan(chatBox!.y + chatBox!.height);
    expect(chatBox!.width).toBeCloseTo(prdBox!.width, 0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test("never offers Jump to latest, since the chat doesn't scroll on its own", async ({
    page,
  }) => {
    await openChat(page);
    await ask(page, "Draft the first section.");
    await expect(turns(page).nth(1)).toContainText(ANSWER_END);

    // The page scrolls, not the chat's pane.
    const scroller = page.locator("#chat-title + div");
    expect(
      await scroller.evaluate(
        (element) => element.scrollHeight <= element.clientHeight,
      ),
    ).toBe(true);
    await page.mouse.wheel(0, 2000);
    await page.mouse.wheel(0, -2000);
    await expect(
      page.getByRole("button", { name: "Jump to latest" }),
    ).toHaveCount(0);
  });
});
