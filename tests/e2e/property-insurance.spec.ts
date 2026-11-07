import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

// #711: the home's insurance policy on the property page (Insurance tab).
// window.__e2e_insurance_policies stands in for the property canister.

async function openInsuranceTab(page: import("@playwright/test").Page, policies: Record<string, unknown>) {
  await injectTestAuth(page);
  await injectTestProperties(page);
  await injectSubscription(page, "Pro");
  await page.addInitScript((p) => {
    (window as any).__e2e_insurance_policies = p;
  }, policies);
  await page.goto("/properties/1");
  await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Insurance", exact: true }).click();
}

test.describe("Property insurance policy", () => {
  test("saves a policy from the empty form and shows it", async ({ page }) => {
    await openInsuranceTab(page, {});
    await expect(page.getByText("No policy saved yet.", { exact: false })).toBeVisible();

    await page.getByLabel("Insurance company").fill("Citizens");
    await page.getByLabel("Policy number").fill("HO3-42");
    await page.getByLabel("Renewal date").fill("2030-06-01");
    await page.getByLabel("Coverage A (dwelling), $").fill("350,000");
    await page.getByLabel("Hurricane deductible").selectOption("percent");
    await page.getByLabel("Percent of Coverage A").fill("2");
    await page.getByRole("button", { name: "Save policy" }).click();

    await expect(page.getByText("Citizens")).toBeVisible();
    await expect(page.getByText("Jun 1, 2030")).toBeVisible();
    await expect(page.getByText("2% of Coverage A (about $7,000)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  });

  test("flags a renewal date that has passed", async ({ page }) => {
    await openInsuranceTab(page, {
      "1": {
        carrier: "Citizens",
        policyNumber: "HO3-42",
        renewalDate: "2020-01-15",
        coverageA: null,
        hurricaneDeductible: null,
      },
    });
    await expect(page.getByText(/renewal date has passed/i)).toBeVisible();
  });

  test("refuses a policy with no insurance company", async ({ page }) => {
    await openInsuranceTab(page, {});
    await page.getByLabel("Renewal date").fill("2030-06-01");
    await page.getByRole("button", { name: "Save policy" }).click();
    await expect(page.getByRole("alert")).toContainText("Enter the insurance company");
  });
});
