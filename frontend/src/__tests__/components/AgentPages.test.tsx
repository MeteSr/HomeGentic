/**
 * TDD tests for Epic 9.1 — Agent Role & Profile pages
 *
 * Pages under test:
 *   AgentProfileEditPage — agent creates/edits their on-chain profile (9.1.1, 9.1.2)
 *   AgentPublicPage      — public view of an agent's profile (9.1.3, 9.1.4)
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ─── Mock service layer ────────────────────────────────────────────────────────

// vi.hoisted ensures these are available inside the vi.mock factory (which is hoisted)
const { mockProfile, mockReview } = vi.hoisted(() => {
  const mockProfile = {
    id:                   "agent-principal-1",
    name:                 "Jane Smith",
    brokerage:            "Premier Realty",
    licenseNumber:        "TX-12345",
    statesLicensed:       ["TX", "OK"],
    bio:                  "10 years in Austin metro",
    phone:                "512-555-0100",
    email:                "jane@example.com",
    avgDaysOnMarket:      21,
    listingsLast12Months: 8,
    isVerified:              true,
    homeGenticTransactionCount: 5,
    typicalCommissionBps:    250,
    createdAt:               Date.now() - 100_000,
    updatedAt:               Date.now() - 50_000,
  };
  const mockReview = {
    id:                "review-1",
    agentId:           "agent-principal-1",
    reviewerPrincipal: "homeowner-1",
    rating:            5,
    comment:           "Jane was fantastic — sold in 12 days above asking.",
    transactionId:     "TXN_1",
    createdAt:         Date.now() - 5000,
  };
  return { mockProfile, mockReview };
});

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => ({})) },
}));

vi.mock("@/services/payment", () => ({
  paymentService: {
    getMyAgentCredits: vi.fn(() => Promise.resolve(0)),
    getMySubscription: vi.fn().mockResolvedValue({ tier: "Pro" }),
  },
}));

vi.mock("@/services/listing", () => ({
  listingService: {
    getAgentPerformanceRecords: vi.fn().mockResolvedValue([]),
    createDirectInvite:         vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/services/agent", () => ({
  agentService: {
    getMyProfile:     vi.fn().mockResolvedValue(mockProfile),
    createProfile:    vi.fn().mockResolvedValue(mockProfile),
    updateProfile:    vi.fn().mockResolvedValue(mockProfile),
    getPublicProfile: vi.fn().mockResolvedValue(mockProfile),
    getReviews:       vi.fn().mockResolvedValue([mockReview]),
    getAllProfiles:    vi.fn().mockResolvedValue([mockProfile]),
  },
  computeAverageRating: vi.fn().mockReturnValue(5),
}));

vi.mock("@/store/authStore", () => {
  const state = {
    principal: "agent-principal-1",
    profile: { role: "Realtor", tier: "Pro" },
    isAuthenticated: true,
    tier: null,
    setTier: vi.fn(),
    setProfile: vi.fn(),
  };
  return { useAuthStore: Object.assign(() => state, { getState: () => state }) };
});
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <>{children}</>,
}));

import AgentProfileEditPage from "@/pages/AgentProfileEditPage";
import AgentPublicPage      from "@/pages/AgentPublicPage";
import { agentService }     from "@/services/agent";

function renderPage(element: React.ReactNode, path = "/", route = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── AgentProfileEditPage ─────────────────────────────────────────────────────

describe("AgentProfileEditPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agentService.getMyProfile).mockResolvedValue(mockProfile);
    vi.mocked(agentService.updateProfile).mockResolvedValue(mockProfile);
    vi.mocked(agentService.createProfile).mockResolvedValue(mockProfile);
  });

  it("renders the page heading", async () => {
    renderPage(<AgentProfileEditPage />, "/agent/profile", "/agent/profile");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /agent profile/i })).toBeInTheDocument();
    });
  });

  it("pre-fills form fields from existing profile", async () => {
    renderPage(<AgentProfileEditPage />, "/agent/profile", "/agent/profile");
    await waitFor(() => {
      expect(screen.getByDisplayValue("Jane Smith")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Premier Realty")).toBeInTheDocument();
      expect(screen.getByDisplayValue("TX-12345")).toBeInTheDocument();
    });
  });

  it("renders brokerage, license number, bio, and states fields", async () => {
    renderPage(<AgentProfileEditPage />, "/agent/profile", "/agent/profile");
    await waitFor(() => {
      expect(screen.getByLabelText(/brokerage/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/license/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/bio/i)).toBeInTheDocument();
    });
  });

  it("renders a Save button", async () => {
    renderPage(<AgentProfileEditPage />, "/agent/profile", "/agent/profile");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    });
  });

  it("calls updateProfile on save when profile already exists", async () => {
    renderPage(<AgentProfileEditPage />, "/agent/profile", "/agent/profile");
    await waitFor(() => screen.getByRole("button", { name: /save/i }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(agentService.updateProfile).toHaveBeenCalled();
    });
  });

  it("calls createProfile on save when no profile exists yet", async () => {
    vi.mocked(agentService.getMyProfile).mockResolvedValueOnce(null);
    renderPage(<AgentProfileEditPage />, "/agent/profile", "/agent/profile");
    await waitFor(() => screen.getByRole("button", { name: /save/i }));
    // Fill required fields before submitting
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText(/brokerage/i), { target: { value: "Realty" } });
    fireEvent.change(screen.getByLabelText(/license number/i), { target: { value: "TX-1" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(agentService.createProfile).toHaveBeenCalled();
    });
  });

  it("shows verification badge when isVerified is true", async () => {
    renderPage(<AgentProfileEditPage />, "/agent/profile", "/agent/profile");
    await waitFor(() => {
      expect(screen.getByText(/verified/i)).toBeInTheDocument();
    });
  });

  it("shows unverified notice when isVerified is false", async () => {
    vi.mocked(agentService.getMyProfile).mockResolvedValueOnce({ ...mockProfile, isVerified: false });
    renderPage(<AgentProfileEditPage />, "/agent/profile", "/agent/profile");
    await waitFor(() => {
      expect(screen.getByText(/pending verification|not yet verified|unverified/i)).toBeInTheDocument();
    });
  });
});

// ─── AgentPublicPage ──────────────────────────────────────────────────────────

describe("AgentPublicPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agentService.getPublicProfile).mockResolvedValue(mockProfile);
    vi.mocked(agentService.getReviews).mockResolvedValue([mockReview]);
  });

  it("renders agent name as heading", async () => {
    renderPage(<AgentPublicPage />, "/agent/agent-principal-1", "/agent/:id");
    await waitFor(() => {
      expect(screen.getByText(/Jane Smith/i)).toBeInTheDocument();
    });
  });

  it("shows brokerage name", async () => {
    renderPage(<AgentPublicPage />, "/agent/agent-principal-1", "/agent/:id");
    await waitFor(() => {
      expect(screen.getByText(/Premier Realty/i)).toBeInTheDocument();
    });
  });

  it("shows license number", async () => {
    renderPage(<AgentPublicPage />, "/agent/agent-principal-1", "/agent/:id");
    await waitFor(() => {
      expect(screen.getByText(/TX-12345/)).toBeInTheDocument();
    });
  });

  it("shows verified badge when agent is verified", async () => {
    renderPage(<AgentPublicPage />, "/agent/agent-principal-1", "/agent/:id");
    await waitFor(() => {
      expect(screen.getByText(/HomeGentic Verified/i)).toBeInTheDocument();
    });
  });

  it("does not show verified badge when agent is not verified", async () => {
    vi.mocked(agentService.getPublicProfile).mockResolvedValueOnce({ ...mockProfile, isVerified: false });
    renderPage(<AgentPublicPage />, "/agent/agent-principal-1", "/agent/:id");
    await waitFor(() => {
      expect(screen.queryByText(/HomeGentic Verified/i)).not.toBeInTheDocument();
    });
  });

  it("shows stats: avg days on market and listings count", async () => {
    renderPage(<AgentPublicPage />, "/agent/agent-principal-1", "/agent/:id");
    await waitFor(() => {
      expect(screen.getByText(/avg.*days on market/i)).toBeInTheDocument();
      expect(screen.getByText(/listings.*12/i)).toBeInTheDocument();
    });
  });

  it("shows reviews section with review comment", async () => {
    renderPage(<AgentPublicPage />, "/agent/agent-principal-1", "/agent/:id");
    await waitFor(() => {
      expect(screen.getByText(/sold in 12 days above asking/i)).toBeInTheDocument();
    });
  });

  it("shows not-found message for unknown agent", async () => {
    vi.mocked(agentService.getPublicProfile).mockResolvedValueOnce(null);
    renderPage(<AgentPublicPage />, "/agent/unknown", "/agent/:id");
    await waitFor(() => {
      expect(screen.getByText(/not found|no profile/i)).toBeInTheDocument();
    });
  });

  it("shows bio text", async () => {
    renderPage(<AgentPublicPage />, "/agent/agent-principal-1", "/agent/:id");
    await waitFor(() => {
      expect(screen.getByText(/10 years in Austin metro/i)).toBeInTheDocument();
    });
  });
});
