/**
 * Recurring Service E2E — /recurring/new, /recurring/:id    (#180)
 *
 * RS.1  /recurring/new with Basic tier → "Add a Service" heading + form fields
 * RS.2  /recurring/new form has Save Service button
 * RS.3  /recurring/:id with injected data → service name as heading
 * RS.4  /recurring/:id service details are visible
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription, injectRecurringServices } from "./helpers/testData";

// ── RS.1 / RS.2 — Create page ─────────────────────────────────────────────────

test.describe("RS — /recurring/new", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Basic");
    await page.goto("/recurring/new");
    await expect(page.getByRole("heading", { name: /add a service/i })).toBeVisible();
  });

  test("RS.1 shows 'Add a Service' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /add a service/i })).toBeVisible();
  });

  test("RS.1 shows Service Type label", async ({ page }) => {
    await expect(page.getByText(/service type/i).first()).toBeVisible();
  });

  test("RS.1 shows Provider Name field", async ({ page }) => {
    await expect(page.getByText(/provider.*name/i).first()).toBeVisible();
  });

  test("RS.2 shows Save Service button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /save service/i })).toBeVisible();
  });

  test("RS.1 shows Recurring Services eyebrow label", async ({ page }) => {
    await expect(page.getByText("Recurring Services")).toBeVisible();
  });
});

// ── RS.4 / RS.5 — Detail page ─────────────────────────────────────────────────

test.describe("RS — /recurring/:id (injected data)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectRecurringServices(page);
    // rs1 = LawnCare service ("Lawn Care" after label mapping)
    await page.goto("/recurring/rs1");
    await expect(page.getByText(/Recurring Service/i)).toBeVisible();
  });

  test("RS.3 shows service type as heading", async ({ page }) => {
    // SERVICE_TYPE_LABELS["LawnCare"] = "Lawn Care" in the app
    await expect(page.getByRole("heading", { name: /lawn care/i })).toBeVisible();
  });

  test("RS.4 shows provider name", async ({ page }) => {
    await expect(page.getByText("Green Thumb Lawns")).toBeVisible();
  });

  test("RS.4 shows Active status badge", async ({ page }) => {
    await expect(page.getByText("Active").first()).toBeVisible();
  });

  test("RS.4 shows Recurring Service eyebrow label", async ({ page }) => {
    await expect(page.getByText("Recurring Service")).toBeVisible();
  });
});
