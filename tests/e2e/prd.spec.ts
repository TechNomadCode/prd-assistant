import { expect, test, type Page } from "@playwright/test";
import { FAKE_FLAWED_SECTION } from "@/server/ai/fake-chat-model";
import { expectNoAccessibilityViolations } from "./accessibility";

// The PRD beside the chat, with the scripted fake model: asked for a section,
// it saves one built from the passages it found, and the PRD shows the latest
// save of each section (src/server/ai/fake-chat-model.ts).

const INTRODUCTION = "Statements in Introduction / Overview";
const GOALS = "Statements in Goals / Objectives";
const FAKE_NOTE = "(This is the local fake model";
const INTRO_TITLE = "You're the product manager of a shared grocery list app";

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
  await openChat(page);
  await ask(page, `Draft the first section.${extra}`);
  await expect(conversation(page)).toContainText(FAKE_NOTE);
}

type Recording = Window & { moves?: string[] };

/**
 * Records, from the page's first load on, each transition the source
 * pop-over starts and each animation its quotes start, by the property or
 * the animation's name; they last under a second.
 */
async function recordMoves(page: Page) {
  await page.addInitScript(() => {
    const moves: string[] = [];
    (window as Recording).moves = moves;
    // The pop-over itself or its quotes, not its backdrop.
    const popover = (event: TransitionEvent | AnimationEvent) =>
      event.target instanceof Element &&
      event.pseudoElement === "" &&
      (event.target.id === "source-popover" ||
        (event.target.tagName === "MARK" &&
          event.target.closest("#source-popover") !== null));
    document.addEventListener(
      "transitionrun",
      (event) => {
        if (popover(event)) moves.push(`transitionrun ${event.propertyName}`);
      },
      true,
    );
    document.addEventListener(
      "animationstart",
      (event) => {
        if (popover(event)) moves.push(`animationstart ${event.animationName}`);
      },
      true,
    );
  });
}

function moves(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as Recording).moves ?? []);
}

test.describe("the PRD", () => {
  test("shows all nine sections from the start, none drafted yet", async ({
    page,
  }) => {
    await openChat(page);

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

    test("opens anew by another name clicked while it's open, under that name", async ({
      page,
    }) => {
      await draftFirstSection(page);
      await statements(page, INTRODUCTION).first().getByRole("button").click();
      const popover = page.getByRole("dialog");
      await expect(popover).toBeVisible();
      const yours = statements(page, INTRODUCTION)
        .last()
        .getByRole("button", { name: "You, in this chat" });

      await yours.click();

      await expect(
        page.getByRole("dialog", { name: "You, in this chat" }),
      ).toBeVisible();
      // Under the name that opened it, 6px apart, its right edge at the
      // name's (`position-area: bottom span-left`), once it has settled.
      await expect
        .poll(async () => {
          const name = (await yours.boundingBox())!;
          const box = (await popover.boundingBox())!;
          return [
            Math.round(box.y - (name.y + name.height)),
            Math.round(box.x + box.width - (name.x + name.width)),
          ];
        })
        .toEqual([6, 0]);
    });

    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      test(`grows from its name and closes the same way, its quote's highlight sweeping in, unless motion is reduced (${reducedMotion})`, async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion });
        await recordMoves(page);
        await draftFirstSection(page);
        const name = statements(page, INTRODUCTION).first().getByRole("button");

        await name.click();

        const popover = page.getByRole("dialog");
        await expect(popover).toBeVisible();
        const mark = popover.locator("mark");
        if (reducedMotion === "reduce") {
          await expect(mark).toHaveCSS("background-size", "100% 100%");
          await page.keyboard.press("Escape");
          await expect(popover).toBeHidden();
          expect(await moves(page)).toEqual([]);
          return;
        }
        // A scale and a fade on the pop-over's spring, then the sweep.
        await expect.poll(() => moves(page)).toContain("animationstart sweep");
        const opened = await moves(page);
        expect(opened.slice(0, 2).sort()).toEqual([
          "transitionrun opacity",
          "transitionrun scale",
        ]);
        expect(opened.slice(2)).toEqual(["animationstart sweep"]);
        await expect(popover).toHaveCSS("transition-duration", "0.5s");
        await expect(mark).toHaveCSS("animation-duration", "0.8s");
        await expect(mark).toHaveCSS("animation-delay", "0.4s");
        // It grew from the name: from the point of its top edge under it,
        // measured once it has settled.
        await expect
          .poll(() =>
            popover.evaluate(
              (element) => element.getAnimations({ subtree: true }).length,
            ),
          )
          .toBe(0);
        const origin = await popover.evaluate((element) =>
          getComputedStyle(element).transformOrigin.split(" ").map(parseFloat),
        );
        const from = (await name.boundingBox())!;
        const box = (await popover.boundingBox())!;
        expect(origin[1]).toBe(0);
        expect(
          Math.abs(box.x + origin[0]! - (from.x + from.width / 2)),
        ).toBeLessThanOrEqual(1);

        await page.keyboard.press("Escape");

        // Shut the same way, still on top until it's done.
        await expect
          .poll(() => moves(page))
          .toEqual(expect.arrayContaining(["transitionrun display"]));
        expect((await moves(page)).slice(3).sort()).toEqual([
          "transitionrun display",
          "transitionrun opacity",
          "transitionrun overlay",
          "transitionrun scale",
        ]);
        await expect(popover).toBeHidden();
        await expect(page.locator("#source-popover")).toHaveCSS(
          "display",
          "none",
        );
      });
    }
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

    test("says Drafting beside the next section while it works, and comes back with a line beside it when the answer fails", async ({
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

      const drafting = page
        .getByRole("region", { name: /^Goals \/ Objectives/ })
        .getByText("Drafting…");
      await expect(drafting).toBeVisible();
      await expect(drafting).toHaveCSS("animation-name", "shimmer");
      await expect(
        page.getByRole("region", { name: /^Introduction \/ Overview/ }),
      ).not.toContainText("Drafting");
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

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`lights up a section as it's saved and rolls the count, without scrolling, and not after a reload (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await draftFirstSection(page);
      const pane = page.locator(".bg-page");
      // Each number the count rolls in, as it appears: it's gone 0.27s later,
      // or stays still with reduced motion, as the first section's 1 does.
      await page.evaluate(() => {
        const seen: { text: string; animation: string }[] = [];
        const before = document.querySelector(".roll-in")?.textContent;
        Object.assign(window, { rolledIn: seen });
        new MutationObserver(() => {
          const incoming = document.querySelector(".roll-in");
          const last = seen.at(-1)?.text ?? before;
          if (incoming && last !== incoming.textContent) {
            seen.push({
              text: incoming.textContent ?? "",
              animation: getComputedStyle(incoming).animationName,
            });
          }
        }).observe(document.body, { childList: true, subtree: true });
      });

      // Enabled once the answer has finished: Playwright retries a click on a
      // disabled button, and its retries scroll the button into view, which
      // would look like the PRD scrolling by itself.
      const checkIn = page.getByRole("button", { name: /^Looks right/ });
      await expect(checkIn).toBeEnabled();
      await checkIn.click();
      await expect(statements(page, GOALS)).not.toHaveCount(0);
      await expect(checkIn).toHaveAccessibleName(
        "Looks right: draft Target Audience / User Personas",
      );
      await expect(checkIn).toBeEnabled();

      const goals = page.getByRole("region", { name: /^Goals \/ Objectives/ });
      const highlight = goals.locator(".just-changed");
      // The glow runs with reduced motion too: it doesn't move.
      await expect(highlight).toHaveCSS("animation-name", "just-changed");
      await expect(highlight).toHaveCSS("animation-duration", "1.13s");
      await expect(highlight).toHaveCSS("border-top-width", "0px");
      await expect(prd(page)).toContainText("2 of 9 sections");
      expect(
        await page.evaluate(
          () => (window as unknown as { rolledIn: unknown[] }).rolledIn,
        ),
      ).toEqual([
        {
          text: "2",
          animation: reducedMotion === "reduce" ? "none" : "roll-in-up",
        },
      ]);
      if (reducedMotion === "reduce") {
        await expect(prd(page).locator(".roll-out")).toBeHidden();
      }
      await expect(pane).toHaveJSProperty("scrollTop", 0);

      await page.reload();
      await expect(statements(page, GOALS)).not.toHaveCount(0);
      await expect(prd(page).locator(".just-changed")).toHaveCount(0);
      await expect(prd(page).locator(".roll")).toHaveCount(0);
    });
  }

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`brings in a saved section's statements one after another, and the check-in, unless motion is reduced, and nothing after a reload (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await draftFirstSection(page);

      const items = statements(page, INTRODUCTION);
      const checkIn = page.getByRole("button", { name: /^Looks right/ });
      const arriving =
        reducedMotion === "reduce" ? "none" : "arrive, arrive-fade";
      await expect(items).toHaveCount(4);
      for (const item of await items.all()) {
        await expect(item).toHaveCSS("animation-name", arriving);
      }
      await expect(checkIn.locator("..")).toHaveCSS("animation-name", arriving);
      if (reducedMotion === "no-preference") {
        // 0.2s apart, as the video's statements are.
        for (const [index, delay] of ["0s", "0.2s", "0.4s", "0.6s"].entries()) {
          await expect(items.nth(index)).toHaveCSS(
            "animation-delay",
            new RegExp(`^${delay.replace(".", "\\.")}`),
          );
        }
      }
      // Then still, sharp and whole.
      for (const item of [items.first(), items.last()]) {
        await expect(item).toHaveCSS("opacity", "1");
        await expect(item).toHaveCSS("transform", "none");
        await expect(item).toHaveCSS("filter", "none");
      }

      await expect(checkIn).toBeEnabled();
      await page.reload();
      await expect(items).toHaveCount(4);
      await expect(prd(page).locator(".arrive")).toHaveCount(0);
    });
  }

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

  test.describe("copying a section", () => {
    test.use({ permissions: ["clipboard-read", "clipboard-write"] });

    /**
     * The clipboard's text. Windows hands it back with its own line breaks;
     * the exact text the app writes is in `tests/unit/prd-markdown.test.ts`.
     */
    async function readClipboard(page: Page) {
      const text = await page.evaluate(() => navigator.clipboard.readText());
      return text.replace(/\r\n/g, "\n");
    }

    test("shows the copy button while the section is hovered or focused, with its label once the pointer rests on it, and copies the section as Markdown", async ({
      page,
    }) => {
      await draftFirstSection(page);
      const section = prd(page).getByRole("region", {
        name: /^Introduction \/ Overview/,
      });
      const button = section.getByRole("button", {
        name: "Copy section: Introduction / Overview",
      });
      const label = section.locator(".copy-tip");
      // Hover-capable: shown only while the section has the pointer or focus.
      await page.mouse.move(0, 0);
      await expect(button.locator("..")).toHaveCSS("opacity", "0");

      await statements(page, INTRODUCTION).first().hover();
      await expect(button.locator("..")).toHaveCSS("opacity", "1");
      await expect(label).toBeHidden();
      await page.mouse.move(0, 0);
      await expect(button.locator("..")).toHaveCSS("opacity", "0");

      await button.focus();
      await expect(button.locator("..")).toHaveCSS("opacity", "1");
      await button.blur();

      await button.hover();
      await expect(label).toBeVisible();
      await expect(label).toHaveText("Copy section");
      await button.click();

      await expect(
        section.getByRole("button", { name: "Copied", exact: true }),
      ).toBeVisible();
      await expect(label).toBeHidden();
      const copied = await readClipboard(page);
      const first = await statements(page, INTRODUCTION)
        .first()
        .locator("p")
        .first()
        .evaluate((element) => element.firstChild?.textContent ?? "");
      expect(copied).toMatch(/^## Introduction \/ Overview\n\n- /);
      expect(copied).toContain(`- ${first.trim()} Sources: `);
      expect(copied.match(/^- /gm)).toHaveLength(4);
      expect(copied).toMatch(/\n\n\[\^1\]: /);
      expect(copied.match(/^\[\^\d\]: /gm)).toHaveLength(4);
      expect(copied).toMatch(/[^\n]\n$/);
      expect(copied).not.toContain("Goals / Objectives");

      // Back to the copy button after two seconds.
      await expect(button).toBeVisible({ timeout: 4000 });
    });

    test.describe("on a phone", () => {
      test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

      test("shows the copy button at rest, and a tap copies the section", async ({
        page,
      }) => {
        await draftFirstSection(page);
        const section = prd(page).getByRole("region", {
          name: /^Introduction \/ Overview/,
        });
        const button = section.getByRole("button", {
          name: "Copy section: Introduction / Overview",
        });
        await expect(button.locator("..")).toHaveCSS("opacity", "1");

        await button.tap();

        await expect(
          section.getByRole("button", { name: "Copied", exact: true }),
        ).toBeVisible();
        expect(await readClipboard(page)).toMatch(
          /^## Introduction \/ Overview\n\n- /,
        );
      });
    });
  });

  test("Start over asks once, then clears the chat and the PRD and brings the intro back", async ({
    page,
  }) => {
    await draftFirstSection(page);

    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByRole("button", { name: "Keep them" }).click();
    await expect(statements(page, INTRODUCTION)).toHaveCount(4);

    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByRole("button", { name: "Clear both" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: INTRO_TITLE }),
    ).toBeFocused();
    await expect(conversation(page)).toHaveCount(0);
    await expect(prd(page)).toHaveCount(0);

    await page
      .getByRole("button", { name: "Or ask your own question first" })
      .click();
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
      // It grows as it opens (slice 26), so it's measured once it has.
      await popover.evaluate((element) => {
        for (const animation of element.getAnimations()) animation.finish();
      });
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
