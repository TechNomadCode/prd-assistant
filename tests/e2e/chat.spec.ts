import { expect, test, type Page } from "@playwright/test";
import { FAKE_FAILURES } from "@/server/ai/fake-chat-model";
import { expectNoAccessibilityViolations } from "./accessibility";

// The chat on the home page, with the scripted fake model. It searches with
// the visitor's own words and quotes the closest passage, or, asked for a
// section, saves one for the check; phrases in a message make it fail on
// purpose or save a flawed section (src/server/ai/fake-chat-model.ts).

const QUESTION = "Who wants a notification for every item someone adds?";
const FAKE_NOTE = "(This is the local fake model";

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
  test("answers with the search it ran as one line, which opens to the passages", async ({
    page,
  }) => {
    await page.goto("/");
    await ask(page, QUESTION);

    await expect(conversation(page)).toContainText(QUESTION);
    const line = page.getByRole("button", {
      name: `Searched the interviews for “${QUESTION}”: closest passages from Sofia, Maya, Henk and Daan`,
    });
    await expect(line).toHaveAttribute("aria-expanded", "false");
    await expect(conversation(page)).toContainText(
      "The closest passages come from Sofia, Maya, Henk and Daan.",
    );
    await expect(conversation(page)).toContainText(FAKE_NOTE);

    await line.click();

    const passages = page.getByRole("list", {
      name: `Passages found for “${QUESTION}”`,
    });
    await expect(passages.getByRole("listitem")).toHaveCount(5);
    await expect(
      passages.getByRole("listitem").filter({ hasText: "ping me" }),
    ).toHaveText(
      /^Researcher: How would you want to know when Ineke adds something\?\s*I'd like my phone to ping me every time .*Henk$/,
    );
  });

  test("streams the answer from the server as it's written", async ({
    page,
  }) => {
    await page.goto("/");
    const answer = page.waitForResponse("**/api/chat");
    await ask(page, QUESTION);

    const response = await answer;
    expect(response.headers()["content-type"]).toContain("text/event-stream");
    const events = await response.text();
    expect(events.match(/"type":"text-delta"/g)?.length).toBeGreaterThan(10);
  });

  test("keeps the demo notice with the message box", async ({ page }) => {
    await page.goto("/");

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
    await page.goto("/");
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
    await page.goto("/");
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

  test("passes the accessibility check with an answer and its passages open", async ({
    page,
  }) => {
    await page.goto("/");
    await ask(page, QUESTION);
    await expect(conversation(page)).toContainText(FAKE_NOTE);
    await page
      .getByRole("button", { name: /^Searched the interviews for/ })
      .click();
    await expect(
      page.getByRole("list", { name: /^Passages found for/ }),
    ).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });
});
