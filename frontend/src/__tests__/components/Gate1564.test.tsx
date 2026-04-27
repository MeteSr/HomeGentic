/**
 * 15.6.4: Agent Marketplace and FSBO flows are accessible to all paying tiers.
 *
 * The old Free-tier UpgradeGate was removed — Basic is now the minimum tier
 * and costs money.  All tests verify that Basic+ users see the real content.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <>{children}</>,
}));

// ─── Mutable tier (controlled per-test) ──────────────────────────────────────

let mockTier: "Basic" | "Pro" | "Premium" | "ContractorPro" = "Basic";

vi.mock("@/services/payment", () => ({
  paymentService: {
    getMyAgentCredits: vi.fn(() => Promise.resolve(0)),
    getMySubscription: vi.fn().mockImplementation(() =>
      Promise.resolve({ tier: mockTier, expiresAt: null, cancelledAt: null })
    ),
  },
}));

// ─── Store / layout mocks ─────────────────────────────────────────────────────

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({
    principal: "test-principal",
    profile: { role: "Homeowner" },
    isAuthenticated: true,
    tier: null,
    setTier: vi.fn(),
    setProfile: vi.fn(),
  }),
}));

vi.mock("@/store/propertyStore", () => {
  const properties = [{ id: "42", address: "123 Maple St" }];
  return { usePropertyStore: () => ({ properties }) };
});

vi.mock("@/store/jobStore", () => {
  const jobs: never[] = [];
  return { useJobStore: () => ({ jobs }) };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock("@/components/VoiceAgent", () => ({
  VoiceAgent: () => null,
}));

vi.mock("@/services/job", () => ({
  jobService: {
    getAll:        vi.fn().mockResolvedValue([]),
    getByProperty: vi.fn().mockResolvedValue([]),
  },
}));

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("@/services/listing", () => ({
  listingService: {
    createBidRequest:       vi.fn().mockResolvedValue({}),
    getMyBidRequests:       vi.fn().mockResolvedValue([]),
    getOpenBidRequests:     vi.fn().mockResolvedValue([]),
    getMyCounters:          vi.fn().mockResolvedValue([]),
  },
  formatCommission: vi.fn().mockReturnValue("2.50%"),
  isDeadlinePassed: vi.fn().mockReturnValue(false),
  computeNetProceeds: vi.fn().mockReturnValue(0),
}));

vi.mock("@/services/agent", () => ({
  agentService: {
    getAllProfiles: vi.fn().mockResolvedValue([
      {
        id: "a1", name: "Alice Agent", brokerage: "Realty Co",
        licenseNumber: "LIC-001", bio: "Agent bio",
        statesLicensed: ["TX"], avgDaysOnMarket: 20,
        listingsLast12Months: 5, isVerified: true,
        homeGenticTransactionCount: 2, typicalCommissionBps: 250,
        phone: "555-0001", email: "alice@example.com",
        createdAt: 0, updatedAt: 0,
      },
    ]),
  },
  computeAverageRating: vi.fn().mockReturnValue(0),
}));

vi.mock("@/services/fsbo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsbo")>();
  return {
    ...actual,
    fsboService: {
      getRecord:   vi.fn().mockReturnValue(null),
      setFsboMode: vi.fn(),
      advanceStep: vi.fn(),
      deactivate:  vi.fn(),
    },
  };
});

vi.mock("@/services/mlsService", () => ({
  mlsService: { submit: vi.fn().mockResolvedValue({ listingId: "x", url: "u", status: "submitted" }) },
}));

vi.mock("@/services/property", () => ({
  propertyService: {
    getAll:          vi.fn().mockResolvedValue([]),
    getMyProperties: vi.fn().mockResolvedValue([]),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import ListingNewPage  from "@/pages/ListingNewPage";
import AgentBrowsePage from "@/pages/AgentBrowsePage";
import FsboPanel       from "@/components/FsboPanel";
import { paymentService } from "@/services/payment";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderListing() {
  return render(
    <MemoryRouter initialEntries={["/listing/new"]}>
      <Routes>
        <Route path="/listing/new" element={<ListingNewPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderBrowse() {
  return render(
    <MemoryRouter initialEntries={["/agents"]}>
      <Routes>
        <Route path="/agents" element={<AgentBrowsePage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderFsboPanel(tier = "Pro") {
  return render(
    <MemoryRouter>
      <FsboPanel
        propertyId="42"
        score={72}
        verifiedJobCount={3}
        hasReport={true}
      />
    </MemoryRouter>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ListingNewPage — accessible to all paying tiers (15.6.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentService.getMySubscription).mockImplementation(() =>
      Promise.resolve({ tier: mockTier, expiresAt: null, cancelledAt: null })
    );
  });

  it("Basic user sees the listing form", async () => {
    mockTier = "Basic";
    renderListing();
    await waitFor(() =>
      expect(screen.getByText(/list your home/i)).toBeInTheDocument()
    );
  });

  it("Pro user sees the listing form", async () => {
    mockTier = "Pro";
    renderListing();
    await waitFor(() =>
      expect(screen.getByText(/list your home/i)).toBeInTheDocument()
    );
  });

  it("Premium user sees the listing form", async () => {
    mockTier = "Premium";
    renderListing();
    await waitFor(() =>
      expect(screen.getByText(/list your home/i)).toBeInTheDocument()
    );
  });
});

describe("AgentBrowsePage — accessible to all paying tiers (15.6.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentService.getMySubscription).mockImplementation(() =>
      Promise.resolve({ tier: mockTier, expiresAt: null, cancelledAt: null })
    );
  });

  it("Basic user sees the agent directory", async () => {
    mockTier = "Basic";
    renderBrowse();
    await waitFor(() =>
      expect(screen.getByText(/find an agent/i)).toBeInTheDocument()
    );
  });

  it("Pro user sees the agent directory", async () => {
    mockTier = "Pro";
    renderBrowse();
    await waitFor(() =>
      expect(screen.getByText(/find an agent/i)).toBeInTheDocument()
    );
  });
});

describe("FsboPanel — accessible to all paying tiers (15.6.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentService.getMySubscription).mockImplementation(() =>
      Promise.resolve({ tier: mockTier, expiresAt: null, cancelledAt: null })
    );
  });

  it("Basic user sees the FSBO panel", async () => {
    mockTier = "Basic";
    renderFsboPanel();
    await waitFor(() =>
      expect(screen.getByText(/sell this home yourself/i)).toBeInTheDocument()
    );
  });

  it("Pro user sees the FSBO panel", async () => {
    mockTier = "Pro";
    renderFsboPanel();
    await waitFor(() =>
      expect(screen.getByText(/sell this home yourself/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/selling your home\?/i)).not.toBeInTheDocument();
  });
});
