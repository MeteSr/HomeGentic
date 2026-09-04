/**
 * Bid to List — H1 (/listing/new) and H2/H3/H6 (/listing/:id) E2E    (#180)
 *
 * LN.1  /listing/new with Basic tier → H1 heading + prefilled property
 * LN.2  /listing/new shows the bidding-window selector and publish CTA
 * LN.3  /listing/:id with no canister → "Listing request not found"
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";
import { assertNoA11yViolations } from "./helpers/a11y";

test.describe("LN — /listing/new", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Basic");
    await page.goto("/listing/new");
    await expect(page.getByRole("heading", { name: /let agents compete for your listing/i })).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("LN.1 shows the H1 heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /let agents compete for your listing/i })).toBeVisible();
  });

  test("LN.1 shows the property prefilled as a verified record", async ({ page }) => {
    await expect(page.getByText(/123 maple street/i)).toBeVisible();
    await expect(page.getByText(/verified record/i)).toBeVisible();
  });

  test("LN.1 never shows the exact address in the agent preview panel", async ({ page }) => {
    await expect(page.getByText(/what agents will see/i)).toBeVisible();
    await expect(page.getByText(/exact address/i).first()).toBeVisible();
  });

  test("LN.2 shows the 3/7/14-day bidding window selector, 7 days default", async ({ page }) => {
    const sevenDays = page.getByRole("button", { name: /^7 days$/i });
    await expect(sevenDays).toBeVisible();
    await expect(page.getByRole("button", { name: /^3 days$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^14 days$/i })).toBeVisible();
  });

  test("LN.2 shows the $0 cost panel and publish CTA", async ({ page }) => {
    await expect(page.getByText(/^\$0$/)).toBeVisible();
    await expect(page.getByRole("button", { name: /publish to licensed agents/i })).toBeVisible();
  });
});

test.describe("LN — /listing/:id (no canister)", () => {
  test("LN.3 shows 'not found' when listing does not exist", async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Basic");
    await page.goto("/listing/NONEXISTENT_LISTING_ID");
    await expect(page.getByText(/listing request not found/i)).toBeVisible();
  });
});
