/**
 * E2E — NegotiationPanel opt-in flow (5.2.3)
 *
 * Verifies the consent gate, analysis render, and opt-out path as they appear
 * inside a real QuoteDetailPage — not just isolated in a unit test.
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

async function injectNegotiationData(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_quote_requests = [
      {
        id:          "qr-neg",
        propertyId:  "1",
        homeowner:   "test-e2e-principal",
        serviceType: "HVAC",
        urgency:     "medium",
        description: "AC unit not cooling — needs diagnosis.",
        status:      "quoted",
        createdAt:   Date.now() - 86_400_000 * 2,
      },
    ];
    (window as any).__e2e_quotes = [
      {
        id:         "q-neg-1",
        requestId:  "qr-neg",
        contractor: "contractor-neg-1",
        amount:     185000,
        timeline:   3,
        validUntil: Date.now() + 86_400_000 * 7,
        status:     "pending",
        createdAt:  Date.now() - 86_400_000,
      },
      {
        id:         "q-neg-2",
        requestId:  "qr-neg",
        contractor: "contractor-neg-2",
        amount:     220000,
        timeline:   5,
        validUntil: Date.now() + 86_400_000 * 7,
        status:     "pending",
        createdAt:  Date.now() - 86_400_000 * 2,
      },
    ];
    (window as any).__e2e_contractors = [
      {
        id: "c-n1", principal: "contractor-neg-1",
        name: "Cool Air Services", specialty: "HVAC",
        trustScore: 92, isVerified: true,
        jobsCompleted: 120, createdAt: 0,
      },
      {
        id: "c-n2", principal: "contractor-neg-2",
        name: "Arctic Pros", specialty: "HVAC",
        trustScore: 85, isVerified: true,
        jobsCompleted: 60, createdAt: 0,
      },
    ];
    // Clear any prior consent so tests start unconsented
    localStorage.removeItem("hf_negotiation_consents");
  });
}

test.describe("NegotiationPanel — consent gate (e2e)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectNegotiationData(page);
    await page.goto("/quotes/qr-neg");
  });

  test("shows the HomeFax Negotiation Analysis toggle", async ({ page }) => {
    await expect(page.getByText(/HomeFax Negotiation Analysis/i)).toBeVisible();
  });

  test("shows the opt-in checkbox unchecked by default", async ({ page }) => {
    const checkbox = page.getByRole("checkbox");
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
  });

  test("shows consent copy before opt-in", async ({ page }) => {
    await expect(page.getByText(/never contacts contractors/i)).toBeVisible();
  });

  test("does not show benchmark data before opt-in", async ({ page }) => {
    await expect(page.getByText(/market p25/i)).not.toBeVisible();
    await expect(page.getByText(/median/i)).not.toBeVisible();
  });

  test("does not show verdict labels before opt-in", async ({ page }) => {
    await expect(page.getByText(/\bfair\b|\bhigh\b|\blow\b/i)).not.toBeVisible();
  });
});

test.describe("NegotiationPanel — analysis after opt-in (e2e)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectNegotiationData(page);
    await page.goto("/quotes/qr-neg");
    // Opt in
    await page.getByRole("checkbox").click();
  });

  test("checkbox is checked after clicking", async ({ page }) => {
    await expect(page.getByRole("checkbox")).toBeChecked();
  });

  test("shows benchmark grid after opt-in", async ({ page }) => {
    await expect(page.getByText(/market p25/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/median/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/market p75/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("shows a verdict label (fair / high / low) for each quote", async ({ page }) => {
    await expect(
      page.getByText(/\bfair\b|\bhigh\b|\blow\b/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("consent copy is hidden after opt-in", async ({ page }) => {
    await expect(page.getByText(/never contacts contractors/i)).not.toBeVisible();
  });

  test("unchecking the toggle hides analysis", async ({ page }) => {
    // Wait for analysis to appear first
    await expect(page.getByText(/market p25/i).first()).toBeVisible({ timeout: 5000 });
    // Opt out
    await page.getByRole("checkbox").click();
    await expect(page.getByText(/market p25/i)).not.toBeVisible({ timeout: 3000 });
  });

  test("opting out re-shows consent copy", async ({ page }) => {
    await expect(page.getByText(/market p25/i).first()).toBeVisible({ timeout: 5000 });
    await page.getByRole("checkbox").click();
    await expect(page.getByText(/never contacts contractors/i)).toBeVisible({ timeout: 3000 });
  });
});
