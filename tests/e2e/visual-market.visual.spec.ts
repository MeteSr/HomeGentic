/**
 * Visual regression baseline — market intelligence page (/market)
 *
 * Pre-analysis empty state. MarketIntelligencePage already used 100vh (not
 * the buggy 100%) so it didn't have the min-height cutoff bug (#520), but
 * it's the same hg-v3 page family and short-content shape, so it's worth
 * the same tablet-viewport coverage as jobs/contractors.
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { freezeClock } from "./helpers/visual";

async function setup(page: Parameters<typeof injectTestAuth>[0]) {
  await freezeClock(page);
  await injectTestAuth(page);
  await page.addInitScript(() => {
    (window as any).__e2e_subscription = { tier: "Pro", expiresAt: null };
    (window as any).__e2e_properties = [
      {
        id: 1, owner: "test-e2e-principal",
        address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
        propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
        verificationLevel: "Unverified", tier: "Free",
        createdAt: 0, updatedAt: 0, isActive: true,
      },
    ];
  });
}

test.describe("Visual — market intelligence page (/market)", () => {
  test("matches baseline", async ({ page }) => {
    await setup(page);
    await page.goto("/market");
    await expect(page.getByText(/select a property and run analysis/i)).toBeVisible();
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await expect(page).toHaveScreenshot("market.png", { fullPage: true });
  });
});
