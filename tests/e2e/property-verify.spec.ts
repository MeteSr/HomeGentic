import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

test.describe("PropertyVerifyPage — /properties/:id/verify", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await page.goto("/properties/1/verify");
    await expect(page.getByRole("heading", { name: "Verify ownership" })).toBeVisible();
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows Ownership eyebrow label", async ({ page }) => {
    await expect(page.getByText("Ownership")).toBeVisible();
  });

  test("shows explanatory intro text", async ({ page }) => {
    await expect(page.getByText(/SHA-256 hash/)).toBeVisible();
  });

  test("shows info banner about verified properties", async ({ page }) => {
    await expect(page.getByText(/Verified properties/)).toBeVisible();
  });

  test("back link returns to property page", async ({ page }) => {
    await page.getByRole("button", { name: /back to property/i }).click();
    await expect(page).toHaveURL("/properties/1");
  });

  // ── Document type selection ────────────────────────────────────────────────

  test("shows three document type options", async ({ page }) => {
    await expect(page.getByText("Utility Bill")).toBeVisible();
    await expect(page.getByText("Property Deed")).toBeVisible();
    await expect(page.getByText("Tax Record")).toBeVisible();
  });

  test("Utility Bill is selected by default", async ({ page }) => {
    const radio = page.getByRole("radio", { name: "" }).first();
    await expect(radio).toBeChecked();
  });

  test("can select Property Deed", async ({ page }) => {
    await page.getByText("Property Deed").click();
    const deedRadio = page.locator("input[value='DeedRecord']");
    await expect(deedRadio).toBeChecked();
  });

  test("can select Tax Record", async ({ page }) => {
    await page.getByText("Tax Record").click();
    const taxRadio = page.locator("input[value='TaxRecord']");
    await expect(taxRadio).toBeChecked();
  });

  // ── File upload area ────────────────────────────────────────────────────────

  test("shows upload drop zone", async ({ page }) => {
    await expect(page.getByText(/Drop your file here/)).toBeVisible();
  });

  test("shows accepted file types hint", async ({ page }) => {
    await expect(page.getByText(/PDF.*JPG.*PNG/i)).toBeVisible();
  });

  // ── Submit button ────────────────────────────────────────────────────────

  test("Submit button is disabled without a file", async ({ page }) => {
    await expect(page.getByRole("button", { name: /submit for verification/i })).toBeDisabled();
  });

  test("after uploading a file, file name is shown and Submit becomes enabled", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    await fileInput.setInputFiles({
      name: "deed.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("fake pdf content"),
    });
    await expect(page.getByText("deed.pdf")).toBeVisible();
    await expect(page.getByRole("button", { name: /submit for verification/i })).toBeEnabled();
  });

  test("remove file button clears the file selection", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    await fileInput.setInputFiles({
      name: "deed.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("fake pdf content"),
    });
    await expect(page.getByText("deed.pdf")).toBeVisible();
    // Click the X remove button
    await page.locator("button").filter({ has: page.locator("svg") }).last().click();
    await expect(page.getByText(/Drop your file here/)).toBeVisible();
    await expect(page.getByRole("button", { name: /submit for verification/i })).toBeDisabled();
  });

  // ── Success state ────────────────────────────────────────────────────────

  test("submitting a file shows confirmation state", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    await fileInput.setInputFiles({
      name: "deed.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("fake pdf content"),
    });
    await page.getByRole("button", { name: /submit for verification/i }).click();
    await expect(page.getByText("Document submitted")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Pending Review/i)).toBeVisible();
  });

  test("confirmation state has Back to Property and Go to Dashboard buttons", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    await fileInput.setInputFiles({
      name: "deed.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("fake pdf content"),
    });
    await page.getByRole("button", { name: /submit for verification/i }).click();
    await expect(page.getByRole("button", { name: /back to property/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /go to dashboard/i })).toBeVisible();
  });
});
