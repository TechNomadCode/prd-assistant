import { expect, test, type Page } from "@playwright/test";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { QUOTA_USED_UP } from "@/lib/chat";
import { site } from "@/lib/site";
import { expectNoAccessibilityViolations } from "./accessibility";

// What a visitor sees once Cloudflare's daily free allocation is used up. The
// fake model can't run out, so the next request to /api/chat gets the answer
// the chat route sends then: the stream's error in the server's words
// (src/server/chat.ts, describeError), built with the AI SDK as the route
// builds it.

async function answerNextWithQuota(page: Page) {
  const reply = createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "error", errorText: QUOTA_USED_UP });
      },
    }),
  });
  const headers = Object.fromEntries(reply.headers.entries());
  const body = await reply.text();
  await page.route(
    "**/api/chat",
    (route) => route.fulfill({ status: reply.status, headers, body }),
    { times: 1 },
  );
}

async function expectQuotaNotice(page: Page) {
  const notice = page
    .getByRole("main")
    .getByRole("alert")
    .filter({ hasText: "free AI allocation for today is used up" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/resets at 00:00 UTC \(.+ your time\)/);
  await expect(notice.getByRole("link", { name: "README" })).toHaveAttribute(
    "href",
    `${site.links.repository}#readme`,
  );
  await expect(
    notice.getByRole("link", { name: "repository" }),
  ).toHaveAttribute("href", site.links.repository);
}

test.describe("when the demo's free AI allocation is used up", () => {
  test("the intro says so and when it resets, without its button", async ({
    page,
  }) => {
    await page.goto("/");
    await answerNextWithQuota(page);

    await page.getByRole("button", { name: "Draft the first section" }).click();

    await expectQuotaNotice(page);
    await expect(
      page.getByRole("heading", { level: 1, name: /product manager/ }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Draft the first section" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Or ask your own question first" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Read the full interviews" }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test("the chat and the PRD so far stay readable, with no message box or Try again", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Draft the first section" }).click();
    const statements = page.getByRole("list", {
      name: "Statements in Introduction / Overview",
    });
    await expect(statements).toBeVisible();

    await answerNextWithQuota(page);
    await page
      .getByRole("textbox", { name: "Your message" })
      .fill("Who wants a ping for every item?");
    await page.getByRole("button", { name: "Send" }).click();

    await expectQuotaNotice(page);
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("textbox", { name: "Your message" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Looks right/ })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("list", { name: "Conversation" }),
    ).toContainText("Who wants a ping for every item?");
    await expect(statements).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
});
