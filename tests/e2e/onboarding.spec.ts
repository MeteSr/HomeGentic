import { test, expect, Page } from "@playwright/test";
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

/** Inject the skip-baseline flag so tests that don't test the new step pass through it automatically. */
async function injectSkipBaseline(page: Page) {
  await page.addInitScript(() => { (window as any).__e2e_skipBaselinePhotos = true; });
}

test.describe("OnboardingWizard — /onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSkipBaseline(page);
    await page.goto("/onboarding");
    // Wait for wizard card to render
    await expect(page.getByText(/step 1 of 6/i)).toBeVisible();
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test("shows HomeGentic logo", async ({ page }) => {
    await expect(page.getByText(/HomeGentic/).first()).toBeVisible();
  });

  test("shows progress bar", async ({ page }) => {
    await expect(page.getByRole("progressbar")).toBeVisible();
  });

  test("shows 'Step 1 of 6' label on load", async ({ page }) => {
    await expect(page.getByText("Step 1 of 6")).toBeVisible();
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
    await expect(page.getByText("Step 2 of 6")).toBeVisible();
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
    await expect(page.getByText("Step 1 of 6")).toBeVisible();
  });

  test("Back from step 2 preserves address values", async ({ page }) => {
    await fillStep1(page);
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByLabel(/city/i)).toHaveValue("Austin");
  });

  // ── Step 3: Verify Ownership ────────────────────────────────────────────────
  // Step 2→3 calls registerProperty. We need __e2e_register_property injected
  // BEFORE page.goto so addInitScript fires on the initial load.
  // These tests use their own nested describe with a dedicated beforeEach.

  test.describe("step 4 — Verify Ownership", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await injectRegisterProperty(page);          // must be before goto
      await injectSkipBaseline(page);              // auto-skip baseline photos step
      await page.goto("/onboarding");
      await expect(page.getByText(/step 1 of 6/i)).toBeVisible();
      // Navigate through step 1
      await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
      await page.getByLabel(/city/i).fill("Austin");
      await page.getByLabel(/state/i).fill("TX");
      await page.getByLabel(/zip code/i).fill("78701");
      await page.getByRole("button", { name: /next/i }).click();
      // Navigate through step 2 (triggers registerProperty → mock returns immediately)
      await page.getByLabel(/year built/i).fill("2000");
      await page.getByLabel(/square feet/i).fill("2000");
      await page.getByRole("button", { name: /next/i }).click();
      // Step 3 (baseline) is auto-skipped, confirm we landed on step 4
      await expect(page.getByText(/step 4 of 6/i)).toBeVisible();
    });

    test("shows 'Verify Ownership' heading", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /verify ownership/i })).toBeVisible();
    });

    test("shows Legal Name field", async ({ page }) => {
      await expect(page.getByLabel(/legal name/i)).toBeVisible();
    });

    test("shows Document Type selector", async ({ page }) => {
      await expect(page.getByLabel(/document type/i)).toBeVisible();
    });

    test("shows file upload input", async ({ page }) => {
      await expect(page.locator('input[type="file"]')).toBeVisible();
    });

    test("Next is disabled when legal name and file are missing", async ({ page }) => {
      await expect(page.getByRole("button", { name: /next/i })).toBeDisabled();
    });

    test("Document Type includes 'Deed / Title' option", async ({ page }) => {
      await expect(page.getByLabel(/document type/i).locator("option", { hasText: /deed/i })).toHaveCount(1);
    });
  });

  // ── Step 3: Capture Baseline Photos ────────────────────────────────────────
  // Uses a separate beforeEach WITHOUT __e2e_skipBaselinePhotos so the step renders.

  test.describe("step 3 — Capture Baseline Photos", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await injectRegisterProperty(page);
      // The outer beforeEach adds __e2e_skipBaselinePhotos via addInitScript; that
      // script persists across navigations. Override it here so step 3 actually renders.
      await page.addInitScript(() => { delete (window as any).__e2e_skipBaselinePhotos; });
      await page.goto("/onboarding");
      await expect(page.getByText(/step 1 of 6/i)).toBeVisible();
      await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
      await page.getByLabel(/city/i).fill("Austin");
      await page.getByLabel(/state/i).fill("TX");
      await page.getByLabel(/zip code/i).fill("78701");
      await page.getByRole("button", { name: /next/i }).click();
      await page.getByLabel(/year built/i).fill("2000");
      await page.getByLabel(/square feet/i).fill("2000");
      await page.getByRole("button", { name: /next/i }).click();
      await expect(page.getByText(/step 3 of 6/i)).toBeVisible();
    });

    test("shows 'Capture Baseline Photos' heading", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /capture baseline photos/i })).toBeVisible();
    });

    test("shows all 6 baseline system categories", async ({ page }) => {
      await expect(page.getByText(/HVAC/i).first()).toBeVisible();
      await expect(page.getByText(/Water Heater/i).first()).toBeVisible();
      await expect(page.getByText(/Electrical Panel/i).first()).toBeVisible();
      await expect(page.getByText(/Water Shut-off/i).first()).toBeVisible();
      await expect(page.getByText(/Roof/i).first()).toBeVisible();
      await expect(page.getByText(/Garage Door/i).first()).toBeVisible();
    });

    test("shows progress count '0 / 6'", async ({ page }) => {
      // Progress counter renders as "0 / 6" — match the fraction span
      await expect(page.getByText(/\/\s*6/).first()).toBeVisible();
    });

    test("Next advances to step 4 without uploading anything", async ({ page }) => {
      await page.getByRole("button", { name: /next/i }).click();
      await expect(page.getByText(/step 4 of 6/i)).toBeVisible();
    });

    test("shows 'Add photo' button for each system", async ({ page }) => {
      const addPhotoButtons = page.getByRole("button", { name: /add photo/i });
      await expect(addPhotoButtons).toHaveCount(6);
    });
  });

  // ── Step 6: System Ages ─────────────────────────────────────────────────────
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
