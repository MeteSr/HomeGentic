import { type Page } from "@playwright/test";
import { checkA11y, injectAxe } from "axe-playwright";

/**
 * Run an axe WCAG 2.1 AA scan on the current page.
 * Fails the test if any violations are found.
 * Call this from `afterEach` or at the end of a page-level test.
 */
export async function assertNoA11yViolations(page: Page): Promise<void> {
  // Under CPU contention (e.g. the full suite running with several workers),
  // web fonts can still be loading when this runs. A fallback font's metrics
  // differ from the real one, which can tip a borderline color-contrast
  // computation over/under its threshold — flaky failures that don't
  // reproduce when a test runs alone. Wait for fonts to settle first.
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await injectAxe(page);
  await checkA11y(page, undefined, {
    detailedReport: true,
    detailedReportOptions: { html: true },
    axeOptions: { runOnly: ["wcag2a", "wcag2aa"] },
  });
}
