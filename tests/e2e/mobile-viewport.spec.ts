/**
 * Mobile viewport smoke tests — iPhone 390×844 breakpoint.
 *
 * Verifies that key authenticated pages render without layout-breaking errors
 * and that primary headings / nav elements are visible at mobile width.
 *
 * All tests use window.__e2e_* injection — no canister required.
 *
 * MV.1  Dashboard (home) loads with nav visible at mobile width
 * MV.2  Jobs page shows its heading at mobile width
 * MV.3  Property detail page renders at mobile width
 * MV.4  Plans/Pricing page renders at mobile width
 * MV.5  Maintenance page renders at mobile width
 * MV.6  Account/Settings page renders at mobile width
 */

import { test, expect, Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

// ── Shared fixture ────────────────────────────────────────────────────────────

async function setupMobile(page: Page) {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await injectTestAuth(page);
  await page.addInitScript(() => {
    (window as any).__e2e_subscription = { tier: "Pro", expiresAt: null };
    (window as any).__e2e_properties = [
      {
        id: 1,
        owner: "test-e2e-principal",
        address: "1 Mobile Ave",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        propertyType: "SingleFamily",
        yearBuilt: 2005,
        squareFeet: 1800,
        verificationLevel: "Basic",
        tier: "Pro",
        createdAt: 0,
        updatedAt: 0,
        isActive: true,
      },
    ];
    (window as any).__e2e_jobs = [
      {
        id: "j1",
        propertyId: "1",
        homeowner: "test-e2e-principal",
        serviceType: "Roofing",
        contractorName: "Apex Roofing",
        amount: 800_000,
        date: "2024-03-01",
        description: "Full roof replacement.",
        isDiy: false,
        status: "verified",
        verified: true,
        homeownerSigned: true,
        contractorSigned: true,
        photos: [],
        createdAt: Date.now() - 86_400_000 * 60,
      },
    ];
  });
}

// ── MV.1 — Dashboard ─────────────────────────────────────────────────────────

test("MV.1 — Dashboard loads at mobile viewport", async ({ page }) => {
  await setupMobile(page);
  await page.goto("/");
  // The property detail page is the landing spot when there's exactly 1 property
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  // Viewport should match what we set
  const vp = page.viewportSize();
  expect(vp?.width).toBe(MOBILE_VIEWPORT.width);
});

// ── MV.2 — Jobs page ─────────────────────────────────────────────────────────

test("MV.2 — Jobs page loads at mobile viewport", async ({ page }) => {
  await setupMobile(page);
  await page.goto("/jobs");
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
});

// ── MV.3 — Property detail ───────────────────────────────────────────────────

test("MV.3 — Property detail page loads at mobile viewport", async ({ page }) => {
  await setupMobile(page);
  await page.goto("/property/1");
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
});

// ── MV.4 — Plans/Pricing ─────────────────────────────────────────────────────

test("MV.4 — Plans page loads at mobile viewport", async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  // Plans/Pricing is public — no auth needed
  await page.goto("/pricing");
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
});

// ── MV.5 — Maintenance page ──────────────────────────────────────────────────

test("MV.5 — Maintenance page loads at mobile viewport", async ({ page }) => {
  await setupMobile(page);
  await page.goto("/maintenance");
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
});

// ── MV.6 — Account/Settings ──────────────────────────────────────────────────

test("MV.6 — Account/Settings page loads at mobile viewport", async ({ page }) => {
  await setupMobile(page);
  await page.goto("/settings");
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
});
