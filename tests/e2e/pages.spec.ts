import { expect, test } from "@playwright/test";
import { site } from "@/lib/site";
import { expectNoAccessibilityViolations } from "./accessibility";

test.describe("home page", () => {
  test("opens on the intro, whose quieter link leads to the full interviews", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "You're the product manager of a shared grocery list app",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Draft the first section" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Your message" }),
    ).toHaveCount(0);

    await page.getByRole("link", { name: "Read the full interviews" }).click();

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

test("every page leads engineers to the README's explanation of the search and the check, and to the code", async ({
  page,
}) => {
  for (const path of ["/", "/transcripts"]) {
    await page.goto(path);
    const footer = page.getByRole("contentinfo");
    await expect(
      footer.getByRole("link", { name: "How the search and the check work" }),
    ).toHaveAttribute("href", `${site.links.repository}#how-it-works`);
    await expect(
      footer.getByRole("link", { name: "Source code on GitHub" }),
    ).toHaveAttribute("href", site.links.repository);
  }
});

test("every page tells search engines not to index it", async ({ request }) => {
  for (const path of ["/", "/transcripts"]) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  }
});
