/**
 * Visual regression baseline — jobs page (/jobs)
 *
 * Empty state (no jobs, no quote requests) — the same state that exposed
 * the min-height:"100%" bug (#520): on a viewport taller than this short
 * content, the light Layout background used to show through below the
 * dark hg-v3 page instead of the dark background extending to fill it.
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
    (window as any).__e2e_quote_requests = [];
    (window as any).__e2e_quotes = [];
  });
}

test.describe("Visual — jobs page (/jobs)", () => {
  test("matches baseline", async ({ page }, testInfo) => {
    await setup(page);
    await page.goto("/jobs");
    // Below the mobile breakpoint, JobsPage renders MobileJobsPage instead —
    // different copy ("0 open, 0 logged" vs "0 open jobs · 0 bids waiting").
    if (testInfo.project.name === "mobile") {
      await expect(page.getByText(/0 open, 0 logged/i)).toBeVisible();
    } else {
      await expect(page.getByText(/0 open jobs/i)).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await expect(page).toHaveScreenshot("jobs.png", { fullPage: true });
  });
});
