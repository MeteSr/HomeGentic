/**
 * Florida insurance inspection readiness E2E (/insurance-defense)
 *
 * IR.1  a Florida home shows 4-point and wind mitigation readiness from its record
 * IR.2  "Get inspector quotes" opens the quote form pre-filled
 * IR.3  a home outside Florida gets no readiness section
 *
 * Canisters are replaced by window.__e2e_* globals; system ages come from
 * localStorage (homegentic_system_ages_<id>).
 */

import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSubscription } from "./helpers/testData";

const property = (state: string) => ({
  id: 1, owner: "test-e2e-principal",
  address: "12 Palm Way", city: "DeLand", state, zipCode: "32720",
  propertyType: "SingleFamily", yearBuilt: 1995, squareFeet: 1800,
  verificationLevel: "Basic", tier: "Pro",
  createdAt: 0, updatedAt: 0, isActive: true,
});

const JOBS = [
  {
    id: "J1", propertyId: "1", homeowner: "test-e2e-principal", serviceType: "Roofing", contractorName: "Sun Roofing",
    amount: 1400000, date: "2021-04-02", description: "Full shingle roof replacement", isDiy: false, permitNumber: "BP-2021-118",
    status: "verified", verified: true, homeownerSigned: true, contractorSigned: true, photos: [], createdAt: 0,
  },
  {
    id: "J2", propertyId: "1", homeowner: "test-e2e-principal", serviceType: "HVAC", contractorName: "Cool Air",
    amount: 18900, date: "2025-05-01", description: "Annual tune-up", isDiy: false,
    status: "verified", verified: true, homeownerSigned: true, contractorSigned: true, photos: [], createdAt: 0,
  },
];

async function setup(page: Page, state: string) {
  await injectTestAuth(page);
  await injectSubscription(page, "Pro");
  await page.addInitScript(({ prop, jobs }) => {
    (window as any).__e2e_properties = [prop];
    (window as any).__e2e_jobs = jobs;
    localStorage.setItem("homegentic_system_ages_1", JSON.stringify({ HVAC: 2018 }));
  }, { prop: property(state), jobs: JOBS });
}

test("IR.1 a Florida home shows what's documented and what's missing", async ({ page }) => {
  await setup(page, "FL");
  await page.goto("/insurance-defense");
  const r = page.getByTestId("insurance-readiness");
  await expect(r).toBeVisible();
  await expect(r.getByTestId("readiness-hvac")).toContainText("In your record");
  await expect(r.getByTestId("readiness-hvac")).toContainText("Installed 2018 (from your system ages)");
  await expect(r.getByTestId("readiness-electrical")).toContainText("Not recorded yet");
  await expect(r.getByTestId("readiness-roofCovering")).toContainText("permit BP-2021-118");
  await expect(r.getByTestId("readiness-attic")).toContainText("Inspector checks");
  await expect(page.getByText("It doesn't predict whether a carrier will insure the home")).toBeVisible();
});

test("IR.2 inspector quotes open the quote form pre-filled", async ({ page }) => {
  await setup(page, "FL");
  await page.goto("/insurance-defense");
  await page.getByRole("button", { name: "Get inspector quotes" }).first().click();
  await expect(page).toHaveURL(/\/quotes\/new$/);
  await expect(page.getByText("4-point insurance inspection (roof, electrical, plumbing, HVAC)")).toBeVisible();
});

test("IR.3 a home outside Florida gets no readiness section", async ({ page }) => {
  await setup(page, "TX");
  await page.goto("/insurance-defense");
  await expect(page.getByRole("heading", { name: /Maintenance & Inspection History/ })).toBeVisible();
  await expect(page.getByTestId("insurance-readiness")).toHaveCount(0);
});
