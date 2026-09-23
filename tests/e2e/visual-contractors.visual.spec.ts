/**
 * Visual regression baseline — contractor browse page (/contractors)
 *
 * Empty registry state — same rationale as visual-jobs.visual.spec.ts:
 * short content is what exposed the min-height:"100%" bug (#520).
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
    (window as any).__e2e_jobs = [];
  });
}

test.describe("Visual — contractors page (/contractors)", () => {
  test("matches baseline", async ({ page }) => {
    await setup(page);
    await page.goto("/contractors");
    await expect(page.getByText(/no contractors yet/i)).toBeVisible();
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await expect(page).toHaveScreenshot("contractors.png", { fullPage: true });
  });
});
