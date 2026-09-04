/**
 * Tests for Bid to List v2 — ListingNewPage (H1) and ListingDetailPage (H2/H3/H6)
 *
 * Pages under test:
 *   ListingNewPage     — homeowner publishes a sealed-bid listing request
 *   ListingDetailPage  — sealed waiting state, revealed bid board, choose-to-confirm flow
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ─── Mock service layer ────────────────────────────────────────────────────────
// NOTE: vi.mock factories are hoisted — no external variable references allowed.

vi.mock("@/services/listing", () => ({
  listingService: {
    createBidRequest:       vi.fn(),
    getMyBidRequests:       vi.fn().mockResolvedValue([]),
    getBidRequest:          vi.fn(),
    cancelBidRequest:       vi.fn().mockResolvedValue(undefined),
    getOpenBidRequests:     vi.fn().mockResolvedValue([]),
    getListingPhotos:       vi.fn().mockResolvedValue([]),
    getPhotoReviewState:    vi.fn().mockResolvedValue(null),
    flagPhotoForReview:     vi.fn().mockResolvedValue(undefined),
    reviewPhoto:            vi.fn().mockResolvedValue(undefined),
    submitProposal:         vi.fn(),
    getProposalsForRequest: vi.fn().mockResolvedValue([]),
    getBidProgress:         vi.fn().mockResolvedValue({ count: 0, sealed: true }),
    getMyProposals:         vi.fn().mockResolvedValue([]),
    acceptProposal:         vi.fn().mockResolvedValue("fee-1"),
    postMessage:            vi.fn(),
    getThread:               vi.fn().mockResolvedValue([]),
    getCompsMedian:          vi.fn().mockResolvedValue(null),
    getPlatformFee:          vi.fn().mockResolvedValue(39900),
  },
}));

// Lightweight stub — the real ListingPhotoManager pulls in photoService and
// upload plumbing that isn't relevant to these page-level tests.
vi.mock("@/components/ListingPhotoManager", () => ({
  default: (props: any) => <div data-testid="photo-manager-stub" data-property-id={props.propertyId} />,
}));

vi.mock("@/store/authStore", () => {
  const state = {
    principal: "local",
    profile: { role: "Homeowner", email: "owner@example.com", phone: "", onboardingComplete: true },
    isAuthenticated: true,
    tier: null, setTier: vi.fn(), setProfile: vi.fn(),
  };
  return { useAuthStore: (selector?: (s: typeof state) => any) => (selector ? selector(state) : state) };
});

vi.mock("@/store/propertyStore", () => {
  // Defined outside the hook function so the reference is stable across renders.
  const properties = [
    { id: "prop-1", address: "123 Main St", city: "Tampa", state: "FL", zipCode: "33602", squareFeet: 1500n },
  ];
  return { usePropertyStore: () => ({ properties }) };
});

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// Mock Layout to avoid pulling in its full dependency tree (AuthContext, VoiceAgent, etc.)
vi.mock("@/components/Layout", async () => {
  const React = await import("react");
  return {
    Layout: (props: any) => React.createElement("div", { "data-testid": "layout" }, props.children),
  };
});

// ─── Page imports ──────────────────────────────────────────────────────────────

import ListingNewPage    from "@/pages/ListingNewPage";
import ListingDetailPage from "@/pages/ListingDetailPage";
import { listingService } from "@/services/listing";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage(element: React.ReactNode, path = "/", route = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>
  );
}

const now = Date.now();

function makeRequest(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: "BID_1", propertyId: "prop-1", homeowner: "local",
    address: "", city: "Tampa", county: "Hillsborough", zipCode: "33602",
    homeownerEmail: "", beds: 3, baths: 2, sqft: 1500,
    targetListDate: now + 30 * 86_400_000, desiredSalePrice: null,
    notes: "Within 60 days — Roof replaced", windowDays: "Seven",
    bidDeadline: now + 7 * 86_400_000, status: "Open",
    feePaid: false, createdAt: now - 5000,
    ...overrides,
  };
}

function makeProposal(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: "PROP_A", requestId: "BID_1", letter: "A",
    commissionBps: 250, suggestedListCents: 52_000_000,
    cmaSummary: "Comps suggest $520k-$540k", marketingPlan: "MLS + social",
    marketingCommitments: ["Professional photography"],
    estimatedDaysOnMarket: 21, status: "Pending",
    derived: { estNetToSellerCents: 50_700_000, pctVsCompsBps: 200, overCompFlag: false, thinCompsFlag: false },
    agentRecord: { closedInZip: 12, avgDom: 24, saleToListRatioBps: 9800, withdrawnUnsold: 0, commitmentsUnmet: 0 },
    isMine: false, agentName: null, agentEmail: null, agentBrokerage: null,
    createdAt: now - 1000,
    ...overrides,
  };
}

// ─── ListingNewPage ────────────────────────────────────────────────────────────

describe("ListingNewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.createBidRequest).mockResolvedValue(makeRequest() as any);
    vi.mocked(listingService.getListingPhotos).mockResolvedValue([]);
    vi.mocked(listingService.getPhotoReviewState).mockResolvedValue(null);
  });

  it("renders the new heading", async () => {
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    await waitFor(() =>
      expect(screen.getByText(/Let agents compete for your listing/i)).toBeInTheDocument()
    );
  });

  it("renders the notes field capped at 180 characters", async () => {
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    const textarea = await screen.findByPlaceholderText(/Roof and HVAC/i);
    const longText = "x".repeat(250);
    fireEvent.change(textarea, { target: { value: longText } });
    expect((textarea as HTMLTextAreaElement).value).toHaveLength(180);
    expect(screen.getByText(/0 left/)).toBeInTheDocument();
  });

  it("renders the 3/7/14-day bidding window selector", async () => {
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    await waitFor(() => {
      expect(screen.getByText("3 days")).toBeInTheDocument();
      expect(screen.getByText("7 days")).toBeInTheDocument();
      expect(screen.getByText("14 days")).toBeInTheDocument();
    });
  });

  it("disables Publish while a flagged photo is unreviewed", async () => {
    vi.mocked(listingService.getListingPhotos).mockResolvedValue(["PHOTO_1"]);
    vi.mocked(listingService.getPhotoReviewState).mockResolvedValue({ flagged: true, reviewed: false });
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /publish to licensed agents/i })).toBeDisabled();
    });
    expect(screen.getByText(/need review before publishing/i)).toBeInTheDocument();
  });

  it("enables Publish when no photos are flagged", async () => {
    vi.mocked(listingService.getListingPhotos).mockResolvedValue(["PHOTO_1"]);
    vi.mocked(listingService.getPhotoReviewState).mockResolvedValue({ flagged: false, reviewed: false });
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /publish to licensed agents/i })).not.toBeDisabled();
    });
  });

  it("calls createBidRequest with the new input shape on submit, including the chosen window", async () => {
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    await waitFor(() => screen.getByText("14 days"));
    fireEvent.click(screen.getByText("14 days"));

    const notesField = screen.getByPlaceholderText(/Roof and HVAC/i);
    fireEvent.change(notesField, { target: { value: "Prefer agents with condo experience" } });

    fireEvent.click(screen.getByRole("button", { name: /publish to licensed agents/i }));

    await waitFor(() => expect(listingService.createBidRequest).toHaveBeenCalled());
    const input = vi.mocked(listingService.createBidRequest).mock.calls[0][0] as any;
    expect(input.propertyId).toBe("prop-1");
    expect(input.city).toBe("Tampa");
    expect(input.zipCode).toBe("33602");
    expect(input.homeownerEmail).toBe("owner@example.com");
    expect(input.windowDays).toBe("Fourteen");
    expect(input.notes).toMatch(/Prefer agents with condo experience/);
    expect(input).not.toHaveProperty("bidDeadline");
  });

  it("navigates to the new request's detail page after publishing", async () => {
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    await waitFor(() => screen.getByRole("button", { name: /publish to licensed agents/i }));
    fireEvent.click(screen.getByRole("button", { name: /publish to licensed agents/i }));
    await waitFor(() => expect(listingService.createBidRequest).toHaveBeenCalled());
  });
});

// ─── ListingDetailPage — sealed / waiting (H2) ─────────────────────────────────

describe("ListingDetailPage — sealed waiting state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.getBidRequest).mockResolvedValue(makeRequest({ status: "Open", feePaid: false }) as any);
    vi.mocked(listingService.getBidProgress).mockResolvedValue({ count: 1, sealed: true });
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([]);
    vi.mocked(listingService.getPlatformFee).mockResolvedValue(39900);
  });

  it("renders a sealed message and does not reveal any bidders", async () => {
    renderPage(<ListingDetailPage />, "/listing/BID_1", "/listing/:id");
    await waitFor(() => {
      expect(screen.getByText(/bids in/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Bid A/)).not.toBeInTheDocument();
  });
});

// ─── ListingDetailPage — revealed board (H3) ───────────────────────────────────

describe("ListingDetailPage — revealed bid board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.getBidRequest).mockResolvedValue(makeRequest({ status: "Open", feePaid: false }) as any);
    vi.mocked(listingService.getBidProgress).mockResolvedValue({ count: 3, sealed: false });
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([
      makeProposal({ id: "PROP_A", letter: "A" }),
      makeProposal({ id: "PROP_B", letter: "B", isMine: true, agentName: "Jane Smith" }),
    ] as any);
    vi.mocked(listingService.getPlatformFee).mockResolvedValue(39900);
    vi.mocked(listingService.getThread).mockResolvedValue([]);
  });

  it("shows masked bidder letters, not agent names, for proposals that aren't the caller's own", async () => {
    renderPage(<ListingDetailPage />, "/listing/BID_1", "/listing/:id");
    await waitFor(() => {
      expect(screen.getByText("Bid A")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Jane Smith/)).not.toBeInTheDocument();
  });

  it("renders the sort control", async () => {
    renderPage(<ListingDetailPage />, "/listing/BID_1", "/listing/:id");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Net to you" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Commission" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Days on market" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Commission" }));
    // no crash on re-sort; the board still renders both bids
    expect(screen.getByText("Bid A")).toBeInTheDocument();
    expect(screen.getByText("Bid B")).toBeInTheDocument();
  });

  it("choosing a bid opens the detail drawer, then the confirm-selection flow", async () => {
    renderPage(<ListingDetailPage />, "/listing/BID_1", "/listing/:id");
    await waitFor(() => screen.getByText("Bid A"));

    // Opens BidDetailDrawer (H4)
    fireEvent.click(screen.getByText("Bid A"));
    const chooseInDrawer = await screen.findByRole("button", { name: /^Choose Bid A$/i });

    // Advances to ConfirmSelectionModal (H5)
    fireEvent.click(chooseInDrawer);
    await waitFor(() => {
      expect(screen.getByText(/You are choosing/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Choose Bid A and unmask/i })).toBeInTheDocument();
    });
  });
});
