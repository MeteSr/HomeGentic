/**
 * Property Verify v2 E2E — /properties/:id/verify/*
 *
 * Tests cover all 7 states of the ownership verification flow:
 *   State 1 — Claim opened (VerifyClaimPage)
 *   State 2 — Identity check (VerifyIdentityPage)
 *   State 3 — Document upload (VerifyDocumentPage)
 *   State 5 — Pending review (VerifyStatusPage)
 *   State 6 — Expired (VerifyExpiredPage)
 *   State 7 — Contested (VerifyContestedPage)
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth, injectSubscription } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

const BASE_NOW = Date.now();

interface VerifyClaimData {
  propertyId           : string;
  address              : string;
  city                 : string;
  state                : string;
  verificationLevel    : string;
  claimStartedAt       : number;
  claimWindowEndsAt    : number;
  identityVerified     : boolean;
  identityVerifiedAt  ?: number;
  nameOnId            ?: string;
  verificationDocHash ?: string;
  verificationMethod  ?: string;
  nameOnDocument      ?: string;
  contestedWithId     ?: string;
  conflictWindowEndsAt?: number;
  currentStep          : string;
}

const MOCK_CLAIM: VerifyClaimData = {
  propertyId       : "1",
  address          : "412 Elder St",
  city             : "Nashville",
  state            : "TN",
  verificationLevel: "Unverified",
  claimStartedAt   : BASE_NOW - 30 * 60 * 1000,
  claimWindowEndsAt: BASE_NOW + 71.5 * 60 * 60 * 1000,
  identityVerified : false,
  currentStep      : "claim",
};

// ── State 1 — Claim opened ────────────────────────────────────────────────────

test.describe("State 1 — Claim opened", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Basic");
    await injectTestProperties(page);
    await page.addInitScript((s) => { (window as any).__e2e_verify_status = s; }, MOCK_CLAIM);
    await page.goto("/properties/1/verify");
  });

  test("PV2-1.1 shows heading and countdown", async ({ page }) => {
    await expect(page.getByText("Two proofs, three days.")).toBeVisible();
    await expect(page.getByText(/LEFT/)).toBeVisible();
  });

  test("PV2-1.2 shows two proof cards", async ({ page }) => {
    await expect(page.getByText("Photo identity")).toBeVisible();
    await expect(page.getByText("Ownership document")).toBeVisible();
  });

  test("PV2-1.3 Start check navigates to identity page", async ({ page }) => {
    await page.getByRole("button", { name: /Start check/i }).click();
    await expect(page).toHaveURL(/\/verify\/identity/);
  });

  test("PV2-1.4 Upload button navigates to document page", async ({ page }) => {
    await page.getByRole("button", { name: /Upload/i }).click();
    await expect(page).toHaveURL(/\/verify\/document/);
  });

  test("PV2-1.5 shows representative link", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Verify as a representative/i })).toBeVisible();
  });
});

// ── State 2 — Identity check ─────────────────────────────────────────────────

test.describe("State 2 — Identity check", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Basic");
    await injectTestProperties(page);
    const status: VerifyClaimData = { ...MOCK_CLAIM, currentStep: "identity" };
    await page.addInitScript((s) => { (window as any).__e2e_verify_status = s; }, status);
    await page.goto("/properties/1/verify/identity");
  });

  test("PV2-2.1 shows identity check heading", async ({ page }) => {
    await expect(page.getByText("Scan your ID, then take a selfie.")).toBeVisible();
  });

  test("PV2-2.2 shows Government ID placeholder", async ({ page }) => {
    await expect(page.getByText("Government ID")).toBeVisible();
  });

  test("PV2-2.3 shows Selfie liveness placeholder", async ({ page }) => {
    await expect(page.getByText("Selfie liveness")).toBeVisible();
  });

  test("PV2-2.4 Start button exists", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Start the identity check/i })).toBeVisible();
  });

  test("PV2-2.5 Back button navigates to claim page", async ({ page }) => {
    await page.getByRole("button", { name: /Back/i }).click();
    await expect(page).toHaveURL(/\/properties\/1\/verify$/);
  });
});

// ── State 3 — Document upload ─────────────────────────────────────────────────

test.describe("State 3 — Document upload", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Basic");
    await injectTestProperties(page);
    const status: VerifyClaimData = {
      ...MOCK_CLAIM,
      identityVerified: true,
      nameOnId        : "Dana R. Whitfield",
      currentStep     : "document",
    };
    await page.addInitScript((s) => { (window as any).__e2e_verify_status = s; }, status);
    await page.goto("/properties/1/verify/document");
  });

  test("PV2-3.1 shows document upload heading", async ({ page }) => {
    await expect(page.getByText("Upload the ownership document.")).toBeVisible();
  });

  test("PV2-3.2 shows document type options", async ({ page }) => {
    await expect(page.getByText("Utility bill")).toBeVisible();
    await expect(page.getByText("Property deed")).toBeVisible();
    await expect(page.getByText("Tax record")).toBeVisible();
  });

  test("PV2-3.3 submit CTA disabled before file selected", async ({ page }) => {
    const btn = page.getByRole("button", { name: /Add a document to continue/i });
    await expect(btn).toBeDisabled();
  });

  test("PV2-3.4 shows identity cleared sidebar", async ({ page }) => {
    await expect(page.getByText("IDENTITY CLEARED")).toBeVisible();
    await expect(page.getByText("Dana R. Whitfield")).toBeVisible();
  });
});

// ── State 5 — Pending review ─────────────────────────────────────────────────

test.describe("State 5 — Pending review", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Basic");
    await injectTestProperties(page);
    const status: VerifyClaimData = {
      ...MOCK_CLAIM,
      verificationLevel  : "PendingReview",
      identityVerified   : true,
      nameOnId           : "Dana R. Whitfield",
      verificationDocHash: "a3f5c81d9b24e7f06c1a8d3b5e92f47c08b6d1a29e34f75c8b0d6a1f3e97c452",
      verificationMethod : "DeedRecord",
      currentStep        : "status",
    };
    await page.addInitScript((s) => { (window as any).__e2e_verify_status = s; }, status);
    await page.goto("/properties/1/verify/status");
  });

  test("PV2-5.1 shows pending heading", async ({ page }) => {
    await expect(page.getByText("Filed, hashed and waiting on a reviewer.")).toBeVisible();
  });

  test("PV2-5.2 shows PENDING REVIEW badge", async ({ page }) => {
    await expect(page.getByText("PENDING REVIEW")).toBeVisible();
  });

  test("PV2-5.3 shows on-chain receipt with hash", async ({ page }) => {
    await expect(page.getByText(/a3f5c81d/)).toBeVisible();
  });

  test("PV2-5.4 back to property button exists", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Back to the property/i })).toBeVisible();
  });
});

// ── State 6 — Expired ─────────────────────────────────────────────────────────

test.describe("State 6 — Expired", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Basic");
    await injectTestProperties(page);
    const status: VerifyClaimData = {
      ...MOCK_CLAIM,
      claimWindowEndsAt: BASE_NOW - 1000,
      currentStep      : "expired",
    };
    await page.addInitScript((s) => { (window as any).__e2e_verify_status = s; }, status);
    await page.goto("/properties/1/verify/expired");
  });

  test("PV2-6.1 shows expired heading", async ({ page }) => {
    await expect(page.getByText("The address went back on the market.")).toBeVisible();
  });

  test("PV2-6.2 shows CLAIM RELEASED badge", async ({ page }) => {
    await expect(page.getByText("CLAIM RELEASED")).toBeVisible();
  });

  test("PV2-6.3 shows restart CTA", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Start a new claim/i })).toBeVisible();
  });

  test("PV2-6.4 shows status items", async ({ page }) => {
    await expect(page.getByText("The address is claimable")).toBeVisible();
    await expect(page.getByText("Nothing you logged is lost")).toBeVisible();
  });
});

// ── State 7 — Contested ──────────────────────────────────────────────────────

test.describe("State 7 — Contested", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Basic");
    await injectTestProperties(page);
    const status: VerifyClaimData = {
      ...MOCK_CLAIM,
      contestedWithId: "PROP_other123",
      currentStep    : "contested",
    };
    await page.addInitScript((s) => { (window as any).__e2e_verify_status = s; }, status);
    await page.goto("/properties/1/verify/contested");
  });

  test("PV2-7.1 shows contested heading", async ({ page }) => {
    await expect(page.getByText("Two claims, one address.")).toBeVisible();
  });

  test("PV2-7.2 shows CONTESTED badge", async ({ page }) => {
    await expect(page.getByText("CONTESTED")).toBeVisible();
  });

  test("PV2-7.3 shows evidence strength bars", async ({ page }) => {
    await expect(page.getByText("STRONG")).toBeVisible();
    await expect(page.getByText("WEAK")).toBeVisible();
  });

  test("PV2-7.4 add stronger document button navigates to document page", async ({ page }) => {
    await page.getByRole("button", { name: /Add a stronger document/i }).click();
    await expect(page).toHaveURL(/\/verify\/document/);
  });
});
