import { expect, test, type Page } from "@playwright/test";
import { FAKE_FAILURES, FAKE_SEARCH_AGAIN } from "@/server/ai/fake-chat-model";
import { expectNoAccessibilityViolations } from "./accessibility";

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

    await line.click();

    await expect(line).toHaveAttribute("aria-expanded", "true");
    for (const each of await lines.all()) await expect(each).toBeVisible();
    const [first, second] = await lines.all();
    const gap =
      (await second!.boundingBox())!.y - (await first!.boundingBox())!.y;
    // 28px rows, 8px apart, as opencode's (docs/decisions.md, Design, 2026-10-20).
    expect(gap).toBe(36);

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
    test(`moves Working… while the answer is on its way, unless motion is reduced (${reducedMotion})`, async ({
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

      const working = conversation(page).getByText("Working…");
      await expect(working).toBeVisible();
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

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`fades the answer's words in as they arrive, unless motion is reduced, and not after a reload (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await openChat(page);
      await ask(page, QUESTION);
      await expect(conversation(page)).toContainText(FAKE_NOTE);

      // The fake model sends a word at a time, so its words fade in by groups.
      const fading = conversation(page).locator(".word-enter");
      if (reducedMotion === "reduce") {
        await expect(fading).toHaveCount(0);
      } else {
        expect(await fading.count()).toBeGreaterThan(1);
        await expect(fading.first()).toHaveCSS("animation-name", "word-enter");
        await expect(fading.first()).toHaveCSS("animation-duration", "0.18s");
        await expect(fading.last()).toHaveCSS("opacity", "1");
      }

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
      await expect(fading).toHaveCount(0);
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
