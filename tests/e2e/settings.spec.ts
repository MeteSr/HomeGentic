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
    // Account content (AccountTab heading) should be visible without clicking
    await expect(page.getByText("Account Details")).toBeVisible();
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
    // The "Dashboard: Home Pulse tips" switch is unique to the NotificationsTab content area
    await expect(page.getByRole("switch", { name: "Dashboard: Home Pulse tips" })).toBeVisible();
  });

  // ── Privacy tab ───────────────────────────────────────────────────────────

  test("clicking Privacy tab shows privacy content", async ({ page }) => {
    await page.getByRole("button", { name: /privacy/i }).click();
    // The "Public HomeGentic Report" switch is unique to the PrivacyTab content area
    await expect(page.getByRole("switch", { name: "Public HomeGentic Report" })).toBeVisible();
    await expect(page.getByText("Changes save as you make them.")).toBeVisible();
  });

  test("Public HomeGentic Report switch keeps its new value", async ({ page }) => {
    await page.getByRole("button", { name: /privacy/i }).click();
    const sw = page.getByRole("switch", { name: "Public HomeGentic Report" });
    await expect(sw).toBeEnabled();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    // Leave the tab and come back: the value is re-read from the service.
    await page.getByRole("button", { name: /account/i }).first().click();
    await page.getByRole("button", { name: /privacy/i }).click();
    await expect(page.getByRole("switch", { name: "Public HomeGentic Report" })).toHaveAttribute("aria-checked", "false");
  });

  test("Delete My Account needs the confirmation word before it can run", async ({ page }) => {
    await page.getByRole("button", { name: /privacy/i }).click();
    await page.getByRole("button", { name: /delete my account/i }).click();
    const confirm = page.getByRole("button", { name: /permanently delete/i });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/type delete to confirm/i).fill("DELETE");
    await expect(confirm).toBeEnabled();
    await page.getByRole("button", { name: /keep my account/i }).click();
    await expect(confirm).not.toBeVisible();
  });
});
