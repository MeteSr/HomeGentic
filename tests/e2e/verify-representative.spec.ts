/**
 * Representative claim E2E — /properties/:id/verify/representative
 * (test-gap audit 2026-11-03, L5). Reached from the claim and document steps
 * when the property is held by an entity or the names don't match.
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

const NOW = Date.now();
const CLAIM = {
  propertyId: "1",
  address: "412 Elder St",
  city: "Nashville",
  state: "TN",
  verificationLevel: "Unverified",
  claimStartedAt: NOW - 30 * 60 * 1000,
  claimWindowEndsAt: NOW + 71.5 * 60 * 60 * 1000,
  identityVerified: true,
  nameOnId: "Dana R. Whitfield",
  currentStep: "document",
};

async function open(page: import("@playwright/test").Page, claim: Record<string, unknown>) {
  await injectTestAuth(page);
  await injectSubscription(page, "Pro");
  await injectTestProperties(page);
  await page.addInitScript((s) => {
    (window as any).__e2e_verify_status = s;
  }, claim);
  await page.goto("/properties/1/verify/representative");
}

test.describe("Representative claim", () => {
  test("REP-1 shows the manual-review heading and the four relationships", async ({ page }) => {
    await open(page, CLAIM);
    await expect(page.getByRole("heading", { name: "Held for a person to check." })).toBeVisible();
    for (const label of [
      "Officer or member of an LLC",
      "Trustee of a trust",
      "Power of attorney",
      "Executor or heir",
    ]) {
      await expect(page.getByText(label)).toBeVisible();
    }
  });

  test("REP-2 the send button waits for a relationship and a document", async ({ page }) => {
    await open(page, CLAIM);
    const send = page.getByRole("button", { name: "Send to manual review" });
    await expect(send).toBeDisabled();

    await page.getByRole("radio", { name: /Trustee of a trust/ }).check();
    await expect(send).toBeDisabled();

    await page.locator('input[type="file"]').setInputFiles({
      name: "trust-certificate.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 trust certificate"),
    });
    await expect(page.getByText("trust-certificate.pdf")).toBeVisible();
    await expect(send).toBeEnabled();
  });

  test("REP-3 removing the document disables sending again", async ({ page }) => {
    await open(page, CLAIM);
    await page.getByRole("radio", { name: /Power of attorney/ }).check();
    await page.locator('input[type="file"]').setInputFiles({
      name: "poa.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 poa"),
    });
    await page.getByRole("button", { name: "×" }).click();
    await expect(page.getByText("poa.pdf")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send to manual review" })).toBeDisabled();
  });

  test("REP-4 a name mismatch is shown with both names", async ({ page }) => {
    await open(page, { ...CLAIM, nameOnDocument: "Whitfield Family Trust" });
    await expect(page.getByText("The names do not match, so a person will look at it.")).toBeVisible();
    await expect(page.getByText(/ID: Dana R\. Whitfield · Document: Whitfield Family Trust/)).toBeVisible();
  });

  test("REP-5 no mismatch banner when there are no names to compare", async ({ page }) => {
    await open(page, { ...CLAIM, nameOnId: undefined });
    await expect(page.getByRole("heading", { name: "Held for a person to check." })).toBeVisible();
    await expect(page.getByText("The names do not match, so a person will look at it.")).toHaveCount(0);
  });
});
