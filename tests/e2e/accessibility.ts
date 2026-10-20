import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Fails with the list of WCAG 2.2 A and AA violations axe finds on the page. */
export async function expectNoAccessibilityViolations(page: Page) {
  // Words that just arrived fade in for 180ms (`.word-enter`), and axe would
  // measure the contrast of that passing moment; it reads the text once it's
  // settled. While an answer's words stream in, a new fade starts before the
  // last ends, so this waits until none runs. A fade that's cut short rejects
  // `finished`, hence `allSettled` (MDN, `Element.getAnimations` and
  // `Animation.finished`, read 2026-10-21 through Context7).
  await page.evaluate(async () => {
    for (;;) {
      const fading = [...document.querySelectorAll(".word-enter")]
        .flatMap((word) => word.getAnimations())
        .filter((animation) => animation.playState === "running");
      if (fading.length === 0) return;
      await Promise.allSettled(fading.map((animation) => animation.finished));
    }
  });
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(
    violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.length} elements)`,
    ),
  ).toEqual([]);
}
