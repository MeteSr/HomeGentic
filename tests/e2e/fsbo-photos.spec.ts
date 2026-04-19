/**
 * E2E tests — issue #114: FSBO listing photos
 *
 * Covers:
 *  1. Public listing page (/for-sale/:propertyId) renders the photo gallery
 *     when photos are injected via __e2e_listing_photos.
 *  2. Owner manager page (/my-listing/:propertyId) shows the photo upload
 *     section in the live dashboard.
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectFsboPhotos, injectSubscription } from "./helpers/testData";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Activate a live FSBO record in the service layer mock. */
async function injectFsboRecord(page: Parameters<typeof injectTestAuth>[0], propertyId = "1") {
  await page.addInitScript((pid: string) => {
    (window as any).__e2e_fsbo = {
      [pid]: {
        propertyId: pid,
        isFsbo:         true,
        listPriceCents: 45_000_000,
        activatedAt:    Date.now() - 86_400_000 * 7,
        step:           "done",
        hasReport:      false,
        description:    "Beautiful family home in Austin.",
      },
    };
  }, propertyId);
}

/** Minimal property shape needed by FsboListingPage. */
async function injectFsboProperty(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_properties = [
      {
        id: 1, owner: "test-e2e-principal",
        address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
        propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
        verificationLevel: "Unverified", tier: "Pro",
        createdAt: 0, updatedAt: 0, isActive: true,
      },
    ];
    (window as any).__e2e_jobs = [];
  });
}

// ─── Public listing gallery ───────────────────────────────────────────────────

test.describe("FsboListingPage — photo gallery", () => {
  test.beforeEach(async ({ page }) => {
    await injectFsboProperty(page);
    await injectFsboRecord(page);
    await injectFsboPhotos(page, "1");
  });

  test("renders the gallery section", async ({ page }) => {
    await page.goto("/for-sale/1");
    await expect(page.getByTestId("listing-gallery-section")).toBeVisible();
  });

  test("shows the photo grid when listing photos are present", async ({ page }) => {
    await page.goto("/for-sale/1");
    await expect(page.getByTestId("listing-photo-grid")).toBeVisible();
  });

  test("does not show the upload button (guest view)", async ({ page }) => {
    await page.goto("/for-sale/1");
    await expect(page.getByTestId("upload-listing-photo-btn")).not.toBeVisible();
  });
});

test.describe("FsboListingPage — empty photo state", () => {
  test.beforeEach(async ({ page }) => {
    await injectFsboProperty(page);
    await injectFsboRecord(page);
    // No photos injected
  });

  test("shows the empty state placeholder", async ({ page }) => {
    await page.goto("/for-sale/1");
    await expect(page.getByTestId("listing-photo-empty")).toBeVisible();
  });
});

// ─── Owner manager dashboard ──────────────────────────────────────────────────

test.describe("FsboListingManagerPage — listing photos section", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Pro");
    await injectFsboRecord(page);
    await injectFsboPhotos(page, "1");
  });

  test("shows the listing-photos-section in the live dashboard", async ({ page }) => {
    await page.goto("/my-listing/1");
    await expect(page.getByTestId("listing-photos-section")).toBeVisible();
  });

  test("shows the Add Photos button for the owner", async ({ page }) => {
    await page.goto("/my-listing/1");
    await expect(page.getByTestId("upload-listing-photo-btn")).toBeVisible();
  });

  test("shows the photo grid with injected photos", async ({ page }) => {
    await page.goto("/my-listing/1");
    await expect(page.getByTestId("listing-photo-grid")).toBeVisible();
  });
});
