/**
 * Maintenance, Market, Resale-Ready, Insurance Defense E2E    (#180)
 *
 * MM.1  /maintenance with no properties → "Add a property" prompt
 * MM.2  /maintenance with properties → "Predictive Maintenance" heading
 * MM.3  /market with Basic tier + properties → "Market Intelligence" heading
 * MM.4  /resale-ready with properties → page renders (hero heading)
 * MM.5  /insurance-defense with Basic tier + properties → defense content
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

// ── MM.1 / MM.2 — Predictive Maintenance ─────────────────────────────────────

test.describe("MM.1 — /maintenance (no properties)", () => {
  test("shows 'Add a property' prompt when no properties", async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Pro");
    await page.addInitScript(() => {
      (window as any).__e2e_properties = [];
      (window as any).__e2e_jobs = [];
    });
    await page.goto("/maintenance");
    await expect(page.getByText(/add a property to see maintenance predictions/i)).toBeVisible();
  });
});

test.describe("MM.2 — /maintenance (with property)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Pro");
    await page.goto("/maintenance");
    await expect(page.getByRole("heading", { name: /predictive maintenance/i })).toBeVisible();
  });

  test("shows 'Predictive Maintenance' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /predictive maintenance/i })).toBeVisible();
  });

  test("shows 'Maintenance' eyebrow label", async ({ page }) => {
    await expect(page.getByText("Maintenance").first()).toBeVisible();
  });

  test("shows system health description", async ({ page }) => {
    await expect(page.getByText(/system health predictions/i)).toBeVisible();
  });
});

// ── MM.3 — Market Intelligence ────────────────────────────────────────────────

test.describe("MM.3 — /market (Basic tier)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Basic");
    await page.goto("/market");
    await expect(page.getByRole("heading", { name: /market intelligence/i })).toBeVisible();
  });

  test("shows 'Market Intelligence' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /market intelligence/i })).toBeVisible();
  });

  test("shows 'Intelligence' eyebrow label", async ({ page }) => {
    await expect(page.getByText("Intelligence").first()).toBeVisible();
  });

  test("shows competitive analysis description", async ({ page }) => {
    await expect(page.getByText(/competitive position analysis/i)).toBeVisible();
  });
});

// ── MM.4 — Resale Ready ───────────────────────────────────────────────────────

test.describe("MM.4 — /resale-ready", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Basic");
    await page.goto("/resale-ready");
  });

  test("shows resale-ready page hero heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /your home history/i })).toBeVisible();
  });

  test("shows 'Resale-Ready' eyebrow label", async ({ page }) => {
    await expect(page.getByText("Resale-Ready")).toBeVisible();
  });
});

// ── MM.5 — Insurance Defense ──────────────────────────────────────────────────

test.describe("MM.5 — /insurance-defense (Basic tier)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Basic");
    await page.goto("/insurance-defense");
    // Page renders (may show loading briefly)
    await page.waitForLoadState("domcontentloaded");
  });

  test("shows Insurance Defense report section", async ({ page }) => {
    await expect(page.getByText(/insurance defense/i).first()).toBeVisible();
  });

  test("shows print/export button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /print.*export pdf/i })).toBeVisible();
  });
});
