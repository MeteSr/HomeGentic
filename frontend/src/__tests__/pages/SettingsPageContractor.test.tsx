/**
 * SettingsPage — Subscription tab, Contractor role.
 *
 * Covers the ContractorBillingPanel integration and the isPaid fix (a
 * Contractor on ContractorFree previously fell through the generic
 * `tier !== "Free"` check and incorrectly saw the Cancel/Pause sections for
 * a plan that was never subscribed to and costs nothing).
 *
 * Tests:
 *   - ContractorFree renders the Contractor Free billing panel, not the
 *     generic homeowner Free-tier panel
 *   - ContractorFree does NOT show the generic Cancel/Pause section
 *   - ContractorFree does NOT show the redundant generic "Upgrade Plan" list
 *     (the billing panel's own Upgrade CTA covers it)
 *   - ContractorPro renders the Contractor Pro billing panel
 *   - ContractorPro DOES show the generic Cancel Subscription section
 *   - ContractorPro's own "Cancel plan" button opens the generic cancel
 *     confirmation flow
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { PLANS } from "@/services/planConstants";

vi.mock("@/services/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/payment")>();
  return {
    ...actual,
    paymentService: {
      getMyAgentCredits: vi.fn(() => Promise.resolve(0)),
      getMySubscription: vi.fn(),
      initiate:          vi.fn().mockResolvedValue({ url: "/dashboard" }),
      cancel:            vi.fn().mockResolvedValue({ expiresAt: null }),
      recordCancellation: vi.fn(),
      pause:             vi.fn(),
      resume:            vi.fn(),
      getPauseState:     vi.fn().mockReturnValue(null),
      getPlan:           vi.fn((tier) => PLANS.find((p) => p.tier === tier) ?? PLANS[0]),
    },
  };
});

vi.mock("@/services/job", () => ({
  jobService: { getMyReferralJobs: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/auth", () => ({
  authService: { updateProfile: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/services/winBackService", () => ({
  winBackService: { schedule: vi.fn() },
}));

vi.mock("@/services/agentProfile", () => ({
  agentProfileService: { getMyProfile: vi.fn().mockResolvedValue(null) },
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(() => ({
    isAuthenticated: true,
    principal:       "test-contractor-principal",
    profile:         { name: "Test Contractor", role: "Contractor", email: "contractor@example.com" },
    isLoading:       false,
    tier:            null,
    setTier:         vi.fn(),
    setProfile:      vi.fn(),
  })),
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: vi.fn(() => ({ properties: [] })),
}));

vi.mock("@/store/jobStore", () => ({
  useJobStore: vi.fn(() => ({ jobs: [] })),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <>{children}</>,
}));

import SettingsPage from "@/pages/SettingsPage";
import { paymentService } from "@/services/payment";

function renderSubscriptionTab() {
  return render(
    <MemoryRouter initialEntries={["/settings?tab=subscription"]}>
      <SettingsPage />
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

// ─── ContractorFree ─────────────────────────────────────────────────────────

describe("SettingsPage — Contractor role, ContractorFree tier", () => {
  beforeEach(() => {
    (paymentService.getMySubscription as any).mockResolvedValue({
      tier: "ContractorFree",
      expiresAt: null,
    });
  });

  it("renders the Contractor Free billing panel", async () => {
    renderSubscriptionTab();
    await waitFor(() => expect(screen.getByText("Contractor Free")).toBeInTheDocument());
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("does not render the generic homeowner Free-tier panel", async () => {
    renderSubscriptionTab();
    await waitFor(() => screen.getByText("Contractor Free"));
    // The generic branch's own "Free" plan label + "Upgrade to unlock:" copy
    // must not also render alongside the contractor panel.
    expect(screen.queryByText("Upgrade to unlock:")).not.toBeInTheDocument();
  });

  it("does not show the generic Cancel/Pause section (nothing to cancel on Free)", async () => {
    renderSubscriptionTab();
    await waitFor(() => screen.getByText("Contractor Free"));
    expect(screen.queryByText("Cancel Subscription")).not.toBeInTheDocument();
  });

  it("does not show the redundant generic Upgrade Plan list", async () => {
    renderSubscriptionTab();
    await waitFor(() => screen.getByText("Contractor Free"));
    expect(screen.queryByText("Upgrade Plan")).not.toBeInTheDocument();
  });
});

// ─── ContractorPro ──────────────────────────────────────────────────────────

describe("SettingsPage — Contractor role, ContractorPro tier", () => {
  beforeEach(() => {
    const futureDate = Date.now() + 30 * 24 * 60 * 60 * 1000;
    (paymentService.getMySubscription as any).mockResolvedValue({
      tier: "ContractorPro",
      expiresAt: futureDate,
    });
  });

  it("renders the Contractor Pro billing panel", async () => {
    renderSubscriptionTab();
    await waitFor(() => expect(screen.getByText("Contractor Pro")).toBeInTheDocument());
    expect(screen.getByText("NO 3% FEE")).toBeInTheDocument();
  });

  it("shows the generic Cancel Subscription section (there is something to cancel)", async () => {
    renderSubscriptionTab();
    await waitFor(() => screen.getByText("Contractor Pro"));
    expect(screen.getByText("Cancel Subscription")).toBeInTheDocument();
  });

  it("the panel's own Cancel plan button opens the cancel confirmation flow", async () => {
    renderSubscriptionTab();
    await waitFor(() => screen.getByText("Contractor Pro"));
    fireEvent.click(screen.getByText("Cancel plan"));
    await waitFor(() =>
      expect(screen.getByText(/You will lose access to/i)).toBeInTheDocument()
    );
  });
});
