/**
 * AgentBidsPage — real logic worth locking down:
 *   - loading -> empty -> populated states
 *   - won-count derived from Accepted proposals only
 *   - status label mapping (Accepted->WON, Pending->SEALED, etc.)
 *   - commission bps -> percentage formatting, including the trailing-zero strip
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AgentBidsPage from "@/pages/AgentBidsPage";
import type { ListingProposal } from "@/services/listing";

const { mockGetMyProposals, mockGetMyFees } = vi.hoisted(() => ({ mockGetMyProposals: vi.fn(), mockGetMyFees: vi.fn() }));

vi.mock("@/services/fee", () => ({ feeService: { getMyFees: mockGetMyFees } }));

vi.mock("@/services/listing", () => ({
  listingService: { getMyProposals: mockGetMyProposals },
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

function makeProposal(overrides: Partial<ListingProposal> = {}): ListingProposal {
  return {
    id: "p1", requestId: "req-1", letter: "A", status: "Pending" as any,
    commissionBps: 250, suggestedListCents: 45000000,
    ...overrides,
  } as ListingProposal;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMyFees.mockResolvedValue([]);
});

const renderPage = () => render(<MemoryRouter><AgentBidsPage /></MemoryRouter>);

describe("AgentBidsPage — states", () => {
  it("shows the empty state when there are no bids", async () => {
    mockGetMyProposals.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("No bids yet.")).toBeInTheDocument());
    expect(screen.getByText("0 bids placed, 0 won this quarter")).toBeInTheDocument();
  });

  it("counts only Accepted proposals as won", async () => {
    mockGetMyProposals.mockResolvedValue([
      makeProposal({ id: "p1", status: "Accepted" as any }),
      makeProposal({ id: "p2", status: "Pending" as any }),
      makeProposal({ id: "p3", status: "Rejected" as any }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText("3 bids placed, 1 won this quarter")).toBeInTheDocument());
  });
});

describe("AgentBidsPage — status labels", () => {
  it.each([
    ["Accepted", "WON"],
    ["Pending", "SEALED"],
    ["Rejected", "NOT SELECTED"],
    ["Withdrawn", "WITHDRAWN"],
  ])("maps status %s to label %s", async (status, label) => {
    mockGetMyProposals.mockResolvedValue([makeProposal({ status: status as any })]);
    renderPage();
    await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument());
  });
});

describe("AgentBidsPage — commission formatting", () => {
  it("strips a trailing zero from a whole-percent commission", async () => {
    // 250 bps = 2.50% -> displayed as "2.5%"
    mockGetMyProposals.mockResolvedValue([makeProposal({ commissionBps: 250 })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("2.5%")).toBeInTheDocument());
  });

  it("keeps both decimals for a non-round commission", async () => {
    // 275 bps = 2.75%
    mockGetMyProposals.mockResolvedValue([makeProposal({ commissionBps: 275 })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("2.75%")).toBeInTheDocument());
  });

  it("formats the suggested list price from cents", async () => {
    mockGetMyProposals.mockResolvedValue([makeProposal({ suggestedListCents: 45000000 })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("$450,000")).toBeInTheDocument());
  });
});

describe("AgentBidsPage — a bid the seller chose", () => {
  it("says to pay the platform fee and links to the page that takes it", async () => {
    mockGetMyProposals.mockResolvedValue([makeProposal({ id: "p9", status: "Pending" as any })]);
    mockGetMyFees.mockResolvedValue([{ id: "f1", proposalId: "p9", status: "Owed", amountCents: 39900 }]);
    renderPage();
    const link = await screen.findByRole("link", { name: "Pay fee" });
    expect(link.getAttribute("href")).toBe("/agents/bids/p9");
    expect(screen.getByText("CHOSEN")).toBeInTheDocument();
    expect(screen.queryByText("SEALED")).not.toBeInTheDocument();
  });

  it("links a won bid to its award page", async () => {
    mockGetMyProposals.mockResolvedValue([makeProposal({ id: "p8", status: "Accepted" as any })]);
    renderPage();
    expect((await screen.findByRole("link", { name: "View" })).getAttribute("href")).toBe("/agents/bids/p8");
  });
});
