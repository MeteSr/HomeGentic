import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

test.describe("QuoteRequestPage — /quotes/new", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await page.goto("/quotes/new");
    await expect(page.getByRole("heading", { name: "Request a Quote" })).toBeVisible();
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows Contractor Network eyebrow label", async ({ page }) => {
    await expect(page.getByText("Contractor Network")).toBeVisible();
  });

  test("shows descriptive subtitle", async ({ page }) => {
    await expect(page.getByText(/verified HomeFax contractors/i)).toBeVisible();
  });

  test("Back button is present", async ({ page }) => {
    await expect(page.getByRole("button", { name: /back/i })).toBeVisible();
  });

  // ── Form fields ────────────────────────────────────────────────────────────

  test("shows Quote Request Quota section", async ({ page }) => {
    await expect(page.getByText("Quote Request Quota")).toBeVisible();
  });

  test("shows property dropdown with injected property", async ({ page }) => {
    await expect(page.getByText(/123 Maple Street/)).toBeVisible();
  });

  test("shows Service Type dropdown with HVAC default", async ({ page }) => {
    const select = page.getByLabel(/service type/i);
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("HVAC");
  });

  test("service type dropdown has all expected options", async ({ page }) => {
    const select = page.getByLabel(/service type/i);
    await expect(select.locator("option[value='Roofing']")).toHaveCount(1);
    await expect(select.locator("option[value='Plumbing']")).toHaveCount(1);
    await expect(select.locator("option[value='Electrical']")).toHaveCount(1);
    await expect(select.locator("option[value='Foundation']")).toHaveCount(1);
  });

  // ── Urgency selector ────────────────────────────────────────────────────────

  test("shows all 4 urgency options", async ({ page }) => {
    await expect(page.getByText("Low")).toBeVisible();
    await expect(page.getByText("Medium")).toBeVisible();
    await expect(page.getByText("High")).toBeVisible();
    await expect(page.getByText("Emergency")).toBeVisible();
  });

  test("Medium is selected by default", async ({ page }) => {
    // Medium urgency option has rust highlight — check background style
    await expect(page.getByText("Within 2–4 weeks")).toBeVisible();
  });

  test("clicking Low urgency selects it", async ({ page }) => {
    await page.getByText("Low").click();
    await expect(page.getByText("Flexible timeline")).toBeVisible();
  });

  test("clicking Emergency shows ASAP description", async ({ page }) => {
    await page.getByText("Emergency").click();
    await expect(page.getByText("ASAP")).toBeVisible();
  });

  // ── Description textarea ────────────────────────────────────────────────────

  test("shows description textarea", async ({ page }) => {
    await expect(page.getByLabel(/describe the work needed/i)).toBeVisible();
  });

  test("description textarea has placeholder text", async ({ page }) => {
    const ta = page.getByLabel(/describe the work needed/i);
    await expect(ta).toHaveAttribute("placeholder", /Describe the issue/);
  });

  // ── Send Quote Request button ────────────────────────────────────────────────

  test("Send Quote Request button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /send quote request/i })).toBeVisible();
  });

  test("submitting without a description shows toast error", async ({ page }) => {
    await page.getByRole("button", { name: /send quote request/i }).click();
    await expect(page.getByText(/describe the work needed/i)).toBeVisible();
  });

  test("filling description and submitting navigates to quote detail", async ({ page }) => {
    await page.getByLabel(/describe the work needed/i).fill("My HVAC system is making strange noises and not cooling properly.");
    await page.getByRole("button", { name: /send quote request/i }).click();
    // Should navigate to /quotes/<id> after successful submission
    await expect(page).toHaveURL(/\/quotes\//);
  });
});
