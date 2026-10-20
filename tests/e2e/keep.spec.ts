import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { FIRST_SECTION_REQUEST } from "@/lib/suggestions";
import { expectNoAccessibilityViolations } from "./accessibility";

// The PRD after a reload and as a download, with the scripted fake model:
// the intro's button drafts the first section, whose last statement quotes
// the visitor's own message (src/server/ai/fake-chat-model.ts).

const INTRO_TITLE = "You're the product manager of a shared grocery list app";
const INTRODUCTION = "Statements in Introduction / Overview";
const FAKE_NOTE = "(This is the local fake model";
const STORAGE_KEY = "prd-assistant:conversation";

function prd(page: Page) {
  return page.getByRole("region", { name: "Shared grocery list app" });
}

function conversation(page: Page) {
  return page.getByRole("list", { name: "Conversation" });
}

function statements(page: Page) {
  return page.getByRole("list", { name: INTRODUCTION }).locator(":scope > li");
}

function introHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: INTRO_TITLE });
}

function checkIn(page: Page) {
  return page.getByRole("button", { name: "Looks right: draft Goals" });
}

/**
 * Drafts the first section and waits until the answer has finished, which is
 * when the conversation is kept: the check-in is disabled until then.
 */
async function draftFirstSection(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Draft the first section" }).click();
  await expect(conversation(page)).toContainText(FAKE_NOTE);
  await expect(statements(page)).toHaveCount(4);
  await expect(checkIn(page)).toBeEnabled();
}

test.describe("after a reload", () => {
  test("the chat and the PRD are still there, with the visitor's message behind its quote", async ({
    page,
  }) => {
    await draftFirstSection(page);

    await page.reload();

    await expect(statements(page)).toHaveCount(4);
    await expect(prd(page)).toContainText("1 of 9 sections");
    await expect(conversation(page)).toContainText(FAKE_NOTE);
    await expect(introHeading(page)).toHaveCount(0);
    await expect(checkIn(page)).toBeEnabled();

    await prd(page).getByRole("button", { name: "You, in this chat" }).click();
    await expect(page.locator("#source-popover")).toContainText(
      FIRST_SECTION_REQUEST,
    );

    await expectNoAccessibilityViolations(page);
  });

  test("Start over clears them for good: the reload opens on the intro", async ({
    page,
  }) => {
    await draftFirstSection(page);

    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByRole("button", { name: "Clear both" }).click();
    await expect(introHeading(page)).toBeVisible();
    await page.reload();

    await expect(introHeading(page)).toBeVisible();
    await expect(prd(page)).toHaveCount(0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
    ).toBeNull();
  });

  test("a kept PRD that no longer fits is discarded with a notice, and the intro works as before", async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({ format: 0, messages: [], interrupted: false }),
      );
    }, STORAGE_KEY);
    await page.goto("/");

    await expect(introHeading(page)).toBeVisible();
    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      "The PRD you started earlier couldn't be brought back: the demo has changed since. You can start a new one.",
    );
    await expectNoAccessibilityViolations(page);

    await page.getByRole("button", { name: "Draft the first section" }).click();
    await expect(statements(page)).toHaveCount(4);
  });
});

test.describe("the download", () => {
  test("saves the PRD as a Markdown file, each name's quotes in a footnote", async ({
    page,
  }) => {
    await draftFirstSection(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download as Markdown" }).click(),
    ]);

    expect(download.suggestedFilename()).toBe("shared-grocery-list-app-prd.md");
    const markdown = await readFile(await download.path(), "utf8");
    expect(markdown).toMatch(/^# Shared grocery list app\n/);
    expect(markdown).toContain("1 of 9 sections");
    expect(markdown).toContain("\n## Introduction / Overview\n");
    expect(markdown.match(/^- /gm)).toHaveLength(4);
    expect(markdown).toMatch(/Sources: You, in this chat\[\^\d+\]\n/);
    expect(markdown).toMatch(
      /\n\[\^1\]: \w+, interview passage [a-z]+-\d+: “[^”]+”/,
    );
    expect(markdown).toContain(
      `: You, in this chat: “${FIRST_SECTION_REQUEST}”`,
    );
    expect(markdown.match(/^Not drafted yet\.$/gm)).toHaveLength(8);
  });

  test("isn't offered before a section is saved", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Or ask your own question first" })
      .click();

    await expect(prd(page)).toContainText("0 of 9 sections");
    await expect(
      page.getByRole("button", { name: "Download as Markdown" }),
    ).toHaveCount(0);
  });
});
