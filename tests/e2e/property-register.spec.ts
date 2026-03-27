import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

test.describe("PropertyRegisterPage — /properties/new", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await page.goto("/properties/new");
    await expect(page.getByRole("heading", { name: "Register a Property" })).toBeVisible();
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows New Property eyebrow label", async ({ page }) => {
    await expect(page.getByText("New Property")).toBeVisible();
  });

  test("shows 3-step indicator with Address, Details, Confirm", async ({ page }) => {
    await expect(page.getByText("Address")).toBeVisible();
    await expect(page.getByText("Details")).toBeVisible();
    await expect(page.getByText("Confirm")).toBeVisible();
  });

  test("Back button navigates to /dashboard", async ({ page }) => {
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page).toHaveURL("/dashboard");
  });

  // ── Step 1: Address ────────────────────────────────────────────────────────

  test("shows address form fields on step 1", async ({ page }) => {
    await expect(page.getByLabel(/street address/i)).toBeVisible();
    await expect(page.getByLabel(/city/i)).toBeVisible();
    await expect(page.getByLabel(/state/i)).toBeVisible();
    await expect(page.getByLabel(/zip code/i)).toBeVisible();
  });

  test("Next button is disabled when address fields are empty", async ({ page }) => {
    await expect(page.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  test("Next button enables after filling required address fields", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("456 Oak Ave");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("78702");
    await expect(page.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  test("clicking Next advances to step 2", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("456 Oak Ave");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("78702");
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByLabel(/year built/i)).toBeVisible();
  });

  // ── Step 2: Details ────────────────────────────────────────────────────────

  test("step 2 shows property type selector", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("456 Oak Ave");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("78702");
    await page.getByRole("button", { name: /next/i }).click();

    await expect(page.getByText("Single Family")).toBeVisible();
    await expect(page.getByText("Condo")).toBeVisible();
    await expect(page.getByText("Townhouse")).toBeVisible();
    await expect(page.getByText("MultiFamily")).toBeVisible();
  });

  test("step 2 shows plan options", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("456 Oak Ave");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("78702");
    await page.getByRole("button", { name: /next/i }).click();

    await expect(page.getByText("Free")).toBeVisible();
    await expect(page.getByText("Pro")).toBeVisible();
    await expect(page.getByText("Premium")).toBeVisible();
  });

  test("Review button disabled until year built and sqft filled", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("456 Oak Ave");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("78702");
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByRole("button", { name: /review/i })).toBeDisabled();
  });

  test("Back from step 2 returns to step 1", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("456 Oak Ave");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("78702");
    await page.getByRole("button", { name: /next/i }).click();
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByLabel(/street address/i)).toBeVisible();
  });

  // ── Step 3: Confirm ────────────────────────────────────────────────────────

  test("step 3 shows review table with entered data", async ({ page }) => {
    // Step 1
    await page.getByLabel(/street address/i).fill("456 Oak Ave");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("78702");
    await page.getByRole("button", { name: /next/i }).click();
    // Step 2
    await page.getByLabel(/year built/i).fill("1995");
    await page.getByLabel(/square feet/i).fill("1800");
    await page.getByRole("button", { name: /review/i }).click();
    // Step 3
    await expect(page.getByText("456 Oak Ave")).toBeVisible();
    await expect(page.getByText("Austin")).toBeVisible();
    await expect(page.getByText("78702")).toBeVisible();
    await expect(page.getByText("1995")).toBeVisible();
    await expect(page.getByText("1800")).toBeVisible();
  });

  test("Register Property button is visible on step 3", async ({ page }) => {
    await page.getByLabel(/street address/i).fill("456 Oak Ave");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip code/i).fill("78702");
    await page.getByRole("button", { name: /next/i }).click();
    await page.getByLabel(/year built/i).fill("1995");
    await page.getByLabel(/square feet/i).fill("1800");
    await page.getByRole("button", { name: /review/i }).click();
    await expect(page.getByRole("button", { name: /register property/i })).toBeVisible();
  });
});
