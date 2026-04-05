import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

test.describe("PropertyDetailPage — /properties/:id", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await page.goto("/properties/1");
    await expect(page.getByRole("heading", { name: "123 Maple Street" })).toBeVisible();
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows Property Record eyebrow label", async ({ page }) => {
    await expect(page.getByText("Property Record")).toBeVisible();
  });

  test("shows property address, city, state in subtitle", async ({ page }) => {
    await expect(page.getByText(/Austin.*TX.*78701/)).toBeVisible();
  });

  test("shows property type and year built", async ({ page }) => {
    await expect(page.getByText(/SingleFamily.*Built 2001/)).toBeVisible();
  });

  test("Back to Dashboard button navigates to /dashboard", async ({ page }) => {
    await page.getByRole("button", { name: /back to dashboard/i }).click();
    await expect(page).toHaveURL("/dashboard");
  });

  test("Share HomeGentic Report button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /share homegentic report/i })).toBeVisible();
  });

  // ── Verification banner ────────────────────────────────────────────────────

  test("shows unverified ownership banner for unverified property", async ({ page }) => {
    await expect(page.getByText(/Ownership not verified/i)).toBeVisible();
  });

  test("Verify Now button navigates to /properties/1/verify", async ({ page }) => {
    await page.getByRole("button", { name: /verify now/i }).click();
    await expect(page).toHaveURL("/properties/1/verify");
  });

  // ── Stats ────────────────────────────────────────────────────────────────

  test("shows Total Jobs stat", async ({ page }) => {
    await expect(page.getByText("Total Jobs")).toBeVisible();
  });

  test("shows Verified stat", async ({ page }) => {
    await expect(page.getByText("Verified")).toBeVisible();
  });

  test("shows Value Added stat", async ({ page }) => {
    await expect(page.getByText("Value Added")).toBeVisible();
  });

  test("total jobs count is 4", async ({ page }) => {
    // 4 jobs injected via testData
    const totalJobs = page.locator("[style*='border']").filter({ hasText: "Total Jobs" });
    await expect(totalJobs.getByText("4")).toBeVisible();
  });

  // ── Tabs ────────────────────────────────────────────────────────────────────

  test("shows Timeline, Jobs, Documents, Settings tabs", async ({ page }) => {
    await expect(page.getByRole("button", { name: /timeline/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /jobs/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /documents/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /settings/i })).toBeVisible();
  });

  // ── Timeline tab ────────────────────────────────────────────────────────────

  test("Timeline tab shows injected jobs", async ({ page }) => {
    await expect(page.getByText("HVAC")).toBeVisible();
    await expect(page.getByText("Roofing")).toBeVisible();
    await expect(page.getByText("Plumbing")).toBeVisible();
    await expect(page.getByText("Painting")).toBeVisible();
  });

  test("verified job shows verified badge", async ({ page }) => {
    // HVAC is verified
    const hvacCard = page.locator("[data-testid='job-hvac']");
    await expect(hvacCard.getByText("verified")).toBeVisible();
  });

  test("unverified job shows completed badge and signature pills", async ({ page }) => {
    const roofCard = page.locator("[data-testid='job-roofing']");
    await expect(roofCard.getByText("completed")).toBeVisible();
    await expect(roofCard.getByText("Homeowner")).toBeVisible();
  });

  // ── Jobs tab ────────────────────────────────────────────────────────────────

  test("Jobs tab shows table with headers", async ({ page }) => {
    await page.getByRole("button", { name: /jobs/i }).click();
    await expect(page.getByText("Service")).toBeVisible();
    await expect(page.getByText("Contractor")).toBeVisible();
    await expect(page.getByText("Amount")).toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
  });

  test("Jobs tab lists all 4 jobs", async ({ page }) => {
    await page.getByRole("button", { name: /jobs/i }).click();
    await expect(page.getByRole("cell", { name: "HVAC" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Roofing" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Plumbing" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Painting" })).toBeVisible();
  });

  // ── Documents tab ────────────────────────────────────────────────────────────

  test("Documents tab shows Maintenance Receipts header", async ({ page }) => {
    await page.getByRole("button", { name: /documents/i }).click();
    await expect(page.getByText("Maintenance Receipts")).toBeVisible();
  });

  test("Documents tab shows Upload Receipt button", async ({ page }) => {
    await page.getByRole("button", { name: /documents/i }).click();
    await expect(page.getByRole("button", { name: /upload receipt/i })).toBeVisible();
  });

  test("Documents tab shows empty state when no receipts", async ({ page }) => {
    await page.getByRole("button", { name: /documents/i }).click();
    await expect(page.getByText("No receipts uploaded yet")).toBeVisible();
  });

  // ── Settings tab ────────────────────────────────────────────────────────────

  test("Settings tab shows property details", async ({ page }) => {
    await page.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByText("Property Details")).toBeVisible();
    await expect(page.getByText("123 Maple Street")).toBeVisible();
    await expect(page.getByText("78701")).toBeVisible();
    await expect(page.getByText("2001")).toBeVisible();
  });

  // ── Report modal ────────────────────────────────────────────────────────────

  test("clicking Share HomeGentic Report opens a modal", async ({ page }) => {
    await page.getByRole("button", { name: /share homegentic report/i }).click();
    // Modal should appear — look for generate/close pattern
    await expect(page.locator("[role='dialog'], [style*='position: fixed']").first()).toBeVisible();
  });
});
