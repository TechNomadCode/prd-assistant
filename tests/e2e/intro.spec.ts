import { expect, test, type Page, type Request } from "@playwright/test";
import type { ChatMessage } from "@/lib/chat";
import {
  FIRST_SECTION_REQUEST,
  GROCERY_DELIVERY_SUGGESTION,
} from "@/lib/suggestions";
import { expectNoAccessibilityViolations } from "./accessibility";

// The intro on the home page, then the chat it opens, with the scripted fake
// model (src/server/ai/fake-chat-model.ts): asked for the first section, it
// saves one, so the suggestion appears.

const INTRO_TITLE = "You're the product manager of a shared grocery list app";
const WORKSPACE_TITLE = "The chat and your PRD";
const FAKE_NOTE = "(This is the local fake model";
// The filled button, in the palette's white (docs/decisions.md, Design);
// quiet ones have none.
const FILLED = "rgb(250, 250, 250)";
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
  return page.getByRole("group", { name: "Suggestion:", exact: true });
}

type Sampled = Window & { opacities?: number[] };

/** Finishes what arrives, so its place can be measured. */
async function settle(page: Page) {
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => animation.finish()),
  );
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
  test("says who the visitor is, what they'll do and who was interviewed, each household linking to its interview, with one filled button that drafts and, quieter, a link to the full interviews and a way to ask first", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      INTRO_TITLE,
    );
    const main = page.getByRole("main");
    await expect(main).toContainText(
      "Turn six household interviews into its product requirements document. The app checks every quote word for word.",
    );
    await expect(main).toContainText(
      "Interviewed: Maya, Henk, Daan, Sofia, Lena and Ravi",
    );
    for (const name of ["Maya", "Henk", "Daan", "Sofia", "Lena", "Ravi"]) {
      await expect(
        main.getByRole("link", { name, exact: true }),
      ).toHaveAttribute("href", `/transcripts#${name.toLowerCase()}`);
    }
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

  test("is centred on one screen, a glimpse of the chat beside the PRD under it that screen readers skip", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(draftButton(page)).not.toHaveAttribute("aria-disabled");
    await settle(page);

    const viewport = page.viewportSize()!;
    const middle = viewport.width / 2;
    for (const part of [
      page.getByRole("heading", { level: 1 }),
      draftButton(page),
    ]) {
      const box = (await part.boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - middle)).toBeLessThan(2);
    }
    const glimpse = page.locator("main [aria-hidden] > svg");
    await expect(glimpse).toBeVisible();
    const box = (await glimpse.boundingBox())!;
    expect(box.y).toBeGreaterThan((await draftButton(page).boundingBox())!.y);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await expectNoAccessibilityViolations(page);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("leaves the glimpse out", async ({ page }) => {
      await page.goto("/");
      await expect(draftButton(page)).toBeVisible();
      await expect(page.locator("main [aria-hidden] > svg")).toBeHidden();
    });
  });

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`arrives line by line as the page first shows, the glimpse last, never starting again (${reducedMotion} motion)`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      // The heading's opacity in every frame from the start, through the
      // moment the browser's intro takes the place of the server's.
      await page.addInitScript(() => {
        const seen: number[] = [];
        (window as Sampled).opacities = seen;
        const sample = () => {
          const heading = document.getElementById("intro-title");
          if (heading) seen.push(Number(getComputedStyle(heading).opacity));
          if (performance.now() < 4000) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page.goto("/");
      await expect(draftButton(page)).not.toHaveAttribute("aria-disabled");

      const lines = page.locator("main .arrive");
      await expect(lines).toHaveCount(5);
      const delays = await lines.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).animationDelay),
      );
      if (reducedMotion === "reduce") {
        await expect(lines.first()).toHaveCSS("animation-name", "none");
      } else {
        await expect(lines.first()).toHaveCSS(
          "animation-name",
          "arrive, arrive-fade",
        );
        // One delay for both of a line's animations, the glimpse's last.
        expect(delays).toEqual(["0s", "0.2s", "0.4s", "0.6s", "0.8s"]);
      }

      await page.waitForFunction(() => performance.now() > 2500, undefined, {
        polling: 100,
      });
      const opacities = await page.evaluate(
        () => (window as Sampled).opacities ?? [],
      );
      expect(opacities.length).toBeGreaterThan(0);
      expect(opacities.at(-1)).toBe(1);
      // Never fading again once it has come in part of the way.
      for (let index = 1; index < opacities.length; index++) {
        expect(opacities[index]).toBeGreaterThanOrEqual(
          opacities[index - 1]! - 0.001,
        );
      }
      if (reducedMotion === "reduce") {
        expect(new Set(opacities)).toEqual(new Set([1]));
      }
    });
  }

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

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`the chat and the PRD arrive as it gives way, the PRD a beat later, unless motion is reduced, and not after a reload (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await page.goto("/");
      await page
        .getByRole("button", { name: "Or ask your own question first" })
        .click();

      // Each region's pane, which rises in from a slight blur.
      const chatPane = page
        .getByRole("region", { name: "Chat with the assistant" })
        .locator("..");
      const prdPane = prd(page).locator("..");
      const arriving =
        reducedMotion === "reduce" ? "none" : "arrive, arrive-fade";
      await expect(chatPane).toHaveCSS("animation-name", arriving);
      await expect(prdPane).toHaveCSS("animation-name", arriving);
      if (reducedMotion === "no-preference") {
        await expect(chatPane).toHaveCSS("animation-duration", /^0\.77s/);
        await expect(chatPane).toHaveCSS("animation-delay", /^0s/);
        await expect(prdPane).toHaveCSS("animation-delay", /^0\.2s/);
      }
      // Then still, sharp and whole.
      for (const pane of [chatPane, prdPane]) {
        await expect(pane).toHaveCSS("opacity", "1");
        await expect(pane).toHaveCSS("transform", "none");
        await expect(pane).toHaveCSS("filter", "none");
      }

      await page
        .getByRole("textbox", { name: "Your message" })
        .fill("Who wants a ping for every item?");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(conversation(page)).toContainText(FAKE_NOTE);
      await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => localStorage.getItem("prd-assistant:conversation") ?? "",
          ),
        )
        .toContain(FAKE_NOTE);
      await page.reload();
      await expect(conversation(page)).toContainText(FAKE_NOTE);
      await expect(page.locator(".arrive")).toHaveCount(0);
    });
  }

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

test.describe("the suggestion", () => {
  test("appears only once the first section is saved, sends its words with one click, then is gone", async ({
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
    await expect(suggestion(page)).toHaveAccessibleName("Suggestion:");
    const suggested = suggestion(page).getByRole("button", {
      name: GROCERY_DELIVERY_SUGGESTION,
    });
    const request = page.waitForRequest("**/api/chat");

    await suggested.click();

    expect(sentByVisitor(await request)).toEqual([
      FIRST_SECTION_REQUEST,
      GROCERY_DELIVERY_SUGGESTION,
    ]);
    await expect(suggestion(page)).toHaveCount(0);
    // The check-in is disabled while the assistant works: once it's back,
    // the answer to the suggestion has finished.
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
    const suggested = page.getByRole("button", {
      name: GROCERY_DELIVERY_SUGGESTION,
    });
    await expect(suggested).toBeVisible();
    expect(await fitsTheWidth()).toBe(true);

    await suggested.click();

    await expect(conversation(page)).toContainText(GROCERY_DELIVERY_SUGGESTION);
    await expect(suggested).toHaveCount(0);
  });
});
