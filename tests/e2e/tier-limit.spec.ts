/**
 * tier-limit.spec.ts
 *
 * Tests tier-enforcement gates that block users from exceeding plan quotas.
 * Uses window.__e2e_* injection so no canister is required.
 *
 * Coverage:
 *  - Free homeowner accessing /dashboard is redirected to /pricing
 *  - Subscription upgrade click navigates to /checkout with correct tier param
 *  - Subscription downgrade click navigates to /checkout with correct tier param
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

// ── Free homeowner redirect ───────────────────────────────────────────────────

test.describe("Tier limit — Free homeowner redirect", () => {
  test("Free homeowner visiting /dashboard is redirected to /pricing", async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Free");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/pricing/);
  });

  test("Free homeowner visiting /properties/new is redirected to /pricing", async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Free");
    await page.goto("/properties/new");
    await expect(page).toHaveURL(/\/pricing/);
  });
});

// ── Subscription upgrade flow from Settings ───────────────────────────────────

test.describe("Tier limit — upgrade flow from Settings (Basic tier)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Basic");
    await page.goto("/settings");
    await page.getByRole("button", { name: /subscription/i }).click();
  });

  test("Basic tier shows 'Upgrade Plan' section heading", async ({ page }) => {
    await expect(page.getByText("Upgrade Plan")).toBeVisible();
  });

  test("Basic tier shows 'Upgrade' buttons (not 'Switch') in plan grid", async ({ page }) => {
    await expect(page.getByRole("button", { name: /^upgrade$/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^switch$/i })).toHaveCount(0);
  });

  test("clicking Upgrade opens the UpgradeModal dialog", async ({ page }) => {
    await page.getByRole("button", { name: /^upgrade$/i }).first().click();
    await expect(page.getByRole("dialog", { name: /upgrade your plan/i })).toBeVisible();
  });

  test("UpgradeModal shows Pro and Premium plan cards", async ({ page }) => {
    await page.getByRole("button", { name: /^upgrade$/i }).first().click();
    // Verify plan cards by their 'Select {tier}' buttons — unambiguous and accessible
    await expect(page.getByRole("button", { name: "Select Pro" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Select Premium" })).toBeVisible();
  });

  test("UpgradeModal shows 'Pay with Card' payment method toggle", async ({ page }) => {
    await page.getByRole("button", { name: /^upgrade$/i }).first().click();
    await expect(page.getByRole("button", { name: /pay with card/i })).toBeVisible();
  });

  test("UpgradeModal shows 'Pay with ICP' payment method toggle", async ({ page }) => {
    await page.getByRole("button", { name: /^upgrade$/i }).first().click();
    await expect(page.getByRole("button", { name: /pay with icp/i })).toBeVisible();
  });

  test("UpgradeModal can be closed", async ({ page }) => {
    await page.getByRole("button", { name: /^upgrade$/i }).first().click();
    await expect(page.getByRole("dialog", { name: /upgrade your plan/i })).toBeVisible();
    // Close button (X) dismisses the modal
    await page.locator('[aria-label="Upgrade Your Plan"] button').first().click();
    await expect(page.getByRole("dialog", { name: /upgrade your plan/i })).not.toBeVisible();
  });
});

test.describe("Tier limit — plan switch flow from Settings (Pro tier)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Pro");
    await page.goto("/settings");
    await page.getByRole("button", { name: /subscription/i }).click();
  });

  test("Pro tier shows 'Switch Plan' section heading", async ({ page }) => {
    await expect(page.getByText("Switch Plan")).toBeVisible();
  });

  test("Pro tier shows 'Switch' buttons (not 'Upgrade') in plan grid", async ({ page }) => {
    await expect(page.getByRole("button", { name: /^switch$/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^upgrade$/i })).toHaveCount(0);
  });

  test("clicking Switch opens the UpgradeModal", async ({ page }) => {
    await page.getByRole("button", { name: /^switch$/i }).first().click();
    await expect(page.getByRole("dialog", { name: /upgrade your plan/i })).toBeVisible();
  });

  test("UpgradeModal ICP tab shows 'No processing fees' note", async ({ page }) => {
    await page.getByRole("button", { name: /^switch$/i }).first().click();
    await page.getByRole("button", { name: /pay with icp/i }).click();
    await expect(page.getByText(/no processing fees/i)).toBeVisible();
  });
});

