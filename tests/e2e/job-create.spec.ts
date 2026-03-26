import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

test.describe("Job Create — /jobs/new", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await page.goto("/jobs/new");
    // Wait for the form to render (not redirected to /login)
    await expect(page.getByRole("heading", { name: "Log a Job" })).toBeVisible();
  });

  // ── DIY toggle ──────────────────────────────────────────────────────────────

  test("contractor name field is visible by default", async ({ page }) => {
    await expect(page.getByLabel(/contractor \/ company name/i)).toBeVisible();
  });

  test("DIY toggle hides the contractor name field", async ({ page }) => {
    await page.getByText("I did this myself (DIY)").click();
    await expect(page.getByLabel(/contractor \/ company name/i)).not.toBeVisible();
  });

  test("DIY toggle changes amount label to 'Materials Cost'", async ({ page }) => {
    // Before toggle: label is "Amount Paid"
    await expect(page.getByText("Amount Paid *")).toBeVisible();

    await page.getByText("I did this myself (DIY)").click();

    await expect(page.getByText("Materials Cost *")).toBeVisible();
    await expect(page.getByText("Amount Paid *")).not.toBeVisible();
  });

  test("toggling DIY off restores contractor name field", async ({ page }) => {
    await page.getByText("I did this myself (DIY)").click();
    await expect(page.getByLabel(/contractor \/ company name/i)).not.toBeVisible();

    await page.getByText("I did this myself (DIY)").click();
    await expect(page.getByLabel(/contractor \/ company name/i)).toBeVisible();
  });

  test("warranty field is hidden for DIY jobs", async ({ page }) => {
    // Warranty field is visible by default (contractor mode)
    await expect(page.getByLabel(/warranty/i)).toBeVisible();

    await page.getByText("I did this myself (DIY)").click();
    await expect(page.getByLabel(/warranty/i)).not.toBeVisible();
  });

  // ── Permit field — conditional on service type ───────────────────────────────

  test("permit number field appears for HVAC service type", async ({ page }) => {
    await page.getByLabel("Service Type *").selectOption("HVAC");
    await expect(page.getByLabel(/permit number/i)).toBeVisible();
  });

  test("permit number field appears for Roofing", async ({ page }) => {
    await page.getByLabel("Service Type *").selectOption("Roofing");
    await expect(page.getByLabel(/permit number/i)).toBeVisible();
  });

  test("permit number field appears for Electrical", async ({ page }) => {
    await page.getByLabel("Service Type *").selectOption("Electrical");
    await expect(page.getByLabel(/permit number/i)).toBeVisible();
  });

  test("permit number field does NOT appear for Painting", async ({ page }) => {
    await page.getByLabel("Service Type *").selectOption("Painting");
    await expect(page.getByLabel(/permit number/i)).not.toBeVisible();
  });

  test("permit number field does NOT appear for Landscaping", async ({ page }) => {
    await page.getByLabel("Service Type *").selectOption("Landscaping");
    await expect(page.getByLabel(/permit number/i)).not.toBeVisible();
  });

  // ── Validation ───────────────────────────────────────────────────────────────

  test("submit without contractor name shows validation toast", async ({ page }) => {
    // Leave contractor name empty, fill amount only
    await page.getByLabel(/amount paid/i).fill("2500");
    await page.getByRole("button", { name: /log job to blockchain/i }).click();
    await expect(page.getByText(/contractor name/i)).toBeVisible();
  });

  test("DIY submit without amount shows validation toast", async ({ page }) => {
    await page.getByText("I did this myself (DIY)").click();
    await page.getByRole("button", { name: /log job to blockchain/i }).click();
    await expect(page.getByText(/amount/i)).toBeVisible();
  });
});
