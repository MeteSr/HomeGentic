/**
 * Capture without typing + recall alerts E2E
 *
 * CAP.1  /jobs shows the forwarding address on request, and a forwarded-invoice draft
 * CAP.2  "Review and log" opens the job form pre-filled; "Dismiss" removes the draft
 * CAP.3  with no inbox domain and no drafts, the panel stays hidden
 * CAP.4  Warranty Wallet: a scanned label is saved as an appliance in a room
 * CAP.5  Dashboard brief: a possible CPSC recall for an appliance is flagged
 * CAP.6  Rooms tab: "Scan the label" fills the fixture form and offers the install year
 *
 * Canisters are replaced by window.__e2e_* globals (__e2e_inbox, __e2e_rooms,
 * __e2e_recalls); the Worker's /api/extract-document is routed here.
 */

import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSubscription } from "./helpers/testData";

const PROPERTY = {
  id: 1, owner: "test-e2e-principal",
  address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
  propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
  verificationLevel: "Unverified", tier: "Pro",
  createdAt: 0, updatedAt: 0, isActive: true,
};

const DRAFT = {
  id: "D1", receivedAt: Date.UTC(2026, 9, 20), fromAddress: "billing@coolair.example", subject: "Invoice #1042",
  title: "AC tune-up", serviceType: "HVAC", contractorName: "Cool Air LLC", amountCents: 18900,
  completedDate: "2026-09-14", warrantyMonths: 12, description: "Cleaned coils and checked refrigerant.",
};

async function setup(page: Page, extra: Record<string, unknown>) {
  await injectTestAuth(page);
  await injectSubscription(page, "Pro");
  await page.addInitScript(({ property, extra }) => {
    (window as any).__e2e_properties = [property];
    (window as any).__e2e_jobs = [];
    (window as any).__e2e_quote_requests = [];
    for (const [k, v] of Object.entries(extra)) (window as any)[k] = v;
  }, { property: PROPERTY, extra });
}

test.describe("CAP — forwarded invoices on /jobs", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, { __e2e_inbox: { domain: "in.homegentic.test", token: "aaaaaaaaaaaaaaaaaaaa", drafts: [DRAFT] } });
    await page.goto("/jobs");
    await expect(page.getByTestId("forwarded-invoices")).toBeVisible();
  });

  test("CAP.1 shows the address and the draft", async ({ page }) => {
    await page.getByRole("button", { name: "Show my forwarding address" }).click();
    await expect(page.getByTestId("inbox-address")).toHaveText("h-aaaaaaaaaaaaaaaaaaaa@in.homegentic.test");
    await expect(page.getByText("Nothing is added to your home's record until you log it.")).toBeVisible();
    const draft = page.getByTestId("email-draft");
    await expect(draft).toContainText("AC tune-up");
    await expect(draft).toContainText("Cool Air LLC");
    await expect(draft).toContainText("$189");
  });

  test("CAP.2 review opens the job form pre-filled; dismiss removes the draft", async ({ page }) => {
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByTestId("email-draft")).toHaveCount(0);

    await page.goto("/jobs");   // the init script restores the draft
    await page.getByRole("button", { name: "Review and log" }).click();
    await expect(page).toHaveURL(/\/jobs\/new$/);
    await expect(page.locator('input[value="Cool Air LLC"]')).toBeVisible();
    await expect(page.locator('input[value="189.00"]')).toBeVisible();
  });
});

test("CAP.3 the panel is hidden with no inbox domain and no drafts", async ({ page }) => {
  await setup(page, { __e2e_inbox: { domain: "", drafts: [] } });
  await page.goto("/jobs");
  await expect(page.getByRole("heading", { name: /open jobs/i })).toBeVisible();
  await expect(page.getByTestId("forwarded-invoices")).toHaveCount(0);
});

test("CAP.4 a scanned label is saved as an appliance", async ({ page }) => {
  await setup(page, { __e2e_rooms: [] });
  await page.route("**/api/extract-document", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      documentType: "appliance_label", brand: "Rheem", modelNumber: "XE50T10H45U0", serialNumber: "Q151400123",
      purchaseDate: "2024-05-01", warrantyMonths: 72, applianceType: "Water Heater", manufactureYear: 2014,
      confidence: "high", description: "Rheem 50-gallon electric water heater label",
    }),
  }));
  await page.goto("/warranties");
  await page.locator('input[type="file"]').setInputFiles({ name: "label.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff]) });
  await expect(page.locator('input[value="XE50T10H45U0"]')).toBeVisible();
  await page.getByLabel("New room name").fill("Garage");
  await page.getByRole("button", { name: "Save as appliance" }).click();
  await expect(page.getByText("Saved as an appliance in Garage.")).toBeVisible();
  const fixture = await page.evaluate(() => (window as any).__e2e_rooms[0].fixtures[0]);
  expect(fixture).toMatchObject({ brand: "Rheem", model: "XE50T10H45U0", installedDate: "2024-05-01", warrantyExpiry: "2030-05-01" });
});

test("CAP.5 the brief flags a possible recall", async ({ page }) => {
  await setup(page, {
    __e2e_rooms: [{
      id: "R1", propertyId: "1", owner: "", name: "Garage", floorName: "", floorType: "", paintColor: "", paintBrand: "",
      paintCode: "", notes: "", createdAt: 0, updatedAt: 0,
      fixtures: [{ id: "F1", brand: "Rheem", model: "XG40T06EC36U1", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "" }],
    }],
    __e2e_recalls: [{
      brand: "Rheem", model: "XG40T06EC36U1",
      recalls: [{ id: "9001", number: "24-123", date: "2024-03-07", title: "Rheem Recalls Gas Water Heaters", url: "https://www.cpsc.gov/Recalls/2024/x", hazard: "", remedy: "Repair" }],
    }],
  });
  await page.goto("/dashboard");
  await expect(page.getByTestId("home-brief")).toContainText(
    "A safety recall may cover your Rheem XG40T06EC36U1: Rheem Recalls Gas Water Heaters. Compare the model numbers on the notice.",
  );
});

test("CAP.6 scanning a label fills the fixture form", async ({ page }) => {
  await setup(page, {
    __e2e_rooms: [{
      id: "R1", propertyId: "1", owner: "", name: "Garage", floorName: "", floorType: "", paintColor: "", paintBrand: "",
      paintCode: "", notes: "", createdAt: 0, updatedAt: 0, fixtures: [],
    }],
  });
  await page.route("**/api/extract-document", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      documentType: "appliance_label", brand: "Rheem", modelNumber: "XE50T10H45U0", serialNumber: "Q151400123",
      applianceType: "Water Heater", manufactureYear: 2014, confidence: "high", description: "Rheem label",
    }),
  }));
  await page.goto("/properties/1");
  await page.getByRole("button", { name: /^Rooms \(1\)/ }).click();
  await page.getByRole("button", { name: "+ Add", exact: true }).click();
  await page.getByLabel("Photo of the appliance label").setInputFiles({ name: "label.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff]) });
  await expect(page.locator('input[value="XE50T10H45U0"]')).toBeVisible();
  await expect(page.locator('input[value="Rheem"]')).toBeVisible();
  const offer = page.getByLabel(/Use 2014 \(the year made, from the label\) as the Water Heater install year/);
  await expect(offer).toBeChecked();
  await page.getByRole("button", { name: "Add fixture" }).click();
  const ages = await page.evaluate(() => localStorage.getItem("homegentic_system_ages_1"));
  expect(JSON.parse(ages ?? "{}")).toEqual({ "Water Heater": 2014 });
});
