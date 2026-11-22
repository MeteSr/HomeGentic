/**
 * AgentAwardPage — real branching logic worth locking down:
 *   - loading -> "nothing to show" (no proposal / not accepted) -> full award view
 *   - fee amount formatted from cents; until the fee is paid the page says it's
 *     due and shows no seller details (the listing canister masks them)
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AgentAwardPage from "@/pages/AgentAwardPage";
import type { ListingProposal, ListingBidRequest } from "@/services/listing";
import type { FeeRecord } from "@/services/fee";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ id: "prop-1" }) };
});

const { mockGetMyProposals, mockGetBidRequest, mockGetMyFees } = vi.hoisted(() => ({
  mockGetMyProposals: vi.fn(),
  mockGetBidRequest:  vi.fn(),
  mockGetMyFees:      vi.fn(),
}));

vi.mock("@/services/listing", () => ({
  listingService: { getMyProposals: mockGetMyProposals, getBidRequest: mockGetBidRequest },
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

function renderPage() {
  return render(
    <MemoryRouter>
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

  it("while the fee is owed, says it's due, claims no charge and shows no seller details", async () => {
    mockGetMyProposals.mockResolvedValue([PROPOSAL]);
    mockGetBidRequest.mockResolvedValue(MASKED);
    mockGetMyFees.mockResolvedValue([{ ...FEE, status: "Owed" }]);
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText(/your \$295 platform fee is due\. the seller's address and email show here once it's paid/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/charged/i)).not.toBeInTheDocument();
    expect(screen.queryByText("RECEIPT SENT")).not.toBeInTheDocument();
    expect(screen.queryByText("Address")).not.toBeInTheDocument();
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
