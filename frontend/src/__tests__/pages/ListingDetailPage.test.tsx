/**
 * ListingDetailPage — real logic worth locking down:
 *   - not-found state
 *   - H2 sealed/waiting state: headline differs at 0 bids vs >0 bids
 *   - H3 board state: proposal count header, sort ordering (net/commission/dom)
 *   - the fee_paid query param triggers a success toast and reload
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ListingDetailPage from "@/pages/ListingDetailPage";
import type { ListingBidRequest, MaskedProposal } from "@/services/listing";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ id: "req-1" }) };
});

const {
  mockGetBidRequest, mockGetBidProgress, mockGetProposalsForRequest, mockGetPlatformFee,
} = vi.hoisted(() => ({
  mockGetBidRequest:         vi.fn(),
  mockGetBidProgress:        vi.fn(),
  mockGetProposalsForRequest: vi.fn(),
  mockGetPlatformFee:        vi.fn(),
}));

vi.mock("@/services/listing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/listing")>();
  return {
    ...actual,
    listingService: {
      getBidRequest: mockGetBidRequest,
      getBidProgress: mockGetBidProgress,
      getProposalsForRequest: mockGetProposalsForRequest,
      getPlatformFee: mockGetPlatformFee,
    },
  };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/BidDetailDrawer", () => ({ BidDetailDrawer: () => null }));
vi.mock("@/components/ConfirmSelectionModal", () => ({ ConfirmSelectionModal: () => null }));

const { mockToastSuccess } = vi.hoisted(() => ({ mockToastSuccess: vi.fn() }));
vi.mock("react-hot-toast", () => {
  const fn: any = vi.fn();
  fn.success = mockToastSuccess;
  fn.error = vi.fn();
  return { default: fn };
});

const REQUEST: ListingBidRequest = {
  id: "req-1", propertyId: "prop-1", homeowner: "p-owner", address: "", city: "Austin",
  county: "Travis", zipCode: "78701", homeownerEmail: "", beds: null, baths: null, sqft: null,
  targetListDate: Date.now(), desiredSalePrice: null, notes: "", windowDays: 7 as any,
  bidDeadline: Date.now() + 86_400_000, status: "Open" as any, createdAt: Date.now(),
} as ListingBidRequest;

function makeProposal(overrides: Partial<MaskedProposal> = {}): MaskedProposal {
  return {
    id: "p1", requestId: "req-1", letter: "A", commissionBps: 250, suggestedListCents: 40_000_000,
    cmaSummary: "", marketingPlan: "", marketingCommitments: [], estimatedDaysOnMarket: 20,
    status: "Pending" as any,
    derived: { estNetToSellerCents: 39_000_000, pctVsCompsBps: 0, overCompFlag: false, thinCompsFlag: false },
    agentRecord: {} as any, isMine: false, agentName: null, agentEmail: null, agentBrokerage: null,
    createdAt: Date.now(),
    ...overrides,
  } as MaskedProposal;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ListingDetailPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPlatformFee.mockResolvedValue(39900);
});

describe("ListingDetailPage — not found", () => {
  it("shows a not-found message when the request doesn't exist", async () => {
    mockGetBidRequest.mockResolvedValue(null);
    renderAt("/listing/req-1");
    await waitFor(() => expect(screen.getByText("Listing request not found.")).toBeInTheDocument());
  });
});

describe("ListingDetailPage — H2 sealed/waiting state", () => {
  it("shows the zero-bids headline when no bids are in yet", async () => {
    mockGetBidRequest.mockResolvedValue(REQUEST);
    mockGetBidProgress.mockResolvedValue({ count: 0, sealed: true });
    renderAt("/listing/req-1");
    await waitFor(() => expect(screen.getByText("Your request is live to verified agents in your county")).toBeInTheDocument());
  });

  it("shows the in-progress headline once bids start coming in", async () => {
    mockGetBidRequest.mockResolvedValue(REQUEST);
    mockGetBidProgress.mockResolvedValue({ count: 2, sealed: true });
    renderAt("/listing/req-1");
    await waitFor(() => expect(screen.getByText("2 of 5 bids in. Comparing now is premature.")).toBeInTheDocument());
  });
});

describe("ListingDetailPage — H3 bid board", () => {
  it("shows the agent count header and sorts by net-to-you by default", async () => {
    mockGetBidRequest.mockResolvedValue(REQUEST);
    mockGetBidProgress.mockResolvedValue({ count: 3, sealed: false });
    mockGetProposalsForRequest.mockResolvedValue([
      makeProposal({ id: "low-net", letter: "A", derived: { estNetToSellerCents: 30_000_000, pctVsCompsBps: 0, overCompFlag: false, thinCompsFlag: false } }),
      makeProposal({ id: "high-net", letter: "B", derived: { estNetToSellerCents: 50_000_000, pctVsCompsBps: 0, overCompFlag: false, thinCompsFlag: false } }),
    ]);
    renderAt("/listing/req-1");

    await waitFor(() => expect(screen.getByText("2 agents want your listing")).toBeInTheDocument());

    // Default sort is "net" descending -> B (higher net) should appear before A
    const bidOrder = screen.getAllByText(/^Bid [AB]$/).map((el) => el.textContent);
    expect(bidOrder[0]).toBe("Bid B");
    expect(bidOrder[1]).toBe("Bid A");
  });

  it("re-sorts by commission (ascending) when that tab is clicked", async () => {
    mockGetBidRequest.mockResolvedValue(REQUEST);
    mockGetBidProgress.mockResolvedValue({ count: 3, sealed: false });
    mockGetProposalsForRequest.mockResolvedValue([
      makeProposal({ id: "hi-comm", letter: "A", commissionBps: 300 }),
      makeProposal({ id: "lo-comm", letter: "B", commissionBps: 200 }),
    ]);
    renderAt("/listing/req-1");
    await waitFor(() => expect(screen.getByText("2 agents want your listing")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Commission" }));

    const bidOrder = screen.getAllByText(/^Bid [AB]$/).map((el) => el.textContent);
    expect(bidOrder[0]).toBe("Bid B"); // lower commission first
    expect(bidOrder[1]).toBe("Bid A");
  });
});

describe("ListingDetailPage — fee_paid query param", () => {
  it("shows a success toast and reloads when fee_paid is present", async () => {
    mockGetBidRequest.mockResolvedValue(REQUEST);
    mockGetBidProgress.mockResolvedValue({ count: 0, sealed: true });
    renderAt("/listing/req-1?fee_paid=1");

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("Payment cleared — identities released."));
    await waitFor(() => expect(mockGetBidRequest).toHaveBeenCalledTimes(2)); // initial load + reload from the effect
  });
});
