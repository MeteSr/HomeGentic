import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

// #726: condo and HOA paperwork on the property page (HOA tab).
// window.__e2e_hoa stands in for the property canister.

async function openHoaTab(page: import("@playwright/test").Page, propertyType = "SingleFamily", hoa: unknown = {}) {
  await injectTestAuth(page);
  await injectTestProperties(page);
  await injectSubscription(page, "Pro");
  await page.addInitScript(
    ({ type, data }) => {
      (window as any).__e2e_properties[0].propertyType = type;
      (window as any).__e2e_hoa = data;
    },
    { type: propertyType, data: hoa },
  );
  await page.goto("/properties/1");
  await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
  await page.getByRole("button", { name: "HOA", exact: true }).click();
}

test.describe("HOA tab", () => {
  test("logs an architectural review request and its decision", async ({ page }) => {
    await openHoaTab(page);
    await expect(page.getByText(/doesn't contact the association/i)).toBeVisible();
    await page.getByRole("button", { name: "Add a request" }).click();
    await page.getByLabel("What's the request for?").fill("Replace the back fence");
    await page.getByLabel("Status").selectOption("Approved");
    await page.getByLabel("Submitted").fill("2026-03-02");
    await page.getByLabel("Decision date").fill("2026-03-20");
    await page.getByRole("button", { name: "Save request" }).click();

    await expect(page.getByText("Replace the back fence")).toBeVisible();
    await expect(page.getByText("Submitted Mar 2, 2026 · Decided Mar 20, 2026")).toBeVisible();
    // No milestone inspection section on a single-family home.
    await expect(page.getByText(/milestone inspection/i)).toHaveCount(0);
  });

  test("records a special assessment and marks it paid", async ({ page }) => {
    await openHoaTab(page);
    await page.getByRole("button", { name: "Add an assessment" }).click();
    await page.getByLabel("What's it for?").fill("Roof replacement");
    await page.getByLabel("Amount, $").fill("4,500");
    await page.getByLabel("Due date").fill("2030-09-01");
    await page.getByRole("button", { name: "Save assessment" }).click();
    await expect(page.getByText("Still owed: $4,500 · Paid: $0")).toBeVisible();
    await page.getByRole("button", { name: "Mark paid" }).click();
    await expect(page.getByText("Still owed: $0 · Paid: $4,500")).toBeVisible();
  });

  test("keeps a condo's milestone inspection and reserve study dates", async ({ page }) => {
    await openHoaTab(page, "Condo");
    await expect(page.getByText(/doesn't say whether the building is safe/i)).toBeVisible();
    await page.getByLabel("Association name").fill("Bayview Towers");
    await page.getByLabel("Last milestone inspection").fill("2024-12-15");
    await page.getByLabel("Next milestone inspection due").fill("2034-12-15");
    await page.getByRole("button", { name: "Save condo record" }).click();
    await expect(page.getByText("Bayview Towers")).toBeVisible();
    await expect(page.getByText("Dec 15, 2034")).toBeVisible();
  });
});
