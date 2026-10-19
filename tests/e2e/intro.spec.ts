import { expect, test, type Page, type Request } from "@playwright/test";
import type { ChatMessage } from "@/lib/chat";
import {
  FIRST_SECTION_REQUEST,
  GROCERY_DELIVERY_SUGGESTION,
} from "@/lib/suggestions";
import { expectNoAccessibilityViolations } from "./accessibility";

// The intro on the home page, then the chat it opens, with the scripted fake
// model (src/server/ai/fake-chat-model.ts): asked for the first section, it
// saves one, so the suggestion to try to break it appears.

const INTRO_TITLE = "You're the product manager of a shared grocery list app";
const WORKSPACE_TITLE = "The chat and your PRD";
const FAKE_NOTE = "(This is the local fake model";
// The filled white button (docs/decisions.md, Design); quiet ones have none.
const FILLED = "rgb(255, 255, 255)";
const UNFILLED = "rgba(0, 0, 0, 0)";

function draftButton(page: Page) {
  return page.getByRole("button", { name: "Draft the first section" });
}

function conversation(page: Page) {
  return page.getByRole("list", { name: "Conversation" });
}

function prd(page: Page) {
  return page.getByRole("region", { name: "Shared grocery list app" });
}

function suggestion(page: Page) {
  return page.getByRole("group", { name: /try to break it/ });
}

/** The visitor's messages a request to /api/chat sent. */
function sentByVisitor(request: Request): string[] {
  const { messages } = request.postDataJSON() as { messages: ChatMessage[] };
  return messages
    .filter((message) => message.role === "user")
    .map((message) =>
      message.parts.flatMap((part) =>
        part.type === "text" ? [part.text] : [],
      ),
    )
    .map((texts) => texts.join("\n"));
}

/** Holds the next request to /api/chat until `release`, then lets it go on or fails it. */
async function holdNextAnswer(page: Page, then: "continue" | "abort") {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    "**/api/chat",
    async (route) => {
      await held;
      await (then === "continue" ? route.continue() : route.abort());
    },
    { times: 1 },
  );
  return release;
}

test.describe("the intro", () => {
  test("says who the visitor is, what the interviews are and what their job is, with one filled button that drafts and, quieter, a link to the full interviews and a way to ask first", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      INTRO_TITLE,
    );
    const main = page.getByRole("main");
    await expect(main).toContainText(
      "A researcher already interviewed six households about it. Those transcripts are finished records: the AI reads and quotes them, and never asks their questions again.",
    );
    await expect(main).toContainText(
      "Your job is to turn them into a product requirements document, a PRD. The AI proves every line with a quote, and the app's own code checks each one.",
    );
    await expect(draftButton(page)).toBeVisible();
    // Exactly one filled button, the one that drafts the first section; the
    // link to the full interviews and the way to ask first are quiet.
    const interviews = main.getByRole("link", {
      name: "Read the full interviews",
    });
    const askFirst = main.getByRole("button", {
      name: "Or ask your own question first",
    });
    await expect(main.getByRole("button")).toHaveCount(2);
    await expect(draftButton(page)).toHaveCSS("background-color", FILLED);
    await expect(askFirst).toHaveCSS("background-color", UNFILLED);
    await expect(interviews).toHaveCSS("background-color", UNFILLED);
    await expect(interviews).toHaveAttribute("href", "/transcripts");
    await expect(
      page.getByRole("textbox", { name: "Your message" }),
    ).toHaveCount(0);
    await expect(prd(page)).toHaveCount(0);
  });

  test("its button drafts the first section with the shared request, and the chat with the PRD appears, focus on them", async ({
    page,
  }) => {
    await page.goto("/");
    const request = page.waitForRequest("**/api/chat");

    await draftButton(page).click();

    expect(sentByVisitor(await request)).toEqual([FIRST_SECTION_REQUEST]);
    await expect(
      page.getByRole("heading", { level: 1, name: WORKSPACE_TITLE }),
    ).toBeFocused();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(conversation(page)).toContainText(FIRST_SECTION_REQUEST);
    await expect(conversation(page)).toContainText(FAKE_NOTE);
    await expect(
      page.getByRole("list", { name: "Statements in Introduction / Overview" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("contentinfo")
        .getByRole("link", { name: "How the search and the check work" }),
    ).toBeVisible();
  });

  test("a quieter way in opens the empty chat, focus in the message box", async ({
    page,
  }) => {
    await page.goto("/");

    await page
      .getByRole("button", { name: "Or ask your own question first" })
      .click();

    await expect(
      page.getByRole("textbox", { name: "Your message" }),
    ).toBeFocused();
    await expect(prd(page)).toContainText("0 of 9 sections");
    await expect(conversation(page)).toHaveCount(0);
  });

  test("when the first request fails, the intro comes back with a clear message and its button, which tries again", async ({
    page,
  }) => {
    // The fake model fails only on its trigger phrases, and the intro sends a
    // fixed request that can't contain them, so this test fails the request
    // at the network level instead (tests/unit/workspace.test.tsx stubs
    // fetch for the same path).
    const release = await holdNextAnswer(page, "abort");
    await page.goto("/");

    await draftButton(page).click();
    await expect(conversation(page)).toContainText(FIRST_SECTION_REQUEST);
    release();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "The first section wasn't drafted: something went wrong before the assistant could finish. Try again in a moment.",
    );
    await expect(
      page.getByRole("heading", { level: 1, name: INTRO_TITLE }),
    ).toBeFocused();
    await expect(conversation(page)).toHaveCount(0);
    await expectNoAccessibilityViolations(page);

    const retry = page.waitForRequest("**/api/chat");
    await draftButton(page).click();

    expect(sentByVisitor(await retry)).toEqual([FIRST_SECTION_REQUEST]);
    await expect(conversation(page)).toContainText(FAKE_NOTE);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });
});

test.describe("the suggestion to try to break it", () => {
  test("appears only once the first section is saved, sends the claim word for word with one click, then is gone", async ({
    page,
  }) => {
    const release = await holdNextAnswer(page, "continue");
    await page.goto("/");

    await draftButton(page).click();
    await expect(conversation(page)).toContainText(FIRST_SECTION_REQUEST);
    await expect(suggestion(page)).toHaveCount(0);
    release();

    await expect(
      page.getByRole("list", { name: "Statements in Introduction / Overview" }),
    ).toBeVisible();
    await expect(suggestion(page)).toHaveAccessibleName(
      "Now try to break it. Send a claim that nobody in the interviews made:",
    );
    const claim = suggestion(page).getByRole("button", {
      name: GROCERY_DELIVERY_SUGGESTION,
    });
    const request = page.waitForRequest("**/api/chat");

    await claim.click();

    expect(sentByVisitor(await request)).toEqual([
      FIRST_SECTION_REQUEST,
      GROCERY_DELIVERY_SUGGESTION,
    ]);
    await expect(suggestion(page)).toHaveCount(0);
    // The check-in is disabled while the assistant works: once it's back,
    // the answer to the claim has finished.
    await expect(
      page.getByRole("button", { name: /^Looks right/ }),
    ).toBeEnabled();
    await expect(conversation(page)).toContainText(GROCERY_DELIVERY_SUGGESTION);
    await expect(suggestion(page)).toHaveCount(0);
  });
});

test("passes the accessibility check on the intro, and with the chat, the PRD and the suggestion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(draftButton(page)).toBeVisible();
  await expectNoAccessibilityViolations(page);

  await draftButton(page).click();
  await expect(suggestion(page)).toBeVisible();

  await expectNoAccessibilityViolations(page);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the intro and the chat stack and fit the width, and the suggestion still sends with one tap", async ({
    page,
  }) => {
    const fitsTheWidth = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
    await page.goto("/");
    expect(await fitsTheWidth()).toBe(true);

    await draftButton(page).click();
    const claim = page.getByRole("button", {
      name: GROCERY_DELIVERY_SUGGESTION,
    });
    await expect(claim).toBeVisible();
    expect(await fitsTheWidth()).toBe(true);

    await claim.click();

    await expect(conversation(page)).toContainText(GROCERY_DELIVERY_SUGGESTION);
    await expect(claim).toHaveCount(0);
  });
});
