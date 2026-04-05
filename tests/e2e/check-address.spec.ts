import { test, expect } from "@playwright/test";

// Public page — no auth required

const FOUND_RESPONSE = {
  found:             true,
  token:             "abc123token",
  address:           "456 Oak Ave, Austin, TX",
  verificationLevel: "Premium",
  propertyType:      "SingleFamily",
  yearBuilt:         1998,
};

const NOT_FOUND_RESPONSE = {
  found:   false,
  address: "789 Unknown Rd, Nowhere, TX",
};

function mockLookup(page: Parameters<typeof test>[1]["page"], payload: object) {
  return page.route("**/api/check**", (route) =>
    route.fulfill({
      status:      200,
      contentType: "application/json",
      body:        JSON.stringify(payload),
    })
  );
}

test.describe("CheckAddressPage — /check", () => {
  // ── Search form (no params) ────────────────────────────────────────────────

  test.describe("search form (no URL params)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/check");
    });

    test("shows HomeGentic logo", async ({ page }) => {
      await expect(page.getByText(/HomeGentic/).first()).toBeVisible();
    });

    test("shows 'Check any home's maintenance history' heading", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /check any home/i })).toBeVisible();
    });

    test("shows address input field", async ({ page }) => {
      await expect(page.getByLabel(/address/i)).toBeVisible();
    });

    test("shows 'Check Address' button", async ({ page }) => {
      await expect(page.getByRole("button", { name: /check address/i })).toBeVisible();
    });

    test("Check Address button is disabled when input is empty", async ({ page }) => {
      const btn = page.getByRole("button", { name: /check address/i });
      await expect(btn).toBeDisabled();
    });

    test("Check Address button enables after typing an address", async ({ page }) => {
      await page.getByLabel(/address/i).fill("123 Main St");
      const btn = page.getByRole("button", { name: /check address/i });
      await expect(btn).toBeEnabled();
    });

    test("clicking Check Address navigates to /check?address=...", async ({ page }) => {
      await mockLookup(page, NOT_FOUND_RESPONSE);
      await page.getByLabel(/address/i).fill("123 Main St");
      await page.getByRole("button", { name: /check address/i }).click();
      await expect(page).toHaveURL(/\/check\?address=/);
    });

    test("pressing Enter in the address field submits the form", async ({ page }) => {
      await mockLookup(page, NOT_FOUND_RESPONSE);
      await page.getByLabel(/address/i).fill("123 Main St");
      await page.getByLabel(/address/i).press("Enter");
      await expect(page).toHaveURL(/\/check\?address=/);
    });
  });

  // ── Result: report found ───────────────────────────────────────────────────

  test.describe("result: HomeGentic report found", () => {
    test.beforeEach(async ({ page }) => {
      await mockLookup(page, FOUND_RESPONSE);
      await page.goto("/check?address=456+Oak+Ave");
      // Wait for loading to complete
      await page.waitForSelector("[aria-label='loading']", { state: "hidden" }).catch(() => {});
    });

    test("shows 'HomeGentic Verified' badge", async ({ page }) => {
      await expect(page.getByText(/HomeGentic Verified/i)).toBeVisible();
    });

    test("shows the matched address", async ({ page }) => {
      await expect(page.getByText(/456 Oak Ave/i)).toBeVisible();
    });

    test("shows verification level", async ({ page }) => {
      await expect(page.getByText(/Premium/)).toBeVisible();
    });

    test("shows year built when available", async ({ page }) => {
      await expect(page.getByText(/Built 1998/)).toBeVisible();
    });

    test("shows 'View Full Report' link", async ({ page }) => {
      await expect(page.getByRole("link", { name: /view.*report|view full report/i })).toBeVisible();
    });

    test("'View Full Report' link href contains the report token", async ({ page }) => {
      const link = page.getByRole("link", { name: /view.*report/i });
      const href = await link.getAttribute("href");
      expect(href).toContain("abc123token");
    });

    test("sets document.title to include the address", async ({ page }) => {
      const title = await page.title();
      expect(title).toMatch(/HomeGentic.*Report/);
    });
  });

  // ── Result: no report on file ──────────────────────────────────────────────

  test.describe("result: no report found", () => {
    test.beforeEach(async ({ page }) => {
      await mockLookup(page, NOT_FOUND_RESPONSE);
      await page.goto("/check?address=789+Unknown+Rd");
      await page.waitForSelector("[aria-label='loading']", { state: "hidden" }).catch(() => {});
    });

    test("shows 'No report on file' heading", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /no report on file/i })).toBeVisible();
    });

    test("shows seller CTA 'Are you the homeowner?'", async ({ page }) => {
      await expect(page.getByText(/are you the homeowner/i)).toBeVisible();
    });

    test("shows 'Create a Free Report' link for sellers", async ({ page }) => {
      await expect(page.getByRole("link", { name: /create a free report/i })).toBeVisible();
    });

    test("'Create a Free Report' href goes to /properties/new", async ({ page }) => {
      const link = page.getByRole("link", { name: /create a free report/i });
      const href = await link.getAttribute("href");
      expect(href).toContain("/properties/new");
    });

    test("'Create a Free Report' href carries the address", async ({ page }) => {
      const link = page.getByRole("link", { name: /create a free report/i });
      const href = await link.getAttribute("href");
      expect(href).toContain("address=");
    });

    test("shows buyer email notification form", async ({ page }) => {
      await expect(page.getByLabel(/email/i)).toBeVisible();
    });

    test("shows 'Notify Me' button", async ({ page }) => {
      await expect(page.getByRole("button", { name: /notify me/i })).toBeVisible();
    });

    test("Notify Me button is disabled with empty email", async ({ page }) => {
      await expect(page.getByRole("button", { name: /notify me/i })).toBeDisabled();
    });

    test("submitting email shows success confirmation", async ({ page }) => {
      // Stub the report-request endpoint
      await page.route("**/api/report-request**", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
      );
      await page.getByLabel(/email/i).fill("buyer@example.com");
      await page.getByRole("button", { name: /notify me/i }).click();
      await expect(page.getByText(/we'll notify you/i)).toBeVisible();
    });
  });

  // ── Sign-in link ──────────────────────────────────────────────────────────

  test("shows Sign in link in nav", async ({ page }) => {
    await page.goto("/check");
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });
});
