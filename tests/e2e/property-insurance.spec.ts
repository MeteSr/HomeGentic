import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

// #711: the home's insurance policy, claim kit and contents inventory on the
// property page (Insurance tab). window.__e2e_insurance_policies /
// __e2e_insurance_claims / __e2e_inventory / __e2e_rooms stand in for the
// property canister.

async function openInsuranceTab(
  page: import("@playwright/test").Page,
  policies: Record<string, unknown>,
  claims: Record<string, unknown[]> = {},
  photos: Record<string, unknown[]> = {},
  extra: { inventory?: Record<string, unknown[]>; rooms?: unknown[] } = {},
) {
  await injectTestAuth(page);
  await injectTestProperties(page);
  await injectSubscription(page, "Pro");
  await page.addInitScript(
    ({ p, c, ph, inv, rooms }) => {
      (window as any).__e2e_insurance_policies = p;
      (window as any).__e2e_insurance_claims = c;
      (window as any).__e2e_inventory = inv;
      if (rooms) (window as any).__e2e_rooms = rooms;
      if (Object.keys(ph).length) (window as any).__e2e_baseline_photos = ph;
    },
    { p: policies, c: claims, ph: photos, inv: extra.inventory ?? {}, rooms: extra.rooms ?? null },
  );
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

const CLAIM = {
  id: "claim-1",
  propertyId: "1",
  title: "Kitchen ceiling leak",
  dateOfLoss: "2026-09-28",
  cause: "Water leak",
  description: "Water through the ceiling",
  claimNumber: "CLM-778",
  adjusterName: "Dana Ruiz",
  adjusterContact: "dana@example.com",
  status: "open",
  log: [{ date: "2026-09-29", note: "Reported by phone", addedAt: 1 }],
  createdAt: 1,
  updatedAt: 1,
};

test.describe("Insurance claim kit", () => {
  test("starts a claim record and logs a dated entry", async ({ page }) => {
    await openInsuranceTab(page, {});
    await expect(page.getByText("No claim records yet.")).toBeVisible();
    await expect(page.getByText(/doesn't file or follow up on claims/i)).toBeVisible();

    await page.getByRole("button", { name: "Start a claim record" }).click();
    await page.getByLabel("Title", { exact: true }).fill("Roof shingles blown off");
    await page.getByLabel("Date of loss").fill("2026-10-10");
    await page.getByLabel("Cause").selectOption("Wind or hurricane");
    await page.getByLabel("Claim number").fill("CLM-900");
    await page.getByRole("button", { name: "Save claim" }).click();

    const card = page.getByRole("article", { name: "Roof shingles blown off" });
    await expect(card).toBeVisible();
    await expect(card.getByText(/Loss on Oct 10, 2026/)).toBeVisible();

    await card.getByLabel("Log date").fill("2026-10-11");
    await card.getByLabel("What happened on this date").fill("Called the insurer");
    await card.getByRole("button", { name: "Add to log" }).click();
    await expect(card.getByText("Called the insurer")).toBeVisible();
  });

  test("shows dated damage photos and pre-fills a repair quote", async ({ page }) => {
    await openInsuranceTab(
      page,
      {},
      { "1": [CLAIM] },
      {
        "claim_claim-1": [
          {
            id: "ph1",
            jobId: "claim_claim-1",
            propertyId: "1",
            phase: "PreConstruction",
            description: "Damage photo: ceiling.jpg",
            hash: "a".repeat(64),
            url: "",
            size: 100,
            verified: false,
            createdAt: Date.UTC(2026, 8, 29, 15),
          },
        ],
      },
    );
    const card = page.getByRole("article", { name: "Kitchen ceiling leak" });
    await expect(card.getByText("Reported by phone")).toBeVisible();
    await expect(card.getByText(/Uploaded Sep 29, 2026/)).toBeVisible();

    await card.getByRole("button", { name: "Get repair quotes" }).click();
    await expect(page).toHaveURL(/\/quotes\/new/);
    await expect(page.locator("textarea").first()).toHaveValue(/Repair needed after: Kitchen ceiling leak/);
  });
});

const ROOMS = [
  { id: "ROOM_1", propertyId: "1", name: "Living room", floorType: "", paintColor: "", paintBrand: "", paintCode: "", notes: "", owner: "", fixtures: [], createdAt: 0, updatedAt: 0 },
  { id: "ROOM_2", propertyId: "1", name: "Bedroom", floorType: "", paintColor: "", paintBrand: "", paintCode: "", notes: "", owner: "", fixtures: [], createdAt: 0, updatedAt: 0 },
];

const TV = {
  id: "item-tv",
  propertyId: "1",
  roomId: "ROOM_1",
  name: "65-inch TV",
  category: "Electronics",
  quantity: 1,
  valueCents: 129_900,
  purchaseDate: "2024-11-29",
  serialNumber: "SN-123",
  notes: "",
  createdAt: 1,
  updatedAt: 1,
};

test.describe("Contents inventory", () => {
  test("adds an item to a room and totals the home", async ({ page }) => {
    await openInsuranceTab(page, {}, {}, {}, { inventory: { "1": [TV] }, rooms: ROOMS });
    await expect(page.getByRole("region", { name: "Living room" }).getByText("65-inch TV")).toBeVisible();
    await expect(page.getByText("1 item · $1,299 listed")).toBeVisible();

    await page.getByRole("button", { name: "Add an item" }).click();
    await page.getByLabel("Item", { exact: true }).fill("Dining chair");
    await page.getByLabel("Room", { exact: true }).selectOption({ label: "Bedroom" });
    await page.getByLabel("Category").fill("Furniture");
    await page.getByLabel("Quantity").fill("4");
    await page.getByLabel("Value each ($)").fill("150");
    await page.getByRole("button", { name: "Save item" }).click();

    const bedroom = page.getByRole("region", { name: "Bedroom" });
    await expect(bedroom.getByText("Dining chair")).toBeVisible();
    await expect(bedroom.getByText("4 × $150 = $600")).toBeVisible();
    await expect(page.getByText("2 items · $1,899 listed")).toBeVisible();
  });

  test("refuses an item with no name", async ({ page }) => {
    await openInsuranceTab(page, {}, {}, {}, { rooms: ROOMS });
    await expect(page.getByText("Nothing listed yet.")).toBeVisible();
    await page.getByRole("button", { name: "Add an item" }).click();
    await page.getByRole("button", { name: "Save item" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Name the item" })).toBeVisible();
  });

  test("moves an item to another room", async ({ page }) => {
    await openInsuranceTab(page, {}, {}, {}, { inventory: { "1": [TV] }, rooms: ROOMS });
    await page.getByRole("button", { name: "Edit 65-inch TV" }).click();
    await page.getByLabel("Room", { exact: true }).selectOption({ label: "Bedroom" });
    await page.getByRole("button", { name: "Save item" }).click();
    await expect(page.getByRole("region", { name: "Bedroom" }).getByText("65-inch TV")).toBeVisible();
    await expect(page.getByRole("region", { name: "Living room" })).toHaveCount(0);
  });

  test("downloads the inventory as CSV", async ({ page }) => {
    await openInsuranceTab(page, {}, {}, {}, { inventory: { "1": [TV] }, rooms: ROOMS });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("home-inventory.csv");
  });

  test("deletes an item after confirming", async ({ page }) => {
    await openInsuranceTab(page, {}, {}, {}, { inventory: { "1": [TV] }, rooms: ROOMS });
    await page.getByRole("button", { name: "Delete 65-inch TV" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page.getByText("Nothing listed yet.")).toBeVisible();
  });
});
