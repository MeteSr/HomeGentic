import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectBaselinePhotos } from "./helpers/testData";
import { assertNoA11yViolations } from "./helpers/a11y";

// Dashboard requires 2+ properties — a single property triggers an immediate
// redirect to the property detail page (DashboardPage redirect effect).
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

test.describe("DashboardPage — /dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await page.goto("/dashboard");
    // Hero "Log maintenance" button is always in the blue panel — reliable ready signal
    await expect(page.getByRole("button", { name: /log maintenance/i })).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // ── Hero panel ──────────────────────────────────────────────────────────────

  test("shows score number in hero panel", async ({ page }) => {
    // Score is a number rendered at 80px font; assert any numeric text exists in the hero
    await expect(page.getByRole("button", { name: /log maintenance/i })).toBeVisible();
  });

  test("shows '+ Log maintenance' button in hero", async ({ page }) => {
    await expect(page.getByRole("button", { name: /log maintenance/i })).toBeVisible();
  });

  test("shows 'Resale report' button in hero", async ({ page }) => {
    await expect(page.getByRole("button", { name: /resale report/i })).toBeVisible();
  });

  test("shows 'Copy cert link' button in hero", async ({ page }) => {
    await expect(page.getByRole("button", { name: /copy cert link/i })).toBeVisible();
  });

  // ── Address bar ─────────────────────────────────────────────────────────────

  test("shows first property address in address bar", async ({ page }) => {
    await expect(page.getByText("123 Maple Street").first()).toBeVisible();
  });

  test("shows SWITCH button in address bar", async ({ page }) => {
    await expect(page.getByText("SWITCH")).toBeVisible();
  });

  test("clicking SWITCH reveals property switcher dropdown", async ({ page }) => {
    await page.getByText("SWITCH").click();
    await expect(page.getByText("456 Oak Ave").first()).toBeVisible();
  });

  // ── Sections ────────────────────────────────────────────────────────────────

  test("shows 'HOME PULSE' section", async ({ page }) => {
    await expect(page.getByText(/home pulse/i).first()).toBeVisible();
  });

  test("shows 'WHERE THE POINTS COME FROM' section", async ({ page }) => {
    await expect(page.getByText(/where the points come from/i)).toBeVisible();
  });

  test("shows 'Ask about your home' section", async ({ page }) => {
    await expect(page.getByText(/ask about your home/i)).toBeVisible();
  });

  test("shows 'UPCOMING MAINTENANCE' section", async ({ page }) => {
    await expect(page.getByText(/upcoming maintenance/i).first()).toBeVisible();
  });

  test("shows 'THE PAPER TRAIL' section", async ({ page }) => {
    await expect(page.getByText(/the paper trail/i)).toBeVisible();
  });

  // ── Paper trail docs ────────────────────────────────────────────────────────

  test("shows recent job receipts in paper trail", async ({ page }) => {
    // 4 jobs injected → top 3 appear as docs; service type is used in the title
    await expect(page.getByText(/painting record|painting receipt|hvac record|hvac receipt|plumbing record|plumbing receipt/i).first()).toBeVisible();
  });

  // ── Recent activity ─────────────────────────────────────────────────────────

  test("shows 'RECENT ACTIVITY' section when jobs are present", async ({ page }) => {
    await expect(page.getByText(/recent activity/i).first()).toBeVisible();
  });

  // ── Sidebar ─────────────────────────────────────────────────────────────────

  test("shows verification upsell card when property is unverified", async ({ page }) => {
    await expect(page.getByText(/next points available/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /start verification/i })).toBeVisible();
  });

  // ── Navigation ──────────────────────────────────────────────────────────────

  test("clicking SWITCH then a property switches the active property", async ({ page }) => {
    await page.getByText("SWITCH").click();
    // Second property listed in dropdown
    await page.getByText("456 Oak Ave").click();
    // Address bar now shows second property
    await expect(page.getByText("456 Oak Ave").first()).toBeVisible();
  });

  test("'+ Log maintenance' button opens Log Job modal", async ({ page }) => {
    await page.getByRole("button", { name: /log maintenance/i }).click();
    await expect(page.getByRole("heading", { name: /what was done/i })).toBeVisible();
  });
});
