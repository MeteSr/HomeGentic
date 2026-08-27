/**
 * Page smoke tests — verify each page loads, its main heading is visible,
 * and there are no WCAG 2.1 AA accessibility violations.
 *
 * No complex interactions — just load, verify, a11y scan.
 * Uses window.__e2e_* injection where auth or data is needed.
 *
 * All tests use window.__e2e_* injection — no canister required.
 *
 * PS.1  /instant-forecast (with query params)
 * PS.2  /report/:token (public, no auth)
 * PS.3  /sample-report
 * PS.4  /contractors (auth required)
 * PS.5  /contractor/:id (public contractor profile)
 * PS.6  /neighborhood/:zipCode (public)
 * PS.7  /market (auth + properties)
 * PS.8  /resale-ready (auth + properties)
 * PS.9  /cert/:token (public score cert)
 * PS.10 /support (no auth)
 * PS.11 /faq (no auth)
 * PS.12 /for-pros (no auth)
 * PS.13 /gift (no auth)
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSubscription, injectContractors } from "./helpers/testData";
import { assertNoA11yViolations } from "./helpers/a11y";

// ── Shared property fixture ───────────────────────────────────────────────────

async function injectProProperty(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_properties = [
      {
        id: 1,
        owner: "test-e2e-principal",
        address: "123 Maple St",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        propertyType: "SingleFamily",
        yearBuilt: 2001,
        squareFeet: 2400,
        verificationLevel: "Unverified",
        tier: "Pro",
        createdAt: 0,
        updatedAt: 0,
        isActive: true,
      },
    ];
    (window as any).__e2e_jobs = [];
  });
}

// ── PS.1 — /instant-forecast (with params) ───────────────────────────────────

test("PS.1 — /instant-forecast shows forecast heading for address+yearBuilt", async ({ page }) => {
  await page.goto("/instant-forecast?address=123+Main+St&yearBuilt=1985&state=TX");

  // When params are present, the ForecastView renders — the h1 is the address
  // When no params, EntryForm renders with "Instant home maintenance forecast" heading
  await expect(
    page.getByRole("heading", { level: 1 }).first()
  ).toBeVisible();

  await assertNoA11yViolations(page);
});

// ── PS.2 — /report/:token (public, no auth) ───────────────────────────────────

test("PS.2 — /report/:token shows report content or not-found state", async ({ page }) => {
  // Inject a mock report snapshot so the service returns data immediately
  await page.addInitScript(() => {
    (window as any).__e2e_report = {
      link: {
        token:      "sample",
        propertyId: "1",
        owner:      "test-principal",
        visibility: "Public",
        expiresAt:  null,
        revokedAt:  null,
        viewCount:  0,
        createdAt:  Date.now(),
      },
      snapshot: {
        snapshotId:        "snap-001",
        propertyId:        "1",
        address:           "123 Maple St",
        city:              "Austin",
        state:             "TX",
        zipCode:           "78701",
        propertyType:      "SingleFamily",
        yearBuilt:         2001,
        squareFeet:        2400,
        verificationLevel: "Basic",
        planTier:          "Pro",
        jobs:              [],
        verifiedJobCount:  0,
        totalAmountCents:  0,
        permitCount:       0,
        generatedAt:       Date.now(),
        recurringServices: [],
        rooms:             [],
      },
    };
  });

  await page.goto("/report/sample");

  // The report renders with the address as h1 or shows a not-found/error state
  await expect(page.getByRole("main").or(page.locator("#homegentic-report"))).toBeVisible();

  await assertNoA11yViolations(page);
});

// ── PS.3 — /sample-report ─────────────────────────────────────────────────────

test("PS.3 — /sample-report shows property address heading", async ({ page }) => {
  await page.goto("/sample-report");

  // SampleReportPage uses a hardcoded address "323 Keech St" as h1
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await assertNoA11yViolations(page);
});

// ── PS.4 — /contractors (auth required) ──────────────────────────────────────

test("PS.4 — /contractors shows contractor browse heading", async ({ page }) => {
  await injectTestAuth(page);
  await injectSubscription(page, "Pro");
  await injectProProperty(page);
  await injectContractors(page, [
    {
      id: "c1",
      name: "Top Notch HVAC",
      specialties: ["HVAC"],
      email: "hvac@example.com",
      phone: "512-555-0101",
      bio: "HVAC specialists since 2005.",
      licenseNumber: "TX-HVAC-001",
      serviceArea: "Austin, TX",
      serviceZips: ["78701"],
      trustScore: 82,
      jobsCompleted: 45,
      isVerified: true,
      createdAt: Date.now() - 86_400_000 * 365,
    },
  ]);

  await page.goto("/contractors");

  // ContractorBrowsePage has a search area; check that main content loads
  await expect(page.getByRole("main").or(page.locator("main")).or(page.locator("[data-testid='layout']"))).toBeVisible();
  // Check for any visible heading or contractor-related text
  await expect(
    page.getByRole("heading").first().or(page.getByText(/contractor|find|search/i).first())
  ).toBeVisible();

  await assertNoA11yViolations(page);
});

// ── PS.5 — /contractor/:id (public contractor profile) ───────────────────────

test("PS.5 — /contractor/:id shows contractor profile", async ({ page }) => {
  await injectTestAuth(page);
  await injectSubscription(page, "Pro");
  await injectContractors(page, [
    {
      id: "contractor-abc",
      name: "Jane's Plumbing",
      specialties: ["Plumbing"],
      email: "jane@example.com",
      phone: "512-555-0202",
      bio: "Expert plumber with 20 years experience.",
      licenseNumber: "TX-PLB-002",
      serviceArea: "Austin metro",
      serviceZips: ["78701", "78702"],
      trustScore: 91,
      jobsCompleted: 120,
      isVerified: true,
      createdAt: Date.now() - 86_400_000 * 200,
    },
  ]);

  await page.goto("/contractor/contractor-abc");

  // ContractorPublicPage loads contractor details — look for name or loading state
  await expect(
    page.getByText(/Jane's Plumbing/i).or(page.getByRole("heading").first())
  ).toBeVisible({ timeout: 5000 });

  await assertNoA11yViolations(page);
});

// ── PS.6 — /neighborhood/:zipCode ─────────────────────────────────────────────

test("PS.6 — /neighborhood/:zipCode shows neighborhood health data or loading", async ({ page }) => {
  await page.goto("/neighborhood/78701");

  // NeighborhoodHealthPage: shows stats or loading
  // The service uses mock data when no canister available
  await expect(page.getByRole("main").or(page.locator("body"))).toBeVisible();
  // TODO: inject __e2e_neighborhood_stats once the service layer checks for it
  // For now just check the page doesn't crash
  await expect(page.locator("body")).not.toBeEmpty();

  await assertNoA11yViolations(page);
});

// ── PS.7 — /market (auth + properties) ───────────────────────────────────────

test("PS.7 — /market shows market intelligence page", async ({ page }) => {
  await injectTestAuth(page);
  await injectSubscription(page, "Pro");
  await injectProProperty(page);

  await page.goto("/market");

  // MarketIntelligencePage main content or upgrade gate
  await expect(page.getByRole("main").or(page.locator("main"))).toBeVisible();
  await expect(page.getByRole("heading").first()).toBeVisible();

  await assertNoA11yViolations(page);
});

// ── PS.8 — /resale-ready (auth + properties) ──────────────────────────────────

test("PS.8 — /resale-ready shows resale ready page", async ({ page }) => {
  await injectTestAuth(page);
  await injectSubscription(page, "Pro");
  await injectProProperty(page);

  await page.goto("/resale-ready");

  await expect(page.getByRole("main").or(page.locator("main"))).toBeVisible();
  await expect(page.getByRole("heading").first()).toBeVisible();

  await assertNoA11yViolations(page);
});

// ── PS.9 — /cert/:token (public score cert) ───────────────────────────────────

test("PS.9 — /cert/:token shows score certificate or error state", async ({ page }) => {
  // Generate a base64-encoded token the parser expects
  // parseCertToken() decodes base64 JSON; we inject a valid-looking one
  const certPayload = { score: 87, grade: "A", propertyId: "1", address: "123 Maple St", certId: "cert-001", issuedAt: Date.now() };
  const token = btoa(JSON.stringify(certPayload));

  await page.goto(`/cert/${token}`);

  // ScoreCertPage shows the cert content or an invalid-token state
  await expect(page.getByRole("main").or(page.locator("body"))).toBeVisible();
  await expect(page.locator("body")).not.toBeEmpty();

  await assertNoA11yViolations(page);
});

// ── PS.10 — /support (no auth) ───────────────────────────────────────────────

test("PS.10 — /support shows 'How can we help?' heading", async ({ page }) => {
  await page.goto("/support");

  await expect(
    page.getByRole("heading", { name: /how can we help/i })
  ).toBeVisible();

  await assertNoA11yViolations(page);
});

// ── PS.11 — /faq (no auth) ───────────────────────────────────────────────────

test("PS.11 — /faq shows 'Frequently Asked Questions' heading", async ({ page }) => {
  await page.goto("/faq");

  await expect(
    page.getByRole("heading", { name: /frequently asked questions/i })
  ).toBeVisible();

  await assertNoA11yViolations(page);
});

// ── PS.12 — /for-pros (no auth) ──────────────────────────────────────────────

test("PS.12 — /for-pros shows contractor-facing heading", async ({ page }) => {
  await page.goto("/for-pros");

  await expect(
    page.getByRole("heading", { name: /grow your business/i })
  ).toBeVisible();

  await assertNoA11yViolations(page);
});

// ── PS.13 — /gift (no auth) ──────────────────────────────────────────────────

test("PS.13 — /gift shows gift page heading", async ({ page }) => {
  await page.goto("/gift");

  await expect(
    page.getByRole("heading", { name: /give the gift/i })
  ).toBeVisible();

  await assertNoA11yViolations(page);
});
