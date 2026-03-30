import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

test.describe("ResaleReadyPage — /resale-ready", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await page.goto("/resale-ready");
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /resale|ready|milestone/i }).first()).toBeVisible();
  });

  test("shows HomeFax score value", async ({ page }) => {
    // Score is numeric — computed from injected jobs
    await expect(page.getByText(/\d{2,3}/).first()).toBeVisible();
  });

  test("shows score grade label", async ({ page }) => {
    // Grade should be A+, A, B, C, D, or F
    await expect(page.getByText(/^(A\+|A|B|C|D|F|CERTIFIED|GREAT|GOOD|FAIR)$/)).toBeVisible();
  });

  // ── Stats / depth ─────────────────────────────────────────────────────────

  test("shows verified job count", async ({ page }) => {
    // 3 verified jobs from testData
    await expect(page.getByText(/verified job/i)).toBeVisible();
  });

  test("shows property address or detail", async ({ page }) => {
    await expect(page.getByText(/123 Maple Street|Austin/)).toBeVisible();
  });

  // ── CTAs ──────────────────────────────────────────────────────────────────

  test("shows a Share or Generate Report button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /share|report|generate|view/i }).first()
    ).toBeVisible();
  });

  test("shows Back button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /back|dashboard/i })).toBeVisible();
  });

  test("Back button navigates to /dashboard", async ({ page }) => {
    await page.getByRole("button", { name: /back|dashboard/i }).first().click();
    await expect(page).toHaveURL("/dashboard");
  });

  // ── Premium estimate ─────────────────────────────────────────────────────

  test("shows premium estimate section", async ({ page }) => {
    // Should show a dollar range like $1,000–$10,000 or similar
    await expect(page.getByText(/\$/)).toBeVisible();
  });
});
