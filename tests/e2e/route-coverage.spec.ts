/**
 * Routes that had no spec: the realtor (Bid to List agent) pages, /admin,
 * /plans, /homes, /manage/claim/:token and /gift/redeem. Mock mode (no
 * canister); their flows against real canisters run in
 * tests/upgrade/browser-flow.live.test.ts.
 *
 * RC.1  realtor pages send a signed-out visitor to /login
 * RC.2  realtor pages send a homeowner to /dashboard
 * RC.3  /agents/verify shows the licence form, with labelled fields
 * RC.4  /agents/bids shows the empty state
 * RC.5  /agents/browse shows a retry when listings can't load
 * RC.6  /admin is closed to a non-admin
 * RC.7  /plans needs sign-in, then offers Pro at $59/year
 * RC.8  /homes lists FSBO homes, filters by type and links to each listing
 * RC.9  /manage/claim/:token with an unknown token says the link isn't valid
 * RC.10 /gift/redeem without a token says the link is incomplete
 * RC.11 /gift/redeem signed out offers sign-in, and remembers where to return
 */

import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

async function asRole(page: Page, role: "Homeowner" | "Realtor" | "Contractor") {
  await injectTestAuth(page);
  await page.addInitScript((r) => {
    (window as any).__e2e_profile = { role: r, onboardingComplete: true };
    (window as any).__e2e_properties = [];
    (window as any).__e2e_jobs = [];
  }, role);
}

const REALTOR_PAGES = ["/agents/verify", "/agents/browse", "/agents/bids", "/agents/bids/b1", "/agents/listings/r1/bid"];

test.describe("RC.1 — realtor pages, signed out", () => {
  for (const path of REALTOR_PAGES) {
    test(`${path} → /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test.describe("RC.2 — realtor pages, as a homeowner", () => {
  for (const path of REALTOR_PAGES) {
    test(`${path} → /dashboard`, async ({ page }) => {
      await asRole(page, "Homeowner");
      await page.goto(path);
      await expect(page).toHaveURL(/\/dashboard/);
    });
  }
});

test("RC.3 — /agents/verify shows the licence form with labelled fields", async ({ page }) => {
  await asRole(page, "Realtor");
  await page.goto("/agents/verify");
  await expect(page.getByRole("heading", { name: "Get verified to bid" })).toBeVisible();
  for (const label of ["Full name", "Brokerage", "License number", "License state", "County", "Email"]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByLabel("License state", { exact: true })).toHaveValue("FL");
  await expect(page.getByRole("button", { name: "Save details" })).toBeVisible();
});

test("RC.4 — /agents/bids shows the empty state", async ({ page }) => {
  await asRole(page, "Realtor");
  await page.goto("/agents/bids");
  await expect(page.getByRole("heading", { name: "My bids" })).toBeVisible();
  await expect(page.getByText("No bids yet.")).toBeVisible();
  await expect(page.getByText(/0 bids placed/)).toBeVisible();
});

test("RC.5 — /agents/browse offers a retry when listings can't load", async ({ page }) => {
  await asRole(page, "Realtor");
  await page.goto("/agents/browse");
  await expect(page.getByRole("heading", { name: "Homes taking bids" })).toBeVisible();
  await expect(page.getByText("Couldn't load open listings.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("RC.6 — /admin is closed to a non-admin", async ({ page }) => {
  await asRole(page, "Homeowner");
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin$/);
  await expect(page.getByText(/pending verifications/i)).toHaveCount(0);
});

test("RC.7 — /plans needs sign-in, then offers Pro at $59/year", async ({ page }) => {
  await page.goto("/plans");
  await expect(page).toHaveURL(/\/login/);

  await asRole(page, "Homeowner");
  await page.goto("/plans");
  await expect(page.getByText("$59")).toBeVisible();
  await expect(page.getByText("/year")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Pro" })).toBeVisible();
});

test("RC.8 — /homes lists FSBO homes, filters by type and links to each listing", async ({ page }) => {
  await page.addInitScript(() => {
    const base = {
      activatedAt: Date.now() - 3 * 86_400_000, state: "FL", yearBuilt: 2004, squareFeet: 1850,
      bedrooms: 3, bathrooms: 2, verificationLevel: "Basic", verifiedJobCount: 4, hasPublicReport: true,
    };
    (window as any).__e2e_fsbo_listings = [
      { ...base, propertyId: "p-house", listPriceCents: 425_000_00, address: "12 Live Oak Ln", city: "Orlando", zipCode: "32801", propertyType: "SingleFamily", score: 82 },
      { ...base, propertyId: "p-condo", listPriceCents: 289_000_00, address: "300 Lake Ave #4", city: "Winter Park", zipCode: "32789", propertyType: "Condo" },
    ];
  });
  await page.goto("/homes");
  await expect(page.getByRole("heading", { name: "Find FSBO Homes for Sale" })).toBeVisible();
  await expect(page.getByText(/^2 homes for sale/)).toBeVisible();
  await expect(page.getByText("12 Live Oak Ln")).toBeVisible();
  await expect(page.getByText("300 Lake Ave #4")).toBeVisible();

  await page.getByRole("button", { name: "Condo" }).click();
  await expect(page.getByText("300 Lake Ave #4")).toBeVisible();
  await expect(page.getByText("12 Live Oak Ln")).toHaveCount(0);

  // Every card's link says "View"; its accessible name says which home.
  await page.getByRole("link", { name: "View 300 Lake Ave #4" }).click();
  await expect(page).toHaveURL(/\/for-sale\/p-condo$/);
});

test("RC.9 — /manage/claim with an unknown token says the link isn't valid", async ({ page }) => {
  await page.goto("/manage/claim/not-a-real-token");
  await expect(page.getByRole("heading", { name: "This link is no longer valid" })).toBeVisible();
  await expect(page.getByText(/ask the property owner to generate a new invite link/i)).toBeVisible();
});

test("RC.10 — /gift/redeem without a token says the link is incomplete", async ({ page }) => {
  await page.goto("/gift/redeem");
  await expect(page.getByRole("heading", { name: "Gift link incomplete" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contact support" })).toBeVisible();
});

test("RC.11 — /gift/redeem signed out offers sign-in and remembers where to return", async ({ page }) => {
  await page.goto("/gift/redeem?token=cs_test_abc123");
  await expect(page.getByRole("heading", { name: "You've been given HomeGentic Pro" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in to redeem" }).click();
  // Dev builds sign in with the local key; the gift page is kept to return to.
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("pendingVerification")))
    .toBe("/gift/redeem?token=cs_test_abc123");
});
