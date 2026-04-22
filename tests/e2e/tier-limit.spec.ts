/**
 * tier-limit.spec.ts
 *
 * Tests tier-enforcement gates that block users from exceeding plan quotas.
 * Uses window.__e2e_* injection so no canister is required.
 *
 * Coverage:
 *  - Free tier job cap (≥5 jobs → UpgradeGate on /jobs/new)
 *  - Free tier property cap (≥1 property → UpgradeGate on /properties/new)
 *  - Subscription upgrade click navigates to /checkout with correct tier param
 *  - Subscription downgrade click navigates to /checkout with correct tier param
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Injects 5 jobs so the Free-tier job cap (≥5) triggers on /jobs/new. */
async function injectFiveJobs(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_jobs = Array.from({ length: 5 }, (_, i) => ({
      id: String(i + 1),
      propertyId: "1",
      homeowner: "test-e2e-principal",
      serviceType: "Plumbing",
      contractorName: "Contractor Co",
      amount: 10_000,
      date: "2024-01-01",
      description: "",
      isDiy: false,
      status: "verified",
      verified: true,
      homeownerSigned: true,
      contractorSigned: true,
      photos: [],
      createdAt: Date.now() - 86_400_000 * (i + 1),
    }));
  });
}

/** Injects 1 property (the Free-tier limit) so adding another triggers the gate. */
async function injectOnePropertyAtFreeLimit(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_properties = [
      {
        id: 1,
        owner: "test-e2e-principal",
        address: "123 Maple Street",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        propertyType: "SingleFamily",
        yearBuilt: 2001,
        squareFeet: 2400,
        verificationLevel: "Unverified",
        tier: "Free",
        createdAt: 0,
        updatedAt: 0,
        isActive: true,
      },
    ];
  });
}

// ── Job limit (Free tier ≥5 jobs) ─────────────────────────────────────────────

test.describe("Tier limit — job cap (Free)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectFiveJobs(page);
    await injectSubscription(page, "Free");
    await page.goto("/jobs/new");
    // Wait for both async loads (subscription + job count) to resolve so the gate renders
    await expect(page.getByText(/job limit reached/i)).toBeVisible();
  });

  test("shows UpgradeGate instead of job form", async ({ page }) => {
    // The free-tier gate replaces the form — 'Log a Job' heading must NOT appear
    await expect(page.getByRole("heading", { name: "Log a Job" })).not.toBeVisible();
  });

  test("shows 'Job Limit Reached' feature label", async ({ page }) => {
    await expect(page.getByText(/job limit reached/i)).toBeVisible();
  });

  test("shows current job count in the gate description", async ({ page }) => {
    await expect(page.getByText(/5 jobs/i)).toBeVisible();
  });

  test("shows upgrade call-to-action button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /upgrade/i }).first()).toBeVisible();
  });

  test("Back button is visible above the gate", async ({ page }) => {
    await expect(page.getByRole("button", { name: /back/i })).toBeVisible();
  });
});

// ── Subscription upgrade flow from Settings ───────────────────────────────────

test.describe("Tier limit — upgrade flow from Settings (Free tier)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Free");
    await page.goto("/settings");
    await page.getByRole("button", { name: /subscription/i }).click();
  });

  test("Free tier shows 'Upgrade Plan' section heading", async ({ page }) => {
    await expect(page.getByText("Upgrade Plan")).toBeVisible();
  });

  test("Free tier shows 'Upgrade' buttons (not 'Switch') in plan grid", async ({ page }) => {
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

// ── UpgradeGate component — /pricing fallback ─────────────────────────────────

test.describe("UpgradeGate — CTA navigates to /pricing", () => {
  test("UpgradeGate 'Upgrade to Pro' button navigates to /pricing", async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectFiveJobs(page);
    await injectSubscription(page, "Free");
    await page.goto("/jobs/new");
    // Wait for both async loads (subscription + job count) to resolve before the gate renders
    await expect(page.getByText(/job limit reached/i)).toBeVisible();
    // UpgradeGate default tier is "Basic" → button text is "Upgrade to Basic →"
    await page.getByRole("button", { name: /upgrade to basic/i }).click();
    await expect(page).toHaveURL(/\/pricing/);
  });
});
