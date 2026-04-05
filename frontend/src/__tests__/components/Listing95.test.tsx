/**
 * TDD tests for Epic 9.5 — Transaction tracking + agent performance scoring
 *
 *   9.5.1 — Listing milestone timeline
 *   9.5.2 — Offer log
 *   9.5.3 — Final sale price logging
 *   9.5.4 — Agent performance score post-close
 */

import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ─── Mock data (vi.hoisted so factories can reference them) ───────────────────

const {
  mockRequest, mockAwardedNoClose, mockProposal,
  mockOffer, mockOffer2, mockClose, mockPerformance, mockProfile,
} = vi.hoisted(() => {
  const now = Date.now();

  const mockProposal = {
    id: "PROP_1", requestId: "BID_1", agentId: "agent-1",
    agentName: "Jane Smith", agentBrokerage: "Premier Realty",
    commissionBps: 250, cmaSummary: "Strong comps",
    marketingPlan: "MLS + social", estimatedDaysOnMarket: 21,
    estimatedSalePrice: 52_000_000,
    includedServices: ["staging"], validUntil: now + 14 * 86_400_000,
    coverLetter: "Expert here", status: "Accepted" as const,
    createdAt: now - 1000, cmaComps: [],
  };

  const milestones = [
    { key: "agreement_signed", label: "Agreement Signed",    completedAt: now - 10_000, completedBy: "homeowner" as const },
    { key: "listed_on_mls",    label: "Listed on MLS",       completedAt: now - 8_000,  completedBy: "agent" as const },
    { key: "first_showing",    label: "First Showing",       completedAt: null, completedBy: null },
    { key: "offer_received",   label: "Offer Received",      completedAt: null, completedBy: null },
    { key: "under_contract",   label: "In Escrow",           completedAt: null, completedBy: null },
    { key: "inspection",       label: "Inspection Complete", completedAt: null, completedBy: null },
    { key: "appraisal",        label: "Appraisal Complete",  completedAt: null, completedBy: null },
    { key: "closed",           label: "Sale Closed",         completedAt: null, completedBy: null },
  ];

  const mockOffer = {
    id: "OFFER_1", requestId: "BID_1",
    offerAmountCents: 50_500_000,       // $505,000
    contingencies: ["financing", "inspection"],
    closeDate: "2025-03-15",
    loggedAt: now - 500,
    deltaFromListingPriceCents: 500_000,   // $5,000 above list
    deltaFromHomeGenticEstimateCents: -14_500_000,
  };

  const mockOffer2 = {
    id: "OFFER_2", requestId: "BID_1",
    offerAmountCents: 50_500_000,
    contingencies: ["financing", "inspection"],
    closeDate: "2025-04-01",
    loggedAt: now,
    deltaFromListingPriceCents: 500_000,
    deltaFromHomeGenticEstimateCents: -14_500_000,
  };

  const mockClose = {
    requestId: "BID_1",
    finalSalePriceCents: 51_800_000,   // $518,000
    actualCloseDateMs: now - 2_000,
    homeGenticBaselineCents: 35_000_000,
    actualPremiumCents: 16_800_000,
    recordedAt: now - 1_000,
  };

  const mockPerformance = {
    requestId: "BID_1", agentId: "agent-1",
    estimatedDOM: 21, actualDOM: 19,
    estimatedSalePrice: 52_000_000, actualSalePrice: 51_800_000,
    promisedCommBps: 250, chargedCommBps: 250,
    domAccuracyScore: 76,
    priceAccuracyScore: 88,
    commissionHonestyScore: 100,
    overallScore: 82,
    recordedAt: now,
  };

  // mockRequest: Awarded, has milestones + offers + closedData
  const mockRequest = {
    id: "BID_1", propertyId: "prop-1", homeowner: "local",
    targetListDate: now + 30 * 86_400_000, desiredSalePrice: 50_000_000,
    notes: "Great unit", bidDeadline: now - 1000,
    status: "Awarded" as const, createdAt: now - 5000,
    visibility: "open" as const, invitedAgentIds: [] as string[],
    propertySnapshot: { score: 88, verifiedJobCount: 7, systemNotes: "Roof: 8 yrs" },
    milestones,
    offers: [mockOffer],
    closedData: mockClose,
  };

  // mockAwardedNoClose: Awarded, milestones, no offers, no closedData
  const mockAwardedNoClose = {
    ...mockRequest,
    offers: [] as any[],
    closedData: undefined as any,
  };

  const mockProfile = {
    id: "agent-1", name: "Jane Smith", brokerage: "Premier Realty",
    licenseNumber: "LIC-123", bio: "Expert", statesLicensed: ["CA"],
    avgDaysOnMarket: 21, listingsLast12Months: 8, isVerified: true,
    createdAt: now - 86_400_000,
  };

  return { mockRequest, mockAwardedNoClose, mockProposal, mockOffer, mockOffer2, mockClose, mockPerformance, mockProfile };
});

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("@/services/listing", () => ({
  listingService: {
    getBidRequest:              vi.fn().mockResolvedValue(mockRequest),
    getProposalsForRequest:     vi.fn().mockResolvedValue([mockProposal]),
    getCountersForProposal:     vi.fn().mockResolvedValue([]),
    updateMilestone:            vi.fn().mockResolvedValue(mockRequest),
    logOffer:                   vi.fn().mockResolvedValue(mockOffer2),
    logClose:                   vi.fn().mockResolvedValue(mockClose),
    logAgentPerformance:        vi.fn().mockResolvedValue(mockPerformance),
    getAgentPerformanceRecords: vi.fn().mockResolvedValue([mockPerformance]),
  },
  computeNetProceeds: (price: number, commBps: number, closingBps: number) =>
    price - Math.round(price * commBps / 10_000) - Math.round(price * closingBps / 10_000),
  formatCommission: (bps: number) => (bps / 100).toFixed(2) + "%",
  isDeadlinePassed: (ms: number) => ms <= Date.now(),
  MILESTONE_STEPS: [
    { key: "agreement_signed", label: "Agreement Signed" },
    { key: "listed_on_mls",    label: "Listed on MLS" },
    { key: "first_showing",    label: "First Showing" },
    { key: "offer_received",   label: "Offer Received" },
    { key: "under_contract",   label: "In Escrow" },
    { key: "inspection",       label: "Inspection Complete" },
    { key: "appraisal",        label: "Appraisal Complete" },
    { key: "closed",           label: "Sale Closed" },
  ],
  initMilestones: () => [
    { key: "agreement_signed", label: "Agreement Signed",    completedAt: null, completedBy: null },
    { key: "listed_on_mls",    label: "Listed on MLS",       completedAt: null, completedBy: null },
    { key: "first_showing",    label: "First Showing",       completedAt: null, completedBy: null },
    { key: "offer_received",   label: "Offer Received",      completedAt: null, completedBy: null },
    { key: "under_contract",   label: "In Escrow",           completedAt: null, completedBy: null },
    { key: "inspection",       label: "Inspection Complete", completedAt: null, completedBy: null },
    { key: "appraisal",        label: "Appraisal Complete",  completedAt: null, completedBy: null },
    { key: "closed",           label: "Sale Closed",         completedAt: null, completedBy: null },
  ],
}));

vi.mock("@/services/scoreService", () => ({
  premiumEstimate: (score: number) => score >= 85 ? { low: 20_000, high: 35_000 } : null,
  computeScore:    vi.fn().mockReturnValue(88),
  loadHistory:     vi.fn().mockReturnValue([]),
  getScoreGrade:   vi.fn().mockReturnValue("A"),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({
    principal: "local", profile: { role: "Homeowner", tier: "Pro" },
    isAuthenticated: true,
  }),
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({ properties: [{ id: "prop-1", address: "123 Main St" }] }),
}));

vi.mock("@/store/jobStore", () => ({
  useJobStore: () => ({ jobs: [] }),
}));

vi.mock("@/services/agent", () => ({
  agentService: {
    getPublicProfile: vi.fn().mockResolvedValue(mockProfile),
    getReviews:       vi.fn().mockResolvedValue([]),
  },
  computeAverageRating: () => null,
}));

import ListingDetailPage  from "@/pages/ListingDetailPage";
import AgentPublicPage    from "@/pages/AgentPublicPage";
import { listingService } from "@/services/listing";

function renderDetail(path = "/listing/BID_1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/listing/:id" element={<ListingDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderAgent(agentId = "agent-1") {
  return render(
    <MemoryRouter initialEntries={[`/agent/${agentId}`]}>
      <Routes>
        <Route path="/agent/:id" element={<AgentPublicPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── 9.5.1 Milestone timeline ─────────────────────────────────────────────────

describe("ListingDetailPage — milestone timeline (9.5.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockProposal as any]);
    vi.mocked(listingService.getCountersForProposal).mockResolvedValue([]);
  });

  it("shows the 'Transaction Timeline' section heading", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("Transaction Timeline")).toBeInTheDocument();
    });
  });

  it("shows milestone step labels", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("Agreement Signed")).toBeInTheDocument();
      expect(screen.getByText("Listed on MLS")).toBeInTheDocument();
      expect(screen.getByText("First Showing")).toBeInTheDocument();
      expect(screen.getByText("Sale Closed")).toBeInTheDocument();
    });
  });

  it("shows a 'Mark Done' button for pending milestones", async () => {
    renderDetail();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /mark first showing complete/i })
      ).toBeInTheDocument();
    });
  });

  it("completed milestones do not show a Mark Done button", async () => {
    renderDetail();
    await waitFor(() => screen.getByText("Agreement Signed"));
    expect(
      screen.queryByRole("button", { name: /mark agreement signed complete/i })
    ).not.toBeInTheDocument();
  });

  it("clicking Mark Done calls updateMilestone with the correct key", async () => {
    renderDetail();
    await waitFor(() => screen.getByRole("button", { name: /mark first showing complete/i }));
    fireEvent.click(screen.getByRole("button", { name: /mark first showing complete/i }));
    await waitFor(() => {
      expect(listingService.updateMilestone).toHaveBeenCalledWith(
        "BID_1", "first_showing", expect.any(String)
      );
    });
  });
});

// ─── 9.5.2 Offer log ──────────────────────────────────────────────────────────

describe("ListingDetailPage — offer log (9.5.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockProposal as any]);
    vi.mocked(listingService.getCountersForProposal).mockResolvedValue([]);
  });

  it("shows the 'Offers Received' section heading", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("Offers Received")).toBeInTheDocument();
    });
  });

  it("shows offer amount input and close date input", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByLabelText(/offer amount/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/close date/i)).toBeInTheDocument();
    });
  });

  it("shows contingency checkboxes", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByLabelText(/financing/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/inspection contingency/i)).toBeInTheDocument();
    });
  });

  it("calls logOffer when form is submitted with a valid amount", async () => {
    renderDetail();
    await waitFor(() => screen.getByLabelText(/offer amount/i));
    fireEvent.change(screen.getByLabelText(/offer amount/i), { target: { value: "505000" } });
    fireEvent.change(screen.getByLabelText(/close date/i), { target: { value: "2025-04-01" } });
    fireEvent.submit(screen.getByRole("form", { name: /log offer/i }));
    await waitFor(() => {
      expect(listingService.logOffer).toHaveBeenCalledWith(
        "BID_1",
        expect.objectContaining({ offerAmountCents: 50_500_000 })
      );
    });
  });

  it("displays existing offer amounts", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/\$505,000|505,000/)).toBeInTheDocument();
    });
  });

  it("shows delta from listing price as positive when offer exceeds list", async () => {
    renderDetail();
    await waitFor(() => {
      // $5,000 above list
      expect(screen.getByText(/\+\$5,000|\+5,000|above list/i)).toBeInTheDocument();
    });
  });
});

// ─── 9.5.3 Final sale price ───────────────────────────────────────────────────

describe("ListingDetailPage — final sale price (9.5.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.getCountersForProposal).mockResolvedValue([]);
  });

  it("shows 'Record Final Sale' form when Awarded and not yet closed", async () => {
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockAwardedNoClose as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockProposal as any]);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/record final sale/i)).toBeInTheDocument();
    });
  });

  it("does not show 'Record Final Sale' when closedData already exists", async () => {
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockProposal as any]);
    renderDetail();
    await waitFor(() => screen.getByText("Transaction Timeline"));
    expect(screen.queryByLabelText(/final sale price/i)).not.toBeInTheDocument();
  });

  it("calls logClose with the price in cents", async () => {
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockAwardedNoClose as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockProposal as any]);
    renderDetail();
    await waitFor(() => screen.getByLabelText(/final sale price/i));
    fireEvent.change(screen.getByLabelText(/final sale price/i), { target: { value: "518000" } });
    fireEvent.change(screen.getByLabelText(/actual close date/i), { target: { value: "2025-03-20" } });
    fireEvent.submit(screen.getByRole("form", { name: /record final sale/i }));
    await waitFor(() => {
      expect(listingService.logClose).toHaveBeenCalledWith(
        "BID_1",
        expect.objectContaining({ finalSalePriceCents: 51_800_000 })
      );
    });
  });

  it("displays the final sale price after close is recorded", async () => {
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockProposal as any]);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/\$518,000|518,000/)).toBeInTheDocument();
    });
  });

  it("shows the actual HomeGentic premium after close", async () => {
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockProposal as any]);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/actual premium|homegentic premium/i)).toBeInTheDocument();
    });
  });
});

// ─── 9.5.4 Agent performance (homeowner side) ─────────────────────────────────

describe("ListingDetailPage — agent performance logging (9.5.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockProposal as any]);
    vi.mocked(listingService.getCountersForProposal).mockResolvedValue([]);
  });

  it("shows commission verification section after close", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/rate this transaction|commission charged|actual commission/i)).toBeInTheDocument();
    });
  });

  it("shows a charged commission input", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByLabelText(/commission charged|actual commission/i)).toBeInTheDocument();
    });
  });

  it("calls logAgentPerformance on submit", async () => {
    renderDetail();
    await waitFor(() => screen.getByLabelText(/commission charged|actual commission/i));
    fireEvent.change(screen.getByLabelText(/commission charged|actual commission/i), { target: { value: "250" } });
    fireEvent.submit(screen.getByRole("form", { name: /agent performance/i }));
    await waitFor(() => {
      expect(listingService.logAgentPerformance).toHaveBeenCalledWith(
        "BID_1",
        expect.objectContaining({ chargedCommBps: 250 })
      );
    });
  });
});

// ─── 9.5.4 Agent performance score (public profile) ──────────────────────────

describe("AgentPublicPage — performance score (9.5.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.getAgentPerformanceRecords).mockResolvedValue([mockPerformance as any]);
  });

  it("shows an 'Agent Performance' section", async () => {
    renderAgent();
    await waitFor(() => {
      expect(screen.getByText(/agent performance/i)).toBeInTheDocument();
    });
  });

  it("shows the overall performance score", async () => {
    renderAgent();
    await waitFor(() => {
      const perf = screen.getByRole("region", { name: /agent performance/i });
      expect(within(perf).getByText("82")).toBeInTheDocument();
    });
  });

  it("shows DOM accuracy score", async () => {
    renderAgent();
    await waitFor(() => {
      const perf = screen.getByRole("region", { name: /agent performance/i });
      expect(within(perf).getByText(/days on market|dom accuracy/i)).toBeInTheDocument();
      expect(within(perf).getByText("76")).toBeInTheDocument();
    });
  });

  it("shows price accuracy score", async () => {
    renderAgent();
    await waitFor(() => {
      const perf = screen.getByRole("region", { name: /agent performance/i });
      expect(within(perf).getByText(/price accuracy/i)).toBeInTheDocument();
      expect(within(perf).getByText("88")).toBeInTheDocument();
    });
  });

  it("shows commission honesty score", async () => {
    renderAgent();
    await waitFor(() => {
      const perf = screen.getByRole("region", { name: /agent performance/i });
      expect(within(perf).getByText(/commission honesty/i)).toBeInTheDocument();
      expect(within(perf).getByText("100")).toBeInTheDocument();
    });
  });

  it("does not show performance section when no records exist", async () => {
    vi.mocked(listingService.getAgentPerformanceRecords).mockResolvedValue([]);
    renderAgent();
    await waitFor(() => screen.getByText("Jane Smith"));
    expect(screen.queryByText(/agent performance/i)).not.toBeInTheDocument();
  });
});
