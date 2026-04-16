/**
 * Contractor flow E2E tests                                           (#72)
 *
 * CB.1  /contractors — "Find a Contractor" heading and search input
 * CB.2  /contractors — injected contractor cards appear
 * CB.3  /contractors — specialty filter chips are rendered
 * CB.4  /contractors — search by name filters results
 * CB.5  /contractors — clicking a card navigates to /contractor/:id
 * CB.6  /contractors — empty state shown when injection is empty
 * CB.7  /contractors — specialty filter chip narrows results
 * CD.1  /contractor-dashboard — "Contractor Dashboard" heading
 * CD.2  /contractor-dashboard (no profile) — "Profile incomplete" banner shown
 * CD.3  /contractor-dashboard (with profile) — profile name shown in header
 *
 * All tests use window.__e2e_* injection — no canister required.
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectContractors } from "./helpers/testData";

// ─── shared fixtures ──────────────────────────────────────────────────────────

const CONTRACTORS = [
  {
    id:            "principal-hvac",
    name:          "Cool Air Services",
    specialties:   ["HVAC"],
    email:         "cool@air.com",
    phone:         "512-555-0101",
    bio:           "Licensed HVAC tech.",
    licenseNumber: "TX-HVAC-12345",
    serviceArea:   "Austin, TX",
    trustScore:    85,
    jobsCompleted: 42,
    isVerified:    true,
    createdAt:     0,
  },
  {
    id:            "principal-roofing",
    name:          "Top Roof Co",
    specialties:   ["Roofing"],
    email:         "top@roof.com",
    phone:         "512-555-0202",
    bio:           null,
    licenseNumber: null,
    serviceArea:   "Austin, TX",
    trustScore:    92,
    jobsCompleted: 78,
    isVerified:    true,
    createdAt:     0,
  },
];

// ── CB — /contractors browse ──────────────────────────────────────────────────

test.describe("CB — /contractors browse page", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectContractors(page, CONTRACTORS);
  });

  // CB.1
  test("shows 'Find a Contractor' heading and search input", async ({ page }) => {
    await page.goto("/contractors");
    await expect(page.getByRole("heading", { name: /find a contractor/i })).toBeVisible();
    await expect(page.getByPlaceholder(/search by name/i)).toBeVisible();
  });

  // CB.2
  test("shows injected contractor names as cards", async ({ page }) => {
    await page.goto("/contractors");
    await expect(page.getByText("Cool Air Services")).toBeVisible();
    await expect(page.getByText("Top Roof Co")).toBeVisible();
  });

  // CB.3
  test("renders specialty filter chips including HVAC and Roofing", async ({ page }) => {
    await page.goto("/contractors");
    await expect(page.getByRole("button", { name: /^hvac$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^roofing$/i })).toBeVisible();
  });

  // CB.4
  test("search by name filters visible contractors", async ({ page }) => {
    await page.goto("/contractors");
    await page.getByPlaceholder(/search by name/i).fill("Cool Air");
    await expect(page.getByText("Cool Air Services")).toBeVisible();
    await expect(page.getByText("Top Roof Co")).not.toBeVisible();
  });

  // CB.5
  test("clicking a contractor card navigates to /contractor/:id", async ({ page }) => {
    await page.goto("/contractors");
    await page.getByText("Cool Air Services").click();
    await expect(page).toHaveURL(/\/contractor\/principal-hvac/);
  });

  // CB.6
  test("shows 'No contractors found' empty state when injection is empty", async ({ page }) => {
    // Override injection with empty list
    await page.addInitScript(() => {
      (window as any).__e2e_contractors = [];
    });
    await page.goto("/contractors");
    await expect(page.getByText(/no contractors found/i)).toBeVisible();
  });

  // CB.7
  test("HVAC specialty filter shows only Cool Air Services", async ({ page }) => {
    await page.goto("/contractors");
    await page.getByRole("button", { name: /^hvac$/i }).click();
    await expect(page.getByText("Cool Air Services")).toBeVisible();
    await expect(page.getByText("Top Roof Co")).not.toBeVisible();
  });
});

// ── CD — /contractor-dashboard ────────────────────────────────────────────────

test.describe("CD — /contractor-dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
  });

  // CD.1
  test("shows 'Contractor Dashboard' heading", async ({ page }) => {
    await page.goto("/contractor-dashboard");
    await expect(page.getByRole("heading", { name: /contractor dashboard/i })).toBeVisible();
  });

  // CD.2 — no profile injected → setup banner
  test("shows 'Profile incomplete' banner when no profile is set", async ({ page }) => {
    // No __e2e_contractors injection → getMyProfile() returns null → banner shown
    await page.goto("/contractor-dashboard");
    await expect(page.getByText(/profile incomplete/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /set up now/i })).toBeVisible();
  });

  // CD.3 — profile injected → name shown
  test("shows contractor name in header when profile is injected", async ({ page }) => {
    await injectContractors(page, [CONTRACTORS[0]]);
    await page.goto("/contractor-dashboard");
    await expect(page.getByText("Cool Air Services")).toBeVisible();
  });
});
