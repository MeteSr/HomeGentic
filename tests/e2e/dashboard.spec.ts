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
    await expect(page.getByRole("heading", { name: /good morning|good afternoon|good evening/i })).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // ── Welcome header ──────────────────────────────────────────────────────────

  test("shows greeting heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /good morning|good afternoon|good evening/i })).toBeVisible();
  });

  test("shows 'Here's what's happening with your home' subtitle", async ({ page }) => {
    await expect(page.getByText(/here's what's happening with your home/i)).toBeVisible();
  });

  // ── Stat cards ─────────────────────────────────────────────────────────────

  test("shows Property Health Score stat card", async ({ page }) => {
    await expect(page.getByText("Property Health Score")).toBeVisible();
  });

  test("shows Upcoming Maintenance stat card", async ({ page }) => {
    await expect(page.getByText("Upcoming Maintenance").first()).toBeVisible();
  });

  test("shows Open Tasks stat card", async ({ page }) => {
    await expect(page.getByText("Open Tasks")).toBeVisible();
  });

  test("shows Property Value Impact stat card", async ({ page }) => {
    await expect(page.getByText("Property Value Impact")).toBeVisible();
  });

  // ── Sections ────────────────────────────────────────────────────────────────

  test("shows Upcoming Maintenance section heading", async ({ page }) => {
    // The section panel heading (second occurrence)
    await expect(page.getByRole("heading", { name: /upcoming maintenance/i }).first()).toBeVisible();
  });

  test("shows Recent Documents section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /recent documents/i })).toBeVisible();
  });

  test("shows Property Insights section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /property insights/i })).toBeVisible();
  });

  test("shows Property Value Tracker section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /property value tracker/i })).toBeVisible();
  });

  test("shows Quick Actions section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /quick actions/i })).toBeVisible();
  });

  // ── Right panel ─────────────────────────────────────────────────────────────

  test("shows AI Assistant panel", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /ai assistant/i })).toBeVisible();
  });

  test("shows Recent Activity section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /recent activity/i })).toBeVisible();
  });

  test("shows Quorum HOA members banner", async ({ page }) => {
    await expect(page.getByText(/Quorum HOA Members Save/i)).toBeVisible();
  });

  // ── My Properties section ───────────────────────────────────────────────────

  test("shows My Properties section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /my properties/i })).toBeVisible();
  });

  test("shows both property addresses in My Properties", async ({ page }) => {
    await expect(page.getByText("123 Maple Street").first()).toBeVisible();
    await expect(page.getByText("456 Oak Ave").first()).toBeVisible();
  });

  test("clicking a property card navigates to property detail", async ({ page }) => {
    await page.getByRole("heading", { name: "123 Maple Street" }).click();
    await expect(page).toHaveURL(/\/properties\/1/);
  });

  // ── Navigation ──────────────────────────────────────────────────────────────

  test("Add Property button opens the add-property modal", async ({ page }) => {
    await page.getByRole("button", { name: /add property/i }).first().click();
    await expect(page.getByText(/step 1 of 6/i)).toBeVisible();
  });

  // ── Quick Actions ───────────────────────────────────────────────────────────

  test("Log Maintenance quick action button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /log maintenance/i })).toBeVisible();
  });

  // ── Baseline photo prompt ───────────────────────────────────────────────────

  test.describe("baseline prompt — zero photos", () => {
    test.beforeEach(async ({ page }) => {
      await injectBaselinePhotos(page, { "1": [], "2": [] });
      await setup(page);
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: /good morning|good afternoon|good evening/i })).toBeVisible();
    });

    test("shows 'Complete your property baseline' card for first property", async ({ page }) => {
      await expect(page.getByText(/complete your property baseline/i).first()).toBeVisible();
    });

    test("shows all 6 system labels in the baseline card", async ({ page }) => {
      await expect(page.getByText(/HVAC \/ Air Conditioning/i).first()).toBeVisible();
      await expect(page.getByText(/Water Heater/i).first()).toBeVisible();
      await expect(page.getByText(/Electrical Panel/i).first()).toBeVisible();
      await expect(page.getByText(/Main Water Shut-off Valve/i).first()).toBeVisible();
      await expect(page.getByText(/Roof/i).first()).toBeVisible();
      await expect(page.getByText(/Garage Door Opener/i).first()).toBeVisible();
    });

    test("shows '0 / 6' progress count", async ({ page }) => {
      await expect(page.getByText(/0/).first()).toBeVisible();
      await expect(page.getByText(/\/\s*6/).first()).toBeVisible();
    });

    test("dismiss button hides the card for that property", async ({ page }) => {
      const card = page.locator('[data-testid="baseline-prompt-1"]');
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: /dismiss/i }).click();
      await expect(card).not.toBeVisible();
    });
  });

  test.describe("baseline prompt — all 6 photos present", () => {
    test.beforeEach(async ({ page }) => {
      await injectBaselinePhotos(page, {
        "1": ["hvac", "waterHeater", "electrical", "shutoff", "roof", "garageDoor"],
        "2": ["hvac", "waterHeater", "electrical", "shutoff", "roof", "garageDoor"],
      });
      await setup(page);
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: /good morning|good afternoon|good evening/i })).toBeVisible();
    });

    test("shows 'Baseline photos complete' badge when all 6 are captured", async ({ page }) => {
      await expect(page.getByText(/baseline photos complete/i).first()).toBeVisible();
    });

    test("does not show the checklist card when all 6 are captured", async ({ page }) => {
      await expect(page.getByText(/complete your property baseline/i)).not.toBeVisible();
    });
  });
});
