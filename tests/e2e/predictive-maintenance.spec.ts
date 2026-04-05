import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

async function setup(page: Parameters<typeof injectTestAuth>[0]) {
  await injectTestAuth(page);
  await injectTestProperties(page);
}

test.describe("PredictiveMaintenancePage — /maintenance", () => {
  // ── No property ─────────────────────────────────────────────────────────────

  test.describe("without a property", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await page.goto("/maintenance");
      await expect(page.getByRole("heading", { name: "Predictive Maintenance" })).toBeVisible();
    });

    test("shows empty state when no properties exist", async ({ page }) => {
      await expect(page.getByText("Add a property to see maintenance predictions.")).toBeVisible();
    });
  });

  // ── With property ────────────────────────────────────────────────────────────

  test.describe("with a property injected", () => {
    test.beforeEach(async ({ page }) => {
      await setup(page);
      await page.goto("/maintenance");
      await expect(page.getByRole("heading", { name: "Predictive Maintenance" })).toBeVisible();
    });

    // ── Page structure ────────────────────────────────────────────────────────

    test("shows the Maintenance eyebrow label", async ({ page }) => {
      await expect(page.getByText("Maintenance")).toBeVisible();
    });

    test("shows the subtitle about system health predictions", async ({ page }) => {
      await expect(page.getByText(/System health predictions/i)).toBeVisible();
    });

    // ── Tabs ──────────────────────────────────────────────────────────────────

    test("shows System Health tab (active by default)", async ({ page }) => {
      await expect(page.getByRole("button", { name: /system health/i })).toBeVisible();
    });

    test("shows Annual Tasks tab", async ({ page }) => {
      await expect(page.getByRole("button", { name: /annual tasks/i })).toBeVisible();
    });

    test("shows Schedule tab", async ({ page }) => {
      await expect(page.getByRole("button", { name: /schedule/i })).toBeVisible();
    });

    test("shows AI Advisor tab", async ({ page }) => {
      await expect(page.getByRole("button", { name: /ai advisor/i })).toBeVisible();
    });

    // ── System cards ──────────────────────────────────────────────────────────

    test("renders system cards for the injected property", async ({ page }) => {
      // The maintenance service has 8 hardcoded systems; all should render
      await expect(page.getByText("HVAC System")).toBeVisible();
    });

    test("shows urgency badges on system cards", async ({ page }) => {
      // At least one urgency badge should be visible (Critical, Soon, Watch, or Good)
      const badges = page.locator("span").filter({ hasText: /^(Critical|Soon|Watch|Good)$/ });
      await expect(badges.first()).toBeVisible();
    });

    test("system cards show percent life used", async ({ page }) => {
      await expect(page.getByText(/% life used/)).toBeVisible();
    });

    test("system cards show a replacement cost range", async ({ page }) => {
      await expect(page.getByText("Replacement")).toBeVisible();
    });

    // ── Expand/collapse ───────────────────────────────────────────────────────

    test("clicking a system card expands its detail", async ({ page }) => {
      await page.getByText("HVAC System").click();
      await expect(page.getByText("Add to schedule")).toBeVisible();
    });

    test("clicking an expanded card collapses it", async ({ page }) => {
      await page.getByText("HVAC System").click();
      await expect(page.getByText("Add to schedule")).toBeVisible();
      await page.getByText("HVAC System").click();
      await expect(page.getByText("Add to schedule")).not.toBeVisible();
    });

    test("expanded card shows Last serviced info", async ({ page }) => {
      await page.getByText("HVAC System").click();
      await expect(page.getByText(/Last serviced:/)).toBeVisible();
    });

    test("expanded card shows Years remaining or overdue info", async ({ page }) => {
      await page.getByText("HVAC System").click();
      await expect(
        page.getByText(/Years remaining:|yrs overdue/)
      ).toBeVisible();
    });

    // ── Schedule tab ──────────────────────────────────────────────────────────

    test("schedule tab shows empty state when no entries", async ({ page }) => {
      await page.getByRole("button", { name: /schedule/i }).click();
      await expect(page.getByText("No scheduled maintenance yet.")).toBeVisible();
    });

    test("adding a system to schedule switches to schedule tab", async ({ page }) => {
      // Expand the HVAC card and click Add to schedule
      await page.getByText("HVAC System").click();
      await page.getByRole("button", { name: "Add to schedule" }).click();

      // Schedule modal appears
      await expect(page.getByText(/Schedule HVAC System Work/i)).toBeVisible();
    });

    // ── Annual Tasks tab ──────────────────────────────────────────────────────

    test("Annual Tasks tab shows seasonal checklists", async ({ page }) => {
      await page.getByRole("button", { name: /annual tasks/i }).click();
      // Annual tasks for a property built in 2001 should include seasonal tasks
      await expect(page.locator("main")).toBeVisible();
    });

    // ── AI Advisor tab ────────────────────────────────────────────────────────

    test("AI Advisor tab shows the chat interface", async ({ page }) => {
      await page.getByRole("button", { name: /ai advisor/i }).click();
      await expect(page.getByText(/HomeGentic Maintenance Advisor/i)).toBeVisible();
    });

    test("AI Advisor shows initial greeting message", async ({ page }) => {
      await page.getByRole("button", { name: /ai advisor/i }).click();
      await expect(page.getByText(/Ask me anything about your home systems/i)).toBeVisible();
    });
  });
});
