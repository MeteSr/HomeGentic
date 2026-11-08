import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

// #714 property tax record on the Bills tab. window.__e2e_property_tax stands
// in for the property canister; the test home is moved to Florida so the
// Florida dates show.

async function openBills(page: import("@playwright/test").Page, state = "FL") {
  await injectTestAuth(page);
  await injectTestProperties(page);
  await injectSubscription(page, "Pro");
  await page.addInitScript((st) => {
    (window as any).__e2e_properties[0].state = st;
    (window as any).__e2e_property_tax = {};
    (window as any).__e2e_mortgage_loans = {};
  }, state);
  await page.goto("/properties/1");
  await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Bills", exact: true }).click();
  await expect(page.getByText("Property tax record")).toBeVisible();
}

test.describe("Property tax record", () => {
  test("shows Florida's dates with official sources and saves a tax year", async ({ page }) => {
    await openBills(page);
    const dates = page.getByRole("region", { name: "Florida dates" });
    await expect(dates.getByText(/apply by March 1/)).toBeVisible();
    await expect(dates.getByRole("link", { name: /s\. 196\.011/ })).toHaveAttribute("href", /flsenate\.gov/);
    await expect(page.getByText(/not tax advice/i)).toBeVisible();

    await page.getByRole("button", { name: "Add a tax year" }).click();
    await page.getByLabel("Tax year").fill("2026");
    await page.getByLabel("Market value, $").fill("412,500");
    await page.getByLabel("Assessed value, $").fill("318,000");
    await page.getByLabel("Homestead exemption").selectOption("Granted");
    await page.getByLabel("Petition deadline on the TRIM notice").fill("2026-09-15");
    await page.getByRole("button", { name: "Save year" }).click();

    const row = page.getByRole("row", { name: /2026/ });
    await expect(row.getByText("$412,500")).toBeVisible();
    await expect(row.getByText("Granted")).toBeVisible();
    await expect(row.getByText("Sep 15, 2026")).toBeVisible();
  });

  test("leaves out the Florida dates for a home in another state", async ({ page }) => {
    await openBills(page, "TX");
    await expect(page.getByRole("region", { name: "Florida dates" })).toHaveCount(0);
  });
});
