/**
 * Visual regression baseline — sensors page (/sensors)
 *
 * Empty state (no devices registered) — same rationale as
 * visual-jobs.visual.spec.ts: short content is what exposed the
 * min-height:"100%" bug (#520, ported to this branch in a follow-up
 * commit since SensorPage copied the same pattern before it merged).
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSensorDevices } from "./helpers/testData";
import { freezeClock } from "./helpers/visual";

async function setup(page: Parameters<typeof injectTestAuth>[0]) {
  await freezeClock(page);
  await injectSensorDevices(page, { "1": [] });
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

test.describe("Visual — sensors page (/sensors)", () => {
  test("matches baseline", async ({ page }) => {
    await setup(page);
    await page.goto("/sensors");
    await expect(page.getByText(/no devices registered/i)).toBeVisible();
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await expect(page).toHaveScreenshot("sensors.png", { fullPage: true });
  });
});
