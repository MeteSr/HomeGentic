/**
 * Warranty Wallet E2E — /warranties    (#180)
 *
 * WW.1  Basic tier with no warranty jobs → empty state
 * WW.2  Basic tier with warranty jobs → heading + all three sections
 * WW.3  Basic tier → scan-document panel visible
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSubscription, injectWarrantyJobs } from "./helpers/testData";

// ── WW.1 — No jobs empty state ────────────────────────────────────────────────

test.describe("WW.1 — /warranties (Basic, no warranties)", () => {
  test("shows empty state when no warranty jobs exist", async ({ page }) => {
    await injectTestAuth(page);
    await page.addInitScript(() => {
      (window as any).__e2e_subscription = { tier: "Basic", expiresAt: null };
      (window as any).__e2e_properties = [
        {
          id: 1, owner: "test-e2e-principal",
          address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
          propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
          verificationLevel: "Unverified", tier: "Pro",
          createdAt: 0, updatedAt: 0, isActive: true,
        },
      ];
      (window as any).__e2e_jobs = [];  // no jobs → no warranties
    });
    await page.goto("/warranties");
    await expect(page.getByText(/no warranties logged yet/i)).toBeVisible();
  });
});

// ── WW.2 / WW.3 — With warranty jobs ─────────────────────────────────────────

test.describe("WW.2 — /warranties (Basic, with warranty jobs)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectWarrantyJobs(page);
    await injectSubscription(page, "Basic");
    await page.goto("/warranties");
    // Wait for sections to render — title includes "(N)" count, only appears after warrantyJobs loads
    await expect(page.getByText(/Expiring Soon \(\d+\)/)).toBeVisible({ timeout: 10_000 });
  });

  test("WW.2 shows 'Your Warranties' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /your warranties/i })).toBeVisible();
  });

  test("WW.2 shows 'Warranty Wallet' eyebrow label", async ({ page }) => {
    await expect(page.getByText("Warranty Wallet")).toBeVisible();
  });

  test("WW.2 shows Expiring Soon section", async ({ page }) => {
    await expect(page.getByText("Expiring Soon")).toBeVisible();
  });

  test("WW.2 shows Active section", async ({ page }) => {
    await expect(page.getByText("Active").first()).toBeVisible();
  });

  test("WW.2 shows Expired section", async ({ page }) => {
    await expect(page.getByText("Expired")).toBeVisible();
  });

  test("WW.3 shows scan document panel upload button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /scan document/i })).toBeVisible();
  });
});
