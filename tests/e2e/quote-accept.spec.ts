/**
 * E2E — Quote accept flow
 *
 * Critical path: homeowner views competing bids → clicks Accept → confirms in
 * modal → sees success banner with "Log This Job" CTA → accepted quote shows
 * accepted state, other quotes show "Not selected".
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

async function injectQuoteAcceptData(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_quote_requests = [
      {
        id:          "qr-accept",
        propertyId:  "1",
        homeowner:   "test-e2e-principal",
        serviceType: "HVAC",
        urgency:     "medium",
        description: "Annual HVAC tune-up and filter replacement.",
        status:      "quoted",
        createdAt:   Date.now() - 86_400_000 * 3,
      },
    ];
    (window as any).__e2e_quotes = [
      {
        id:         "q-accept-1",
        requestId:  "qr-accept",
        contractor: "contractor-accept-1",
        amount:     42000,
        timeline:   3,
        validUntil: Date.now() + 86_400_000 * 7,
        status:     "pending",
        createdAt:  Date.now() - 86_400_000,
      },
      {
        id:         "q-accept-2",
        requestId:  "qr-accept",
        contractor: "contractor-accept-2",
        amount:     55000,
        timeline:   5,
        validUntil: Date.now() + 86_400_000 * 7,
        status:     "pending",
        createdAt:  Date.now() - 86_400_000 * 2,
      },
    ];
    (window as any).__e2e_contractors = [
      {
        id: "c-a1", principal: "contractor-accept-1",
        name: "Cool Air Services", specialty: "HVAC",
        trustScore: 92, isVerified: true,
        jobsCompleted: 120, createdAt: 0,
      },
      {
        id: "c-a2", principal: "contractor-accept-2",
        name: "Arctic Pros", specialty: "HVAC",
        trustScore: 85, isVerified: false,
        jobsCompleted: 60, createdAt: 0,
      },
    ];
  });
}

test.describe("Quote Accept Flow — /quotes/qr-accept", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectQuoteAcceptData(page);
    await page.goto("/quotes/qr-accept");
  });

  // ── Bids visible ────────────────────────────────────────────────────────────

  test("shows both contractor bids", async ({ page }) => {
    await expect(page.getByText("Cool Air Services")).toBeVisible();
    await expect(page.getByText("Arctic Pros")).toBeVisible();
  });

  test("shows bid amounts", async ({ page }) => {
    await expect(page.getByText(/\$420/)).toBeVisible();
  });

  test("shows Accept buttons for pending bids", async ({ page }) => {
    const acceptBtns = page.getByRole("button", { name: /accept this quote/i });
    await expect(acceptBtns.first()).toBeVisible();
  });

  // ── Confirmation modal ──────────────────────────────────────────────────────

  test("clicking Accept opens the confirmation modal", async ({ page }) => {
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await expect(page.getByText(/confirm acceptance/i)).toBeVisible();
  });

  test("modal shows contractor name", async ({ page }) => {
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await expect(page.getByText(/Cool Air Services|Arctic Pros/i)).toBeVisible();
  });

  test("modal shows amount and timeline", async ({ page }) => {
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    // Amount column and Timeline column in the modal grid
    await expect(page.getByText(/amount/i)).toBeVisible();
    await expect(page.getByText(/timeline/i)).toBeVisible();
  });

  test("Cancel button dismisses the modal", async ({ page }) => {
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await expect(page.getByText(/confirm acceptance/i)).toBeVisible();
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByText(/confirm acceptance/i)).not.toBeVisible();
  });

  test("clicking outside the modal dismisses it", async ({ page }) => {
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await expect(page.getByText(/confirm acceptance/i)).toBeVisible();
    // Click the backdrop (fixed overlay behind the modal)
    await page.mouse.click(10, 10);
    await expect(page.getByText(/confirm acceptance/i)).not.toBeVisible();
  });

  // ── Successful acceptance ───────────────────────────────────────────────────

  test("confirming acceptance shows the Quote Accepted banner", async ({ page }) => {
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await page.getByRole("button", { name: /confirm accept/i }).click();
    await expect(page.getByText(/quote accepted/i)).toBeVisible({ timeout: 5000 });
  });

  test("success banner shows a Log This Job button", async ({ page }) => {
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await page.getByRole("button", { name: /confirm accept/i }).click();
    await expect(page.getByRole("button", { name: /log this job/i })).toBeVisible({ timeout: 5000 });
  });

  test("Log This Job navigates to /jobs/new", async ({ page }) => {
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await page.getByRole("button", { name: /confirm accept/i }).click();
    await page.getByRole("button", { name: /log this job/i }).click({ timeout: 5000 });
    await expect(page).toHaveURL(/\/jobs\/new/, { timeout: 5000 });
  });

  test("accepted quote card shows Accepted state after confirmation", async ({ page }) => {
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await page.getByRole("button", { name: /confirm accept/i }).click();
    await expect(page.getByText(/\bAccepted\b/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("non-accepted quote card shows Not selected after confirmation", async ({ page }) => {
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await page.getByRole("button", { name: /confirm accept/i }).click();
    await expect(page.getByText(/not selected/i)).toBeVisible({ timeout: 5000 });
  });
});
