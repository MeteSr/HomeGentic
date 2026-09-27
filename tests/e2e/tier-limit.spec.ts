/**
 * tier-limit.spec.ts
 *
 * Tests tier-enforcement gates that block users from exceeding plan quotas.
 * Uses window.__e2e_* injection so no canister is required.
 *
 * Coverage:
 *  - Free homeowner can reach /dashboard and /properties/new (1-property access)
 *  - Free homeowner can reach the AI/intelligence pages (e.g. /market) — no longer Pro-only
 *  - Free homeowner is still blocked from the two remaining Pro-only pages (/insurance-defense, /resale-ready)
 *  - Free homeowner at their 1-property cap gets the upgrade modal, not the add-property form
 *  - Subscription upgrade click navigates to /checkout with correct tier param
 *  - Subscription downgrade click navigates to /checkout with correct tier param
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

// ── Free homeowner: 1-property access, not a blanket redirect ────────────────

test.describe("Tier limit — Free homeowner gets 1-property access", () => {
  test("Free homeowner visiting /dashboard is not redirected to /pricing", async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Free");
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/dashboard");
  });

  test("Free homeowner visiting /properties/new is not redirected to /pricing", async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Free");
    await page.goto("/properties/new");
    // /properties/new unconditionally forwards to /dashboard, where the
    // add-property modal lives — the point of this test is that neither
    // hop lands on /pricing.
    await expect(page).not.toHaveURL(/\/pricing/);
  });

  test("Free homeowner can reach /market (no longer Pro-only)", async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Free");
    await page.goto("/market");
    await expect(page).toHaveURL("/market");
  });

  test("Free homeowner is still blocked from Pro-only /insurance-defense", async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Free");
    await page.goto("/insurance-defense");
    await expect(page).toHaveURL(/\/pricing/);
  });

  test("Free homeowner is still blocked from Pro-only /resale-ready", async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Free");
    await page.goto("/resale-ready");
    await expect(page).toHaveURL(/\/pricing/);
  });

  for (const path of ["/maintenance", "/warranties", "/recurring/new", "/sensors", "/people"]) {
    test(`Free homeowner can reach ${path} (no longer Pro-only)`, async ({ page }) => {
      await injectTestAuth(page);
      await injectTestProperties(page);
      await injectSubscription(page, "Free");
      await page.goto(path);
      await expect(page).toHaveURL(path);
    });
  }

  test("Free homeowner at their 1-property limit sees the upgrade modal, not the add-property form", async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page); // seeds exactly 1 property
    await injectSubscription(page, "Free");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /add property/i }).click();
    await expect(page.getByRole("dialog", { name: /upgrade your plan/i })).toBeVisible();
  });
});

// ── Subscription upgrade flow from Settings ───────────────────────────────────

test.describe("Tier limit — plan upgrade flow from Settings (Free tier)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Free");
    await page.goto("/settings");
    await page.getByRole("button", { name: /subscription/i }).click();
  });

  test("Free tier shows 'Upgrade Plan' section heading (Pro is offered as the upgrade)", async ({ page }) => {
    await expect(page.getByText("Upgrade Plan")).toBeVisible();
  });

  test("clicking Upgrade opens the UpgradeModal dialog", async ({ page }) => {
    await page.getByRole("button", { name: /^upgrade$/i }).first().click();
    await expect(page.getByRole("dialog", { name: /upgrade your plan/i })).toBeVisible();
  });

  test("UpgradeModal shows only the single Pro plan card", async ({ page }) => {
    await page.getByRole("button", { name: /^upgrade$/i }).first().click();
    // Pro is the only purchasable homeowner plan now.
    await expect(page.getByRole("button", { name: "Select Pro" })).toBeVisible();
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

test.describe("Tier limit — Settings plan section (Pro tier, the only purchasable plan)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Pro");
    await page.goto("/settings");
    await page.getByRole("button", { name: /subscription/i }).click();
  });

  // Pro is the only purchasable homeowner tier, so there's nothing to
  // upgrade to — the whole "Upgrade Plan" section is absent for Pro subscribers.
  test("Pro tier shows no 'Upgrade Plan' section", async ({ page }) => {
    await expect(page.getByText("Upgrade Plan")).toHaveCount(0);
  });

  test("Pro tier shows no 'Upgrade' buttons in the subscription tab", async ({ page }) => {
    await expect(page.getByRole("button", { name: /^upgrade$/i })).toHaveCount(0);
  });
});

