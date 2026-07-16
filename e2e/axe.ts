import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

/**
 * Run an axe accessibility scan against the current page and assert there are
 * no WCAG 2.1 A/AA violations. Later tickets assert this on the real tool UI;
 * the walking skeleton uses it on the home + placeholder pages.
 *
 * Any violations found are attached to the test report for debugging.
 */
export async function expectNoA11yViolations(page: Page, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  if (results.violations.length > 0) {
    await testInfo.attach("axe-violations.json", {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });
  }

  expect(results.violations).toEqual([]);
}
