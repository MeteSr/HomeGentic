import { test, expect } from "@playwright/test";

// Public page — no auth required

test.describe("HomeSystemsEstimatorPage — /home-systems", () => {
  // ── Entry form (no params) ─────────────────────────────────────────────────

  test.describe("entry form (no URL params)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/home-systems");
    });

    test("shows 'Home System Age Estimator' heading", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /home system age estimator/i })).toBeVisible();
    });

    test("shows Year Built input", async ({ page }) => {
      await expect(page.getByRole("spinbutton")).toBeVisible();
    });

    test("shows Property Type selector with Single Family option", async ({ page }) => {
      await expect(page.getByRole("combobox")).toBeVisible();
      await expect(page.getByRole("combobox")).toContainText("Single Family");
    });

    test("shows State input for climate accuracy", async ({ page }) => {
      await expect(page.getByPlaceholder("e.g. TX")).toBeVisible();
    });

    test("shows 'Estimate My Systems' link", async ({ page }) => {
      await expect(page.getByRole("link", { name: /estimate my systems/i })).toBeVisible();
    });

    test("estimate link navigates to results when year is entered", async ({ page }) => {
      await page.getByRole("spinbutton").fill("1985");
      await page.getByRole("link", { name: /estimate my systems/i }).click();
      await expect(page).toHaveURL(/\/home-systems\?yearBuilt=1985/);
    });
  });

  // ── Results view ───────────────────────────────────────────────────────────

  test.describe("results (with yearBuilt param)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/home-systems?yearBuilt=1976&type=single-family");
    });

    test("shows heading with year built", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /systems for a 1976 home/i })).toBeVisible();
    });

    test("renders all 9 system rows", async ({ page }) => {
      // There should be exactly 9 system entries
      const systemNames = ["HVAC", "Roofing", "Plumbing", "Electrical", "Water Heater", "Windows", "Flooring", "Insulation"];
      for (const name of systemNames) {
        await expect(page.getByText(name).first()).toBeVisible();
      }
    });

    test("shows urgency badges", async ({ page }) => {
      const badge = page.getByText(/^(Critical|Soon|Watch|Good)$/).first();
      await expect(badge).toBeVisible();
    });

    test("shows replacement cost ranges for each system", async ({ page }) => {
      const costs = page.getByLabel(/replacement cost/);
      const count = await costs.count();
      expect(count).toBeGreaterThan(0);
    });

    test("shows 'Installed [year] · N yrs old' detail for HVAC", async ({ page }) => {
      await expect(page.getByText(/Installed 1976/)).toBeVisible();
    });

    test("1976 home has at least one Critical system", async ({ page }) => {
      await expect(page.getByText("Critical").first()).toBeVisible();
    });

    // ── Shareable URL ──────────────────────────────────────────────────────

    test("shows 'Share this estimate' section with URL input", async ({ page }) => {
      await expect(page.getByText(/share this estimate/i)).toBeVisible();
      await expect(page.getByLabel(/share url/i)).toBeVisible();
    });

    test("share URL input contains /home-systems", async ({ page }) => {
      const input = page.getByLabel(/share url/i);
      const value = await input.inputValue();
      expect(value).toContain("/home-systems");
      expect(value).toContain("yearBuilt=1976");
    });

    test("shows Copy button", async ({ page }) => {
      await expect(page.getByRole("button", { name: /copy share url/i })).toBeVisible();
    });

    // ── Track this property CTA ────────────────────────────────────────────

    test("shows 'Track this property' CTA section", async ({ page }) => {
      await expect(page.getByText(/track this property for free/i)).toBeVisible();
    });

    test("'Track this property' link href contains /properties/new", async ({ page }) => {
      const link = page.getByRole("link", { name: /track this property/i });
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href).toContain("/properties/new");
    });

    test("Track CTA href carries yearBuilt param", async ({ page }) => {
      const link = page.getByRole("link", { name: /track this property/i });
      const href = await link.getAttribute("href");
      expect(href).toContain("yearBuilt=1976");
    });
  });

  // ── State parameter ────────────────────────────────────────────────────────

  test.describe("with state param", () => {
    test("shows state in heading when state is provided", async ({ page }) => {
      await page.goto("/home-systems?yearBuilt=1985&type=single-family&state=FL");
      await expect(page.getByRole("heading", { name: /in FL/i })).toBeVisible();
    });

    test("mentions climate-adjusted estimates when state is provided", async ({ page }) => {
      await page.goto("/home-systems?yearBuilt=1985&type=single-family&state=TX");
      await expect(page.getByText(/adjusted for your climate/i)).toBeVisible();
    });
  });

  // ── Summary line ───────────────────────────────────────────────────────────

  test("shows a systems summary line (Critical count or 'within expected lifespan')", async ({ page }) => {
    await page.goto("/home-systems?yearBuilt=1976&type=single-family");
    await expect(
      page.getByText(/past expected lifespan|approaching replacement|within expected lifespan/i).first()
    ).toBeVisible();
  });
});
