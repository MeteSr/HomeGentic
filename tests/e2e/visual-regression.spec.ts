/**
 * Visual Regression Baselines (12.6.2)
 *
 * Captures full-page screenshots of key pages on first run and stores them
 * as baseline images under tests/e2e/__snapshots__/. Subsequent runs diff
 * against the baseline and fail if pixel delta exceeds the threshold.
 *
 * To update baselines after intentional UI changes:
 *   npx playwright test visual-regression --update-snapshots
 */
import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

const SNAPSHOT_OPTS = {
  maxDiffPixelRatio: 0.02,   // Allow 2% pixel delta (anti-aliasing, font rendering)
  animations: "disabled" as const,
  caret: "hide" as const,
};

// ── Landing page (public) ──────────────────────────────────────────────────────

test.describe("Visual regression — Landing page", () => {
  test("landing page matches baseline", async ({ page }) => {
    await page.goto("/");
    // Wait for fonts and animations to settle
    await page.waitForLoadState("networkidle");
    // Pause animated blob and pulse dot so screenshot is deterministic
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("landing.png", SNAPSHOT_OPTS);
  });
});

// ── Login page (public) ───────────────────────────────────────────────────────

test.describe("Visual regression — Login page", () => {
  test("login page matches baseline", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("login.png", SNAPSHOT_OPTS);
  });
});

// ── Pricing page (public) ─────────────────────────────────────────────────────

test.describe("Visual regression — Pricing page", () => {
  test("pricing page matches baseline", async ({ page }) => {
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("pricing.png", SNAPSHOT_OPTS);
  });
});

// ── Dashboard (authenticated) ─────────────────────────────────────────────────

test.describe("Visual regression — Dashboard", () => {
  test("dashboard matches baseline", async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("dashboard.png", SNAPSHOT_OPTS);
  });
});

// ── Score certificate (public token page) ─────────────────────────────────────

test.describe("Visual regression — Score certificate", () => {
  const TOKEN = Buffer.from(
    JSON.stringify({
      address:     "123 Maple St",
      score:       91,
      grade:       "A+",
      certified:   true,
      generatedAt: 1711670400000,
    })
  )
    .toString("base64")
    .replace(/=/g, "");

  test("cert page matches baseline", async ({ page }) => {
    await page.goto(`/cert/${TOKEN}`);
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("score-cert.png", SNAPSHOT_OPTS);
  });
});

// ── Register page (public) ────────────────────────────────────────────────────

test.describe("Visual regression — Register page", () => {
  test("register step 1 matches baseline", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("register-step1.png", SNAPSHOT_OPTS);
  });
});

// ── Check Address page (public) ───────────────────────────────────────────────

test.describe("Visual regression — Check Address page", () => {
  test("check address form matches baseline", async ({ page }) => {
    await page.goto("/check");
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("check-address-form.png", SNAPSHOT_OPTS);
  });

  test("check address — report found matches baseline", async ({ page }) => {
    await page.route("**/api/check**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          found: true,
          token: "tok_visual_test",
          address: "456 Oak Ave, Austin, TX 78701",
          verificationLevel: "Premium",
          propertyType: "SingleFamily",
          yearBuilt: 1998,
        }),
      })
    );
    await page.goto("/check?address=456+Oak+Ave%2C+Austin%2C+TX");
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("check-address-found.png", SNAPSHOT_OPTS);
  });
});

// ── Price Lookup page (public) ────────────────────────────────────────────────

test.describe("Visual regression — Price Lookup page", () => {
  test("price lookup form matches baseline", async ({ page }) => {
    await page.goto("/prices");
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("price-lookup-form.png", SNAPSHOT_OPTS);
  });

  test("price lookup — benchmark result matches baseline", async ({ page }) => {
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
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("price-lookup-result.png", SNAPSHOT_OPTS);
  });
});

// ── Instant Forecast page (public) ───────────────────────────────────────────

test.describe("Visual regression — Instant Forecast page", () => {
  test("instant forecast form matches baseline", async ({ page }) => {
    await page.goto("/instant-forecast");
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("instant-forecast-form.png", SNAPSHOT_OPTS);
  });

  test("instant forecast — results view matches baseline", async ({ page }) => {
    await page.goto("/instant-forecast?address=123+Elm+St%2C+Dallas%2C+TX&yearBuilt=1992");
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("instant-forecast-results.png", SNAPSHOT_OPTS);
  });
});

// ── Home Systems Estimator page (public) ──────────────────────────────────────

test.describe("Visual regression — Home Systems Estimator page", () => {
  test("home systems estimator form matches baseline", async ({ page }) => {
    await page.goto("/home-systems");
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("home-systems-form.png", SNAPSHOT_OPTS);
  });

  test("home systems estimator — results view matches baseline", async ({ page }) => {
    await page.goto("/home-systems?yearBuilt=1988&type=single-family&state=TX");
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await expect(page).toHaveScreenshot("home-systems-results.png", SNAPSHOT_OPTS);
  });
});
