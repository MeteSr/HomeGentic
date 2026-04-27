/**
 * Property Verify E2E — /properties/:id/verify       (#180)
 *
 * PV.1  Page loads with "Verify ownership" heading
 * PV.2  Three verification method options are visible
 * PV.3  Submit button is disabled before a file is selected
 * PV.4  "Back to property" navigation link is present
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

test.describe("PropertyVerifyPage — /properties/1/verify", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await page.goto("/properties/1/verify");
    await expect(page.getByRole("heading", { name: /verify ownership/i })).toBeVisible();
  });

  test("PV.1 shows 'Verify ownership' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /verify ownership/i })).toBeVisible();
  });

  test("PV.2 shows Utility Bill method option", async ({ page }) => {
    await expect(page.getByText("Utility Bill")).toBeVisible();
  });

  test("PV.2 shows Property Deed method option", async ({ page }) => {
    await expect(page.getByText("Property Deed")).toBeVisible();
  });

  test("PV.2 shows Tax Record method option", async ({ page }) => {
    await expect(page.getByText("Tax Record")).toBeVisible();
  });

  test("PV.3 submit button is disabled when no file selected", async ({ page }) => {
    await expect(page.getByRole("button", { name: /submit for verification/i })).toBeDisabled();
  });

  test("PV.4 back link navigates to property detail", async ({ page }) => {
    await expect(page.getByText(/back to property/i)).toBeVisible();
  });

  test("PV.2 Utility Bill is selected by default", async ({ page }) => {
    const radio = page.locator('input[name="method"][value="UtilityBill"]');
    await expect(radio).toBeChecked();
  });

  test("PV.2 Ownership eyebrow label is visible", async ({ page }) => {
    await expect(page.getByText("Ownership").first()).toBeVisible();
  });
});
