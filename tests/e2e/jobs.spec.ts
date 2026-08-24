/**
 * Jobs page E2E tests
 *
 * JP.1  /jobs — "open jobs" heading visible
 * JP.2  /jobs — "Post a job" and "Back to dashboard" buttons visible
 * JP.3  /jobs — empty state when no open jobs and no bids
 * JP.4  /jobs — injected open job card appears with AWAITING BIDS badge
 * JP.5  /jobs — "How bidding works" explainer always shown when jobs present
 * JP.6  /jobs — "Post a job" navigates to /jobs/new
 *
 * All tests use window.__e2e_* injection — no canister required.
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSubscription } from "./helpers/testData";

async function setup(page: Parameters<typeof injectTestAuth>[0]) {
  await injectTestAuth(page);
  await injectSubscription(page, "Pro");
  await page.addInitScript(() => {
    (window as any).__e2e_properties = [
      {
        id: 1, owner: "test-e2e-principal",
        address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
        propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
        verificationLevel: "Unverified", tier: "Pro",
        createdAt: 0, updatedAt: 0, isActive: true,
      },
    ];
  });
}

// ── JP — /jobs page ───────────────────────────────────────────────────────────

test.describe("JP — /jobs page", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await page.addInitScript(() => {
      (window as any).__e2e_jobs = [];
      (window as any).__e2e_quote_requests = [];
    });
    await page.goto("/jobs");
    await expect(page.getByRole("heading", { name: /open jobs/i })).toBeVisible();
  });

  // JP.1
  test("shows open jobs heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /open jobs/i })).toBeVisible();
  });

  // JP.2
  test("shows 'Post a job' and 'Back to dashboard' buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: /\+ post a job/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /back to dashboard/i })).toBeVisible();
  });

  // JP.3
  test("shows empty state when no open jobs", async ({ page }) => {
    await expect(page.getByText(/no open jobs/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /post your first job/i })).toBeVisible();
  });

  // JP.6
  test("'Post a job' navigates to /jobs/new", async ({ page }) => {
    await page.getByRole("button", { name: /\+ post a job/i }).click();
    await expect(page).toHaveURL(/\/jobs\/new/);
  });
});

test.describe("JP — /jobs page with open job", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await page.addInitScript(() => {
      (window as any).__e2e_jobs = [
        {
          id: "j1", propertyId: "1", homeowner: "test-e2e-principal",
          serviceType: "Plumbing", contractorName: null,
          amount: 0, date: new Date().toISOString().slice(0, 10),
          description: "Fix the leaking bathroom faucet.",
          isDiy: false, status: "open", verified: false,
          homeownerSigned: false, contractorSigned: false,
          photos: [], createdAt: Date.now() - 86_400_000,
        },
      ];
      (window as any).__e2e_quote_requests = [
        {
          id: "qr1", propertyId: "1", homeowner: "test-e2e-principal",
          serviceType: "Plumbing", urgency: "Normal",
          description: "Fix the leaking bathroom faucet.",
          status: "open", createdAt: Date.now() - 86_400_000,
        },
      ];
    });
    await page.goto("/jobs");
    await expect(page.getByRole("heading", { name: /open jobs/i })).toBeVisible();
  });

  // JP.4
  test("shows job card with service type", async ({ page }) => {
    await expect(page.getByText("Plumbing").first()).toBeVisible();
  });

  test("shows AWAITING BIDS badge on job with no bids", async ({ page }) => {
    await expect(page.getByText(/awaiting bids/i)).toBeVisible();
  });

  // JP.5
  test("shows 'How bidding works' explainer section", async ({ page }) => {
    await expect(page.getByText(/how bidding works/i)).toBeVisible();
  });

  test("shows job description text", async ({ page }) => {
    await expect(page.getByText(/leaking bathroom faucet/i)).toBeVisible();
  });
});
