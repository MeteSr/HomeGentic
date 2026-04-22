/**
 * TDD tests for SettingsPage — Subscription tab expiry behaviour.
 *
 * Gap 1: expired subscription shows "Expired" (not "Renews [past date]")
 * Gap 2: expired subscription shows a "Renew" CTA
 * Gap 3: active subscription shows correct renewal date
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Service mocks ────────────────────────────────────────────────────────────

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
    principal:       "test-principal",
    profile:         { name: "Test User", role: "Homeowner", email: "test@example.com" },
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

import SettingsPage from "@/pages/SettingsPage";
import { paymentService } from "@/services/payment";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderSubscriptionTab() {
  return render(
    <MemoryRouter initialEntries={["/settings?tab=subscription"]}>
      <SettingsPage />
    </MemoryRouter>
  );
}

// ─── Subscription expiry display ──────────────────────────────────────────────

describe("SettingsPage — subscription expiry display", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows 'Expired' badge when expiresAt is in the past", async () => {
    const pastDate = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
    (paymentService.getMySubscription as any).mockResolvedValue({
      tier: "Pro",
      expiresAt: pastDate,
    });
    renderSubscriptionTab();
    await waitFor(() =>
      expect(screen.getByText(/expired/i)).toBeInTheDocument()
    );
  });

  it("does NOT show 'Renews [past date]' when subscription is expired", async () => {
    const pastDate = Date.now() - 7 * 24 * 60 * 60 * 1000;
    (paymentService.getMySubscription as any).mockResolvedValue({
      tier: "Pro",
      expiresAt: pastDate,
    });
    renderSubscriptionTab();
    await waitFor(() => screen.getByText(/expired/i));
    // The past renewal date should NOT appear as "Renews ..."
    expect(screen.queryByText(/renews/i)).not.toBeInTheDocument();
  });

  it("shows 'Renews [date]' when expiresAt is in the future", async () => {
    const futureDate = Date.now() + 30 * 24 * 60 * 60 * 1000;
    (paymentService.getMySubscription as any).mockResolvedValue({
      tier: "Pro",
      expiresAt: futureDate,
    });
    renderSubscriptionTab();
    await waitFor(() =>
      expect(screen.getByText(/renews/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
  });

  it("shows 'Active subscription' when expiresAt is null", async () => {
    (paymentService.getMySubscription as any).mockResolvedValue({
      tier: "Pro",
      expiresAt: null,
    });
    renderSubscriptionTab();
    await waitFor(() =>
      expect(screen.getByText(/active subscription/i)).toBeInTheDocument()
    );
  });
});

// ─── Renewal CTA ──────────────────────────────────────────────────────────────

describe("SettingsPage — renewal CTA", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a Renew button when subscription is expired", async () => {
    const pastDate = Date.now() - 1;
    (paymentService.getMySubscription as any).mockResolvedValue({
      tier: "Pro",
      expiresAt: pastDate,
    });
    renderSubscriptionTab();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /renew/i })).toBeInTheDocument()
    );
  });

  it("does NOT show a Renew button when subscription is active", async () => {
    const futureDate = Date.now() + 30 * 24 * 60 * 60 * 1000;
    (paymentService.getMySubscription as any).mockResolvedValue({
      tier: "Pro",
      expiresAt: futureDate,
    });
    renderSubscriptionTab();
    await waitFor(() => screen.getByText(/renews/i));
    expect(screen.queryByRole("button", { name: /renew/i })).not.toBeInTheDocument();
  });

  it("does NOT show a Renew button on Free tier", async () => {
    (paymentService.getMySubscription as any).mockResolvedValue({
      tier: "Free",
      expiresAt: null,
    });
    renderSubscriptionTab();
    // Wait for load
    await waitFor(() => screen.getByText(/upgrade to pro/i));
    expect(screen.queryByRole("button", { name: /renew/i })).not.toBeInTheDocument();
  });
});
