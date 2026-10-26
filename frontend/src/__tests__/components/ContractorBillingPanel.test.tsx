/**
 * ContractorBillingPanel
 *
 * Covers the Contractor Plan & Billing screen: on Free, the saved card and the
 * referral-fee ledger from the fee canister (3% of the bid, $20 floor); on
 * Pro, the fees-waived panel built from accepted bids.
 *
 * Tests:
 *   - Shows a loading spinner while the fetch is in flight
 *   - Free tier: asks for a card (with the terms checkbox) before bidding; shows a saved card
 *   - Free tier: each fee's status — pending with its fallback date, paid, declined with the invoice link
 *   - Free tier: waived fees are left out; 3% fee and $20 floor (MIN badge)
 *   - Free tier: savings headline flips between "Free is cheaper" and "Pro would have saved you"
 *   - Free tier: Upgrade CTA calls onUpgradeClick
 *   - Pro tier: stats (work won / fees waived / net position) from this month's accepted bids
 *   - Pro tier: Cancel plan button and renew date
 *   - Gracefully falls back to an empty ledger when the fetch fails
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReferralFee } from "@/services/fee";
import type { Quote } from "@/services/quote";

vi.mock("@/services/fee", () => ({
  REFERRAL_FALLBACK_DAYS: 60,
  feeService: {
    getMyReferralFees:      vi.fn(),
    getMyReferralCard:      vi.fn(),
    startReferralCardSetup: vi.fn(),
  },
}));
vi.mock("@/services/quote", () => ({
  quoteService: { getMyBids: vi.fn() },
}));

import { feeService } from "@/services/fee";
import { quoteService } from "@/services/quote";
import ContractorBillingPanel from "@/components/ContractorBillingPanel";

const mockFees  = feeService.getMyReferralFees as unknown as ReturnType<typeof vi.fn>;
const mockCard  = feeService.getMyReferralCard as unknown as ReturnType<typeof vi.fn>;
const mockSetup = feeService.startReferralCardSetup as unknown as ReturnType<typeof vi.fn>;
const mockBids  = quoteService.getMyBids as unknown as ReturnType<typeof vi.fn>;

const NOW = Date.now();
const DAY = 86_400_000;
const LAST_MONTH = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15).getTime();
const CARD = { brand: "visa", last4: "4242", agreedAt: NOW - 3 * DAY, termsVersion: "2026-10-26" };

function makeFee(over: Partial<ReferralFee> = {}): ReferralFee {
  return {
    id: "RF_1", quoteId: "QUOTE_1", requestId: "REQ_1", contractor: "c", homeowner: "h", propertyId: "p",
    serviceType: "HVAC", bidCents: 184_000, feeCents: 5_520, status: "Pending", reason: "verified_job",
    acceptedAt: NOW, jobId: null, dueAt: null, paymentRef: "", payUrl: "", failedAt: null, createdAt: NOW,
    ...over,
  };
}

function makeBid(over: Partial<Quote> = {}): Quote {
  return { id: "QUOTE_1", requestId: "REQ_1", contractor: "c", amount: 184_000, timeline: 3, validUntil: NOW + DAY, status: "accepted", createdAt: NOW, ...over } as Quote;
}

function renderPanel(props: Partial<React.ComponentProps<typeof ContractorBillingPanel>> = {}) {
  const onUpgradeClick = vi.fn();
  const onCancelClick  = vi.fn();
  const utils = render(
    <MemoryRouter>
      <ContractorBillingPanel tier="ContractorFree" renewDate={null} onUpgradeClick={onUpgradeClick} onCancelClick={onCancelClick} {...props} />
    </MemoryRouter>
  );
  return { ...utils, onUpgradeClick, onCancelClick };
}

beforeEach(() => {
  mockFees.mockReset().mockResolvedValue([]);
  mockCard.mockReset().mockResolvedValue(CARD);
  mockSetup.mockReset();
  mockBids.mockReset().mockResolvedValue([]);
});

describe("ContractorBillingPanel — loading", () => {
  it("shows a spinner while the fetch is in flight", () => {
    mockFees.mockReturnValue(new Promise(() => {}));
    const { container } = renderPanel();
    expect(container.querySelector(".spinner-lg")).toBeInTheDocument();
  });
});

describe("ContractorBillingPanel — Free tier card", () => {
  it("asks for a card before bidding, and only opens Stripe once the terms are ticked", async () => {
    mockCard.mockResolvedValue(null);
    mockSetup.mockResolvedValue("https://checkout.stripe.com/c/x");
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign, origin: "https://app.test", search: "" }, writable: true });
    renderPanel();
    expect(await screen.findByText("Save a card before you bid")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Save card with Stripe" });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/x"));
    expect(mockSetup).toHaveBeenCalledWith("https://app.test/settings?tab=subscription");
  });

  it("shows the saved card", async () => {
    renderPanel();
    expect(await screen.findByText(/ending 4242/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace card" })).toBeInTheDocument();
  });
});

describe("ContractorBillingPanel — Free tier ledger", () => {
  it("shows the empty state when there are no fees", async () => {
    renderPanel();
    expect(await screen.findByText("No referral fees yet.")).toBeInTheDocument();
    expect(screen.getByText("Contractor Free")).toBeInTheDocument();
  });

  it("says when a pending fee will be charged", async () => {
    mockFees.mockResolvedValue([makeFee()]);
    renderPanel();
    const fallback = new Date(NOW + 60 * DAY).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    expect(await screen.findByText(new RegExp(`Charged when the job is verified, or on ${fallback}`))).toBeInTheDocument();
  });

  it("links a declined fee's invoice and leaves out waived fees", async () => {
    mockFees.mockResolvedValue([
      makeFee({ id: "RF_2", status: "PaymentFailed", failedAt: NOW, payUrl: "https://invoice.stripe.com/i/2" }),
      makeFee({ id: "RF_3", status: "Waived", serviceType: "Roofing" }),
      makeFee({ id: "RF_4", status: "Paid", serviceType: "Plumbing", reason: "off_app_job" }),
    ]);
    renderPanel();
    expect(await screen.findByRole("link", { name: "Pay invoice" })).toHaveAttribute("href", "https://invoice.stripe.com/i/2");
    expect(screen.getByText(/Card declined/)).toBeInTheDocument();
    expect(screen.getByText("Plumbing bid (job verified without an accepted bid)")).toBeInTheDocument();
    expect(screen.queryByText(/Roofing/)).not.toBeInTheDocument();
  });

  it("applies the $20 floor and shows a MIN badge on a small bid", async () => {
    mockFees.mockResolvedValue([makeFee({ bidCents: 18_500, feeCents: 2_000 })]);
    renderPanel();
    await waitFor(() => expect(screen.getAllByText("$20.00").length).toBeGreaterThan(0));
    expect(screen.getByText("MIN")).toBeInTheDocument();
  });

  it("shows 'Pro would have saved you' when this month's fees exceed the Pro price", async () => {
    mockFees.mockResolvedValue([makeFee({ id: "a" }), makeFee({ id: "b" }), makeFee({ id: "c" }), makeFee({ id: "old", acceptedAt: LAST_MONTH })]);
    renderPanel();
    expect(await screen.findByText(/Pro would have saved you \$125\.60 this cycle/)).toBeInTheDocument();
  });

  it("shows 'Free is still the cheaper plan' when this month's fees are under the Pro price", async () => {
    mockFees.mockResolvedValue([makeFee({ bidCents: 18_500, feeCents: 2_000 })]);
    renderPanel();
    expect(await screen.findByText("Free is still the cheaper plan at your volume")).toBeInTheDocument();
  });

  it("calls onUpgradeClick when the Upgrade to Pro button is clicked", async () => {
    const { onUpgradeClick } = renderPanel();
    fireEvent.click(await screen.findByText("Upgrade to Pro — $40/mo"));
    expect(onUpgradeClick).toHaveBeenCalledTimes(1);
  });
});

describe("ContractorBillingPanel — Pro tier", () => {
  it("computes work-won, fees-waived, and net-position stats from this month's accepted bids", async () => {
    mockBids.mockResolvedValue([makeBid(), makeBid({ id: "Q2", status: "rejected" }), makeBid({ id: "Q3", createdAt: LAST_MONTH })]);
    renderPanel({ tier: "ContractorPro" });
    expect(await screen.findByText("$1,840")).toBeInTheDocument();
    expect(screen.getAllByText("$55.20").length).toBeGreaterThan(0);
    expect(screen.getByText("+$15.20")).toBeInTheDocument();
    expect(screen.getByText("NO 3% FEE")).toBeInTheDocument();
    expect(mockFees).not.toHaveBeenCalled();
  });

  it("shows the empty-cycle message when no bid was accepted this month", async () => {
    renderPanel({ tier: "ContractorPro" });
    expect(await screen.findByText("No bids won yet this cycle.")).toBeInTheDocument();
  });

  it("calls onCancelClick when Cancel plan is clicked", async () => {
    const { onCancelClick } = renderPanel({ tier: "ContractorPro" });
    fireEvent.click(await screen.findByText("Cancel plan"));
    expect(onCancelClick).toHaveBeenCalledTimes(1);
  });

  it("shows 'Next invoice {date}' when renewDate is provided", async () => {
    renderPanel({ tier: "ContractorPro", renewDate: "Oct 15, 2026" });
    expect(await screen.findByText("Next invoice Oct 15, 2026")).toBeInTheDocument();
  });
});

describe("ContractorBillingPanel — fetch failure", () => {
  it("falls back to an empty ledger and shows a notice instead of crashing", async () => {
    mockFees.mockRejectedValue(new Error("canister unreachable"));
    renderPanel();
    expect(await screen.findByText(/Couldn't load your billing history/)).toBeInTheDocument();
    expect(screen.getByText("No referral fees yet.")).toBeInTheDocument();
  });
});
