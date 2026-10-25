import { expect, test, type Page } from "@playwright/test";
import { FAKE_FAILURES, FAKE_SEARCH_AGAIN } from "@/server/ai/fake-chat-model";
import {
  STORAGE_KEY,
  STORED_FORMAT,
} from "@/features/workspace/stored-conversation";
import { expectNoAccessibilityViolations } from "./accessibility";
import { arrivals, recordArrivals } from "./motion";

// The chat on the home page, with the scripted fake model. It searches with
// the visitor's own words and quotes the closest passage, or, asked for a
// section, saves one for the check; phrases in a message make it fail on
// purpose or save a flawed section (src/server/ai/fake-chat-model.ts).

const QUESTION = "Who wants a notification for every item someone adds?";
const FAKE_NOTE = "(This is the local fake model";

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

function conversation(page: Page) {
  return page.getByRole("list", { name: "Conversation" });
}

/** A step whose result the server is still waiting for. */
type HeldStep = {
  toolName: "searchNotes" | "saveSection";
  input: unknown;
  /** The error it ends in once the test lets it finish. */
  errorText: string;
};

/**
 * Answers the next message with one step that stays in progress until the
 * test calls `window.finishStep()`, as a search or a save does while the
 * server waits on a slow database, then ends it in an error. The chat's
 * requests go through the page's own `fetch`, which this replaces from an
 * init script, since a route can't hold a response halfway.
 */
async function holdStep(page: Page, step: HeldStep) {
  await page.addInitScript((step) => {
    const fetchFromNetwork = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.includes("/api/chat")) return fetchFromNetwork(input, init);
      let finish = () => {};
      const finished = new Promise<void>((resolve) => (finish = resolve));
      Object.assign(window, { finishStep: finish });
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (chunk: unknown) =>
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
            );
          send({ type: "start" });
          send({ type: "start-step" });
          send({
            type: "tool-input-available",
            toolCallId: "held",
            toolName: step.toolName,
            input: step.input,
          });
          await finished;
          send({
            type: "tool-output-error",
            toolCallId: "held",
            errorText: step.errorText,
          });
          send({ type: "finish-step" });
          send({ type: "finish" });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(body, {
        headers: {
          "content-type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
      });
    };
  }, step);
}

/** The chat's own alert. Next.js keeps an empty one for route changes too. */
function chatAlert(page: Page) {
  return page
    .getByRole("region", { name: "Chat with the assistant" })
    .getByRole("alert");
}

test.describe("chat", () => {
  test("answers with the search it ran as one plain line naming whose passages came back", async ({
    page,
  }) => {
    await openChat(page);
    await ask(page, QUESTION);

    await expect(conversation(page)).toContainText(QUESTION);
    await expect(
      conversation(page).getByText(
        `Search “${QUESTION}” · passages from Sofia, Maya, Henk and Daan`,
      ),
    ).toBeVisible();
    await expect(conversation(page)).toContainText(
      "The closest passages come from Sofia, Maya, Henk and Daan.",
    );
    await expect(conversation(page)).toContainText(FAKE_NOTE);
    await expect(conversation(page).getByRole("button")).toHaveCount(0);
  });

  test("says how long the model thought before each reply, in a line that doesn't open, after a reload too", async ({
    page,
  }) => {
    await openChat(page);
    await ask(page, QUESTION);
    await expect(conversation(page)).toContainText(FAKE_NOTE);

    // The fake model searches, then replies: a wait before each.
    const thoughts = conversation(page).getByText(/^Thought \d+s$/);
    await expect(thoughts).toHaveCount(2);
    const answer = conversation(page).getByRole("listitem").nth(1);
    await expect(answer).toHaveText(
      /^Assistant\s*Thought \d+s\s*Search “[^”]+” · passages from [^]*Thought \d+s\s*I searched the interviews/,
    );
    await expect(thoughts.first()).toHaveCSS("font-size", "13px");
    await expect(thoughts.first()).toHaveCSS("line-height", "16px");
    await expect(thoughts.first()).toHaveCSS("color", "rgb(180, 180, 180)");
    await expect(thoughts.first().getByText("Thought")).toHaveCSS(
      "font-weight",
      "500",
    );
    await expect(conversation(page).getByRole("button")).toHaveCount(0);
    const shown = await thoughts.allTextContents();

    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
    await page.reload();

    await expect(conversation(page).getByText(/^Thought \d+s$/)).toHaveText(
      shown,
    );
  });

  test("folds searches in a row into one line that slides open to them", async ({
    page,
  }) => {
    await openChat(page);
    await ask(page, `${QUESTION} ${FAKE_SEARCH_AGAIN}`);
    await expect(conversation(page)).toContainText(FAKE_NOTE);

    const line = conversation(page).getByRole("button", {
      name: "Used 3 searches",
    });
    const lines = conversation(page).getByText(
      `Search “${QUESTION}” · passages from Sofia, Maya, Henk and Daan`,
    );
    await expect(line).toHaveAttribute("aria-expanded", "false");
    await expect(lines).toHaveCount(3);
    for (const each of await lines.all()) await expect(each).toBeHidden();
    // Its triangle turns as the lines slide, on the curve of what changes in
    // place (src/app/globals.css, Motion).
    const triangle = line.locator("svg");
    await expect(triangle).toHaveCSS("transition-duration", "0.4s");
    await expect(triangle).toHaveCSS(
      "transition-timing-function",
      "cubic-bezier(0.65, 0, 0.35, 1)",
    );

    await line.click();

    await expect(line).toHaveAttribute("aria-expanded", "true");
    for (const each of await lines.all()) await expect(each).toBeVisible();
    // The times the model thought fold with the searches, around each one.
    const rows = page.locator(
      `[id="${await line.getAttribute("aria-controls")}"] p`,
    );
    await expect(rows).toHaveText([
      /^Thought \d+s$/,
      /^Search “/,
      /^Thought \d+s$/,
      /^Search “/,
      /^Thought \d+s$/,
      /^Search “/,
      /^Thought \d+s$/,
    ]);
    const tops = await Promise.all(
      (await rows.all()).map(async (row) => (await row.boundingBox())!.y),
    );
    // 28px rows, 8px apart, as opencode's (docs/decisions.md, Design, 2026-10-20).
    for (let row = 1; row < tops.length; row++) {
      expect(tops[row]! - tops[row - 1]!).toBe(36);
    }

    await line.click();

    await expect(line).toHaveAttribute("aria-expanded", "false");
    for (const each of await lines.all()) await expect(each).toBeHidden();
  });

  test("opens the folded line at once under reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openChat(page);
    await ask(page, `${QUESTION} ${FAKE_SEARCH_AGAIN}`);
    await expect(conversation(page)).toContainText(FAKE_NOTE);
    const line = conversation(page).getByRole("button", {
      name: "Used 3 searches",
    });

    await line.click();

    // Neither the mark turns nor the lines slide: no transition starts.
    expect(
      await line.evaluate(
        (button) =>
          button.parentElement!.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    await expect(
      conversation(page)
        .getByText(/^Search “/)
        .first(),
    ).toBeVisible();
  });

  test("streams the answer from the server as it's written", async ({
    page,
  }) => {
    await openChat(page);
    const answer = page.waitForResponse("**/api/chat");
    await ask(page, QUESTION);

    const response = await answer;
    expect(response.headers()["content-type"]).toContain("text/event-stream");
    const events = await response.text();
    expect(events.match(/"type":"text-delta"/g)?.length).toBeGreaterThan(10);
  });

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`moves Thinking while the answer is on its way, unless motion is reduced (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
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
      await openChat(page);
      await ask(page, QUESTION);

      const working = conversation(page).getByText("Thinking", {
        exact: true,
      });
      await expect(working).toBeVisible();
      // opencode's Thinking row: 13px, medium weight, 16px high.
      await expect(working).toHaveCSS("font-size", "13px");
      await expect(working).toHaveCSS("font-weight", "500");
      await expect(working).toHaveCSS("line-height", "16px");
      await expect(working).toHaveCSS(
        "animation-name",
        reducedMotion === "reduce" ? "none" : "shimmer",
      );
      if (reducedMotion === "reduce") {
        await expect(working).toHaveCSS("color", "rgb(180, 180, 180)");
      }

      release();
      await expect(conversation(page)).toContainText(FAKE_NOTE);
      await expect(working).toHaveCount(0);
    });
  }

  const heldSteps: { name: string; line: string; step: HeldStep }[] = [
    {
      name: "search",
      line: "Search “pings”…",
      step: {
        toolName: "searchNotes",
        input: { query: "pings" },
        errorText: "The search didn't work this time.",
      },
    },
    {
      name: "quote check",
      line: "Checking the quotes in Goals / Objectives…",
      step: {
        toolName: "saveSection",
        input: {
          section: "Goals / Objectives",
          statements: [
            {
              text: "Keep one list.",
              citations: [{ source: "maya-3", quote: "one list" }],
            },
          ],
        },
        errorText:
          "The section couldn't be checked this time, so it wasn't saved.",
      },
    },
  ];
  for (const { name, line, step } of heldSteps) {
    test(`brings a ${name} in once and keeps its band moving while it waits, without arriving again`, async ({
      page,
    }) => {
      // The arrival and the band are both animations of the one line. Mixed
      // up, the line rose in again every 0.4s while it waited, with no band
      // (found 2026-10-25, while the database was down).
      await holdStep(page, step);
      await openChat(page);
      await ask(page, QUESTION);

      const working = conversation(page).getByText(line);
      await expect(working).toBeVisible();
      await expect(working).toHaveCSS(
        "animation-name",
        "arrive, arrive-fade, shimmer",
      );
      await expect(working).toHaveCSS(
        "animation-iteration-count",
        "1, 1, infinite",
      );
      // Once it has arrived, only the band runs.
      await expect
        .poll(() =>
          working.evaluate((element) =>
            element
              .getAnimations()
              .map(
                (animation) =>
                  `${(animation as CSSAnimation).animationName} ${animation.playState}`,
              ),
          ),
        )
        .toEqual(["shimmer running"]);

      await page.evaluate(() =>
        (window as unknown as { finishStep: () => void }).finishStep(),
      );
      await expect(conversation(page)).toContainText(step.errorText);
      await expect(working).toHaveCount(0);
    });
  }

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`brings the answer's words in one after another as they arrive, unless motion is reduced, then plain again, and not after a reload (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await recordArrivals(page, ".word-arrive");
      await openChat(page);
      await ask(page, QUESTION);
      await expect(conversation(page)).toContainText(FAKE_NOTE);

      const words = await arrivals(page);
      if (reducedMotion === "reduce") {
        expect(words).toEqual([]);
      } else {
        // The fake model sends a word at a time, so its words come one by
        // one, or a few together should a busy page gather many.
        expect(words.length).toBeGreaterThan(10);
        for (const word of words) {
          expect(word.text).toMatch(/^\S(.*\S)?$/);
          expect(word.animation).toBe("word-arrive");
          expect(word.duration).toBe("0.3s");
        }
      }
      // Then plain again, as tests and screen readers read it: no word apart
      // from the others, one text node per run.
      await expect(conversation(page).locator(".word-arrive")).toHaveCount(0);
      const reply = conversation(page).locator("p", { hasText: FAKE_NOTE });
      await expect(reply.locator("span")).toHaveCount(0);
      expect(
        await reply.evaluate((paragraph) =>
          [...paragraph.childNodes].map((node) => node.nodeName),
        ),
      ).toEqual(["#text"]);

      // Kept once the answer has ended.
      await expect
        .poll(() =>
          page.evaluate(
            () => localStorage.getItem("prd-assistant:conversation") ?? "",
          ),
        )
        .toContain(FAKE_NOTE);
      await page.reload();
      await expect(conversation(page)).toContainText(FAKE_NOTE);
      expect(await arrivals(page)).toEqual([]);
    });
  }

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`draws a search's plain lines together into the folded line as the next search joins them, unless motion is reduced (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await recordArrivals(page, ".fold-closes, .fold-settles");
      await openChat(page);
      await ask(page, `${QUESTION} ${FAKE_SEARCH_AGAIN}`);
      await expect(conversation(page)).toContainText(FAKE_NOTE);

      const folded = await arrivals(page);
      if (reducedMotion === "reduce") {
        expect(folded).toEqual([]);
      } else {
        // The lines that showed: the time before the first search, the
        // search, and maybe the time before the second, which came with it.
        const lines = folded.find(({ classes }) =>
          classes.includes("fold-closes"),
        );
        expect(lines?.animation).toBe("fold-closes");
        const texts = lines?.children.map(({ text }) => text) ?? [];
        expect(texts[0]).toMatch(/^Thought \d+s$/);
        expect(texts[1]).toBe(
          `Search “${QUESTION}” · passages from Sofia, Maya, Henk and Daan`,
        );
        expect(texts.slice(2)).toEqual(
          texts.length > 2 ? [expect.stringMatching(/^Thought \d+s$/)] : [],
        );
        for (const line of lines?.children ?? []) {
          expect(line.animation).toBe("fold-leaves");
        }
        const line = folded.find(({ classes }) =>
          classes.includes("fold-settles"),
        );
        expect(line?.text).toBe("Used 2 searches");
        expect(line?.animation).toBe("fold-settles");
        expect(line?.delay).toBe("0.265s");
      }

      // Then only the folded line, in its place and still.
      await expect(conversation(page).locator(".fold-closes")).toHaveCount(0);
      const line = conversation(page).getByRole("button", {
        name: "Used 3 searches",
      });
      await expect(line).toHaveCSS("position", "static");
      await expect(line).toHaveCSS("opacity", "1");
      await expect(line).toHaveCSS("transform", "none");
    });
  }

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`brings in the visitor's message and each line of the answer, the saved line's tick drawing itself, unless motion is reduced, and nothing after a reload (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await openChat(page);
      await ask(page, "Draft the first section.");
      await expect(conversation(page)).toContainText(FAKE_NOTE);

      const moving = (name: string) =>
        reducedMotion === "reduce" ? "none" : name;
      const asked = conversation(page).locator(":scope > li").first();
      const search = conversation(page).getByText(/^Search “/);
      const saved = conversation(page).locator("p", {
        hasText: /^Saved Introduction \/ Overview/,
      });
      await expect(asked).toHaveCSS(
        "animation-name",
        moving("arrive, arrive-fade"),
      );
      await expect(
        conversation(page)
          .getByText(/^Thought \d+s$/)
          .first(),
      ).toHaveCSS("animation-name", moving("arrive, arrive-fade"));
      await expect(search).toHaveCSS(
        "animation-name",
        moving("arrive, arrive-fade"),
      );
      await expect(saved).toHaveCSS(
        "animation-name",
        moving("arrive, arrive-fade"),
      );
      // The tick draws its circle, then itself.
      await expect(saved.locator("circle")).toHaveCSS(
        "animation-name",
        moving("tick-draw"),
      );
      await expect(saved.locator("path")).toHaveCSS(
        "animation-name",
        moving("tick-draw"),
      );
      if (reducedMotion === "no-preference") {
        await expect(asked).toHaveCSS("animation-duration", /^0\.4s/);
        await expect(search).toHaveCSS("animation-duration", /^0\.4s/);
      }
      // Then still, sharp and whole, the tick drawn.
      for (const line of [asked, search, saved]) {
        await expect(line).toHaveCSS("opacity", "1");
        await expect(line).toHaveCSS("transform", "none");
        await expect(line).toHaveCSS("filter", "none");
      }
      await expect(saved.locator("circle")).toHaveCSS(
        "stroke-dashoffset",
        "0px",
      );

      // Kept once the answer has ended, and brought back still.
      await expect
        .poll(() =>
          page.evaluate(
            () => localStorage.getItem("prd-assistant:conversation") ?? "",
          ),
        )
        .toContain(FAKE_NOTE);
      await page.reload();
      await expect(conversation(page)).toContainText(FAKE_NOTE);
      await expect(conversation(page).locator(".arrive")).toHaveCount(0);
      await expect(saved.locator("circle")).toHaveCSS("animation-name", "none");
    });
  }

  test("stops an answer with Stop, keeping what the visitor typed and the focus, and the chat goes on, after a reload too", async ({
    page,
  }) => {
    // Held, so the answer is still on its way when Stop is clicked.
    await page.route("**/api/chat", () => {}, { times: 1 });
    await openChat(page);
    await ask(page, QUESTION);
    const box = page.getByRole("textbox", { name: "Your message" });
    await box.fill("Who doesn't?");

    await page.getByRole("button", { name: "Stop" }).click();

    await expect(conversation(page)).toContainText(
      `${QUESTION}AssistantYou stopped this answer.`,
    );
    await expect(page.getByRole("button", { name: "Send" })).toBeFocused();
    await expect(box).toHaveValue("Who doesn't?");
    await expect(chatAlert(page)).toHaveCount(0);
    await expectNoAccessibilityViolations(page);

    await page.reload();
    await expect(conversation(page)).toContainText("You stopped this answer.");
    await ask(page, `${QUESTION} Again.`);
    await expect(conversation(page)).toContainText(FAKE_NOTE);
    await expect(conversation(page)).toContainText("You stopped this answer.");
    await expect(chatAlert(page)).toHaveCount(0);
  });

  test("keeps the demo notice with the message box", async ({ page }) => {
    await openChat(page);

    const box = page.getByRole("textbox", { name: "Your message" });
    await expect(box).toHaveAccessibleDescription(
      "This is a demo with fictional interviews. Don't enter personal information.",
    );
    await expect(
      page.getByText("This is a demo with fictional interviews."),
    ).toBeVisible();
  });

  test("marks an answer that breaks off as unfinished, and trying again replaces it", async ({
    page,
  }, testInfo) => {
    await openChat(page);
    await ask(
      page,
      `Who wants a ping for every item? ${FAKE_FAILURES.partway} ${testInfo.testId}`,
    );

    await expect(chatAlert(page)).toHaveText(
      /Something went wrong before the assistant could finish\. Try again in a moment\./,
    );
    await expect(conversation(page)).toContainText(
      "This answer stopped before it finished.",
    );
    await expect(conversation(page)).toContainText("I searched the interviews");
    await expect(conversation(page)).not.toContainText(FAKE_NOTE);

    await page.getByRole("button", { name: "Try again" }).click();

    await expect(conversation(page)).toContainText(FAKE_NOTE);
    await expect(chatAlert(page)).toHaveCount(0);
    await expect(conversation(page)).not.toContainText(
      "This answer stopped before it finished.",
    );
    await expect(
      conversation(page)
        .getByRole("listitem")
        .filter({ hasText: /^Assistant/ }),
    ).toHaveCount(1);
  });

  test("shows a plain message when the provider fails before answering, and trying again works", async ({
    page,
  }, testInfo) => {
    await openChat(page);
    await ask(
      page,
      `Who wants a ping for every item? ${FAKE_FAILURES.beforeAnswering} ${testInfo.testId}`,
    );

    await expect(chatAlert(page)).toContainText(
      "Something went wrong before the assistant could finish.",
    );
    await expect(
      conversation(page)
        .getByRole("listitem")
        .filter({ hasText: /^Assistant/ }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Try again" }).click();

    await expect(conversation(page)).toContainText(FAKE_NOTE);
    await expect(chatAlert(page)).toHaveCount(0);
  });

  test("passes the accessibility check with an answer's searches folded and open", async ({
    page,
  }) => {
    await openChat(page);
    await ask(page, `${QUESTION} ${FAKE_SEARCH_AGAIN}`);
    await expect(conversation(page)).toContainText(FAKE_NOTE);
    await expectNoAccessibilityViolations(page);

    await conversation(page)
      .getByRole("button", { name: "Used 3 searches" })
      .click();
    await expect(
      conversation(page)
        .getByText(/^Search “/)
        .first(),
    ).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });
});

// A table in the assistant's answer (slice 19). The fake model never writes
// one, so the tests open a kept conversation whose answer holds two tables, a
// wide one and one that fits a laptop's chat.
test.describe("a table in an answer", () => {
  const ANSWER = [
    "The households differ on six points:",
    "",
    "| Persona | Household | Shopping | Needs | Pain points | Notifications |",
    "|---|---|---|---|---|---|",
    "| **Maya** | Parent of two, organises everything | Supermarket, weekly | • One shared list<br>• Aisle order | • Duplicates<br>• Forgotten items | Summaries |",
    "| **Henk** | Retired, lives with Ineke | Neighbourhood shop, daily | • A ping for every item | • Missing what Ineke adds | Everything |",
    "",
    "And the goal they share:",
    "",
    "| Goal | Metric |",
    "|---|---|",
    "| Fewer forgotten items | Items forgotten a week |",
  ].join("\n");

  test.beforeEach(async ({ page }) => {
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
              parts: [{ type: "text", text: "How do the households differ?" }],
            },
            {
              id: "answer",
              role: "assistant",
              parts: [
                { type: "step-start" },
                { type: "text", text: ANSWER, state: "done" },
              ],
            },
          ],
          interrupted: false,
          stopped: [],
        },
      },
    );
  });

  function wideTable(page: Page) {
    return conversation(page)
      .getByRole("table")
      .filter({
        has: page.getByRole("columnheader", { name: "Notifications" }),
      });
  }

  /** Whether the page itself scrolls sideways. */
  function pageScrollsSideways(page: Page) {
    return page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
  }

  test.describe("on a laptop", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("shows each as a table, the wide one scrolling sideways in its own box, which the keyboard reaches", async ({
      page,
    }) => {
      await page.goto("/");

      await expect(conversation(page).getByRole("table")).toHaveCount(2);
      await expect(wideTable(page).getByRole("columnheader")).toHaveText([
        "Persona",
        "Household",
        "Shopping",
        "Needs",
        "Pain points",
        "Notifications",
      ]);
      await expect(
        wideTable(page).getByRole("cell", { name: "Maya" }),
      ).toBeVisible();
      await expect(conversation(page)).not.toContainText("|");
      await expect(conversation(page)).not.toContainText("<br");
      await expect(conversation(page)).not.toContainText("**");

      // Only the wide table's box scrolls, so only it is a stop for the
      // keyboard; the page and the chat's pane don't scroll sideways.
      const box = conversation(page).getByRole("region", {
        name: "Table, scrolls sideways",
      });
      await expect(box).toHaveCount(1);
      await expect(box.getByRole("table")).toContainText("Notifications");
      expect(await pageScrollsSideways(page)).toBe(false);
      expect(
        await page
          .locator("#chat-title + div")
          .evaluate((pane) => pane.scrollWidth > pane.clientWidth),
      ).toBe(false);

      await box.focus();
      await expect(box).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => box.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);

      await expectNoAccessibilityViolations(page);
    });
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("scrolls a table sideways inside the message, never the page", async ({
      page,
    }) => {
      await page.goto("/");

      await expect(conversation(page).getByRole("table")).toHaveCount(2);
      await expect(
        conversation(page).getByRole("region", {
          name: "Table, scrolls sideways",
        }),
      ).not.toHaveCount(0);
      expect(await pageScrollsSideways(page)).toBe(false);

      await expectNoAccessibilityViolations(page);
    });
  });
});
