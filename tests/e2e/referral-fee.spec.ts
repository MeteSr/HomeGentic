/**
 * Contractor Free referral fee E2E (3% of an accepted bid, $20 minimum)
 *
 * RF.1  Contractor dashboard: Contractor Free with no saved card is told to save one
 * RF.2  Settings: the card form opens only after the terms box is ticked
 * RF.3  Settings: the fee ledger shows when each fee is charged and links a declined fee's invoice
 * RF.4  Contractor profile: contact details are held back while the homeowner has an open request in that trade
 * RF.5  Terms of Service: the referral fee section
 *
 * window.__e2e_* globals stand in for the canisters and the voice Worker:
 * __e2e_subscription, __e2e_referral_card, __e2e_referral_fees,
 * __e2e_referral_card_url (where "Save card with Stripe" goes),
 * __e2e_contractors and __e2e_quote_requests.
 */

import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectContractors, injectQuoteRequests, injectSubscription } from "./helpers/testData";

async function asContractor(page: Page, extra: Record<string, unknown> = {}) {
  await injectTestAuth(page);
  await injectSubscription(page, "Free");
  await page.addInitScript((extra) => {
    const w = window as any;
    w.__e2e_properties = [];
    w.__e2e_jobs = [];
    w.__e2e_profile = {
      principal: "test-e2e-principal", role: "Contractor", email: "pro@example.com", phone: "",
      createdAt: BigInt(0), updatedAt: BigInt(0), isActive: true, lastLoggedIn: null,
    };
    Object.assign(w, extra);
  }, extra);
}

const HVAC_PRO = {
  id: "hvac-pro", name: "Cool Air Co", specialties: ["HVAC"], email: "hello@coolair.test", phone: "386-555-0199",
  bio: null, licenseNumber: null, serviceArea: null, serviceZips: [], trustScore: 70, jobsCompleted: 3, isVerified: false, createdAt: 0,
};

const NOW = Date.now();
const DAY = 86_400_000;
const FEE = {
  quoteId: "QUOTE_1", requestId: "REQ_1", contractor: "test-e2e-principal", homeowner: "h", propertyId: "p",
  serviceType: "HVAC", bidCents: 184_000, feeCents: 5_520, reason: "verified_job",
  acceptedAt: NOW, jobId: null, dueAt: null, paymentRef: "", payUrl: "", failedAt: null, createdAt: NOW,
};

test("RF.1 a Contractor Free contractor without a card is told to save one", async ({ page }) => {
  await asContractor(page);
  await injectContractors(page, [{ ...HVAC_PRO, id: "test-e2e-principal" }]);
  await page.goto("/contractor-dashboard");
  const banner = page.getByTestId("referral-card-needed");
  await expect(banner).toContainText("Save a card before you bid.");
  await banner.getByRole("link", { name: "Save a card" }).click();
  await expect(page).toHaveURL(/\/settings\?tab=subscription/);
});

test("RF.2 the card form opens only after the terms are ticked", async ({ page }) => {
  await asContractor(page, { __e2e_referral_card_url: "/settings?tab=subscription&referral_card=saved" });
  await page.goto("/settings?tab=subscription");
  const box = page.getByTestId("referral-card");
  await expect(box).toContainText("Save a card before you bid");
  const save = box.getByRole("button", { name: "Save card with Stripe" });
  await expect(save).toBeDisabled();
  await box.getByRole("checkbox").check();
  await save.click();
  await expect(page).toHaveURL(/referral_card=saved/);
  await expect(page.getByTestId("referral-card")).toContainText("Stripe has your card.");
});

test("RF.3 the ledger says when each fee is charged and links a declined fee's invoice", async ({ page }) => {
  await asContractor(page, {
    __e2e_referral_card: { brand: "visa", last4: "4242", agreedAt: NOW - 5 * DAY, termsVersion: "2026-10-26" },
    __e2e_referral_fees: [
      { ...FEE, id: "RF_1", status: "Pending" },
      { ...FEE, id: "RF_2", status: "PaymentFailed", failedAt: NOW, payUrl: "https://invoice.stripe.com/i/test", serviceType: "Plumbing" },
    ],
  });
  await page.goto("/settings?tab=subscription");
  await expect(page.getByTestId("referral-card")).toContainText("ending 4242");
  await expect(page.getByText(/Charged when the job is verified, or on/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Pay invoice" })).toHaveAttribute("href", "https://invoice.stripe.com/i/test");
  await expect(page.getByTestId("referral-card-needed")).toHaveCount(0);
});


test("RF.4a a homeowner with an open HVAC request sees bids, not the HVAC contractor's phone", async ({ page }) => {
  await injectTestAuth(page);
  await injectContractors(page, [HVAC_PRO]);
  await injectQuoteRequests(page, [
    { id: "REQ_9", propertyId: "p1", homeowner: "test-e2e-principal", serviceType: "HVAC", urgency: "medium", description: "AC not cooling", status: "quoted", createdAt: NOW },
  ]);
  await page.goto("/contractor/hvac-pro");
  await expect(page.getByTestId("contact-held")).toContainText("You have an open HVAC request");
  await expect(page.getByText("386-555-0199")).toHaveCount(0);
});

test("RF.4b with no open request in that trade the contact details show", async ({ page }) => {
  await injectTestAuth(page);
  await injectContractors(page, [HVAC_PRO]);
  await injectQuoteRequests(page, [
    { id: "REQ_8", propertyId: "p1", homeowner: "test-e2e-principal", serviceType: "Roofing", urgency: "low", description: "Leak", status: "open", createdAt: NOW },
    { id: "REQ_7", propertyId: "p1", homeowner: "test-e2e-principal", serviceType: "HVAC", urgency: "low", description: "Tune-up", status: "accepted", createdAt: NOW },
  ]);
  await page.goto("/contractor/hvac-pro");
  await expect(page.getByText("386-555-0199")).toBeVisible();
  await expect(page.getByTestId("contact-held")).toHaveCount(0);
});

test("RF.5 the Terms of Service explain the referral fee", async ({ page }) => {
  await page.goto("/terms#referral-fee");
  const section = page.locator("#referral-fee");
  await expect(section).toContainText("3% of the bid amount, or $20, whichever is greater");
  await expect(section).toContainText("within 6 months");
});
