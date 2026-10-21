import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

type Held = Window & { heldWords?: MutationObserver };

/** Fails with the list of WCAG 2.2 A and AA violations axe finds on the page. */
export async function expectNoAccessibilityViolations(page: Page) {
  // Words that just arrived fade in for 180ms (`.word-enter`), and axe would
  // measure the contrast of that passing moment, so it reads them settled:
  // each fade is finished at once, the ones running now and, while axe
  // reads, the ones that start as an answer's words keep arriving. A
  // `MutationObserver` runs before the next paint, and `finish()` jumps a
  // fade to its end (MDN, `Animation.finish` and `MutationObserver`, read
  // 2026-10-21 through Context7). Waiting for the fades to end wasn't enough:
  // on CI, words arrived after a pause, while axe was reading.
  await page.evaluate(() => {
    const settle = () => {
      for (const word of document.querySelectorAll(".word-enter"))
        for (const fade of word.getAnimations()) fade.finish();
    };
    settle();
    const observer = new MutationObserver(settle);
    observer.observe(document.body, { childList: true, subtree: true });
    (window as Held).heldWords = observer;
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
    await page.evaluate(() => (window as Held).heldWords?.disconnect());
  }
}
