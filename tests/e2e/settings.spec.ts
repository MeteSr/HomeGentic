import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

test.describe("SettingsPage — /settings", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows 'Account' eyebrow label", async ({ page }) => {
    await expect(page.getByText("Account").first()).toBeVisible();
  });

  test("shows Settings heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  // ── Sidebar tabs ──────────────────────────────────────────────────────────

  test("shows Account tab in sidebar", async ({ page }) => {
    await expect(page.getByRole("button", { name: /account/i }).first()).toBeVisible();
  });

  test("shows Subscription tab in sidebar", async ({ page }) => {
    await expect(page.getByRole("button", { name: /subscription/i })).toBeVisible();
  });

  test("shows Notifications tab in sidebar", async ({ page }) => {
    await expect(page.getByRole("button", { name: /notifications/i })).toBeVisible();
  });

  test("shows Privacy tab in sidebar", async ({ page }) => {
    await expect(page.getByRole("button", { name: /privacy/i })).toBeVisible();
  });

  // ── Account tab (default) ─────────────────────────────────────────────────

  test("Account tab is active by default", async ({ page }) => {
    // Account content should be visible without clicking
    await expect(page.getByText(/principal/i)).toBeVisible();
  });

  // ── Subscription tab ──────────────────────────────────────────────────────

  test("clicking Subscription tab shows subscription content", async ({ page }) => {
    await page.getByRole("button", { name: /subscription/i }).click();
    // Should show tier or plan info
    await expect(page.getByText(/free|pro|premium|plan|tier/i).first()).toBeVisible();
  });

  // ── Notifications tab ─────────────────────────────────────────────────────

  test("clicking Notifications tab shows notification content", async ({ page }) => {
    await page.getByRole("button", { name: /notifications/i }).click();
    await expect(page.getByText(/notification/i)).toBeVisible();
  });

  // ── Privacy tab ───────────────────────────────────────────────────────────

  test("clicking Privacy tab shows privacy content", async ({ page }) => {
    await page.getByRole("button", { name: /privacy/i }).click();
    await expect(page.getByText(/privacy/i)).toBeVisible();
  });
});
