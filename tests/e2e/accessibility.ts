import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Fails with the list of WCAG 2.2 A and AA violations axe finds on the page. */
export async function expectNoAccessibilityViolations(page: Page) {
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
