/**
 * TDD tests for Epic 9.6 — Agent discovery
 *
 *   9.6.1 — Agent browse / search page (/agents)
 *   9.6.2 — "Request proposal from this agent" direct invite
 *   9.6.3 — HomeGentic-verified transaction badge on agent profiles
 */

import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ─── Mock data (vi.hoisted so factories can reference them) ───────────────────

const { mockAgentA, mockAgentB, mockProperty, mockPerf } = vi.hoisted(() => {
  const mockAgentA = {
    id: "agent-a", name: "Alice Chen", brokerage: "Premier Realty",
    licenseNumber: "LIC-001", bio: "Expert in SF Bay area",
    statesLicensed: ["CA"],
    avgDaysOnMarket: 18, listingsLast12Months: 12,
    isVerified: true, homeGenticTransactionCount: 3,
    typicalCommissionBps: 250,
    phone: "415-555-0001", email: "alice@example.com",
    createdAt: 0, updatedAt: 0,
  };
  const mockAgentB = {
    id: "agent-b", name: "Bob Torres", brokerage: "Bay City Homes",
    licenseNumber: "LIC-002", bio: "Reliable NYC agent",
    statesLicensed: ["NY"],
    avgDaysOnMarket: 28, listingsLast12Months: 5,
    isVerified: false, homeGenticTransactionCount: 0,
    typicalCommissionBps: 300,
    phone: "212-555-0002", email: "bob@example.com",
    createdAt: 0, updatedAt: 0,
  };
  const mockProperty = { id: "prop-1", address: "123 Main St" };
  const mockPerf = {
    requestId: "BID_1", agentId: "agent-a",
    estimatedDOM: 21, actualDOM: 19,
    estimatedSalePrice: 52_000_000, actualSalePrice: 51_800_000,
    promisedCommBps: 250, chargedCommBps: 250,
    domAccuracyScore: 76, priceAccuracyScore: 88,
    commissionHonestyScore: 100, overallScore: 82,
    recordedAt: Date.now(),
  };
  return { mockAgentA, mockAgentB, mockProperty, mockPerf };
});

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("@/services/agent", () => ({
  agentService: {
    getAllProfiles:  vi.fn().mockResolvedValue([mockAgentA, mockAgentB]),
    getPublicProfile: vi.fn().mockResolvedValue(mockAgentA),
    getReviews:       vi.fn().mockResolvedValue([]),
  },
  computeAverageRating: () => 0,
}));

vi.mock("@/services/listing", () => ({
  listingService: {
    getAgentPerformanceRecords: vi.fn().mockResolvedValue([mockPerf]),
    createDirectInvite:         vi.fn().mockResolvedValue({ id: "BID_NEW" }),
  },
}));

vi.mock("@/services/payment", () => ({
  paymentService: {
    getMyAgentCredits: vi.fn(() => Promise.resolve(0)),
    getMySubscription: vi.fn().mockResolvedValue({ tier: "Pro" }),
  },
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({
    principal: "local",
    profile: { role: "Homeowner", tier: "Pro" },
    isAuthenticated: true,
    tier: null, setTier: vi.fn(), setProfile: vi.fn(),
  }),
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({ properties: [mockProperty] }),
}));

vi.mock("@/store/jobStore", () => ({
  useJobStore: () => ({ jobs: [] }),
}));
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <>{children}</>,
}));

import AgentBrowsePage from "@/pages/AgentBrowsePage";
import AgentPublicPage  from "@/pages/AgentPublicPage";
import { agentService }   from "@/services/agent";
import { listingService } from "@/services/listing";

function renderBrowse() {
  return render(
    <MemoryRouter initialEntries={["/agents"]}>
      <Routes>
        <Route path="/agents" element={<AgentBrowsePage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderProfile(agentId = "agent-a") {
  return render(
    <MemoryRouter initialEntries={[`/agent/${agentId}`]}>
      <Routes>
        <Route path="/agent/:id" element={<AgentPublicPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── 9.6.1 Agent browse page ──────────────────────────────────────────────────

describe("AgentBrowsePage — directory (9.6.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agentService.getAllProfiles).mockResolvedValue([mockAgentA, mockAgentB] as any);
  });

  it("shows the page heading", async () => {
    renderBrowse();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /find an agent|agent directory/i })).toBeInTheDocument();
    });
  });

  it("renders agent cards with names and brokerages", async () => {
    renderBrowse();
    await waitFor(() => {
      expect(screen.getByText("Alice Chen")).toBeInTheDocument();
      expect(screen.getByText("Bob Torres")).toBeInTheDocument();
      expect(screen.getByText("Premier Realty")).toBeInTheDocument();
    });
  });

  it("state chip filters to agents licensed in that state", async () => {
    renderBrowse();
    await waitFor(() => screen.getByText("Alice Chen"));
    fireEvent.click(screen.getByRole("button", { name: "CA" }));
    await waitFor(() => {
      expect(screen.getByText("Alice Chen")).toBeInTheDocument();
      expect(screen.queryByText("Bob Torres")).not.toBeInTheDocument();
    });
  });

  it("HomeGentic-only checkbox shows only agents with transactions", async () => {
    renderBrowse();
    await waitFor(() => screen.getByText("Bob Torres"));
    fireEvent.click(screen.getByRole("checkbox", { name: /homegentic only/i }));
    await waitFor(() => {
      expect(screen.getByText("Alice Chen")).toBeInTheDocument();
      expect(screen.queryByText("Bob Torres")).not.toBeInTheDocument();
    });
  });

  it("shows HomeGentic Verified Transaction badge on qualifying cards", async () => {
    renderBrowse();
    await waitFor(() => {
      expect(screen.getByText(/homegentic verified transaction/i)).toBeInTheDocument();
    });
  });

  it("agent card links to /agent/:id", async () => {
    renderBrowse();
    await waitFor(() => screen.getByText("Alice Chen"));
    const link = screen.getAllByRole("link").find(
      (l) => l.getAttribute("href") === "/agent/agent-a"
    );
    expect(link).toBeDefined();
  });
});

// ─── 9.6.2 Direct proposal invite ────────────────────────────────────────────

describe("AgentPublicPage — direct invite (9.6.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agentService.getPublicProfile).mockResolvedValue(mockAgentA as any);
    vi.mocked(agentService.getReviews).mockResolvedValue([]);
    vi.mocked(listingService.getAgentPerformanceRecords).mockResolvedValue([mockPerf as any]);
  });

  it("shows a 'Request Proposal' button on the agent profile", async () => {
    renderProfile();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /request proposal/i })).toBeInTheDocument();
    });
  });

  it("clicking Request Proposal shows a property selector", async () => {
    renderProfile();
    await waitFor(() => screen.getByRole("button", { name: /request proposal/i }));
    fireEvent.click(screen.getByRole("button", { name: /request proposal/i }));
    // Poll until the select appears (mirrors the pattern in the "submitting" test below),
    // then assert synchronously to avoid timer-reset hangs from continuous re-renders.
    await waitFor(() => screen.getByLabelText(/select property/i));
    expect(screen.getByLabelText(/select property/i)).toBeInTheDocument();
  });

  it("submitting the invite form calls createDirectInvite with agentId and propertyId", async () => {
    renderProfile();
    await waitFor(() => screen.getByRole("button", { name: /request proposal/i }));
    fireEvent.click(screen.getByRole("button", { name: /request proposal/i }));
    await waitFor(() => screen.getByLabelText(/select property/i));
    fireEvent.change(screen.getByLabelText(/select property/i), {
      target: { value: "prop-1" },
    });
    fireEvent.submit(screen.getByRole("form", { name: /request proposal/i }));
    await waitFor(() => {
      expect(listingService.createDirectInvite).toHaveBeenCalledWith("agent-a", "prop-1");
    });
  });
});

// ─── 9.6.3 Verified transaction badge ────────────────────────────────────────

describe("AgentPublicPage — verified transaction badge (9.6.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agentService.getPublicProfile).mockResolvedValue(mockAgentA as any);
    vi.mocked(agentService.getReviews).mockResolvedValue([]);
  });

  it("shows 'HomeGentic Verified Transaction' badge when agent has perf records", async () => {
    vi.mocked(listingService.getAgentPerformanceRecords).mockResolvedValue([mockPerf as any]);
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText(/homegentic verified transaction/i)).toBeInTheDocument();
    });
  });

  it("does not show the badge when the agent has no perf records", async () => {
    vi.mocked(listingService.getAgentPerformanceRecords).mockResolvedValue([]);
    renderProfile();
    await waitFor(() => screen.getByText("Alice Chen"));
    expect(screen.queryByText(/homegentic verified transaction/i)).not.toBeInTheDocument();
  });
});
