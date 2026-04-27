/**
 * Listing new & detail E2E — /listing/new, /listing/:id    (#180)
 *
 * LN.1  /listing/new with Basic tier → "List Your Home" heading + form fields
 * LN.2  /listing/new form has bid deadline field and Create button
 * LN.3  /listing/:id with no canister → "Listing request not found"
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

test.describe("LN — /listing/new", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Basic");
    await page.goto("/listing/new");
    await expect(page.getByRole("heading", { name: /list your home/i })).toBeVisible();
  });

  test("LN.1 shows 'List Your Home' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /list your home/i })).toBeVisible();
  });

  test("LN.1 shows subheading about sealed proposals", async ({ page }) => {
    await expect(page.getByText(/sealed proposals/i)).toBeVisible();
  });

  test("LN.2 shows Property selector", async ({ page }) => {
    await expect(page.locator("#listing-property")).toBeVisible();
  });

  test("LN.2 shows Bid Deadline label", async ({ page }) => {
    await expect(page.getByText(/bid deadline/i)).toBeVisible();
  });

  test("LN.2 shows Create Listing Request button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /create listing request/i })).toBeVisible();
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
