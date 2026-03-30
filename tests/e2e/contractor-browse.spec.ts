import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

async function injectContractors(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_contractors = [
      {
        id: "c1", principal: "contractor-1",
        name: "Cool Air Services", specialty: "HVAC",
        serviceArea: "Austin, TX", trustScore: 92, reviewCount: 45,
        jobsCompleted: 120, isVerified: true,
        yearsInBusiness: 12, licenseNumber: "TX-HVAC-001",
        description: "Expert HVAC installation and repair.",
        createdAt: 0,
      },
      {
        id: "c2", principal: "contractor-2",
        name: "Top Roof Co", specialty: "Roofing",
        serviceArea: "Austin, TX", trustScore: 88, reviewCount: 30,
        jobsCompleted: 80, isVerified: true,
        yearsInBusiness: 8, licenseNumber: "TX-ROOF-002",
        description: "Full roof replacement specialists.",
        createdAt: 0,
      },
      {
        id: "c3", principal: "contractor-3",
        name: "Flow Masters", specialty: "Plumbing",
        serviceArea: "Austin, TX", trustScore: 79, reviewCount: 20,
        jobsCompleted: 55, isVerified: false,
        yearsInBusiness: 5, licenseNumber: "TX-PLMB-003",
        description: "Residential plumbing repair.",
        createdAt: 0,
      },
    ];
  });
}

test.describe("ContractorBrowsePage — /contractors", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectContractors(page);
    await page.goto("/contractors");
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /contractor|find/i }).first()).toBeVisible();
  });

  test("shows search input", async ({ page }) => {
    await expect(page.getByRole("textbox")).toBeVisible();
  });

  // ── Specialty filter chips ────────────────────────────────────────────────

  test("shows 'All' filter chip", async ({ page }) => {
    await expect(page.getByText("All")).toBeVisible();
  });

  test("shows 'HVAC' specialty chip", async ({ page }) => {
    await expect(page.getByText("HVAC").first()).toBeVisible();
  });

  test("shows 'Roofing' specialty chip", async ({ page }) => {
    await expect(page.getByText("Roofing").first()).toBeVisible();
  });

  test("shows 'Plumbing' specialty chip", async ({ page }) => {
    await expect(page.getByText("Plumbing").first()).toBeVisible();
  });

  // ── Contractor cards ──────────────────────────────────────────────────────

  test("shows Cool Air Services contractor card", async ({ page }) => {
    await expect(page.getByText("Cool Air Services")).toBeVisible();
  });

  test("shows Top Roof Co contractor card", async ({ page }) => {
    await expect(page.getByText("Top Roof Co")).toBeVisible();
  });

  test("shows Flow Masters contractor card", async ({ page }) => {
    await expect(page.getByText("Flow Masters")).toBeVisible();
  });

  // ── Search filtering ──────────────────────────────────────────────────────

  test("typing in search hides non-matching contractors", async ({ page }) => {
    await page.getByRole("textbox").fill("Cool Air");
    await expect(page.getByText("Cool Air Services")).toBeVisible();
    await expect(page.getByText("Top Roof Co")).not.toBeVisible();
  });

  test("clearing search shows all contractors again", async ({ page }) => {
    await page.getByRole("textbox").fill("xyz-no-match");
    await expect(page.getByText("Cool Air Services")).not.toBeVisible();
    await page.getByRole("textbox").fill("");
    await expect(page.getByText("Cool Air Services")).toBeVisible();
  });

  // ── Specialty filter ──────────────────────────────────────────────────────

  test("clicking HVAC chip shows only HVAC contractors", async ({ page }) => {
    await page.getByText("HVAC").first().click();
    await expect(page.getByText("Cool Air Services")).toBeVisible();
    await expect(page.getByText("Top Roof Co")).not.toBeVisible();
  });

  // ── Card navigation ───────────────────────────────────────────────────────

  test("clicking a contractor card navigates to /contractor/:id", async ({ page }) => {
    await page.getByText("Cool Air Services").click();
    await expect(page).toHaveURL(/\/contractor\//);
  });
});
