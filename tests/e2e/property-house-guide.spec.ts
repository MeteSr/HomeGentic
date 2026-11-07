import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

// #725: the house guide on the property page (House guide tab) and the public
// /guide/:token page. window.__e2e_house_guides / __e2e_guide_links stand in
// for the property canister.

const GUIDE = {
  wifiName: "Maple Guest",
  wifiPassword: "sunny porch",
  alarm: "Panel by the garage door. Code 4821, then OFF.",
  trashDay: "Tuesday night",
  recyclingDay: "Every other Friday",
  waterShutoff: "Garage, left wall, red handle",
  gasShutoff: "",
  electricPanel: "Hall closet",
  contacts: [{ name: "Ana", role: "Spare key", phone: "512-555-0142" }],
  notes: "Feed the cat at 7am and 6pm.",
  photoIds: [],
};
const TOKEN = "ab".repeat(32);
const DAY = 86_400_000;

async function seed(page: import("@playwright/test").Page, guides: Record<string, unknown>, links: unknown[] = []) {
  await injectTestProperties(page);
  await page.addInitScript(
    ({ g, l }) => {
      (window as any).__e2e_house_guides = g;
      (window as any).__e2e_guide_links = l;
    },
    { g: guides, l: links },
  );
}

test.describe("House guide tab", () => {
  test("writes a guide and shares it with a link that can be turned off", async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Pro");
    await seed(page, {});
    await page.goto("/properties/1");
    await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
    await page.getByRole("button", { name: "House guide", exact: true }).click();

    await expect(page.getByText(/stored exactly as you type it/i)).toBeVisible();
    await page.getByLabel("Wi-Fi network").fill("Maple Guest");
    await page.getByLabel("Wi-Fi password").fill("sunny porch");
    await page.getByLabel("Trash day").fill("Tuesday night");
    await page.getByRole("button", { name: "Add a contact" }).click();
    await page.getByLabel("Contact 1 name").fill("Ana");
    await page.getByLabel("Contact 1 phone").fill("512-555-0142");
    await page.getByRole("button", { name: "Save guide" }).click();

    await expect(page.getByText("sunny porch")).toBeVisible();
    await page.getByLabel("Who is it for?").fill("Cat sitter");
    await page.getByLabel("Link lasts").selectOption("3");
    await page.getByRole("button", { name: "Create link" }).click();
    const link = page.getByLabel("Link for Cat sitter");
    await expect(link).toHaveValue(/\/guide\/[0-9a-f]{64}$/);
    await page.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByText("Turned off")).toBeVisible();
  });

  test("refuses an empty guide", async ({ page }) => {
    await injectTestAuth(page);
    await seed(page, {});
    await page.goto("/properties/1");
    await page.getByRole("button", { name: "House guide", exact: true }).click();
    await page.getByRole("button", { name: "Save guide" }).click();
    await expect(page.getByRole("alert")).toContainText(/at least one part/i);
  });
});

test.describe("Shared house guide page", () => {
  test("shows the guide and address to anyone with a live link", async ({ page }) => {
    const now = Date.now();
    await seed(page, { "1": GUIDE }, [
      { token: TOKEN, propertyId: "1", name: "Sitter", createdAt: now, expiresAt: now + 7 * DAY, revoked: false },
    ]);
    await page.goto(`/guide/${TOKEN}`);
    await expect(page.getByRole("heading", { name: "123 Maple Street" })).toBeVisible();
    await expect(page.getByText("sunny porch")).toBeVisible();
    await expect(page.getByText("Feed the cat at 7am and 6pm.")).toBeVisible();
    await expect(page.getByRole("link", { name: "512-555-0142" })).toHaveAttribute("href", "tel:5125550142");
    await expect(page.getByText(/this link works until/i)).toBeVisible();
  });

  test("says an expired or turned-off link isn't working", async ({ page }) => {
    const now = Date.now();
    await seed(page, { "1": GUIDE }, [
      { token: TOKEN, propertyId: "1", name: "Old", createdAt: now - 9 * DAY, expiresAt: now - DAY, revoked: false },
    ]);
    await page.goto(`/guide/${TOKEN}`);
    await expect(page.getByRole("heading", { name: /isn't working/i })).toBeVisible();
    await expect(page.getByText("sunny porch")).toHaveCount(0);
  });
});
