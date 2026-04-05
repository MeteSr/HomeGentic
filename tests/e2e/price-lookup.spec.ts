import { test, expect } from "@playwright/test";

// Public page — no auth required

// Stub the relay so tests don't need a running voice server
function mockPriceBenchmark(page: Parameters<typeof test>[1]["page"], payload: object) {
  return page.route("**/api/price-benchmark**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    })
  );
}

const SUFFICIENT_RESULT = {
  serviceType: "Roofing",
  zipCode:     "32114",
  low:         700_000,   // cents → $7,000
  median:      1_200_000, // $12,000
  high:        2_000_000, // $20,000
  sampleSize:  12,
  lastUpdated: "2024-12",
};

const INSUFFICIENT_RESULT = {
  serviceType: "Foundation",
  zipCode:     "00001",
  low:         500_000,
  median:      800_000,
  high:        1_500_000,
  sampleSize:  2,          // < 5 threshold
  lastUpdated: "2024-11",
};

test.describe("PriceLookupPage — /prices", () => {
  // ── Search form (no params) ────────────────────────────────────────────────

  test.describe("search form (no URL params)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/prices");
    });

    test("shows HomeGentic logo", async ({ page }) => {
      await expect(page.getByText(/HomeGentic/).first()).toBeVisible();
    });

    test("shows 'Home repair cost lookup' heading", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /home repair cost lookup/i })).toBeVisible();
    });

    test("shows service type selector", async ({ page }) => {
      await expect(page.getByLabel(/service type/i)).toBeVisible();
    });

    test("service type selector includes HVAC option", async ({ page }) => {
      const select = page.getByLabel(/service type/i);
      await expect(select).toContainText("HVAC");
    });

    test("service type selector includes Roofing option", async ({ page }) => {
      await expect(page.getByLabel(/service type/i)).toContainText("Roofing");
    });

    test("shows zip code input", async ({ page }) => {
      await expect(page.getByLabel(/zip code/i)).toBeVisible();
    });

    test("shows 'Look Up Prices' link", async ({ page }) => {
      await expect(page.getByRole("link", { name: /look up prices/i })).toBeVisible();
    });

    test("selecting a service and entering a zip navigates to results", async ({ page }) => {
      await page.getByLabel(/service type/i).selectOption("Roofing");
      await page.getByLabel(/zip code/i).fill("32114");
      await page.getByRole("link", { name: /look up prices/i }).click();
      await expect(page).toHaveURL(/\/prices\?service=Roofing&zip=32114/);
    });
  });

  // ── Results: sufficient data ───────────────────────────────────────────────

  test.describe("results with sufficient data", () => {
    test.beforeEach(async ({ page }) => {
      await mockPriceBenchmark(page, SUFFICIENT_RESULT);
      await page.goto("/prices?service=Roofing&zip=32114");
      // Wait for the loading spinner to disappear
      await page.waitForSelector("[aria-label='loading']", { state: "hidden" }).catch(() => {});
    });

    test("shows service and zip heading", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /roofing in 32114/i })).toBeVisible();
    });

    test("shows 'Price Benchmark' eyebrow label", async ({ page }) => {
      await expect(page.getByText(/price benchmark/i)).toBeVisible();
    });

    test("shows the low price ($7,000)", async ({ page }) => {
      await expect(page.getByText(/\$7,000/).first()).toBeVisible();
    });

    test("shows the high price ($20,000)", async ({ page }) => {
      await expect(page.getByText(/\$20,000/).first()).toBeVisible();
    });

    test("shows the median price ($12,000)", async ({ page }) => {
      await expect(page.getByText(/\$12,000/)).toBeVisible();
    });

    test("shows sample size and last updated", async ({ page }) => {
      await expect(page.getByText(/12 closed bids/)).toBeVisible();
    });

    test("shows '← Search another' back link to /prices", async ({ page }) => {
      const link = page.getByRole("link", { name: /search another/i });
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href).toBe("/prices");
    });
  });

  // ── Results: insufficient data (<5 samples) ───────────────────────────────

  test.describe("results with insufficient data", () => {
    test.beforeEach(async ({ page }) => {
      await mockPriceBenchmark(page, INSUFFICIENT_RESULT);
      await page.goto("/prices?service=Foundation&zip=00001");
      await page.waitForSelector("[aria-label='loading']", { state: "hidden" }).catch(() => {});
    });

    test("shows 'Not enough data' message", async ({ page }) => {
      await expect(page.getByText(/not enough data/i)).toBeVisible();
    });

    test("mentions fewer than 5 bids", async ({ page }) => {
      await expect(page.getByText(/fewer than 5/i)).toBeVisible();
    });

    test("does NOT show price range when insufficient", async ({ page }) => {
      // Should not show large dollar figures as a range
      await expect(page.getByText(/\$[\d,]+–\$[\d,]+/)).not.toBeVisible();
    });
  });

  // ── No data from relay ────────────────────────────────────────────────────

  test.describe("when relay returns no data (null)", () => {
    test.beforeEach(async ({ page }) => {
      await page.route("**/api/price-benchmark**", (route) =>
        route.fulfill({ status: 404, body: "Not Found" })
      );
      await page.goto("/prices?service=Other&zip=99999");
      await page.waitForSelector("[aria-label='loading']", { state: "hidden" }).catch(() => {});
    });

    test("shows 'No data available' message", async ({ page }) => {
      await expect(page.getByText(/no data available/i)).toBeVisible();
    });

    test("shows '← Search another' link", async ({ page }) => {
      await expect(page.getByRole("link", { name: /search another/i })).toBeVisible();
    });
  });

  // ── Sign-in link ──────────────────────────────────────────────────────────

  test("shows Sign in link in nav", async ({ page }) => {
    await page.goto("/prices");
    const link = page.getByRole("link", { name: /sign in/i });
    await expect(link).toBeVisible();
  });
});
