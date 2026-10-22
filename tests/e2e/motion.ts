import type { Page } from "@playwright/test";

/** An element as it arrived, with its children. */
export type Arrived = {
  /** Which batch of changes to the page added it, counted from 1. */
  batch: number;
  text: string;
  classes: string;
  animation: string;
  duration: string;
  delay: string;
  children: { text: string; animation: string }[];
};

type Recording = Window & { arrived?: Arrived[] };

/**
 * Records each element matching the selector as it's added to the page, from
 * the page's first load on, as it is once the change that added it has
 * rendered: what arrives moves for less than a second, and the words are
 * plain again after it, so a test that looked afterwards would find nothing.
 * A `MutationObserver`'s callback runs once the task that changed the page
 * is over, so after React's renders before the paint too (MDN,
 * `MutationObserver`, read 2026-10-21 through Context7).
 */
export async function recordArrivals(page: Page, selector: string) {
  await page.addInitScript((selector: string) => {
    const arrived: Arrived[] = [];
    (window as Recording).arrived = arrived;
    let batch = 0;
    new MutationObserver((records) => {
      batch += 1;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const found = [
            ...(node.matches(selector) ? [node] : []),
            ...node.querySelectorAll<HTMLElement>(selector),
          ];
          for (const element of found) {
            const style = getComputedStyle(element);
            arrived.push({
              batch,
              text: element.textContent ?? "",
              classes: element.className,
              animation: style.animationName,
              duration: style.animationDuration,
              delay: style.animationDelay,
              children: [...element.children].map((child) => ({
                text: child.textContent ?? "",
                animation: getComputedStyle(child).animationName,
              })),
            });
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  }, selector);
}

/** What arrived since the page last loaded, in order. */
export function arrivals(page: Page): Promise<Arrived[]> {
  return page.evaluate(() => (window as Recording).arrived ?? []);
}
