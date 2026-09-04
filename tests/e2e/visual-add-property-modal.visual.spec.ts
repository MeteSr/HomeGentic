/**
 * Visual regression baseline — AddPropertyModal / onboarding wizard (#432)
 *
 * Covers the three required steps of the wizard: address, details, and the
 * saved hub. The four optional post-save steps (photos, documents, ages,
 * verify) aren't baselined yet — same reasoning as the public ReportPage
 * (see TESTING.md → "Visual regression tests"): they need their own mock
 * fixtures and are a reasonable fast-follow, not a blocker for this PR.
 *
 * Setup mirrors onboarding.spec.ts: no properties injected + a fresh
 * auth session means the wizard auto-opens on /dashboard.
 */

import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectRegisterProperty, injectSubscription } from "./helpers/testData";
import { freezeClock } from "./helpers/visual";

async function fillAddressStep(page: Page) {
  await page.getByLabel(/street address/i).fill("100 Onboarding Lane");
  await page.getByLabel(/city/i).fill("Austin");
  await page.getByLabel(/state/i).fill("TX");
  await page.getByLabel(/zip code/i).fill("78701");
  await page.getByRole("button", { name: /continue/i }).click();
}

async function fillDetailsStep(page: Page) {
  await page.getByLabel(/year built/i).fill("2000");
  await page.getByLabel(/square feet/i).fill("2000");
  await page.getByRole("button", { name: /save property/i }).click();
}

test.describe("Visual — AddPropertyModal wizard", () => {
  test("step 1: address", async ({ page }) => {
    await freezeClock(page);
    await injectTestAuth(page);
    await injectSubscription(page, "Basic");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /where is the home/i })).toBeVisible();
    await expect(page).toHaveScreenshot("add-property-address.png");
  });

  test("step 2: details", async ({ page }) => {
    await freezeClock(page);
    await injectTestAuth(page);
    await injectSubscription(page, "Basic");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /where is the home/i })).toBeVisible();
    await fillAddressStep(page);
    await expect(page.getByRole("heading", { name: /year built and size/i })).toBeVisible();
    await expect(page).toHaveScreenshot("add-property-details.png");
  });

  test("saved hub", async ({ page }) => {
    await freezeClock(page);
    await injectTestAuth(page);
    await injectSubscription(page, "Basic");
    await injectRegisterProperty(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /where is the home/i })).toBeVisible();
    await fillAddressStep(page);
    await fillDetailsStep(page);
    await expect(page.getByRole("heading", { name: /your property is saved/i })).toBeVisible();
    await expect(page).toHaveScreenshot("add-property-saved.png");
  });
});
