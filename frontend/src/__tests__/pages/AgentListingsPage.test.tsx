/**
 * AgentListingsPage — real logic worth locking down:
 *   - county filter derives its option list from the loaded listings and
 *     actually filters the displayed cards
 *   - full (0 open slots) listings show "FULL" and disable the bid button
 *   - navigating to place a bid uses the listing id
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AgentListingsPage from "@/pages/AgentListingsPage";
import type { BidRequestSummary } from "@/services/listing";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockGetOpenBidRequests } = vi.hoisted(() => ({ mockGetOpenBidRequests: vi.fn() }));

vi.mock("@/services/listing", () => ({
  listingService: { getOpenBidRequests: mockGetOpenBidRequests },
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

function makeListing(overrides: Partial<BidRequestSummary> = {}): BidRequestSummary {
  return {
    id: "l1", city: "Austin", county: "Travis", zipCode: "78701",
    beds: 3, baths: 2, sqft: 1800, targetListDate: Date.now(), desiredSalePrice: null,
    notes: "", windowDays: 14 as any, bidDeadline: Date.now() + 86_400_000 * 2,
    status: "Open" as any, proposalCount: 2, openSlots: 3,
    ...overrides,
  } as BidRequestSummary;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AgentListingsPage />
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("AgentListingsPage — states", () => {
  it("shows the empty state when there are no open listings", async () => {
    mockGetOpenBidRequests.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("No open listings right now.")).toBeInTheDocument());
    expect(screen.getByText("0 homes taking bids")).toBeInTheDocument();
  });

  it("pluralizes the header correctly for a single listing", async () => {
    mockGetOpenBidRequests.mockResolvedValue([makeListing()]);
    renderPage();
    await waitFor(() => expect(screen.getByText("1 home taking bids")).toBeInTheDocument());
  });
});

describe("AgentListingsPage — county filter", () => {
  it("derives filter buttons from the distinct counties present and filters on click", async () => {
    mockGetOpenBidRequests.mockResolvedValue([
      makeListing({ id: "l1", city: "Austin", county: "Travis" }),
      makeListing({ id: "l2", city: "Round Rock", county: "Williamson" }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/Austin/)).toBeInTheDocument());
    expect(screen.getByText(/Round Rock/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Williamson"));

    expect(screen.queryByText(/Austin/)).not.toBeInTheDocument();
    expect(screen.getByText(/Round Rock/)).toBeInTheDocument();
  });
});

describe("AgentListingsPage — full listings", () => {
  it("shows FULL and disables bidding when openSlots is 0", async () => {
    mockGetOpenBidRequests.mockResolvedValue([makeListing({ openSlots: 0 })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("FULL")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Bidding full" })).toBeDisabled();
  });

  it("shows the open-slot count and an enabled bid button otherwise", async () => {
    mockGetOpenBidRequests.mockResolvedValue([makeListing({ openSlots: 3 })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("3 OF 5 OPEN")).toBeInTheDocument());
    const button = screen.getByRole("button", { name: "Place a bid" });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(mockNavigate).toHaveBeenCalledWith("/agents/listings/l1/bid");
  });
});
