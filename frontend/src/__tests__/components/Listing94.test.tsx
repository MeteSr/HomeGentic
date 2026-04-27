/**
 * TDD tests for Epic 9.4 — Proposal comparison enhancements
 *
 *   9.4.3 — HomeGentic score context per proposal (flag underpriced)
 *   9.4.5 — Post-selection contract upload
 *   9.4.6 — Counter-proposal flow (homeowner counters; agent accepts/rejects)
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ─── Mock data (vi.hoisted so factories can reference them) ───────────────────

const { mockRequest, mockAwardedRequest, mockProposal, mockAcceptedProposal, mockCounter } = vi.hoisted(() => {
  const now = Date.now();

  const mockProposal = {
    id: "PROP_1", requestId: "BID_1", agentId: "agent-1",
    agentName: "Jane Smith", agentBrokerage: "Premier Realty",
    commissionBps: 250, cmaSummary: "Comps suggest $520k–$540k",
    marketingPlan: "MLS + social", estimatedDaysOnMarket: 21,
    estimatedSalePrice: 52_000_000,   // $520k — above $500k desired
    includedServices: ["staging"], validUntil: now + 14 * 86_400_000,
    coverLetter: "I specialize here", status: "Pending" as const,
    createdAt: now - 1000, cmaComps: [],
  };

  const mockAcceptedProposal = { ...mockProposal, status: "Accepted" as const };

  const mockRequest = {
    id: "BID_1", propertyId: "prop-1", homeowner: "local",
    targetListDate: now + 30 * 86_400_000, desiredSalePrice: 50_000_000,
    notes: "Great unit", bidDeadline: now - 1000,
    status: "Open" as const, createdAt: now - 5000,
    visibility: "open" as const, invitedAgentIds: [] as string[],
    propertySnapshot: { score: 88, verifiedJobCount: 7, systemNotes: "Roof: 8 yrs" },
  };

  const mockAwardedRequest = {
    ...mockRequest, status: "Awarded" as const,
    contractFile: undefined as any,
  };

  const mockCounter = {
    id: "COUNTER_1", proposalId: "PROP_1", requestId: "BID_1",
    fromRole: "homeowner" as const, commissionBps: 225,
    notes: "Can you do 2.25%?", status: "Pending" as const,
    createdAt: now - 500,
  };

  return { mockRequest, mockAwardedRequest, mockProposal, mockAcceptedProposal, mockCounter };
});

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("@/services/listing", () => ({
  listingService: {
    getBidRequest:          vi.fn().mockResolvedValue(mockRequest),
    getProposalsForRequest: vi.fn().mockResolvedValue([mockProposal]),
    acceptProposal:         vi.fn().mockResolvedValue(undefined),
    uploadContract:         vi.fn().mockResolvedValue(undefined),
    counterProposal:        vi.fn().mockResolvedValue(mockCounter),
    respondToCounter:       vi.fn().mockResolvedValue(undefined),
    getCountersForProposal: vi.fn().mockResolvedValue([]),
    getOpenBidRequests:     vi.fn().mockResolvedValue([]),
    getMyProposals:         vi.fn().mockResolvedValue([mockProposal]),
    getMyCounters:          vi.fn().mockResolvedValue([mockCounter]),
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
  computeScore: vi.fn().mockReturnValue(88),
  loadHistory: vi.fn().mockReturnValue([]),
  getScoreGrade: vi.fn().mockReturnValue("A"),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({
    principal: "local", profile: { role: "Homeowner", tier: "Pro" },
    isAuthenticated: true,
    tier: null, setTier: vi.fn(), setProfile: vi.fn(),
  }),
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({
    properties: [{ id: "prop-1", address: "123 Main St" }],
  }),
}));

vi.mock("@/store/jobStore", () => ({
  useJobStore: () => ({ jobs: [] }),
}));
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <>{children}</>,
}));

import ListingDetailPage  from "@/pages/ListingDetailPage";
import AgentMarketplacePage from "@/pages/AgentMarketplacePage";
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

function renderMarketplace() {
  return render(
    <MemoryRouter initialEntries={["/agent/marketplace"]}>
      <Routes>
        <Route path="/agent/marketplace" element={<AgentMarketplacePage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── 9.4.3 Score context ──────────────────────────────────────────────────────

describe("ListingDetailPage — HomeGentic score context (9.4.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockProposal as any]);
    vi.mocked(listingService.getCountersForProposal).mockResolvedValue([]);
  });

  it("shows HomeGentic premium potential label", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/premium potential|homegentic range|homegentic estimate/i)).toBeInTheDocument();
    });
  });

  it("shows the premium dollar range from the snapshot score", async () => {
    renderDetail();
    await waitFor(() => {
      // premiumEstimate(88) → { low: 20000, high: 35000 }
      expect(screen.getByText(/\$20,000|\$35,000|20k|35k/i)).toBeInTheDocument();
    });
  });

  it("shows 'meets target' badge when estimatedSalePrice >= desiredSalePrice", async () => {
    // mockProposal.estimatedSalePrice = 52_000_000 >= 50_000_000 desired
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/meets.*target|at.*target|above.*target/i)).toBeInTheDocument();
    });
  });

  it("shows warning badge when estimatedSalePrice is below desired price", async () => {
    const lowProposal = { ...mockProposal, estimatedSalePrice: 47_000_000 }; // $470k < $500k
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([lowProposal as any]);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/below.*target|under.*target|underpriced/i)).toBeInTheDocument();
    });
  });
});

// ─── 9.4.5 Contract upload ────────────────────────────────────────────────────

describe("ListingDetailPage — contract upload (9.4.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.getCountersForProposal).mockResolvedValue([]);
  });

  it("shows contract upload section when request is Awarded", async () => {
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockAwardedRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockAcceptedProposal as any]);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/listing agreement|signed agreement|contract|upload/i)).toBeInTheDocument();
    });
  });

  it("does not show contract upload when request is still Open", async () => {
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockProposal as any]);
    renderDetail();
    await waitFor(() => screen.getByText(/Jane Smith/i)); // wait for proposals to load
    expect(screen.queryByText(/listing agreement/i)).not.toBeInTheDocument();
  });

  it("calls uploadContract when file is submitted", async () => {
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockAwardedRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockAcceptedProposal as any]);
    renderDetail();
    await waitFor(() => screen.getByRole("button", { name: /upload.*contract|confirm.*upload/i }));
    fireEvent.click(screen.getByRole("button", { name: /upload.*contract|confirm.*upload/i }));
    await waitFor(() => {
      expect(listingService.uploadContract).toHaveBeenCalled();
    });
  });
});

// ─── 9.4.6 Counter-proposal ───────────────────────────────────────────────────

describe("ListingDetailPage — counter-proposal (9.4.6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.getBidRequest).mockResolvedValue(mockRequest as any);
    vi.mocked(listingService.getProposalsForRequest).mockResolvedValue([mockProposal as any]);
    vi.mocked(listingService.getCountersForProposal).mockResolvedValue([]);
    vi.mocked(listingService.counterProposal).mockResolvedValue(mockCounter as any);
  });

  it("shows a Counter button for Open Pending proposals", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /counter/i })).toBeInTheDocument();
    });
  });

  it("counter form appears after clicking Counter", async () => {
    renderDetail();
    await waitFor(() => screen.getByRole("button", { name: /counter/i }));
    fireEvent.click(screen.getByRole("button", { name: /counter/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/counter commission/i)).toBeInTheDocument();
    });
  });

  it("counterProposal is called on form submit", async () => {
    renderDetail();
    await waitFor(() => screen.getByRole("button", { name: /counter/i }));
    fireEvent.click(screen.getByRole("button", { name: /counter/i }));
    await waitFor(() => screen.getByLabelText(/counter commission/i));
    // commission field should already have a default value
    fireEvent.submit(screen.getByRole("form", { name: /counter/i }));
    await waitFor(() => {
      expect(listingService.counterProposal).toHaveBeenCalled();
    });
  });

  it("shows existing counter status on proposal", async () => {
    vi.mocked(listingService.getCountersForProposal).mockResolvedValue([mockCounter as any]);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/2\.25%|counter offer|counter.*pending/i)).toBeInTheDocument();
    });
  });
});

describe("AgentMarketplacePage — respond to counter (9.4.6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.getOpenBidRequests).mockResolvedValue([]);
    vi.mocked(listingService.getMyCounters).mockResolvedValue([mockCounter as any]);
    vi.mocked(listingService.respondToCounter).mockResolvedValue(undefined);
  });

  it("shows pending counters section", async () => {
    renderMarketplace();
    await waitFor(() => {
      expect(screen.getByText(/pending counter|counter offer/i)).toBeInTheDocument();
    });
  });

  it("shows the counter commission rate", async () => {
    renderMarketplace();
    await waitFor(() => {
      expect(screen.getByText(/2\.25%|225/)).toBeInTheDocument();
    });
  });

  it("Accept counter button calls respondToCounter with 'accept'", async () => {
    renderMarketplace();
    await waitFor(() => screen.getByRole("button", { name: /accept/i }));
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    await waitFor(() => {
      expect(listingService.respondToCounter).toHaveBeenCalledWith("COUNTER_1", "accept");
    });
  });

  it("Decline counter button calls respondToCounter with 'reject'", async () => {
    renderMarketplace();
    await waitFor(() => screen.getByRole("button", { name: /decline|reject/i }));
    fireEvent.click(screen.getByRole("button", { name: /decline|reject/i }));
    await waitFor(() => {
      expect(listingService.respondToCounter).toHaveBeenCalledWith("COUNTER_1", "reject");
    });
  });
});
