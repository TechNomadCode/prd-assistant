import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./accessibility";

test.describe("home page", () => {
  test("introduces the app and leads to the transcripts", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "PRD Assistant" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Read the transcripts" }).click();

    await expect(page).toHaveURL(/\/transcripts$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Interview transcripts" }),
    ).toBeVisible();
  });

  test("passes the accessibility check", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
});

test.describe("transcripts page", () => {
  test("shows the six interviews from the database, each question above its answer", async ({
    page,
  }) => {
    await page.goto("/transcripts");

    await expect(page.getByRole("article")).toHaveCount(6);
    const firstPassage = page
      .getByRole("article", { name: "Interview: Daan, family of five" })
      .locator("#daan-1");
    await expect(firstPassage).toContainText(
      "Researcher: Tell me about the list on the fridge.",
    );
    await expect(firstPassage.locator("blockquote")).toHaveText(
      /^It's a notepad with a magnet\./,
    );
    await expect(firstPassage.locator("figcaption")).toHaveText("Daan");
  });

  test("passes the accessibility check", async ({ page }) => {
    await page.goto("/transcripts");
    await expect(page.getByRole("article")).toHaveCount(6);
    await expectNoAccessibilityViolations(page);
  });
});

test("every page tells search engines not to index it", async ({ request }) => {
  for (const path of ["/", "/transcripts"]) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  }
});
