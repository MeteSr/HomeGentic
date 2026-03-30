import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

test.describe("InsuranceDefensePage — /insurance-defense", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await page.goto("/insurance-defense");
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows Insurance Defense heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /insurance defense/i })
    ).toBeVisible();
  });

  test("shows eyebrow label", async ({ page }) => {
    await expect(page.getByText(/insurance|defense/i).first()).toBeVisible();
  });

  // ── Insurance-relevant systems ────────────────────────────────────────────

  test("shows Roofing key system label", async ({ page }) => {
    await expect(page.getByText(/Roofing/)).toBeVisible();
  });

  test("shows HVAC key system label", async ({ page }) => {
    await expect(page.getByText(/HVAC/)).toBeVisible();
  });

  // ── Job cards ─────────────────────────────────────────────────────────────

  test("shows verified job details from injected data", async ({ page }) => {
    // Full HVAC system replacement — HVAC job from testData
    await expect(page.getByText(/HVAC|replacement|roof/i).first()).toBeVisible();
  });

  // ── Print CTA ─────────────────────────────────────────────────────────────

  test("shows Print button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /print|export|pdf/i })).toBeVisible();
  });

  // ── Property info ─────────────────────────────────────────────────────────

  test("shows property address", async ({ page }) => {
    await expect(page.getByText(/123 Maple Street|Austin/)).toBeVisible();
  });

  // ── Back navigation ───────────────────────────────────────────────────────

  test("shows Back button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /back/i })).toBeVisible();
  });

  test("Back button navigates to dashboard", async ({ page }) => {
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page).toHaveURL("/dashboard");
  });
});
