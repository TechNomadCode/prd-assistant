import { expect, test, type Page } from "@playwright/test";
import { FAKE_FLAWED_SECTION } from "@/server/ai/fake-chat-model";
import { expectNoAccessibilityViolations } from "./accessibility";

// The PRD beside the chat, with the scripted fake model: asked for a section,
// it saves one built from the passages it found, and the PRD shows the latest
// save of each section (src/server/ai/fake-chat-model.ts).

const INTRODUCTION = "Statements in Introduction / Overview";
const GOALS = "Statements in Goals / Objectives";
const FAKE_NOTE = "(This is the local fake model";

async function ask(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Your message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

function prd(page: Page) {
  return page.getByRole("region", { name: "Shared grocery list app" });
}

function conversation(page: Page) {
  return page.getByRole("list", { name: "Conversation" });
}

/** The statements' own items, without the items of a list inside them. */
function statements(page: Page, list: string) {
  return page.getByRole("list", { name: list }).locator(":scope > li");
}

async function draftFirstSection(page: Page, extra = "") {
  await page.goto("/");
  await ask(page, `Draft the first section.${extra}`);
  await expect(conversation(page)).toContainText(FAKE_NOTE);
}

test.describe("the PRD", () => {
  test("shows all nine sections from the start, none drafted yet", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(prd(page)).toContainText(
      "Product requirements document · Draft · 0 of 9 sections · From six household interviews",
    );
    await expect(
      prd(page).getByRole("heading", { level: 3, name: /not drafted yet/ }),
    ).toHaveCount(9);
    await expect(
      prd(page).getByRole("heading", { level: 3 }).first(),
    ).toHaveAccessibleName("Introduction / Overview (not drafted yet)");
  });

  test("shows a saved section with how many quotes the check confirmed, each statement ending in its sources by name", async ({
    page,
  }) => {
    await draftFirstSection(page);

    await expect(conversation(page)).toContainText(
      "Saved Introduction / Overview: 4 of 4 quotes confirmed · See it",
    );
    await expect(
      prd(page).getByRole("heading", {
        level: 3,
        name: "Introduction / Overview 4 of 4 quotes confirmed",
      }),
    ).toBeVisible();
    await expect(prd(page)).toContainText("1 of 9 sections");

    const items = statements(page, INTRODUCTION);
    await expect(items).toHaveCount(4);
    for (const item of await items.all()) {
      await expect(item.getByRole("button")).toHaveCount(1);
    }
    await expect(items.first()).toHaveText(
      /^\S+ answered the researcher's question “.+” Sources: (Daan|Henk|Lena|Maya|Ravi|Sofia)$/,
    );
    // Confirmed quotes aren't written out.
    await expect(prd(page).locator("blockquote:visible")).toHaveCount(0);
    await expect(items.last()).toHaveText(
      "You asked for this section. Sources: You, in this chatYour decision, not from the interviews.",
    );
  });

  test("writes out what the check objects to under its statement", async ({
    page,
  }) => {
    await draftFirstSection(page, ` ${FAKE_FLAWED_SECTION}`);

    await expect(
      prd(page).getByRole("heading", {
        level: 3,
        name: "Introduction / Overview 4 of 6 quotes confirmed",
      }),
    ).toBeVisible();
    await expect(
      prd(page).getByText(
        /^Unverified quote from \S+: “.+” These words aren't in the answer it cites\.$/,
      ),
    ).toHaveCount(2);
    await expect(
      statements(page, INTRODUCTION).filter({
        hasText: "Cites nothing at all.",
      }),
    ).toContainText("No quote backs this statement.");
  });

  test.describe("a source's pop-over", () => {
    test("opens from an interviewee's name, with the researcher's question above the answer and the quoted words highlighted", async ({
      page,
    }) => {
      await draftFirstSection(page);
      const name = statements(page, INTRODUCTION).first().getByRole("button");
      const interviewee = await name.innerText();

      await name.click();

      const popover = page.getByRole("dialog", {
        name: `${interviewee}, interview`,
      });
      await expect(popover).toBeVisible();
      await expect(popover).toContainText(/^.*Researcher: .+\?/s);
      await expect(popover.locator("mark")).toHaveCount(1);
      // The first sentence of the answer, without its full stop.
      const quoted = await popover.locator("mark").innerText();
      expect(quoted).not.toBe("");
      await expect(popover.locator("blockquote")).toHaveText(
        new RegExp(`^${RegExp.escape(quoted)}[.!?]`),
      );

      await expectNoAccessibilityViolations(page);

      await page.keyboard.press("Escape");
      await expect(popover).toBeHidden();
    });

    test("shows the visitor's own message for their words, and closes with a click outside", async ({
      page,
    }) => {
      await draftFirstSection(page);

      await statements(page, INTRODUCTION)
        .last()
        .getByRole("button", { name: "You, in this chat" })
        .click();

      const popover = page.getByRole("dialog", { name: "You, in this chat" });
      await expect(popover.locator("blockquote")).toHaveText(
        "Draft the first section.",
      );
      await expect(popover.locator("mark")).toHaveText(
        "Draft the first section",
      );

      await page.mouse.click(5, 300);
      await expect(popover).toBeHidden();
    });
  });

  test.describe("the check-in", () => {
    test("confirms the section through the chat and drafts the next one in the PRD's order", async ({
      page,
    }) => {
      await draftFirstSection(page);

      await page
        .getByRole("button", { name: "Looks right: draft Goals / Objectives" })
        .click();

      await expect(conversation(page)).toContainText(
        "Introduction / Overview looks right. Please draft Goals / Objectives.",
      );
      await expect(statements(page, GOALS)).not.toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /^Looks right/ }),
      ).toHaveAccessibleName(
        "Looks right: draft Target Audience / User Personas",
      );
      await expect(
        page
          .getByRole("region", { name: /^Goals \/ Objectives/ })
          .getByRole("button", { name: /^Looks right/ }),
      ).toBeVisible();
      await expect(prd(page)).toContainText("2 of 9 sections");
    });

    test("reads Drafting while it works, and comes back with a line beside it when the answer fails", async ({
      page,
    }) => {
      await draftFirstSection(page);
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/api/chat", async (route) => {
        await held;
        await route.abort();
      });

      await page
        .getByRole("button", { name: "Looks right: draft Goals / Objectives" })
        .click();

      await expect(prd(page)).toContainText("Drafting Goals / Objectives…");
      await expect(
        page.getByRole("button", { name: /^Looks right/ }),
      ).toHaveCount(0);
      release();

      const button = page.getByRole("button", {
        name: "Looks right: draft Goals / Objectives",
      });
      await expect(button).toBeEnabled();
      await expect(prd(page)).toContainText(
        "That answer didn't finish. Try again.",
      );

      await page.unroute("**/api/chat");
      await button.click();
      await expect(statements(page, GOALS)).not.toHaveCount(0);
      await expect(prd(page)).not.toContainText("That answer didn't finish.");
    });
  });

  test("See it brings the section into view; nothing else scrolls the PRD", async ({
    page,
  }) => {
    await draftFirstSection(page);
    await page
      .getByRole("button", { name: "Looks right: draft Goals / Objectives" })
      .click();
    await expect(statements(page, GOALS)).not.toHaveCount(0);
    const heading = page.locator("#prd-introduction-overview");
    const pane = page.locator(".bg-page");
    await pane.evaluate(
      (element) => (element.scrollTop = element.scrollHeight),
    );
    await expect(heading).not.toBeInViewport();

    await page
      .getByRole("button", { name: "See it: Introduction / Overview" })
      .click();

    await expect(heading).toBeInViewport();
    await expect(heading).toBeFocused();
  });

  test("Start over asks once, then clears the chat and the PRD", async ({
    page,
  }) => {
    await draftFirstSection(page);

    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByRole("button", { name: "Keep them" }).click();
    await expect(statements(page, INTRODUCTION)).toHaveCount(4);

    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByRole("button", { name: "Clear both" }).click();

    await expect(conversation(page)).toHaveCount(0);
    await expect(prd(page)).toContainText("0 of 9 sections");
    await expect(page.getByRole("list", { name: INTRODUCTION })).toHaveCount(0);
  });

  test("passes the accessibility check with a flawed section", async ({
    page,
  }) => {
    await draftFirstSection(page, ` ${FAKE_FLAWED_SECTION}`);
    await expect(statements(page, INTRODUCTION)).not.toHaveCount(0);

    await expectNoAccessibilityViolations(page);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("stacks the PRD under the chat, and opens a pop-over nearly full width that closes with a tap outside", async ({
      page,
    }) => {
      await draftFirstSection(page);
      const box = await page
        .getByRole("textbox", { name: "Your message" })
        .boundingBox();
      const title = await prd(page)
        .getByRole("heading", { level: 2 })
        .boundingBox();
      expect(title!.y).toBeGreaterThan(box!.y);

      await statements(page, INTRODUCTION).first().getByRole("button").click();

      const popover = page.getByRole("dialog");
      await expect(popover).toBeVisible();
      const size = await popover.boundingBox();
      expect(size!.width).toBeGreaterThan(340);
      await expectNoAccessibilityViolations(page);

      await page.mouse.click(187, 20);
      await expect(popover).toBeHidden();
    });
  });
});

test.describe("the chat beside the PRD", () => {
  test("follows the newest message, unless the visitor scrolled up", async ({
    page,
  }) => {
    await draftFirstSection(page);
    await page
      .getByRole("button", { name: "Looks right: draft Goals / Objectives" })
      .click();
    await expect(statements(page, GOALS)).not.toHaveCount(0);

    const chat = page.locator("#chat-title + div");
    const atBottom = () =>
      chat.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight < 2,
      );
    expect(
      await chat.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    expect(await atBottom()).toBe(true);

    await chat.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });
    await page
      .getByRole("button", {
        name: "Looks right: draft Target Audience / User Personas",
      })
      .click();
    await expect(
      statements(page, "Statements in Target Audience / User Personas"),
    ).not.toHaveCount(0);

    expect(await chat.evaluate((element) => element.scrollTop)).toBe(0);
  });
});
