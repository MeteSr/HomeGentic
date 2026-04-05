import { test, expect } from "@playwright/test";

// Public page — no auth required

test.describe("InstantForecastPage — /instant-forecast", () => {
  // ── Entry form (no params) ─────────────────────────────────────────────────

  test.describe("entry form (no URL params)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/instant-forecast");
    });

    test("shows HomeGentic logo", async ({ page }) => {
      await expect(page.getByText(/HomeGentic/).first()).toBeVisible();
    });

    test("shows 'Instant home maintenance forecast' heading", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /instant home maintenance forecast/i })).toBeVisible();
    });

    test("shows address input", async ({ page }) => {
      await expect(page.getByRole("textbox", { name: /address/i })).toBeVisible();
    });

    test("shows year built input", async ({ page }) => {
      await expect(page.getByRole("spinbutton", { name: /year built/i })).toBeVisible();
    });

    test("shows Get Forecast submit button", async ({ page }) => {
      await expect(page.getByRole("button", { name: /get forecast/i })).toBeVisible();
    });

    test("does not show the forecast table before form is submitted", async ({ page }) => {
      await expect(page.getByRole("table")).not.toBeVisible();
    });

    test("submitting the form navigates to /instant-forecast with params", async ({ page }) => {
      await page.getByRole("textbox", { name: /address/i }).fill("123 Main St");
      await page.getByRole("spinbutton", { name: /year built/i }).fill("1985");
      await page.getByRole("button", { name: /get forecast/i }).click();
      await expect(page).toHaveURL(/\/instant-forecast\?.*address=.*yearBuilt=1985/);
    });
  });

  // ── Forecast view (with valid params) ────────────────────────────────────

  test.describe("forecast view (with URL params)", () => {
    test.beforeEach(async ({ page }) => {
      // Stub the year-built relay so the form doesn't hang on fetch
      await page.route("**/api/lookup-year-built**", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ yearBuilt: null }) })
      );
      await page.goto("/instant-forecast?address=123+Main+St&yearBuilt=1976");
    });

    test("shows the address in the page", async ({ page }) => {
      await expect(page.getByText(/123 Main St/i)).toBeVisible();
    });

    test("shows year built info", async ({ page }) => {
      await expect(page.getByText(/1976/)).toBeVisible();
    });

    test("renders the forecast table", async ({ page }) => {
      await expect(page.getByRole("table")).toBeVisible();
    });

    test("shows HVAC as a system row", async ({ page }) => {
      await expect(page.getByText("HVAC")).toBeVisible();
    });

    test("shows at least 5 system rows", async ({ page }) => {
      const rows = page.getByRole("row");
      // 1 header + at least 5 system rows
      await expect(rows).toHaveCount(expect.any(Number));
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(6);
    });

    test("each system row has a 'Last replaced' input", async ({ page }) => {
      const inputs = page.getByLabel(/last replaced/i);
      const count = await inputs.count();
      expect(count).toBeGreaterThan(0);
    });

    test("shows 10-year budget figure", async ({ page }) => {
      await expect(page.getByText(/10.year budget/i)).toBeVisible();
    });

    test("shows urgency badges (Critical, Soon, Watch, or Good)", async ({ page }) => {
      const badge = page.getByText(/^(Critical|Soon|Watch|Good)$/).first();
      await expect(badge).toBeVisible();
    });

    test("shows replacement cost ranges", async ({ page }) => {
      await expect(page.getByText(/\$[\d,]+–\$[\d,]+/).first()).toBeVisible();
    });
  });

  // ── Save your forecast CTA ────────────────────────────────────────────────

  test.describe("Save CTA", () => {
    test.beforeEach(async ({ page }) => {
      await page.route("**/api/lookup-year-built**", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ yearBuilt: null }) })
      );
      await page.goto("/instant-forecast?address=123+Main+St&yearBuilt=1976");
    });

    test("shows 'Save your forecast' link", async ({ page }) => {
      await expect(page.getByRole("link", { name: /save your forecast/i })).toBeVisible();
    });

    test("Save CTA href contains /properties/new", async ({ page }) => {
      const link = page.getByRole("link", { name: /save your forecast/i });
      const href = await link.getAttribute("href");
      expect(href).toContain("/properties/new");
    });

    test("Save CTA href carries the address param", async ({ page }) => {
      const link = page.getByRole("link", { name: /save your forecast/i });
      const href = await link.getAttribute("href");
      expect(href).toContain("address=");
    });

    test("Save CTA href carries yearBuilt param", async ({ page }) => {
      const link = page.getByRole("link", { name: /save your forecast/i });
      const href = await link.getAttribute("href");
      expect(href).toContain("yearBuilt=1976");
    });
  });

  // ── Per-system override inputs ────────────────────────────────────────────

  test.describe("per-system override inputs", () => {
    test.beforeEach(async ({ page }) => {
      await page.route("**/api/lookup-year-built**", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ yearBuilt: null }) })
      );
    });

    test("pre-fills HVAC override input when hvac param is in URL", async ({ page }) => {
      await page.goto("/instant-forecast?address=123+Main+St&yearBuilt=1976&hvac=2000");
      // Find the HVAC row's last-replaced input
      const hvacRow = page.getByRole("row").filter({ hasText: "HVAC" });
      const input = hvacRow.getByRole("spinbutton");
      await expect(input).toHaveValue("2000");
    });

    test("changing an override input updates the URL", async ({ page }) => {
      await page.goto("/instant-forecast?address=123+Main+St&yearBuilt=1976");
      const hvacRow = page.getByRole("row").filter({ hasText: "HVAC" });
      const input = hvacRow.getByRole("spinbutton");
      await input.fill("2010");
      await input.blur();
      await expect(page).toHaveURL(/hvac=2010/);
    });

    test("newer HVAC override removes Critical urgency", async ({ page }) => {
      // yearBuilt=1976 with no override → HVAC is ~50 yrs old → Critical
      // with hvac=2022 → HVAC is ~3 yrs old → should not be Critical
      await page.goto("/instant-forecast?address=123+Main+St&yearBuilt=1976&hvac=2022");
      const hvacRow = page.getByRole("row").filter({ hasText: "HVAC" });
      await expect(hvacRow.getByText("Critical")).not.toBeVisible();
    });
  });

  // ── Sign-in link ──────────────────────────────────────────────────────────

  test("shows Sign in link that links to /login", async ({ page }) => {
    await page.goto("/instant-forecast");
    const link = page.getByRole("link", { name: /sign in/i });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toContain("/login");
  });
});
