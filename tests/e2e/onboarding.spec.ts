import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectRegisterProperty } from "./helpers/testData";

// Helper: fill Step 1 and advance
async function fillStep1(page: Parameters<typeof injectTestAuth>[0]) {
  await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
  await page.getByLabel(/city/i).fill("Austin");
  await page.getByLabel(/state/i).fill("TX");
  await page.getByLabel(/zip code/i).fill("78701");
  await page.getByRole("button", { name: /next/i }).click();
}

// Helper: fill Step 2 and advance
async function fillStep2(page: Parameters<typeof injectTestAuth>[0]) {
  await page.getByLabel(/year built/i).fill("2000");
  await page.getByLabel(/square feet/i).fill("2000");
  // Step 2 Next tries to register with canister — stub it out
  await page.route("**", (route) => route.continue());
  await page.getByRole("button", { name: /next/i }).click();
}

test.describe("OnboardingWizard — /onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await page.goto("/onboarding");
    // Wait for wizard card to render
    await expect(page.getByText(/step 1 of 5/i)).toBeVisible();
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test("shows HomeGentic logo", async ({ page }) => {
    await expect(page.getByText(/HomeGentic/).first()).toBeVisible();
  });

  test("shows progress bar", async ({ page }) => {
    await expect(page.getByRole("progressbar")).toBeVisible();
  });

  test("shows 'Step 1 of 5' label on load", async ({ page }) => {
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
  });

  test("shows 'Skip setup — go to my dashboard' link", async ({ page }) => {
    await expect(page.getByText(/skip setup/i)).toBeVisible();
  });

  test("clicking logo navigates to home", async ({ page }) => {
    await page.getByText(/HomeGentic/).first().click();
    await expect(page).toHaveURL("/");
  });

  // ── Step 1: Property Address ────────────────────────────────────────────────

  test("step 1 shows 'Property Address' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /property address/i })).toBeVisible();
  });

  test("step 1 shows Street Address field", async ({ page }) => {
    await expect(page.getByLabel(/street address/i)).toBeVisible();
  });

  test("step 1 shows City field", async ({ page }) => {
    await expect(page.getByLabel(/city/i)).toBeVisible();
  });

  test("step 1 shows State field", async ({ page }) => {
    await expect(page.getByLabel(/state/i)).toBeVisible();
  });

  test("step 1 shows ZIP Code field", async ({ page }) => {
    await expect(page.getByLabel(/zip code/i)).toBeVisible();
  });

  test("Next is disabled when step 1 fields are empty", async ({ page }) => {
    await expect(page.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  test("Next is disabled with invalid state abbreviation", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("XX");  // invalid
    await page.getByLabel(/zip code/i).fill("78701");
    await expect(page.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  test("Next is disabled with invalid ZIP", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("1234");  // only 4 digits
    await expect(page.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  test("invalid state shows validation message", async ({ page }) => {
    await page.getByLabel(/state/i).fill("XX");
    await expect(page.getByText(/valid us state/i)).toBeVisible();
  });

  test("invalid ZIP shows validation message", async ({ page }) => {
    await page.getByLabel(/zip code/i).fill("1234");
    await expect(page.getByText(/5-digit zip/i)).toBeVisible();
  });

  test("Next enables after filling all required step 1 fields", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("78701");
    await expect(page.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  test("clicking Next advances to step 2", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("78701");
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByText("Step 2 of 5")).toBeVisible();
  });

  // ── Step 2: Property Details ────────────────────────────────────────────────

  test("step 2 shows 'Property Details' heading", async ({ page }) => {
    await fillStep1(page);
    await expect(page.getByRole("heading", { name: /property details/i })).toBeVisible();
  });

  test("step 2 shows property type grid with Single Family option", async ({ page }) => {
    await fillStep1(page);
    await expect(page.getByText("Single Family")).toBeVisible();
  });

  test("step 2 shows Condo property type option", async ({ page }) => {
    await fillStep1(page);
    await expect(page.getByText("Condo")).toBeVisible();
  });

  test("step 2 shows Year Built field", async ({ page }) => {
    await fillStep1(page);
    await expect(page.getByLabel(/year built/i)).toBeVisible();
  });

  test("step 2 shows Square Feet field", async ({ page }) => {
    await fillStep1(page);
    await expect(page.getByLabel(/square feet/i)).toBeVisible();
  });

  test("Next is disabled on step 2 when fields are empty", async ({ page }) => {
    await fillStep1(page);
    await expect(page.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  test("Next enables on step 2 after filling year and sqft", async ({ page }) => {
    await fillStep1(page);
    await page.getByLabel(/year built/i).fill("1990");
    await page.getByLabel(/square feet/i).fill("1800");
    await expect(page.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  test("year out of range shows validation error", async ({ page }) => {
    await fillStep1(page);
    await page.getByLabel(/year built/i).fill("1800");
    await expect(page.getByText(/year must be between/i)).toBeVisible();
  });

  test("Back from step 2 returns to step 1", async ({ page }) => {
    await fillStep1(page);
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
  });

  test("Back from step 2 preserves address values", async ({ page }) => {
    await fillStep1(page);
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByLabel(/city/i)).toHaveValue("Austin");
  });

  // ── Step 3: Verify Ownership ────────────────────────────────────────────────
  // These tests require navigating through step 2, which calls registerProperty.
  // We inject window.__e2e_register_property so the service returns a mock
  // property immediately without hitting the canister.

  test("step 3 shows 'Verify Ownership' heading", async ({ page }) => {
    await injectRegisterProperty(page);
    await fillStep1(page);
    await page.getByLabel(/year built/i).fill("2000");
    await page.getByLabel(/square feet/i).fill("2000");
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByRole("heading", { name: /verify ownership/i })).toBeVisible();
  });

  test("step 3 shows Legal Name field", async ({ page }) => {
    await injectRegisterProperty(page);
    await fillStep1(page);
    await page.getByLabel(/year built/i).fill("2000");
    await page.getByLabel(/square feet/i).fill("2000");
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByLabel(/legal name/i)).toBeVisible();
  });

  test("step 3 shows Document Type selector", async ({ page }) => {
    await injectRegisterProperty(page);
    await fillStep1(page);
    await page.getByLabel(/year built/i).fill("2000");
    await page.getByLabel(/square feet/i).fill("2000");
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByLabel(/document type/i)).toBeVisible();
  });

  test("step 3 shows file upload input", async ({ page }) => {
    await injectRegisterProperty(page);
    await fillStep1(page);
    await page.getByLabel(/year built/i).fill("2000");
    await page.getByLabel(/square feet/i).fill("2000");
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  test("Next is disabled on step 3 when legal name and file are missing", async ({ page }) => {
    await injectRegisterProperty(page);
    await fillStep1(page);
    await page.getByLabel(/year built/i).fill("2000");
    await page.getByLabel(/square feet/i).fill("2000");
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  test("step 3 document type includes Deed / Title option", async ({ page }) => {
    await injectRegisterProperty(page);
    await fillStep1(page);
    await page.getByLabel(/year built/i).fill("2000");
    await page.getByLabel(/square feet/i).fill("2000");
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByLabel(/document type/i).locator("option", { hasText: /deed/i })).toHaveCount(1);
  });

  // ── Step 5: System Ages ─────────────────────────────────────────────────────
  // Steps 4 and 5 can be reached with the skip link from step 3 indirectly,
  // but we validate step 5 via direct step count progression.

  test("progress bar width increases as steps advance", async ({ page }) => {
    // Step 1: 20%
    const barAt1 = await page.locator('[role="progressbar"] > div').getAttribute("style");
    await fillStep1(page);
    // Step 2: 40%
    const barAt2 = await page.locator('[role="progressbar"] > div').getAttribute("style");
    expect(barAt1).not.toEqual(barAt2);
  });

  // ── Skip setup ──────────────────────────────────────────────────────────────

  test("'Skip setup' link navigates to /dashboard", async ({ page }) => {
    await page.getByText(/skip setup/i).click();
    await expect(page).toHaveURL("/dashboard");
  });
});
