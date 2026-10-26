/**
 * Record handoff at closing E2E
 *
 * HO.1  Settings: a verified home's handoff link, email link and free-Pro note
 * HO.2  Settings: an unverified home says verifying first adds the Pro year
 * HO.3  Claim page: a verified home offers the Pro year; accepting says it was added
 * HO.4  Claim page: an unverified home doesn't mention Pro
 *
 * Canisters are replaced by window.__e2e_* globals: __e2e_transfers (pending
 * transfers by token), __e2e_grant_handoff (payment grants the Pro year on
 * claim) and __e2e_handoff_grant (when it did).
 */

import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSubscription } from "./helpers/testData";

const property = (verificationLevel: string) => ({
  id: 1, owner: "test-e2e-principal",
  address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
  propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
  verificationLevel, tier: "Free",
  createdAt: 0, updatedAt: 0, isActive: true,
});

const PENDING = {
  propertyId: "1", from: "seller-principal", token: "e2e-1",
  initiatedAt: Date.now(), expiresAt: Date.now() + 30 * 86_400_000,
};

async function setup(page: Page, verificationLevel: string, transfers: Record<string, unknown>) {
  await injectTestAuth(page);
  await injectSubscription(page, "Free");
  await page.addInitScript(({ prop, transfers }) => {
    (window as any).__e2e_properties = [prop];
    (window as any).__e2e_jobs = [];
    (window as any).__e2e_transfers = transfers;
    (window as any).__e2e_grant_handoff = true;
    (window as any).__e2e_handoff_grant = null;
  }, { prop: property(verificationLevel), transfers });
}

test("HO.1 a verified home's handoff link comes with the free Pro year", async ({ page }) => {
  await setup(page, "Basic", {});
  await page.goto("/properties/1?tab=settings");
  await expect(page.getByText("Hand the record to your buyer")).toBeVisible();
  await expect(page.getByTestId("handoff-pro-note")).toContainText("the buyer also gets a free year of HomeGentic Pro");
  await page.getByRole("button", { name: /Generate Transfer Link/ }).click();
  await expect(page.getByText(/\/transfer\/claim\/e2e-1$/)).toBeVisible();
  const email = page.getByRole("link", { name: /Email the link to your buyer/ });
  await expect(email).toHaveAttribute("href", /^mailto:\?subject=.*transfer%2Fclaim%2Fe2e-1/);
});

test("HO.2 an unverified home says to verify first", async ({ page }) => {
  await setup(page, "Unverified", {});
  await page.goto("/properties/1?tab=settings");
  await expect(page.getByTestId("handoff-pro-note")).toHaveText("Verify ownership first and the buyer also gets a free year of HomeGentic Pro.");
});

test("HO.3 the buyer of a verified home gets the Pro year", async ({ page }) => {
  await setup(page, "Basic", { "e2e-1": PENDING });
  await page.goto("/transfer/claim/e2e-1");
  await expect(page.getByTestId("handoff-pro-offer")).toContainText("Plus a free year of HomeGentic Pro");
  await page.getByRole("button", { name: /Accept & Become Owner/ }).click();
  await expect(page.getByRole("heading", { name: "You're the new owner" })).toBeVisible();
  await expect(page.getByTestId("handoff-pro-year")).toContainText("We've added a free year of HomeGentic Pro");
});

test("HO.4 an unverified home's claim page doesn't mention Pro", async ({ page }) => {
  await setup(page, "Unverified", { "e2e-1": PENDING });
  await page.goto("/transfer/claim/e2e-1");
  await expect(page.getByRole("heading", { name: "Claim this property" })).toBeVisible();
  await expect(page.getByTestId("handoff-pro-offer")).toHaveCount(0);
});
