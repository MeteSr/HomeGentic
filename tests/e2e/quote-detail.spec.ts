import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

async function injectQuoteData(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_quote_requests = [
      {
        id: "qr1",
        propertyId: "1",
        homeowner: "test-e2e-principal",
        serviceType: "HVAC",
        description: "Annual HVAC tune-up and filter replacement.",
        budgetCents: 50000,
        preferredDate: "2026-04-15",
        deadline: "2026-04-01",
        status: "Open",
        createdAt: Date.now() - 86_400_000 * 3,
      },
    ];
    (window as any).__e2e_quotes = [
      {
        id: "q1",
        requestId: "qr1",
        contractor: "contractor-1",
        amount: 42000,
        message: "Happy to help with your HVAC. We can do it next week.",
        estimatedDays: 1,
        createdAt: Date.now() - 86_400_000,
      },
      {
        id: "q2",
        requestId: "qr1",
        contractor: "contractor-2",
        amount: 48000,
        message: "Certified HVAC tech — full tune-up with report.",
        estimatedDays: 2,
        createdAt: Date.now() - 86_400_000 * 2,
      },
    ];
    (window as any).__e2e_contractors = [
      {
        id: "c1", principal: "contractor-1",
        name: "Cool Air Services", specialty: "HVAC",
        trustScore: 92, isVerified: true,
        jobsCompleted: 120, reviewCount: 45,
        createdAt: 0,
      },
      {
        id: "c2", principal: "contractor-2",
        name: "Arctic Pros", specialty: "HVAC",
        trustScore: 85, isVerified: true,
        jobsCompleted: 60, reviewCount: 20,
        createdAt: 0,
      },
    ];
  });
}

test.describe("QuoteDetailPage — /quotes/:id", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectQuoteData(page);
    await page.goto("/quotes/qr1");
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows quote request detail heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /quote|request/i }).first()).toBeVisible();
  });

  test("shows the service type HVAC", async ({ page }) => {
    await expect(page.getByText("HVAC")).toBeVisible();
  });

  test("shows the quote description", async ({ page }) => {
    await expect(page.getByText(/tune-up/i)).toBeVisible();
  });

  // ── Bids ──────────────────────────────────────────────────────────────────

  test("shows bids / quotes section", async ({ page }) => {
    await expect(page.getByText(/bid|quote/i).first()).toBeVisible();
  });

  test("shows Cool Air Services bid", async ({ page }) => {
    await expect(page.getByText("Cool Air Services")).toBeVisible();
  });

  test("shows Arctic Pros bid", async ({ page }) => {
    await expect(page.getByText("Arctic Pros")).toBeVisible();
  });

  test("shows bid amounts in dollars", async ({ page }) => {
    // $420.00 or $420
    await expect(page.getByText(/\$4(20|80)/)).toBeVisible();
  });

  // ── Back navigation ───────────────────────────────────────────────────────

  test("Back button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /back/i })).toBeVisible();
  });

  test("Back button navigates away from quote detail", async ({ page }) => {
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page).not.toHaveURL("/quotes/qr1");
  });
});
