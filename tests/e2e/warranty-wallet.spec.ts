import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

async function injectWarrantyData(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    // Pro tier subscription so UpgradeGate does not block
    (window as any).__e2e_subscription = { tier: "Pro", expiresAt: null };

    (window as any).__e2e_properties = [
      {
        id: 1, owner: "test-e2e-principal",
        address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
        propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
        verificationLevel: "Unverified", tier: "Pro",
        createdAt: 0, updatedAt: 0, isActive: true,
      },
    ];

    const now = Date.now();
    const MS  = 1000 * 60 * 60 * 24 * 30;

    (window as any).__e2e_jobs = [
      // Active warranty (24 months from 18 months ago → 6 months left)
      {
        id: "w1", propertyId: "1", homeowner: "test-e2e-principal",
        serviceType: "HVAC", contractorName: "Cool Air Services",
        amount: 240_000, date: new Date(now - MS * 18).toISOString().slice(0, 10),
        description: "HVAC replacement with warranty.",
        isDiy: false, status: "verified", verified: true,
        homeownerSigned: true, contractorSigned: true,
        warrantyMonths: 24,
        photos: [], createdAt: now - MS * 18,
      },
      // Expiring warranty (12 months from 11.5 months ago → ~15 days left)
      {
        id: "w2", propertyId: "1", homeowner: "test-e2e-principal",
        serviceType: "Roofing", contractorName: "Top Roof Co",
        amount: 850_000, date: new Date(now - MS * 11 - 86_400_000 * 15).toISOString().slice(0, 10),
        description: "Roof replacement — expiring soon.",
        isDiy: false, status: "verified", verified: true,
        homeownerSigned: true, contractorSigned: true,
        warrantyMonths: 12,
        photos: [], createdAt: now - MS * 11,
      },
      // Expired warranty (12 months from 14 months ago)
      {
        id: "w3", propertyId: "1", homeowner: "test-e2e-principal",
        serviceType: "Plumbing", contractorName: "Flow Masters",
        amount: 65_000, date: new Date(now - MS * 14).toISOString().slice(0, 10),
        description: "Plumbing fix — warranty expired.",
        isDiy: false, status: "verified", verified: true,
        homeownerSigned: true, contractorSigned: true,
        warrantyMonths: 12,
        photos: [], createdAt: now - MS * 14,
      },
    ];
  });
}

async function injectFreeUser(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_subscription = { tier: "Free", expiresAt: null };
    (window as any).__e2e_properties = [];
    (window as any).__e2e_jobs = [];
  });
}

test.describe("WarrantyWalletPage — /warranties", () => {
  // ── Free tier — upgrade gate ──────────────────────────────────────────────

  test.describe("Free tier shows upgrade gate", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await injectFreeUser(page);
      await page.goto("/warranties");
    });

    test("shows upgrade prompt for Free users", async ({ page }) => {
      await expect(page.getByText(/upgrade|pro|warranty wallet/i).first()).toBeVisible();
    });

    test("does not show 'Your Warranties' heading on Free tier", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /your warranties/i })).not.toBeVisible();
    });
  });

  // ── Pro tier — full page ──────────────────────────────────────────────────

  test.describe("Pro tier with warranty data", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await injectWarrantyData(page);
      await page.goto("/warranties");
    });

    test("shows 'Warranty Wallet' eyebrow label", async ({ page }) => {
      await expect(page.getByText("Warranty Wallet")).toBeVisible();
    });

    test("shows 'Your Warranties' heading", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /your warranties/i })).toBeVisible();
    });

    test("shows HVAC warranty entry", async ({ page }) => {
      await expect(page.getByText("HVAC")).toBeVisible();
    });

    test("shows Roofing warranty entry", async ({ page }) => {
      await expect(page.getByText("Roofing")).toBeVisible();
    });

    test("shows Plumbing warranty entry", async ({ page }) => {
      await expect(page.getByText("Plumbing")).toBeVisible();
    });

    test("shows Active badge for HVAC", async ({ page }) => {
      await expect(page.getByText("Active")).toBeVisible();
    });

    test("shows Expiring Soon badge for Roofing", async ({ page }) => {
      await expect(page.getByText("Expiring Soon")).toBeVisible();
    });

    test("shows Expired badge for Plumbing", async ({ page }) => {
      await expect(page.getByText("Expired")).toBeVisible();
    });

    test("shows contractor names", async ({ page }) => {
      await expect(page.getByText("Cool Air Services")).toBeVisible();
    });

    test("Back button is visible", async ({ page }) => {
      await expect(page.getByText(/back/i)).toBeVisible();
    });
  });
});
