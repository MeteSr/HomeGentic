import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

async function setup(page: Parameters<typeof injectTestAuth>[0]) {
  await injectTestAuth(page);
  await injectTestProperties(page);
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

  test("shows the principal truncated in the subheading", async ({ page }) => {
    // "test-e2e-principal".slice(0,16) = "test-e2e-princip"
    await expect(page.getByText(/test-e2e-princip/)).toBeVisible();
  });

  // ── Stats panel ─────────────────────────────────────────────────────────────

  test("shows Properties stat equal to 1", async ({ page }) => {
    const cell = page.locator("div").filter({ hasText: /^Properties$/ }).first();
    await expect(cell).toBeVisible();
    // The value "1" appears as the big serif number in the same stat box
    await expect(page.getByText("Properties").locator("..").getByText("1")).toBeVisible();
  });

  test("shows Verified Jobs stat equal to 3", async ({ page }) => {
    // 3 of the 4 injected jobs are verified
    await expect(page.getByText("Verified Jobs").locator("..").getByText("3")).toBeVisible();
  });

  test("shows Total Value Added stat", async ({ page }) => {
    await expect(page.getByText("Total Value Added")).toBeVisible();
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
    await expect(page.getByText("123 Maple Street")).toBeVisible();
  });

  test("clicking a property card navigates to property detail", async ({ page }) => {
    await page.getByText("123 Maple Street").click();
    await expect(page).toHaveURL(/\/properties\/1/);
  });

  // ── Onboarding banner ───────────────────────────────────────────────────────

  test("shows onboarding banner when property is unverified", async ({ page }) => {
    // The injected property has verificationLevel: "Unverified"
    await expect(page.getByText(/Verify ownership/i)).toBeVisible();
  });

  test("dismissing the banner hides it", async ({ page }) => {
    // The X button closes the banner
    const closeBtn = page.locator("button").filter({ has: page.locator("svg") }).nth(1);
    // Use the aria-accessible dismiss approach: find the banner and its close button
    await expect(page.getByText(/Verify ownership/i)).toBeVisible();
    // Click the X close button inside the banner
    await page.locator("div").filter({ hasText: /Finish setting up/ }).getByRole("button").last().click();
    await expect(page.getByText(/Verify ownership/i)).not.toBeVisible();
  });

  // ── Navigation ──────────────────────────────────────────────────────────────

  test("Add Property button navigates to /properties/new", async ({ page }) => {
    // Header-level Add Property button
    await page.getByRole("button", { name: /add property/i }).first().click();
    await expect(page).toHaveURL("/properties/new");
  });

  test("Log a Job navigates to /jobs/new", async ({ page }) => {
    await page.getByRole("button", { name: /log a job/i }).click();
    await expect(page).toHaveURL("/jobs/new");
  });
});
