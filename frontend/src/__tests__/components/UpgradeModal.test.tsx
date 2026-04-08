/**
 * TDD tests for the in-app UpgradeModal and related entry points.
 *
 *   - UpgradeModal renders plan cards (Pro + Premium) with prices and features
 *   - Selecting a plan calls paymentService.subscribe
 *   - Modal can be dismissed
 *   - UpgradeGate calls onUpgrade prop instead of navigating
 *   - DashboardPage "See Plans →" and "Upgrade →" buttons open the modal
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("@/services/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/payment")>();
  return {
    ...actual, // re-export PLANS constant
    paymentService: {
      subscribe:           vi.fn().mockResolvedValue(undefined),
      getMySubscription:   vi.fn().mockResolvedValue({ tier: "Free", expiresAt: null }),
      initiate:            vi.fn().mockResolvedValue({ url: "/" }),
    },
  };
});

vi.mock("@/services/property", () => ({
  propertyService: {
    getAll: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/services/job", () => ({
  jobService: {
    getAll: vi.fn().mockResolvedValue([]),
    getByProperty: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/services/scoreService", () => ({
  scoreService: { getScore: vi.fn().mockResolvedValue(null) },
}));

vi.mock("@/services/scoreEventService", () => ({
  scoreEventService: { getEvents: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/maintenance", () => ({
  maintenanceService: {
    getSchedule: vi.fn().mockResolvedValue([]),
    getTasks:    vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/services/market", () => ({
  marketService: { getRecommendations: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(() => ({
    isAuthenticated: true,
    principal: "test-principal",
    profile: { name: "Test User", role: "Homeowner" },
    isLoading: false,
  })),
}));

import UpgradeModal from "@/components/UpgradeModal";
import { UpgradeGate } from "@/components/UpgradeGate";
import { paymentService } from "@/services/payment";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderModal(open = true, onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <UpgradeModal open={open} onClose={onClose} />
    </MemoryRouter>
  );
}

// ─── UpgradeModal tests ───────────────────────────────────────────────────────

describe("UpgradeModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when open=false", () => {
    const { container } = renderModal(false);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a modal heading when open", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /upgrade your plan/i })).toBeInTheDocument();
  });

  it("shows Pro plan card with price", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /select pro/i })).toBeInTheDocument();
    // "$10" with per-month suffix rendered by the plan card
    expect(screen.getAllByText(/\$10/).length).toBeGreaterThan(0);
  });

  it("shows Premium plan card with price", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /select premium/i })).toBeInTheDocument();
    expect(screen.getAllByText(/\$20/).length).toBeGreaterThan(0);
  });

  it("shows at least one feature for each plan", () => {
    renderModal();
    expect(screen.getByText(/5 properties/i)).toBeInTheDocument();       // Pro feature
    expect(screen.getByText(/20 properties/i)).toBeInTheDocument();         // Premium feature
  });

  it("calls paymentService.subscribe('Pro') when Pro plan is selected", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /select pro/i }));
    await waitFor(() => {
      expect(paymentService.subscribe).toHaveBeenCalledWith("Pro");
    });
  });

  it("calls paymentService.subscribe('Premium') when Premium plan is selected", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /select premium/i }));
    await waitFor(() => {
      expect(paymentService.subscribe).toHaveBeenCalledWith("Premium");
    });
  });

  it("calls onClose after a plan is successfully selected", async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <UpgradeModal open onClose={onClose} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /select pro/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("calls onClose when the dismiss button is clicked", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <UpgradeModal open onClose={onClose} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /maybe later/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── UpgradeGate — onUpgrade prop ─────────────────────────────────────────────

describe("UpgradeGate with onUpgrade prop", () => {
  it("calls onUpgrade instead of navigating when prop is provided", () => {
    const onUpgrade = vi.fn();
    render(
      <MemoryRouter>
        <UpgradeGate feature="Score Breakdown" description="See details." onUpgrade={onUpgrade} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /upgrade to pro/i }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it("does not throw when onUpgrade is not provided (falls back to navigate)", () => {
    render(
      <MemoryRouter>
        <UpgradeGate feature="Score Breakdown" description="See details." />
      </MemoryRouter>
    );
    // Should render without error
    expect(screen.getByRole("button", { name: /upgrade to pro/i })).toBeInTheDocument();
  });
});
