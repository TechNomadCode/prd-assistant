import { expect, test } from "@playwright/test";
import { DAILY_LIMIT_REACHED, DAILY_MESSAGE_LIMIT } from "@/lib/chat";
import { site } from "@/lib/site";
import { expectNoAccessibilityViolations } from "./accessibility";

// What a visitor sees once they've sent the day's messages. The limit counts
// only messages to the real model, and these tests run on the fake, so the
// next request to /api/chat gets the refusal the chat route sends then: a 429
// with the server's words (src/app/api/chat/route.ts).

test.describe("once the visitor has sent the day's messages", () => {
  test("the chat says so and when they can carry on, with no message box", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Draft the first section" }).click();
    const statements = page.getByRole("list", {
      name: "Statements in Introduction / Overview",
    });
    await expect(statements).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

    await page.route(
      "**/api/chat",
      (route) =>
        route.fulfill({
          status: 429,
          contentType: "text/plain; charset=utf-8",
          body: DAILY_LIMIT_REACHED,
        }),
      { times: 1 },
    );
    await page.getByRole("textbox", { name: "Your message" }).fill("Who?");
    await page.getByRole("button", { name: "Send" }).click();

    const notice = page
      .getByRole("main")
      .getByRole("alert")
      .filter({ hasText: `today's ${DAILY_MESSAGE_LIMIT} messages` });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/after 00:00 UTC \(.+ your time\)/);
    await expect(notice.getByRole("link", { name: "README" })).toHaveAttribute(
      "href",
      `${site.links.repository}#readme`,
    );
    await expect(
      page.getByRole("textbox", { name: "Your message" }),
    ).toBeHidden();
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(
      0,
    );
    await expect(statements).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
});
