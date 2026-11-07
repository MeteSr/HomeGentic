import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

// #719 home warranty plan (Home warranty tab), #722 mortgage calculator (Bills
// tab) and #718 FEMA flood zone (Insurance tab). window.__e2e_home_warranty,
// __e2e_mortgage_loans and __e2e_flood_zones stand in for the property
// canister and the voice Worker.

async function openProperty(page: import("@playwright/test").Page, data: Record<string, unknown> = {}) {
  await injectTestAuth(page);
  await injectTestProperties(page);
  await injectSubscription(page, "Pro");
  await page.addInitScript((d) => {
    (window as any).__e2e_home_warranty = d.warranty ?? { plans: {}, claims: {} };
    (window as any).__e2e_mortgage_loans = d.loans ?? {};
    (window as any).__e2e_flood_zones = d.flood ?? {};
    (window as any).__e2e_insurance_policies = {};
  }, data as any);
  await page.goto("/properties/1");
  await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
}

test.describe("Home warranty tab", () => {
  test("saves a plan and logs a claim", async ({ page }) => {
    await openProperty(page);
    await page.getByRole("button", { name: "Home warranty", exact: true }).click();
    await expect(page.getByText(/doesn't sell or rate home warranty plans/i)).toBeVisible();

    await page.getByRole("button", { name: "Add your plan" }).click();
    await page.getByLabel("Home warranty company").fill("American Home Shield");
    await page.getByLabel("Service-call fee, $").fill("125");
    await page.getByLabel("Renewal date").fill("2099-03-15");
    await page.getByLabel("What it covers").fill("HVAC, plumbing");
    await page.getByRole("button", { name: "Save plan" }).click();
    await expect(page.getByText("American Home Shield", { exact: true })).toBeVisible();
    await expect(page.getByText("HVAC, plumbing")).toBeVisible();

    await page.getByRole("button", { name: "Log a claim" }).click();
    await page.getByLabel("What's the claim for?").fill("AC not cooling");
    await page.getByLabel("Service fee paid, $").fill("125");
    await page.getByRole("button", { name: "Save claim" }).click();
    await expect(page.getByText("AC not cooling")).toBeVisible();
    await expect(page.getByText(/Service-call fees paid: \$125 across 1 claim/)).toBeVisible();
  });
});

test.describe("Mortgage calculator", () => {
  test("works out the payment and PMI dates from the owner's numbers", async ({ page }) => {
    await openProperty(page, {
      loans: {
        "1": {
          lender: "Sunshine Bank",
          originalAmount: 300000,
          annualRatePct: 6.5,
          termMonths: 360,
          firstPaymentDate: "2024-02-01",
          originalValue: 350000,
          currentValue: 420000,
          monthlyPmi: 120,
          monthlyEscrow: 600,
          statementBalance: null,
          statementDate: "",
        },
      },
    });
    await page.getByRole("button", { name: "Bills", exact: true }).click();
    await expect(page.getByText("Mortgage and equity")).toBeVisible();
    await expect(page.getByText("$1,896.20")).toBeVisible();
    await expect(page.getByText(/80% of the original value on Apr 1, 2029/)).toBeVisible();
    await expect(page.getByText(/your lender decides/i)).toBeVisible();
  });
});

test.describe("FEMA flood zone", () => {
  test("shows what FEMA's map shows and links the Map Service Center", async ({ page }) => {
    await openProperty(page, {
      flood: {
        "1": {
          status: "Mapped",
          zone: "AE",
          zoneSubtype: "",
          specialFloodHazardArea: true,
          baseFloodElevation: "8",
          firmPanel: "12095C0430F",
          firmEffectiveDate: "2009-09-25",
          matchedAddress: "123 MAPLE STREET",
          latitude: "28.5",
          longitude: "-81.3",
          checkedAt: Date.UTC(2026, 10, 7, 12),
        },
      },
    });
    await page.getByRole("button", { name: "Insurance", exact: true }).click();
    await expect(page.getByText("FEMA's map shows zone AE as of Nov 7, 2026")).toBeVisible();
    await expect(page.getByRole("link", { name: /FEMA's Flood Map Service Center/ })).toHaveAttribute(
      "href",
      /msc\.fema\.gov/,
    );
  });
});
