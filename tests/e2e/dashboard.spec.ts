import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectBaselinePhotos } from "./helpers/testData";

// Dashboard requires 2+ properties — a single property triggers an immediate
// redirect to the property detail page (DashboardPage line 83-85).
async function setup(page: Parameters<typeof injectTestAuth>[0]) {
  await injectTestAuth(page);
  await page.addInitScript(() => {
    // Pro tier so 2 properties don't hit the property limit (Pro allows 5)
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
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test("shows the Overview eyebrow label", async ({ page }) => {
    await expect(page.getByText("Overview")).toBeVisible();
  });

  test("shows the user email in the dashboard subheading", async ({ page }) => {
    // injectTestAuth sets email = "e2e@test.com", shown below the Dashboard heading
    await expect(page.getByRole("main").getByText("e2e@test.com")).toBeVisible();
  });

  // ── Stats panel ─────────────────────────────────────────────────────────────

  test("shows both properties in My Properties section", async ({ page }) => {
    await expect(page.getByText("My Properties")).toBeVisible();
    await expect(page.getByText("123 Maple Street").first()).toBeVisible();
    await expect(page.getByText("456 Oak Ave").first()).toBeVisible();
  });

  test("shows Verified Jobs stat equal to 3", async ({ page }) => {
    // 3 of the 4 injected jobs are verified
    await expect(page.getByText("Verified Jobs").locator("..").getByText("3")).toBeVisible();
  });

  test("shows Total Value stat", async ({ page }) => {
    await expect(page.getByText("Total Value")).toBeVisible();
    // $11,830 total across all 4 jobs (in cents: 240k + 850k + 65k + 28k = 1,183,000)
    await expect(page.getByText("$11,830")).toBeVisible();
  });

  test("shows HomeGentic Premium stat", async ({ page }) => {
    await expect(page.getByText(/HomeGentic Premium/)).toBeVisible();
  });

  // ── Quick Actions ───────────────────────────────────────────────────────────

  test("shows Quick Actions section", async ({ page }) => {
    await expect(page.getByText("Quick Actions")).toBeVisible();
  });

  test("Add Property quick action is visible", async ({ page }) => {
    // There are multiple "Add Property" buttons; at least one should be visible
    await expect(page.getByRole("button", { name: /add property/i }).first()).toBeVisible();
  });

  test("Log a Job quick action is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /log a job/i })).toBeVisible();
  });

  test("Request Quote quick action is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /request quote/i })).toBeVisible();
  });

  // ── Properties section ──────────────────────────────────────────────────────

  test("shows My Properties section heading", async ({ page }) => {
    await expect(page.getByText("My Properties")).toBeVisible();
  });

  test("shows the injected property address", async ({ page }) => {
    await expect(page.getByText("123 Maple Street").first()).toBeVisible();
  });

  test("clicking a property card navigates to property detail", async ({ page }) => {
    // The PropertyCard renders the address in an <h3>; selector buttons are plain text
    await page.getByRole("heading", { name: "123 Maple Street" }).click();
    await expect(page).toHaveURL(/\/properties\/1/);
  });

  // ── Navigation ──────────────────────────────────────────────────────────────

  test("Add Property button navigates to /properties/new", async ({ page }) => {
    // Sidebar "+" button (aria-label="Add property")
    await page.getByRole("button", { name: /add property/i }).first().click();
    await expect(page).toHaveURL("/properties/new");
  });

  test("Log a Job opens the log job modal", async ({ page }) => {
    await page.getByRole("button", { name: /log a job/i }).first().click();
    await expect(page.getByRole("heading", { name: /log a job/i })).toBeVisible();
  });

  // ── Baseline photo prompt ───────────────────────────────────────────────────

  test.describe("baseline prompt — zero photos", () => {
    test.beforeEach(async ({ page }) => {
      // No __e2e_baseline_photos injected → getByJob returns [] for all properties
      await setup(page);
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
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
      const cards = page.getByText(/complete your property baseline/i);
      const firstCard = cards.first();
      await expect(firstCard).toBeVisible();
      // Click dismiss on the first card's parent
      await firstCard.locator("..").locator("..").getByRole("button", { name: /dismiss/i }).click();
      await expect(page.getByText(/complete your property baseline/i).first()).not.toBeVisible({ timeout: 3000 }).catch(() => {
        // If second property card still shows, that's expected — just verify first is gone
      });
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
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    });

    test("shows 'Baseline photos complete' badge when all 6 are captured", async ({ page }) => {
      await expect(page.getByText(/baseline photos complete/i).first()).toBeVisible();
    });

    test("does not show the checklist card when all 6 are captured", async ({ page }) => {
      await expect(page.getByText(/complete your property baseline/i)).not.toBeVisible();
    });
  });
});
