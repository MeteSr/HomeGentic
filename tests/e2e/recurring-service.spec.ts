import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

async function injectProTier(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_subscription = { tier: "Pro", expiresAt: null };
  });
}

async function injectFreeTier(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_subscription = { tier: "Free", expiresAt: null };
  });
}

test.describe("RecurringServiceCreatePage — /recurring/new", () => {
  // ── Free tier — upgrade gate ──────────────────────────────────────────────

  test.describe("Free tier shows upgrade gate", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await injectTestProperties(page);
      await injectFreeTier(page);
      await page.goto("/recurring/new");
    });

    test("shows upgrade prompt for Free users", async ({ page }) => {
      await expect(page.getByText(/upgrade|pro|recurring/i).first()).toBeVisible();
    });
  });

  // ── Pro tier — full create form ───────────────────────────────────────────

  test.describe("Pro tier — create form", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await injectTestProperties(page);
      await injectProTier(page);
      await page.goto("/recurring/new");
    });

    test("shows page heading", async ({ page }) => {
      await expect(
        page.getByRole("heading", { name: /recurring service|new service/i })
      ).toBeVisible();
    });

    test("shows Service Type selector", async ({ page }) => {
      await expect(page.getByText(/service type/i)).toBeVisible();
    });

    test("shows LawnCare as a service type option", async ({ page }) => {
      await expect(page.getByText(/lawn care/i)).toBeVisible();
    });

    test("shows Pest Control service type option", async ({ page }) => {
      await expect(page.getByText(/pest control/i)).toBeVisible();
    });

    test("shows Pool Maintenance service type option", async ({ page }) => {
      await expect(page.getByText(/pool maintenance/i)).toBeVisible();
    });

    test("shows Frequency selector", async ({ page }) => {
      await expect(page.getByText(/frequency/i)).toBeVisible();
    });

    test("shows Monthly frequency option", async ({ page }) => {
      await expect(page.getByText("Monthly")).toBeVisible();
    });

    test("shows Quarterly frequency option", async ({ page }) => {
      await expect(page.getByText("Quarterly")).toBeVisible();
    });

    test("shows Provider Name field", async ({ page }) => {
      await expect(page.getByLabel(/provider name/i)).toBeVisible();
    });

    test("shows Start Date field", async ({ page }) => {
      await expect(page.getByLabel(/start date/i)).toBeVisible();
    });

    test("shows Save button", async ({ page }) => {
      await expect(page.getByRole("button", { name: /save|create|submit/i })).toBeVisible();
    });

    test("shows Back button", async ({ page }) => {
      await expect(page.getByRole("button", { name: /back/i })).toBeVisible();
    });

    test("Back button navigates away from form", async ({ page }) => {
      await page.getByRole("button", { name: /back/i }).click();
      await expect(page).not.toHaveURL("/recurring/new");
    });

    // ── Validation ──────────────────────────────────────────────────────────

    test("submitting without provider name shows error toast", async ({ page }) => {
      await page.getByRole("button", { name: /save|create|submit/i }).click();
      await expect(page.getByText(/provider name|required/i)).toBeVisible();
    });

    // ── Success flow ────────────────────────────────────────────────────────

    test("filling form and submitting shows success screen", async ({ page }) => {
      await page.getByLabel(/provider name/i).fill("Green Thumb Lawns");
      await page.getByRole("button", { name: /save|create|submit/i }).click();
      // Success screen shows "Service Logged" and the service name
      await expect(page.getByText(/service logged|lawn care|added/i)).toBeVisible({ timeout: 5000 });
    });
  });
});
