/**
 * TDD tests for Epic 9 — Seller's Marketplace listing pages
 *
 * Pages under test:
 *   ListingNewPage        — homeowner creates a sealed-bid listing request
 *   ListingDetailPage     — homeowner views proposals, compares, accepts
 *   AgentMarketplacePage  — agent browses open requests and submits proposals
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ─── Mock service layer ────────────────────────────────────────────────────────
// NOTE: vi.mock factories are hoisted — no external variable references allowed.

vi.mock("@/services/listing", () => {
  const now = Date.now();
  const bidRequest = {
    id:               "BID_1",
    propertyId:       "prop-1",
    homeowner:        "local",
    targetListDate:   now + 30 * 86_400_000,
    desiredSalePrice: 50_000_000,
    notes:            "Ocean view unit",
    bidDeadline:      now - 1000, // deadline already passed
    status:           "Open",
    createdAt:        now - 5000,
    visibility:       "open",
    invitedAgentIds:  [],
    propertySnapshot: { score: 88, verifiedJobCount: 7, systemNotes: "Roof: 8 yrs" },
  };
  const proposal = {
    id:                    "PROP_1",
    requestId:             "BID_1",
    agentId:               "agent-1",
    agentName:             "Jane Smith",
    agentBrokerage:        "Premier Realty",
    commissionBps:         250,
    cmaSummary:            "Comps suggest $520k–$540k",
    marketingPlan:         "MLS + social + open house",
    estimatedDaysOnMarket: 21,
    estimatedSalePrice:    52_000_000,
    includedServices:      ["staging", "professional photos"],
    validUntil:            now + 14 * 86_400_000,
    coverLetter:           "I specialize in this zip code",
    status:                "Pending",
    createdAt:             now - 1000,
    cmaComps:              [{ address: "100 Oak Ave", salePriceCents: 51_000_000, bedrooms: 3, bathrooms: 2, sqft: 1800, soldDate: "2024-06-01" }],
  };
  const openRequest = {
    ...bidRequest,
    id:          "BID_2",
    bidDeadline: now + 7 * 86_400_000,
  };
  return {
    listingService: {
      createBidRequest:       vi.fn().mockResolvedValue(bidRequest),
      getMyBidRequests:       vi.fn().mockResolvedValue([bidRequest]),
      getBidRequest:          vi.fn().mockResolvedValue(bidRequest),
      cancelBidRequest:       vi.fn().mockResolvedValue(undefined),
      getOpenBidRequests:     vi.fn().mockResolvedValue([openRequest]),
      submitProposal:         vi.fn().mockResolvedValue(proposal),
      getProposalsForRequest: vi.fn().mockResolvedValue([proposal]),
      getMyProposals:         vi.fn().mockResolvedValue([proposal]),
      acceptProposal:         vi.fn().mockResolvedValue(undefined),
      getMyCounters:          vi.fn().mockResolvedValue([]),
      getCountersForProposal: vi.fn().mockResolvedValue([]),
      uploadContract:         vi.fn().mockResolvedValue(undefined),
      counterProposal:        vi.fn().mockResolvedValue(undefined),
      respondToCounter:       vi.fn().mockResolvedValue(undefined),
    },
    computeNetProceeds: (price: number, commBps: number, closingBps: number) =>
      price - Math.round(price * commBps / 10_000) - Math.round(price * closingBps / 10_000),
    formatCommission: (bps: number) => (bps / 100).toFixed(2) + "%",
    isDeadlinePassed: (ms: number) => ms <= Date.now(),
  };
});

// Local copies for use in test assertions / overrides
const _now = Date.now();
const mockBidRequest = {
  id: "BID_1", propertyId: "prop-1", homeowner: "local",
  targetListDate: _now + 30 * 86_400_000, desiredSalePrice: 50_000_000,
  notes: "Ocean view unit", bidDeadline: _now - 1000,
  status: "Open" as const, createdAt: _now - 5000,
  visibility: "open" as const, invitedAgentIds: [] as string[],
  propertySnapshot: { score: 88, verifiedJobCount: 7, systemNotes: "Roof: 8 yrs" },
};
const mockProposal = {
  id: "PROP_1", requestId: "BID_1", agentId: "agent-1",
  agentName: "Jane Smith", agentBrokerage: "Premier Realty",
  commissionBps: 250, cmaSummary: "Comps suggest $520k–$540k",
  marketingPlan: "MLS + social + open house", estimatedDaysOnMarket: 21,
  estimatedSalePrice: 52_000_000, includedServices: ["staging", "professional photos"],
  validUntil: _now + 14 * 86_400_000, coverLetter: "I specialize in this zip code",
  status: "Pending" as const, createdAt: _now - 1000,
  cmaComps: [{ address: "100 Oak Ave", salePriceCents: 51_000_000, bedrooms: 3, bathrooms: 2, sqft: 1800, soldDate: "2024-06-01" }],
};
const mockOpenRequest = {
  ...mockBidRequest, id: "BID_2", bidDeadline: _now + 7 * 86_400_000, status: "Open" as const,
};

vi.mock("@/services/payment", () => ({
  paymentService: {
    getMySubscription: vi.fn().mockResolvedValue({ tier: "Pro" }),
  },
}));

vi.mock("@/services/property", () => ({
  propertyService: {
    getAll: vi.fn().mockResolvedValue([
      { id: "prop-1", address: "123 Main St", status: "Active", verificationLevel: "Basic", createdAt: Date.now() },
    ]),
  },
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({
    principal: "local",
    profile: { role: "Homeowner", tier: "Pro" },
    isAuthenticated: true,
  }),
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({
    properties: [
      { id: "prop-1", address: "123 Main St", status: "Active", verificationLevel: "Basic", createdAt: Date.now() },
    ],
  }),
}));

// ─── Page imports ──────────────────────────────────────────────────────────────

import ListingNewPage       from "@/pages/ListingNewPage";
import ListingDetailPage    from "@/pages/ListingDetailPage";
import AgentMarketplacePage from "@/pages/AgentMarketplacePage";
import { listingService }   from "@/services/listing";

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

// ─── ListingNewPage ────────────────────────────────────────────────────────────

describe("ListingNewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.createBidRequest).mockResolvedValue(mockBidRequest);
  });

  it("renders the page heading", () => {
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    expect(screen.getByText(/List Your Home/i)).toBeInTheDocument();
  });

  it("renders the notes / bid deadline fields", () => {
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    expect(screen.getByLabelText(/Notes/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Bid Deadline/i)).toBeInTheDocument();
  });

  it("renders a Submit button", () => {
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    expect(
      screen.getByRole("button", { name: /submit|create|list/i })
    ).toBeInTheDocument();
  });

  it("calls listingService.createBidRequest on submit", async () => {
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: "Test notes" } });
    // Set a future datetime-local value for the required bid deadline field
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16);
    fireEvent.change(screen.getByLabelText(/Bid Deadline/i), { target: { value: future } });
    fireEvent.click(screen.getByRole("button", { name: /submit|create|list/i }));
    await waitFor(() => {
      expect(listingService.createBidRequest).toHaveBeenCalled();
    });
  });

  it("shows a property selector when multiple properties exist", () => {
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    expect(screen.getByLabelText(/Property/i)).toBeInTheDocument();
  });
});

// ─── ListingDetailPage ────────────────────────────────────────────────────────

describe("ListingDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock implementations after clearAllMocks
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockBidRequest);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockProposal]);
    vi.mocked(listingService.acceptProposal).mockResolvedValue(undefined);
  });

  it("renders the page heading", async () => {
    renderPage(
      <ListingDetailPage />,
      "/listing/BID_1",
      "/listing/:id"
    );
    await waitFor(() => {
      expect(screen.getByText(/Listing Request/i)).toBeInTheDocument();
    });
  });

  it("loads and displays proposal agent name after deadline passes", async () => {
    renderPage(
      <ListingDetailPage />,
      "/listing/BID_1",
      "/listing/:id"
    );
    await waitFor(() => {
      expect(screen.getByText(/Jane Smith/i)).toBeInTheDocument();
    });
  });

  it("displays commission formatted as percentage", async () => {
    renderPage(
      <ListingDetailPage />,
      "/listing/BID_1",
      "/listing/:id"
    );
    await waitFor(() => {
      expect(screen.getByText(/2\.50%/)).toBeInTheDocument();
    });
  });

  it("shows Accept button for each proposal", async () => {
    renderPage(
      <ListingDetailPage />,
      "/listing/BID_1",
      "/listing/:id"
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
    });
  });

  it("calls acceptProposal when Accept is clicked", async () => {
    // jsdom window.confirm returns false by default — mock it to return true
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    renderPage(
      <ListingDetailPage />,
      "/listing/BID_1",
      "/listing/:id"
    );
    await waitFor(() => screen.getByRole("button", { name: /accept/i }));
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    await waitFor(() => {
      expect(listingService.acceptProposal).toHaveBeenCalledWith("PROP_1");
    });
  });

  it("shows sealed message when deadline has not yet passed", async () => {
    vi.mocked(listingService.getBidRequest).mockResolvedValueOnce({
      ...mockBidRequest,
      bidDeadline: Date.now() + 99_999_999,
    });
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValueOnce([]);
    renderPage(
      <ListingDetailPage />,
      "/listing/BID_1",
      "/listing/:id"
    );
    await waitFor(() => {
      // The sealed banner has a unique heading
      expect(screen.getByText(/Proposals are sealed until the deadline passes/i)).toBeInTheDocument();
    });
  });

  it("shows net proceeds for each proposal", async () => {
    renderPage(
      <ListingDetailPage />,
      "/listing/BID_1",
      "/listing/:id"
    );
    await waitFor(() => {
      // net proceeds label or dollar amount should appear
      expect(screen.getByText(/net proceeds|estimated net/i)).toBeInTheDocument();
    });
  });
});

// ─── AgentMarketplacePage ─────────────────────────────────────────────────────

describe("AgentMarketplacePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.getOpenBidRequests).mockResolvedValue([mockOpenRequest]);
    vi.mocked(listingService.submitProposal).mockResolvedValue(mockProposal);
  });

  it("renders the marketplace heading", async () => {
    renderPage(
      <AgentMarketplacePage />,
      "/agent/marketplace",
      "/agent/marketplace"
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /marketplace/i })).toBeInTheDocument();
    });
  });

  it("displays open bid requests", async () => {
    renderPage(
      <AgentMarketplacePage />,
      "/agent/marketplace",
      "/agent/marketplace"
    );
    await waitFor(() => {
      expect(listingService.getOpenBidRequests).toHaveBeenCalled();
    });
  });

  it("shows a Submit Proposal button for each open request", async () => {
    renderPage(
      <AgentMarketplacePage />,
      "/agent/marketplace",
      "/agent/marketplace"
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /submit proposal|propose|bid/i })
      ).toBeInTheDocument();
    });
  });

  it("shows proposal form when Submit Proposal is clicked", async () => {
    renderPage(
      <AgentMarketplacePage />,
      "/agent/marketplace",
      "/agent/marketplace"
    );
    await waitFor(() => screen.getByRole("button", { name: /submit proposal|propose|bid/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit proposal|propose|bid/i }));
    expect(screen.getByLabelText(/commission/i)).toBeInTheDocument();
  });

  it("calls submitProposal when form is submitted", async () => {
    renderPage(
      <AgentMarketplacePage />,
      "/agent/marketplace",
      "/agent/marketplace"
    );
    // Open the form
    await waitFor(() => screen.getByRole("button", { name: /submit proposal/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit proposal/i }));
    // Fill required fields
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: "Jane Smith" } });
    fireEvent.change(screen.getByLabelText(/brokerage/i), { target: { value: "Premier Realty" } });
    fireEvent.change(screen.getByLabelText(/commission/i), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText(/est\. sale price/i), { target: { value: "550000" } });
    // Submit the form — by submitting the form element directly (avoids button ambiguity)
    const form = screen.getByLabelText(/your name/i).closest("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(listingService.submitProposal).toHaveBeenCalled();
    });
  });

  it("shows empty-state message when no open requests exist", async () => {
    vi.mocked(listingService.getOpenBidRequests).mockResolvedValueOnce([]);
    renderPage(
      <AgentMarketplacePage />,
      "/agent/marketplace",
      "/agent/marketplace"
    );
    await waitFor(() => {
      expect(screen.getByText(/no open|no listings|no requests/i)).toBeInTheDocument();
    });
  });

  it("displays bid deadline for each request", async () => {
    renderPage(
      <AgentMarketplacePage />,
      "/agent/marketplace",
      "/agent/marketplace"
    );
    await waitFor(() => {
      expect(screen.getByText(/deadline|closes/i)).toBeInTheDocument();
    });
  });
});

// ─── 9.2.3 Property snapshot ──────────────────────────────────────────────────

describe("ListingDetailPage — property snapshot (9.2.3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the HomeFax score from the property snapshot", async () => {
    vi.mocked(listingService.getBidRequest).mockResolvedValueOnce(mockBidRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValueOnce([mockProposal as any]);
    renderPage(<ListingDetailPage />, "/listing/BID_1", "/listing/:id");
    await waitFor(() => {
      expect(screen.getByText(/88/)).toBeInTheDocument();
    });
  });

  it("shows verified job count from the snapshot", async () => {
    vi.mocked(listingService.getBidRequest).mockResolvedValueOnce(mockBidRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValueOnce([mockProposal as any]);
    renderPage(<ListingDetailPage />, "/listing/BID_1", "/listing/:id");
    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument(); // exact verifiedJobCount
    });
  });
});

// ─── 9.2.4 Bid request visibility ─────────────────────────────────────────────

describe("ListingNewPage — visibility controls (9.2.4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders visibility radio buttons", async () => {
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    await waitFor(() => {
      expect(screen.getByLabelText(/open to all agents/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/invite.only/i)).toBeInTheDocument();
    });
  });

  it("defaults to open visibility", async () => {
    renderPage(<ListingNewPage />, "/listing/new", "/listing/new");
    await waitFor(() => {
      const radio = screen.getByLabelText(/open to all agents/i) as HTMLInputElement;
      expect(radio.checked).toBe(true);
    });
  });
});

// ─── 9.2.5 Deadline enforcement ───────────────────────────────────────────────

describe("AgentMarketplacePage — deadline enforcement (9.2.5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows open requests that have not expired", async () => {
    vi.mocked(listingService.getOpenBidRequests).mockResolvedValueOnce([mockOpenRequest as any]);
    renderPage(<AgentMarketplacePage />, "/agent/marketplace", "/agent/marketplace");
    await waitFor(() => {
      expect(screen.getByText(/Ocean view unit/i)).toBeInTheDocument();
    });
  });
});

// ─── 9.3.4 CMA comps ──────────────────────────────────────────────────────────

describe("AgentMarketplacePage — CMA comps (9.3.4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows an Add Comp button in the proposal form", async () => {
    vi.mocked(listingService.getOpenBidRequests).mockResolvedValueOnce([mockOpenRequest as any]);
    renderPage(<AgentMarketplacePage />, "/agent/marketplace", "/agent/marketplace");
    await waitFor(() => screen.getByText(/Submit Proposal/i));
    fireEvent.click(screen.getByText(/Submit Proposal/i));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add comp/i })).toBeInTheDocument();
    });
  });

  it("shows comp fields after clicking Add Comp", async () => {
    vi.mocked(listingService.getOpenBidRequests).mockResolvedValueOnce([mockOpenRequest as any]);
    renderPage(<AgentMarketplacePage />, "/agent/marketplace", "/agent/marketplace");
    await waitFor(() => screen.getByText(/Submit Proposal/i));
    fireEvent.click(screen.getByText(/Submit Proposal/i));
    await waitFor(() => screen.getByRole("button", { name: /add comp/i }));
    fireEvent.click(screen.getByRole("button", { name: /add comp/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/comp address/i)).toBeInTheDocument();
    });
  });
});

describe("ListingDetailPage — CMA comps display (9.3.4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows comp address in proposal details", async () => {
    vi.mocked(listingService.getBidRequest).mockResolvedValueOnce(mockBidRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValueOnce([mockProposal as any]);
    renderPage(<ListingDetailPage />, "/listing/BID_1", "/listing/:id");
    await waitFor(() => {
      expect(screen.getByText(/100 Oak Ave/i)).toBeInTheDocument();
    });
  });
});

// ─── 9.3.5 Proposal draft ─────────────────────────────────────────────────────

describe("AgentMarketplacePage — proposal draft (9.3.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows a Save Draft button in the proposal form", async () => {
    vi.mocked(listingService.getOpenBidRequests).mockResolvedValueOnce([mockOpenRequest as any]);
    renderPage(<AgentMarketplacePage />, "/agent/marketplace", "/agent/marketplace");
    await waitFor(() => screen.getByText(/Submit Proposal/i));
    fireEvent.click(screen.getByText(/Submit Proposal/i));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save draft/i })).toBeInTheDocument();
    });
  });

  it("pre-fills form from localStorage draft", async () => {
    localStorage.setItem("proposal_draft_BID_2", JSON.stringify({
      form: {
        agentName: "Drafted Agent", agentBrokerage: "Draft Realty",
        commissionBps: "300", estimatedSalePrice: "", estimatedDaysOnMarket: "",
        cmaSummary: "", marketingPlan: "", includedServices: "", coverLetter: "",
      },
      comps: [],
    }));
    vi.mocked(listingService.getOpenBidRequests).mockResolvedValueOnce([mockOpenRequest as any]);
    renderPage(<AgentMarketplacePage />, "/agent/marketplace", "/agent/marketplace");
    await waitFor(() => screen.getByText(/Submit Proposal/i));
    fireEvent.click(screen.getByText(/Submit Proposal/i));
    await waitFor(() => {
      expect(screen.getByDisplayValue("Drafted Agent")).toBeInTheDocument();
    });
  });
});
