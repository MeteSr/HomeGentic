import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";
import { assertNoA11yViolations } from "./helpers/a11y";

// v3 left-rail dashboard (#dashboard-v3-left-nav). Most tests below seed 2
// properties so the property-switcher popover has something to switch
// between — the dashboard itself renders regardless of property count.
async function setup(page: Parameters<typeof injectTestAuth>[0]) {
  await injectTestAuth(page);
  await page.addInitScript(() => {
    // Pro tier so 2 properties don't hit the property limit
    (window as any).__e2e_subscription = { tier: "Pro", expiresAt: null };
    (window as any).__e2e_properties = [
      {
        id: 1, owner: "test-e2e-principal",
        address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
        propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
        verificationLevel: "Unverified", tier: "Free",
        createdAt: 0, updatedAt: 0, isActive: true,
      },
      {
        id: 2, owner: "test-e2e-principal",
        address: "456 Oak Ave", city: "Austin", state: "TX", zipCode: "78702",
        propertyType: "SingleFamily", yearBuilt: 1995, squareFeet: 1800,
        verificationLevel: "Unverified", tier: "Free",
        createdAt: 0, updatedAt: 0, isActive: true,
      },
    ];
    (window as any).__e2e_jobs = [
      {
        id: "1", propertyId: "1", homeowner: "test-e2e-principal",
        serviceType: "HVAC", contractorName: "Cool Air Services",
        amount: 240_000, date: "2023-03-15",
        description: "Full HVAC system replacement.",
        isDiy: false, status: "verified", verified: true,
        homeownerSigned: true, contractorSigned: true,
        photos: [], createdAt: Date.now() - 86_400_000 * 30,
      },
      {
        id: "2", propertyId: "1", homeowner: "test-e2e-principal",
        serviceType: "Roofing", contractorName: "Top Roof Co",
        amount: 850_000, date: "2023-07-22",
        description: "Full roof replacement after storm damage.",
        isDiy: false, status: "completed", verified: false,
        homeownerSigned: false, contractorSigned: false,
        photos: [], createdAt: Date.now() - 86_400_000 * 15,
      },
      {
        id: "3", propertyId: "1", homeowner: "test-e2e-principal",
        serviceType: "Plumbing", contractorName: "Flow Masters",
        amount: 65_000, date: "2023-09-10",
        description: "Fixed leaking pipes under kitchen sink.",
        isDiy: false, status: "verified", verified: true,
        homeownerSigned: true, contractorSigned: true,
        photos: [], createdAt: Date.now() - 86_400_000 * 10,
      },
      {
        id: "4", propertyId: "1", homeowner: "test-e2e-principal",
        serviceType: "Painting", isDiy: true,
        amount: 28_000, date: "2023-11-05",
        description: "Painted living room and hallway.",
        status: "verified", verified: true,
        homeownerSigned: true, contractorSigned: true,
        photos: [], createdAt: Date.now() - 86_400_000 * 5,
      },
    ];
  });
}

test.describe("DashboardPage — /dashboard (v3 left nav)", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await page.goto("/dashboard");
    // The score readout is always in the resting stage — reliable ready signal
    await expect(page.getByText("HOMEGENTIC SCORE")).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // ── Header ──────────────────────────────────────────────────────────────

  test("shows the property address in the header", async ({ page }) => {
    await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
  });

  test("clicking the address reveals the property switcher popover", async ({ page }) => {
    await page.getByText(/123 maple street/i).first().click();
    await expect(page.getByText("456 Oak Ave")).toBeVisible();
  });

  test("switching properties updates the header address", async ({ page }) => {
    await page.getByText(/123 maple street/i).first().click();
    await page.getByText("456 Oak Ave").click();
    await expect(page.getByText(/456 oak ave/i).first()).toBeVisible();
  });

  test("shows a theme toggle and switches to light mode", async ({ page }) => {
    const toggle = page.getByText("LIGHT", { exact: true });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByText("DARK", { exact: true })).toBeVisible();
  });

  // ── Left rail ───────────────────────────────────────────────────────────

  test("shows the left rail with SCORE, PROPERTY and MARKET chips", async ({ page }) => {
    await expect(page.getByText("SCORE", { exact: true })).toBeVisible();
    await expect(page.getByText("PROPERTY", { exact: true })).toBeVisible();
    await expect(page.getByText("MARKET", { exact: true })).toBeVisible();
  });

  test("clicking a rail chip opens that panel", async ({ page }) => {
    await page.getByText("DOCS", { exact: true }).click();
    await expect(page.getByText("Most recent first.")).toBeVisible();
  });

  test("clicking a panel's close control returns to the resting stage", async ({ page }) => {
    await page.getByText("SPEND", { exact: true }).click();
    await expect(page.getByText("All logged jobs, by trade.")).toBeVisible();
    await page.getByText("Back to quiet").click();
    await expect(page.getByText("HOMEGENTIC SCORE")).toBeVisible();
  });

  // ── Ask bar ─────────────────────────────────────────────────────────────

  test("shows the ask bar with its placeholder", async ({ page }) => {
    await expect(page.getByPlaceholder(/ask about your home/i)).toBeVisible();
  });

  test("typing a question in the ask bar routes to a panel", async ({ page }) => {
    await page.getByPlaceholder(/ask about your home/i).fill("how much have I spent");
    await page.keyboard.press("Enter");
    await expect(page.getByText("All logged jobs, by trade.")).toBeVisible();
  });

  test("the '+' button opens the Add panel", async ({ page }) => {
    await page.getByTitle("Add to the record").click();
    await expect(page.getByText("Add to the record")).toBeVisible();
  });

  // ── Panel CTAs open real modals ─────────────────────────────────────────

  test("Docs panel's CTA opens the Log Job modal", async ({ page }) => {
    await page.getByText("DOCS", { exact: true }).click();
    await page.getByText(/upload a receipt/i).click();
    await expect(page.getByRole("heading", { name: /what was done/i })).toBeVisible();
  });

  test("Rooms panel's CTA opens the Add Room modal", async ({ page }) => {
    await page.getByText("ROOMS", { exact: true }).click();
    await page.getByText(/^add a room$/i).click();
    await expect(page.getByRole("heading", { name: /add room/i })).toBeVisible();
  });
});

test.describe("DashboardPage — /dashboard (single property)", () => {
  test("stays on /dashboard and shows dashboard content — no redirect to the property page", async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page); // seeds exactly 1 property
    await page.goto("/dashboard");
    await expect(page.getByText("HOMEGENTIC SCORE")).toBeVisible();
    await expect(page).toHaveURL("/dashboard");
  });
});
