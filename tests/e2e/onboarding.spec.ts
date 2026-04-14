import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

async function injectEmptyData(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_properties = [];
    (window as any).__e2e_jobs       = [];
  });
}

async function injectWithProperty(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_properties = [
      {
        id: 1, owner: "test-e2e-principal",
        address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
        propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
        verificationLevel: "Unverified", tier: "Free",
        createdAt: 0, updatedAt: 0, isActive: true,
      },
    ];
    (window as any).__e2e_jobs = [];
  });
}

test.describe("OnboardingPage — /onboarding", () => {
  // ── Empty state — no property yet ─────────────────────────────────────────

  test.describe("no property registered", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await injectEmptyData(page);
      await page.goto("/onboarding");
    });

    test("shows onboarding heading", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
    });

    test("shows 'Add your first property' step", async ({ page }) => {
      await expect(page.getByText(/add your first property/i)).toBeVisible();
    });

    test("shows 'Verify ownership' step", async ({ page }) => {
      await expect(page.getByText(/verify ownership/i)).toBeVisible();
    });

    test("shows 'Log your first maintenance job' step", async ({ page }) => {
      await expect(page.getByText(/log your first maintenance job/i)).toBeVisible();
    });

    test("shows 'Set your system ages' step", async ({ page }) => {
      await expect(page.getByText(/set your system ages/i)).toBeVisible();
    });

    test("shows 'Import historical documents' step", async ({ page }) => {
      await expect(page.getByText(/import historical documents/i)).toBeVisible();
    });

    test("Add property CTA button is visible", async ({ page }) => {
      await expect(page.getByRole("button", { name: /add property/i })).toBeVisible();
    });

    test("Add property CTA navigates to /properties/new", async ({ page }) => {
      await page.getByRole("button", { name: /add property/i }).first().click();
      await expect(page).toHaveURL("/properties/new");
    });
  });

  // ── Property registered — first step done ─────────────────────────────────

  test.describe("property registered", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await injectWithProperty(page);
      await page.goto("/onboarding");
    });

    test("shows first step as Done when property exists", async ({ page }) => {
      // When a property is registered the 'Add your first property' step is marked Done
      // — the CTA button is replaced by a Done badge + CheckCircle icon
      await expect(page.getByText("Done").first()).toBeVisible();
    });

    test("Log a job step CTA navigates to /jobs/new", async ({ page }) => {
      await page.getByRole("button", { name: /log a job/i }).click();
      await expect(page).toHaveURL("/jobs/new");
    });
  });
});
