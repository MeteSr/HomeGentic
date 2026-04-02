/**
 * TDD — 15.6.4: Upgrade gate on Agent Marketplace and FSBO flows
 *
 * Free users who navigate to:
 *   - /listing/new (create listing bid request)
 *   - /agents       (agent browse / find an agent)
 *   - FsboPanel     (FSBO mode panel)
 *
 * …see an UpgradeGate instead of the real content.
 * Pro and Premium users see the real content.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ─── Mutable tier (controlled per-test) ──────────────────────────────────────

let mockTier = "Pro";

vi.mock("@/services/payment", () => ({
  paymentService: {
    getMySubscription: vi.fn().mockImplementation(() =>
      Promise.resolve({ tier: mockTier })
    ),
  },
}));

// ─── Store / layout mocks ─────────────────────────────────────────────────────

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({
    principal: "test-principal",
    profile: { role: "Homeowner" },
    isAuthenticated: true,
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
        homeFaxTransactionCount: 2, typicalCommissionBps: 250,
        phone: "555-0001", email: "alice@example.com",
        createdAt: 0, updatedAt: 0,
      },
    ]),
  },
  computeAverageRating: vi.fn().mockReturnValue(null),
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

describe("ListingNewPage — free tier gate (15.6.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentService.getMySubscription).mockImplementation(() =>
      Promise.resolve({ tier: mockTier })
    );
  });

  it("free user sees the upgrade gate instead of the listing form", async () => {
    mockTier = "Free";
    renderListing();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /upgrade to pro/i })).toBeInTheDocument()
    );
    expect(screen.queryByText(/list your home/i)).not.toBeInTheDocument();
  });

  it("gate message mentions selling their home or making agents compete", async () => {
    mockTier = "Free";
    renderListing();
    await waitFor(() =>
      expect(screen.getByText(/selling your home|agents compete/i)).toBeInTheDocument()
    );
  });

  it("Pro user sees the listing form (not the gate)", async () => {
    mockTier = "Pro";
    renderListing();
    await waitFor(() =>
      expect(screen.getByText(/list your home/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/selling your home\?/i)).not.toBeInTheDocument();
  });

  it("Premium user sees the listing form (not the gate)", async () => {
    mockTier = "Premium";
    renderListing();
    await waitFor(() =>
      expect(screen.getByText(/list your home/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/selling your home\?/i)).not.toBeInTheDocument();
  });
});

describe("AgentBrowsePage — free tier gate (15.6.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentService.getMySubscription).mockImplementation(() =>
      Promise.resolve({ tier: mockTier })
    );
  });

  it("free user sees the upgrade gate instead of the agent directory", async () => {
    mockTier = "Free";
    renderBrowse();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /upgrade to pro/i })).toBeInTheDocument()
    );
    expect(screen.queryByText(/find an agent/i)).not.toBeInTheDocument();
  });

  it("gate message mentions making agents compete or FSBO", async () => {
    mockTier = "Free";
    renderBrowse();
    await waitFor(() =>
      expect(screen.getByText(/selling your home|agents compete/i)).toBeInTheDocument()
    );
  });

  it("Pro user sees the agent directory (not the gate)", async () => {
    mockTier = "Pro";
    renderBrowse();
    await waitFor(() =>
      expect(screen.getByText(/find an agent/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/selling your home\?/i)).not.toBeInTheDocument();
  });
});

describe("FsboPanel — free tier gate (15.6.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentService.getMySubscription).mockImplementation(() =>
      Promise.resolve({ tier: mockTier })
    );
  });

  it("free user sees the upgrade gate instead of the FSBO panel", async () => {
    mockTier = "Free";
    renderFsboPanel();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /upgrade to pro/i })).toBeInTheDocument()
    );
    expect(screen.queryByText(/sell this home yourself/i)).not.toBeInTheDocument();
  });

  it("gate message mentions FSBO or making agents compete", async () => {
    mockTier = "Free";
    renderFsboPanel();
    await waitFor(() =>
      expect(screen.getByText(/selling your home|go fsbo|agents compete/i)).toBeInTheDocument()
    );
  });

  it("Pro user sees the FSBO panel (not the gate)", async () => {
    mockTier = "Pro";
    renderFsboPanel();
    await waitFor(() =>
      expect(screen.getByText(/sell this home yourself/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/selling your home\?/i)).not.toBeInTheDocument();
  });
});
