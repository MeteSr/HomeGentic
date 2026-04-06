/**
 * Accessibility tests (§testing-backlog/#33)
 *
 * Uses @axe-core/playwright to run WCAG 2.1 AA audits on key public pages.
 * Failures mean real accessibility violations — fix the component, don't
 * suppress the rule unless there's a documented exception.
 *
 * Run: npx playwright test a11y
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Run axe against the current page and assert zero violations.
 * Excludes known third-party iframes that we can't control.
 */
async function checkA11y(page: Parameters<typeof test>[1]["page"]) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .exclude("#internet-identity-container")  // II iframe — not our code
    .analyze();
  expect(results.violations).toEqual([]);
}

// ── Landing page ──────────────────────────────────────────────────────────────

test.describe("a11y — Landing page", () => {
  test("no violations", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });
});

// ── Login page ────────────────────────────────────────────────────────────────

test.describe("a11y — Login page", () => {
  test("no violations", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });
});

// ── Pricing page ──────────────────────────────────────────────────────────────

test.describe("a11y — Pricing page", () => {
  test("no violations", async ({ page }) => {
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });
});

// ── Check Address page ────────────────────────────────────────────────────────

test.describe("a11y — Check Address page", () => {
  test("search form has no violations", async ({ page }) => {
    await page.goto("/check");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("report-found result has no violations", async ({ page }) => {
    await page.route("**/api/check**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          found: true,
          token: "tok_a11y_test",
          address: "456 Oak Ave, Austin, TX 78701",
          verificationLevel: "Premium",
          propertyType: "SingleFamily",
          yearBuilt: 1998,
        }),
      })
    );
    await page.goto("/check?address=456+Oak+Ave%2C+Austin%2C+TX");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("no-report-found result has no violations", async ({ page }) => {
    await page.route("**/api/check**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ found: false, address: "789 Unknown Rd, Nowhere, TX" }),
      })
    );
    await page.goto("/check?address=789+Unknown+Rd%2C+Nowhere%2C+TX");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });
});

// ── Price Lookup page ─────────────────────────────────────────────────────────

test.describe("a11y — Price Lookup page", () => {
  test("search form has no violations", async ({ page }) => {
    await page.goto("/prices");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("benchmark result has no violations", async ({ page }) => {
    await page.route("**/api/price-benchmark**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          low: 800000,
          high: 1500000,
          median: 1100000,
          sampleSize: 12,
          lastUpdated: "2026-03-01",
        }),
      })
    );
    await page.goto("/prices?service=HVAC&zip=32114");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });
});

// ── Instant Forecast page ─────────────────────────────────────────────────────

test.describe("a11y — Instant Forecast page", () => {
  test("entry form has no violations", async ({ page }) => {
    await page.goto("/instant-forecast");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("forecast results have no violations", async ({ page }) => {
    await page.goto("/instant-forecast?address=123+Elm+St%2C+Dallas%2C+TX&yearBuilt=1992");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });
});

// ── Home Systems Estimator page ───────────────────────────────────────────────

test.describe("a11y — Home Systems Estimator page", () => {
  test("estimator form has no violations", async ({ page }) => {
    await page.goto("/home-systems");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("estimator results have no violations", async ({ page }) => {
    await page.goto("/home-systems?yearBuilt=1988&type=single-family&state=TX");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });
});

// ── Support page ──────────────────────────────────────────────────────────────

test.describe("a11y — Support page", () => {
  test("no violations", async ({ page }) => {
    await page.goto("/support");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });
});
