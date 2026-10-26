/**
 * E2E — For Sale By Owner, end to end in mock mode (no replica): the services
 * run on their in-memory store, so state carries across in-app navigation.
 *
 *  1. Seller starts from the property page ("List Your Home"), walks the setup
 *     wizard on My Listing and publishes.
 *  2. The public listing shows what the seller entered; a buyer asks for a
 *     showing and is told the seller will reply directly.
 *  3. Back on My Listing the request is in the inbox with a mailto link, and
 *     the seller can accept it, log an offer and take the listing down.
 */
import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

async function setup(page: Page) {
  await injectTestAuth(page);
  await injectTestProperties(page);
  await injectSubscription(page, "Pro");
  // "List Your Home" shows once ownership is verified.
  await page.addInitScript(() => {
    (window as any).__e2e_properties[0].verificationLevel = "Basic";
  });
}

async function listTheHome(page: Page) {
  await page.goto("/properties/1");
  await page.getByRole("button", { name: "List Your Home" }).click();
  await page.getByPlaceholder("e.g. 425000").fill("425000");
  await page.getByPlaceholder(/describe your home/i).fill("Shady backyard, new roof.");
  await page.getByRole("button", { name: /start my listing/i }).click();

  await expect(page).toHaveURL(/\/my-listing\/1$/);
  await expect(page.getByText("Step 2 — Review Your HomeGentic Report")).toBeVisible();
  await page.getByRole("button", { name: /skip for now|report looks good/i }).click();

  await expect(page.getByText("Step 3 — Go Live")).toBeVisible();
  await page.getByLabel("Bedrooms").fill("3");
  await page.getByLabel("Bathrooms").fill("2");
  await page.getByRole("button", { name: /publish fsbo listing/i }).click();

  await expect(page.getByTestId("listing-status-badge")).toHaveText(/live/i);
  await expect(page.getByTestId("stat-list-price")).toHaveText("$425,000");
}

test.describe("FSBO — seller lists, buyer asks for a showing", () => {
  test.beforeEach(async ({ page }) => { await setup(page); });

  test("the setup wizard saves each step and publishes the listing", async ({ page }) => {
    await listTheHome(page);
    await expect(page.getByTestId("stat-showings")).toHaveText("0");
    await expect(page.getByTestId("price-history-list")).toContainText("$425,000");
  });

  test("the buyer's showing request reaches the seller's inbox", async ({ page }) => {
    await listTheHome(page);

    await page.getByTestId("view-public-listing-link").click();
    await expect(page).toHaveURL(/\/for-sale\/1$/);
    await expect(page.getByRole("heading", { name: "Schedule a Showing" })).toBeVisible();
    await expect(page.getByText("$425,000")).toBeVisible();
    await expect(page.getByText("Shady backyard, new roof.")).toBeVisible();

    await page.getByLabel("Your Name").fill("Jane Buyer");
    await page.getByLabel("Email or Phone").fill("jane@example.com");
    await page.getByLabel("Preferred Showing Time").fill("Saturday morning");
    await page.getByRole("button", { name: "Request a Showing" }).click();
    await expect(page.getByText(/the seller has your contact details and will reply to you directly/i)).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/my-listing\/1$/);
    await expect(page.getByTestId("stat-showings")).toHaveText("1");
    const row = page.getByTestId("showing-row").filter({ hasText: "Jane Buyer" });
    await expect(row.getByRole("link", { name: "Contact Jane Buyer" })).toHaveAttribute("href", "mailto:jane@example.com");
    await row.getByRole("button", { name: "Accept" }).click();
    await expect(row).toContainText("Accepted");
    await expect(page.getByTestId("showing-calendar-section")).toContainText("Jane Buyer");
  });

  test("the seller logs an offer, changes the price and takes the listing down", async ({ page }) => {
    await listTheHome(page);

    await page.getByLabel("Buyer Name").fill("Ben Buyer");
    await page.getByLabel("Offer Amount ($)").fill("410000");
    await page.getByRole("button", { name: "Log Offer" }).click();
    await expect(page.getByTestId("stat-offers")).toHaveText("1");

    await page.getByTestId("price-edit-input").fill("415000");
    await page.getByTestId("save-price-btn").click();
    await expect(page.getByTestId("stat-list-price")).toHaveText("$415,000");

    await page.getByTestId("take-down-btn").click();
    await expect(page.getByTestId("take-down-confirm-dialog")).toContainText(/will be deleted/i);
    await page.getByTestId("take-down-confirm").click();
    await expect(page.getByTestId("activate-listing-cta")).toBeVisible();
  });
});
