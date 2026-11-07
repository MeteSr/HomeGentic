import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

const DOCS = {
  docs_1: [
    {
      id: "D1",
      jobId: "docs_1",
      propertyId: "1",
      phase: "PostConstruction",
      description: "[Deed] deed-2019.pdf",
      hash: "a".repeat(64),
      url: "",
      size: 2048,
      verified: false,
      createdAt: 3,
    },
    {
      id: "D2",
      jobId: "docs_1",
      propertyId: "1",
      phase: "PostConstruction",
      description: "[Insurance] declarations-2026.pdf",
      hash: "b".repeat(64),
      url: "",
      size: 4096,
      verified: false,
      createdAt: 2,
    },
    {
      id: "D3",
      jobId: "docs_1",
      propertyId: "1",
      phase: "PostConstruction",
      description: "[Receipt] water-heater.pdf",
      hash: "c".repeat(64),
      url: "",
      size: 1024,
      verified: false,
      createdAt: 1,
    },
  ],
  receipts_1: [],
};

test.describe("Property documents — home document vault", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Pro");
    await page.addInitScript((docs) => {
      (window as any).__e2e_baseline_photos = docs;
    }, DOCS);
    await page.goto("/properties/1");
    await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
    await page.getByRole("button", { name: "Documents", exact: true }).click();
  });

  test("lists home papers under their groups", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Ownership and closing" })).toBeVisible();
    await expect(page.getByText("deed-2019.pdf")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Insurance and risk" })).toBeVisible();
    await expect(page.getByText("declarations-2026.pdf")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Work records" })).toBeVisible();
  });

  test("offers deed, closing papers and policies as document types", async ({ page }) => {
    const picker = page.getByLabel("Document type");
    await expect(picker).toBeVisible();
    await picker.selectOption("Closing");
    await expect(picker).toHaveValue("Closing");
    for (const label of ["Deed", "Title policy", "Insurance policy", "HOA documents"]) {
      await expect(picker.locator("option", { hasText: label })).toHaveCount(1);
    }
  });

  test("says who can see the files", async ({ page }) => {
    await expect(page.getByText(/who can see these files/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove deed-2019.pdf" })).toBeVisible();
  });
});
