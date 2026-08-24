/**
 * Contractor flow E2E tests                                           (#72)
 *
 * CB.1  /contractors — heading shows "pros with work on this record"
 * CB.2  /contractors — registry contractors appear as cards
 * CB.3  /contractors — "Request quote" button visible on contractor cards
 * CB.4  /contractors — "View jobs" button navigates to /contractor/:id for registry cards
 * CB.5  /contractors — empty state shown when no jobs and no registry
 * CB.6  /contractors — awaiting signature banner when job is homeowner-signed but not contractor-signed
 * CD.1  /contractor-dashboard — "Contractor Dashboard" heading
 * CD.2  /contractor-dashboard (no profile) — "Profile incomplete" banner shown
 * CD.3  /contractor-dashboard (with profile) — profile name shown in header
 *
 * All tests use window.__e2e_* injection — no canister required.
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectContractors, injectQuotes } from "./helpers/testData";

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
    serviceZips:   ["78701", "78702"],
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
    serviceZips:   [],
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
    // No jobs → myContractors is empty; registry contractors show as extras
    await page.addInitScript(() => {
      (window as any).__e2e_jobs = [];
      (window as any).__e2e_subscription = { tier: "Pro", expiresAt: null };
      (window as any).__e2e_properties = [
        {
          id: 1, owner: "test-e2e-principal",
          address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
          propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
          verificationLevel: "Unverified", tier: "Free",
          createdAt: 0, updatedAt: 0, isActive: true,
        },
      ];
    });
  });

  // CB.1 — heading
  test("shows 'pros with work on this record' heading", async ({ page }) => {
    await page.goto("/contractors");
    await expect(page.getByRole("heading", { name: /pros with work on this record/i })).toBeVisible();
  });

  // CB.2 — registry contractors appear
  test("shows injected registry contractor names as cards", async ({ page }) => {
    await page.goto("/contractors");
    await expect(page.getByText("Cool Air Services")).toBeVisible();
    await expect(page.getByText("Top Roof Co")).toBeVisible();
  });

  // CB.3 — Request quote button
  test("shows 'Request quote' button on contractor cards", async ({ page }) => {
    await page.goto("/contractors");
    await expect(page.getByRole("button", { name: /request quote/i }).first()).toBeVisible();
  });

  // CB.4 — View jobs navigates to /contractor/:id for registry cards
  test("'View jobs' button on registry card navigates to /contractor/:id", async ({ page }) => {
    await page.goto("/contractors");
    // First registry contractor card — the View jobs button calls navigate(`/contractor/${ctr.id}`)
    await page.getByRole("button", { name: /view jobs/i }).first().click();
    await expect(page).toHaveURL(/\/contractor\//);
  });

  // CB.5 — empty state
  test("shows 'No contractors yet' empty state when no jobs and no registry", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_contractors = [];
    });
    await page.goto("/contractors");
    await expect(page.getByText(/no contractors yet/i)).toBeVisible();
  });

  // CB.6 — awaiting signature banner
  test("shows awaiting-signature banner when contractor has not countersigned", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_jobs = [
        {
          id: "j1", propertyId: "1", homeowner: "test-e2e-principal",
          serviceType: "HVAC", contractorName: "Cool Air Services",
          amount: 240_000, date: "2024-01-15",
          description: "HVAC replacement.",
          isDiy: false, status: "completed", verified: false,
          homeownerSigned: true, contractorSigned: false,
          photos: [], createdAt: Date.now() - 86_400_000 * 5,
        },
      ];
    });
    await page.goto("/contractors");
    await expect(page.getByText(/has not countersigned/i)).toBeVisible();
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

  // CD.4 — bid history section appears and shows injected bid amount
  test("shows bid history with amount when bids are injected", async ({ page }) => {
    await injectQuotes(page, [
      {
        id:         "bid-1",
        requestId:  "req-1",
        contractor: "test-principal",
        amount:     15000,
        timeline:   5,
        validUntil: Date.now() + 7 * 24 * 60 * 60 * 1000,
        status:     "pending",
        createdAt:  Date.now(),
      },
    ]);
    await injectContractors(page, [CONTRACTORS[0]]);
    await page.goto("/contractor-dashboard");
    const historyBtn = page.getByRole("button", { name: /bid history/i });
    await expect(historyBtn).toBeVisible();
    await historyBtn.click();
    await expect(page.getByText("$150")).toBeVisible();
  });

  // CD.5 — service ZIP input on contractor profile form
  test("ZIP codes can be added to the profile form", async ({ page }) => {
    await injectContractors(page, [CONTRACTORS[0]]);
    await page.goto("/contractor/profile");
    const zipInput = page.getByPlaceholder(/78701/i);
    await zipInput.fill("90210");
    await zipInput.press("Enter");
    await expect(page.getByText("90210")).toBeVisible();
  });
});
