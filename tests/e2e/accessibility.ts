import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

type Held = Window & { heldMotion?: MutationObserver };

/** Fails with the list of WCAG 2.2 A and AA violations axe finds on the page. */
export async function expectNoAccessibilityViolations(page: Page) {
  // What arrives fades in as it sharpens (`.arrive`, slice 25), as do words
  // that just arrived (`.word-enter`, slice 16), and axe would measure the
  // contrast of that passing moment, so it reads the page settled: every
  // animation that ends is finished at once, the ones running now and, while
  // axe reads, the ones that start as an answer keeps arriving. The moving
  // band (`.shimmer`) never ends, and can't be finished. A
  // `MutationObserver` runs before the next paint, and `finish()` jumps an
  // animation to its end (MDN, `Animation.finish` and `MutationObserver`,
  // read 2026-10-21 through Context7). Waiting for the fades to end wasn't
  // enough: on CI, words arrived after a pause, while axe was reading.
  await page.evaluate(() => {
    const settle = () => {
      for (const animation of document.getAnimations()) {
        if (animation.effect?.getComputedTiming().endTime !== Infinity) {
          animation.finish();
        }
      }
    };
    settle();
    const observer = new MutationObserver(settle);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributeFilter: ["class", "data-again"],
    });
    (window as Held).heldMotion = observer;
  });
  try {
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(
      violations.map(
        (violation) =>
          `${violation.id}: ${violation.help} (${violation.nodes.length} elements)`,
      ),
    ).toEqual([]);
  } finally {
    await page.evaluate(() => (window as Held).heldMotion?.disconnect());
  }
}
