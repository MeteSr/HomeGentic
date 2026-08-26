import { test, expect, Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectRegisterProperty, injectSubscription } from "./helpers/testData";
import { assertNoA11yViolations } from "./helpers/a11y";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Fill and submit the address step (V2: "Continue →" button). */
async function fillAddressStep(page: Page) {
  await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
  await page.getByLabel(/city/i).fill("Austin");
  await page.getByLabel(/state/i).fill("TX");
  await page.getByLabel(/zip code/i).fill("78701");
  await page.getByRole("button", { name: /continue/i }).click();
}

/**
 * Fill and submit the details step (V2: "Save property" button calls the API).
 * Requires injectRegisterProperty to be set up before page.goto.
 */
async function fillDetailsStep(page: Page) {
  await page.getByLabel(/year built/i).fill("2000");
  await page.getByLabel(/square feet/i).fill("2000");
  await page.getByRole("button", { name: /save property/i }).click();
}

/** Wait for the wizard modal to appear (V2: dialog with "Where is the home?" heading). */
async function waitForWizard(page: Page) {
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: /where is the home/i })).toBeVisible();
}

/** Navigate from the saved hub to the photos optional step. */
async function goToPhotosStep(page: Page) {
  await page.getByRole("button", { name: /open camera guide/i }).click();
  await expect(page.getByRole("heading", { name: /capture baseline photos/i })).toBeVisible();
}

// ── Main suite ─────────────────────────────────────────────────────────────────

test.describe("OnboardingWizard — modal auto-opens on /dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Basic");
    // No properties injected + onboardingComplete defaults to false → modal auto-opens
    await page.goto("/dashboard");
    await waitForWizard(page);
  });

  test.afterEach(async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // ── Step 1: address ─────────────────────────────────────────────────────────

  test("shows 'STEP 1 OF 2' badge on address step", async ({ page }) => {
    await expect(page.getByText(/step 1 of 2/i)).toBeVisible();
  });

  test("step 1 shows 'Where is the home?' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /where is the home/i })).toBeVisible();
  });

  test("step 1 shows Street address field", async ({ page }) => {
    await expect(page.getByLabel(/street address/i)).toBeVisible();
  });

  test("step 1 shows City field", async ({ page }) => {
    await expect(page.getByLabel(/city/i)).toBeVisible();
  });

  test("step 1 shows State field", async ({ page }) => {
    await expect(page.getByLabel(/state/i)).toBeVisible();
  });

  test("step 1 shows ZIP code field", async ({ page }) => {
    await expect(page.getByLabel(/zip code/i)).toBeVisible();
  });

  test("Continue is disabled when address fields are empty", async ({ page }) => {
    await expect(page.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  test("Continue is disabled with invalid state abbreviation", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("XX");
    await page.getByLabel(/zip code/i).fill("78701");
    await expect(page.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  test("Continue is disabled with invalid ZIP", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("1234");
    await expect(page.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  test("invalid state shows validation message", async ({ page }) => {
    await page.getByLabel(/state/i).fill("XX");
    await expect(page.getByText(/valid.*state abbreviation/i)).toBeVisible();
  });

  test("invalid ZIP shows validation message", async ({ page }) => {
    await page.getByLabel(/zip code/i).fill("1234");
    await expect(page.getByText(/5-digit zip/i)).toBeVisible();
  });

  test("Continue enables after filling all required address fields", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("78701");
    await expect(page.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  test("Continue advances to details step", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("78701");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/step 2 of 2/i)).toBeVisible();
  });

  // ── Step 2: details ─────────────────────────────────────────────────────────

  test("step 2 shows 'Year built and size.' heading", async ({ page }) => {
    await fillAddressStep(page);
    await expect(page.getByRole("heading", { name: /year built and size/i })).toBeVisible();
  });

  test("step 2 shows 'STEP 2 OF 2' badge", async ({ page }) => {
    await fillAddressStep(page);
    await expect(page.getByText(/step 2 of 2/i)).toBeVisible();
  });

  test("step 2 shows property type options", async ({ page }) => {
    await fillAddressStep(page);
    await expect(page.getByText("Single Family")).toBeVisible();
    await expect(page.getByText("Condo")).toBeVisible();
  });

  test("step 2 shows Year built field", async ({ page }) => {
    await fillAddressStep(page);
    await expect(page.getByLabel(/year built/i)).toBeVisible();
  });

  test("step 2 shows Square feet field", async ({ page }) => {
    await fillAddressStep(page);
    await expect(page.getByLabel(/square feet/i)).toBeVisible();
  });

  test("Save property is disabled when year and sqft are empty", async ({ page }) => {
    await fillAddressStep(page);
    await expect(page.getByRole("button", { name: /save property/i })).toBeDisabled();
  });

  test("Save property enables after filling year and sqft", async ({ page }) => {
    await fillAddressStep(page);
    await page.getByLabel(/year built/i).fill("1990");
    await page.getByLabel(/square feet/i).fill("1800");
    await expect(page.getByRole("button", { name: /save property/i })).toBeEnabled();
  });

  test("year out of range shows validation error", async ({ page }) => {
    await fillAddressStep(page);
    await page.getByLabel(/year built/i).fill("1800");
    await expect(page.getByText(/must be 1900/i)).toBeVisible();
  });

  test("Back from details returns to address step", async ({ page }) => {
    await fillAddressStep(page);
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByText(/step 1 of 2/i)).toBeVisible();
  });

  test("Back from details preserves address values", async ({ page }) => {
    await fillAddressStep(page);
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByLabel(/city/i)).toHaveValue("Austin");
  });

  // ── Saved hub ───────────────────────────────────────────────────────────────

  test.describe("saved hub — after registering property", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await injectSubscription(page, "Basic");
      await injectRegisterProperty(page);
      await page.goto("/dashboard");
      await waitForWizard(page);
      await fillAddressStep(page);
      await fillDetailsStep(page);
      await expect(page.getByRole("heading", { name: /your property is saved/i })).toBeVisible();
    });

    test("shows 'SAVED · FREE TIER' badge", async ({ page }) => {
      await expect(page.getByText(/saved · free tier/i)).toBeVisible();
    });

    test("shows record score", async ({ page }) => {
      await expect(page.getByText(/record score/i).first()).toBeVisible();
    });

    test("shows 4 optional task card CTAs", async ({ page }) => {
      await expect(page.getByRole("button", { name: /start verification/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /open camera guide/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /import files/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /fill in ages/i })).toBeVisible();
    });

    test("View property record button is visible", async ({ page }) => {
      await expect(page.getByRole("button", { name: /view property record/i })).toBeVisible();
    });

    // ── Verify ownership (optional) ────────────────────────────────────────────

    test.describe("verify ownership step", () => {
      test.beforeEach(async ({ page }) => {
        await page.getByRole("button", { name: /start verification/i }).click();
        await expect(page.getByRole("heading", { name: /verify ownership/i })).toBeVisible();
      });

      test("shows 'Verify ownership.' heading", async ({ page }) => {
        await expect(page.getByRole("heading", { name: /verify ownership/i })).toBeVisible();
      });

      test("shows Legal name field", async ({ page }) => {
        await expect(page.getByLabel(/legal name/i)).toBeVisible();
      });

      test("shows Document type selector", async ({ page }) => {
        await expect(page.getByLabel(/document type/i)).toBeVisible();
      });

      test("shows file upload input", async ({ page }) => {
        await expect(page.locator("#wiz-verify-doc")).toBeAttached();
      });

      test("Submit is disabled when legal name and file are missing", async ({ page }) => {
        await expect(page.getByRole("button", { name: /submit for review/i })).toBeDisabled();
      });

      test("Document Type includes 'Deed / Title' option", async ({ page }) => {
        await expect(
          page.getByLabel(/document type/i).locator("option", { hasText: /deed/i })
        ).toHaveCount(1);
      });

      test("Back returns to saved hub", async ({ page }) => {
        await page.getByRole("button", { name: /back/i }).click();
        await expect(page.getByRole("heading", { name: /your property is saved/i })).toBeVisible();
      });
    });

    // ── Baseline photos (optional) ─────────────────────────────────────────────

    test.describe("baseline photos step", () => {
      test.beforeEach(async ({ page }) => {
        await goToPhotosStep(page);
      });

      test("shows 'Capture baseline photos.' heading", async ({ page }) => {
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
        await expect(page.getByText("0 / 6").first()).toBeVisible();
      });

      test("shows 'Add photo' button for each of the 6 systems", async ({ page }) => {
        const modal = page.getByTestId("property-wizard-modal");
        await expect(modal.getByRole("button", { name: /add photo/i })).toHaveCount(6);
      });

      test("Skip returns to saved hub", async ({ page }) => {
        await page.getByRole("button", { name: /skip/i }).click();
        await expect(page.getByRole("heading", { name: /your property is saved/i })).toBeVisible();
      });

      test("Save & continue returns to saved hub", async ({ page }) => {
        await page.getByRole("button", { name: /save & continue/i }).click();
        await expect(page.getByRole("heading", { name: /your property is saved/i })).toBeVisible();
      });
    });

    // ── System ages (optional) ─────────────────────────────────────────────────

    test.describe("system ages step", () => {
      test.beforeEach(async ({ page }) => {
        await page.getByRole("button", { name: /fill in ages/i }).click();
        await expect(page.getByRole("heading", { name: /how old are your systems/i })).toBeVisible();
      });

      test("shows system age inputs", async ({ page }) => {
        await expect(page.getByLabel(/hvac/i)).toBeVisible();
        await expect(page.getByLabel(/^roof$/i)).toBeVisible();
        await expect(page.getByLabel(/water heater/i)).toBeVisible();
      });

      test("solar checkbox is unchecked by default", async ({ page }) => {
        await expect(page.getByLabel(/solar panels/i)).not.toBeChecked();
      });

      test("Skip returns to saved hub", async ({ page }) => {
        await page.getByRole("button", { name: /skip/i }).click();
        await expect(page.getByRole("heading", { name: /your property is saved/i })).toBeVisible();
      });
    });
  });
});
