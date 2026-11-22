/**
 * AgentAwardPage — real branching logic worth locking down:
 *   - loading -> "nothing to show" (no proposal / not accepted) -> full award view
 *   - fee amount formatted from cents; until the fee is paid the page says it's
 *     due and shows no seller details (the listing canister masks them)
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AgentAwardPage from "@/pages/AgentAwardPage";
import type { ListingProposal, ListingBidRequest } from "@/services/listing";
import type { FeeRecord } from "@/services/fee";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ id: "prop-1" }) };
});

const { mockGetMyProposals, mockGetBidRequest, mockGetMyFees, mockStartFeeCheckout } = vi.hoisted(() => ({
  mockGetMyProposals:   vi.fn(),
  mockGetBidRequest:    vi.fn(),
  mockGetMyFees:        vi.fn(),
  mockStartFeeCheckout: vi.fn(),
}));

vi.mock("@/services/listing", () => ({
  listingService: { getMyProposals: mockGetMyProposals, getBidRequest: mockGetBidRequest, startFeeCheckout: mockStartFeeCheckout },
}));

vi.mock("@/services/fee", () => ({
  feeService: { getMyFees: mockGetMyFees },
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const PROPOSAL: Partial<ListingProposal> = { id: "prop-1", requestId: "req-1", status: "Accepted" as any };
const REQUEST: Partial<ListingBidRequest> = { id: "req-1", address: "123 Main St", homeownerEmail: "seller@example.com" };
const FEE: Partial<FeeRecord> = { id: "fee-1", proposalId: "prop-1", amountCents: 29500, status: "Paid" };
const MASKED: Partial<ListingBidRequest> = { id: "req-1", address: "", homeownerEmail: "" };

function renderPage(path = "/agents/bids/prop-1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AgentAwardPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentAwardPage — gating", () => {
  it("shows 'Nothing to show yet' when no matching proposal exists", async () => {
    mockGetMyProposals.mockResolvedValue([]);
    mockGetMyFees.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument());
  });

  it("shows 'Nothing to show yet' when the proposal was not accepted", async () => {
    mockGetMyProposals.mockResolvedValue([{ ...PROPOSAL, status: "Pending" as any }]);
    mockGetMyFees.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument());
  });

  it("renders the award view when the proposal is Accepted", async () => {
    mockGetMyProposals.mockResolvedValue([PROPOSAL]);
    mockGetBidRequest.mockResolvedValue(REQUEST);
    mockGetMyFees.mockResolvedValue([FEE]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/the homeowner chose your bid/i)).toBeInTheDocument());
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText("seller@example.com")).toBeInTheDocument();
  });
});

describe("AgentAwardPage — fee display", () => {
  it("says the fee is paid, from cents to dollars, once it is", async () => {
    mockGetMyProposals.mockResolvedValue([PROPOSAL]);
    mockGetBidRequest.mockResolvedValue(REQUEST);
    mockGetMyFees.mockResolvedValue([FEE]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/your \$295 platform fee is paid/i)).toBeInTheDocument());
    expect(screen.getByText("RECEIPT SENT")).toBeInTheDocument();
  });

  it("before the fee is recorded, says the details come once it's paid", async () => {
    mockGetMyProposals.mockResolvedValue([PROPOSAL]);
    mockGetBidRequest.mockResolvedValue(MASKED);
    mockGetMyFees.mockResolvedValue([]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/the seller's address and email show here once your platform fee is paid/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/charged/i)).not.toBeInTheDocument();
  });
});

describe("AgentAwardPage — paying the platform fee", () => {
  const CHOSEN = { ...PROPOSAL, status: "Pending" as any };
  const OWED = { ...FEE, status: "Owed" as const };

  it("when the seller chose this bid, asks for the fee by card and shows no seller details", async () => {
    mockGetMyProposals.mockResolvedValue([CHOSEN]);
    mockGetBidRequest.mockResolvedValue(MASKED);
    mockGetMyFees.mockResolvedValue([OWED]);
    mockStartFeeCheckout.mockResolvedValue("https://checkout.stripe.test/s");
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/the seller chose your bid\. pay the \$295 platform fee to see their address and email\./i)).toBeInTheDocument(),
    );
    expect(screen.queryByText("Address")).not.toBeInTheDocument();
    expect(screen.queryByText(/charged/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pay $295 by card" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/s"));
    expect(mockStartFeeCheckout).toHaveBeenCalledWith("prop-1");
    vi.unstubAllGlobals();
  });

  it("says so when card payments aren't set up, and that nothing was charged", async () => {
    mockGetMyProposals.mockResolvedValue([CHOSEN]);
    mockGetBidRequest.mockResolvedValue(MASKED);
    mockGetMyFees.mockResolvedValue([OWED]);
    mockStartFeeCheckout.mockResolvedValue(null);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Pay $295 by card" }));
    expect(await screen.findByText("Card payments aren't set up yet. Nothing was charged.")).toBeInTheDocument();
  });

  it("back from Stripe, says the payment is being confirmed until the details are released", async () => {
    mockGetMyProposals.mockResolvedValue([CHOSEN]);
    mockGetBidRequest.mockResolvedValue(MASKED);
    mockGetMyFees.mockResolvedValue([OWED]);
    renderPage("/agents/bids/prop-1?fee_paid=1");
    expect(await screen.findByText("Payment received. The seller's details show here as soon as Stripe confirms it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay \$295/i })).not.toBeInTheDocument();
  });

  it("shows nothing for a pending bid the seller hasn't chosen", async () => {
    mockGetMyProposals.mockResolvedValue([CHOSEN]);
    mockGetMyFees.mockResolvedValue([{ ...OWED, proposalId: "someone-else" }]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument());
  });
});
