/**
 * AgentAwardPage — real branching logic worth locking down:
 *   - loading -> "nothing to show" (no proposal / not accepted) -> full award view
 *   - fee amount formatted from cents; "(pending confirmation)" when no fee yet
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
const FEE: Partial<FeeRecord> = { id: "fee-1", proposalId: "prop-1", amountCents: 29500 };

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
  it("formats the fee amount from cents to dollars", async () => {
    mockGetMyProposals.mockResolvedValue([PROPOSAL]);
    mockGetBidRequest.mockResolvedValue(REQUEST);
    mockGetMyFees.mockResolvedValue([FEE]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/\$295 charged/)).toBeInTheDocument());
  });

  it("shows pending confirmation when no fee record exists yet", async () => {
    mockGetMyProposals.mockResolvedValue([PROPOSAL]);
    mockGetBidRequest.mockResolvedValue(REQUEST);
    mockGetMyFees.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/\$0 charged \(pending confirmation\)/)).toBeInTheDocument());
  });
});
