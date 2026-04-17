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
      subscribe:              vi.fn().mockResolvedValue(undefined),
      startStripeCheckout:    vi.fn().mockResolvedValue(undefined),
      getMySubscription:      vi.fn().mockResolvedValue({ tier: "Free", expiresAt: null }),
      initiate:               vi.fn().mockResolvedValue({ url: "/" }),
    },
  };
});

vi.mock("@/services/icpLedger", () => ({
  icpLedgerService: {
    approve:  vi.fn().mockResolvedValue(undefined),
    getBalance: vi.fn().mockResolvedValue(BigInt(500_000_000)),
    reset:    vi.fn(),
  },
}));

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
    // Pro is $20/month
    expect(screen.getAllByText(/\$20/).length).toBeGreaterThan(0);
  });

  it("shows Premium plan card with price", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /select premium/i })).toBeInTheDocument();
    // Premium is $40/month
    expect(screen.getAllByText(/\$40/).length).toBeGreaterThan(0);
  });

  it("shows at least one feature for each plan", () => {
    renderModal();
    expect(screen.getByText(/5 properties/i)).toBeInTheDocument();
    expect(screen.getByText(/20 properties/i)).toBeInTheDocument();
  });

  it("shows payment method toggle defaulting to Card", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /pay with card/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay with icp/i })).toBeInTheDocument();
  });

  // ── Card path (default) ──────────────────────────────────────────────────────

  it("calls startStripeCheckout('Pro') when Pro is selected on card", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /select pro/i }));
    await waitFor(() => {
      expect(paymentService.startStripeCheckout).toHaveBeenCalledWith("Pro", "Monthly");
    });
  });

  it("calls startStripeCheckout('Premium') when Premium is selected on card", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /select premium/i }));
    await waitFor(() => {
      expect(paymentService.startStripeCheckout).toHaveBeenCalledWith("Premium", "Monthly");
    });
  });

  it("calls onClose after card checkout resolves", async () => {
    const onClose = vi.fn();
    render(<MemoryRouter><UpgradeModal open onClose={onClose} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /select pro/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows error message when startStripeCheckout rejects", async () => {
    (paymentService.startStripeCheckout as any).mockRejectedValueOnce(
      new Error("Stripe not configured")
    );
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /select pro/i }));
    await waitFor(() =>
      expect(screen.getByText(/Stripe not configured/i)).toBeInTheDocument()
    );
  });

  // ── ICP path ─────────────────────────────────────────────────────────────────

  it("calls paymentService.subscribe('Pro') when ICP is selected and Pro clicked", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /pay with icp/i }));
    fireEvent.click(screen.getByRole("button", { name: /select pro/i }));
    await waitFor(() => {
      expect(paymentService.subscribe).toHaveBeenCalledWith("Pro", expect.any(Function));
    });
  });

  it("calls paymentService.subscribe('Premium') when ICP is selected and Premium clicked", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /pay with icp/i }));
    fireEvent.click(screen.getByRole("button", { name: /select premium/i }));
    await waitFor(() => {
      expect(paymentService.subscribe).toHaveBeenCalledWith("Premium", expect.any(Function));
    });
  });

  it("shows simplified 'Insufficient ICP balance.' for balance errors", async () => {
    (paymentService.subscribe as any).mockRejectedValueOnce(
      new Error("Insufficient ICP balance")
    );
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /pay with icp/i }));
    fireEvent.click(screen.getByRole("button", { name: /select pro/i }));
    await waitFor(() =>
      expect(screen.getByText("Insufficient ICP balance.")).toBeInTheDocument()
    );
  });

  it("shows 'Payment service is temporarily unavailable.' for IC0 / wasm errors", async () => {
    (paymentService.subscribe as any).mockRejectedValueOnce(
      new Error("Requested canister has no wasm module Error code: IC0537")
    );
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /pay with icp/i }));
    fireEvent.click(screen.getByRole("button", { name: /select pro/i }));
    await waitFor(() =>
      expect(
        screen.getByText("Payment service is temporarily unavailable.")
      ).toBeInTheDocument()
    );
  });

  it("shows 'Approval cancelled or timed out.' for approve/identity errors", async () => {
    (paymentService.subscribe as any).mockRejectedValueOnce(
      new Error("User cancelled approve in Internet Identity")
    );
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /pay with icp/i }));
    fireEvent.click(screen.getByRole("button", { name: /select pro/i }));
    await waitFor(() =>
      expect(screen.getByText("Approval cancelled or timed out.")).toBeInTheDocument()
    );
  });

  it("shows 'Payment failed. Please try again.' for unknown ICP errors", async () => {
    (paymentService.subscribe as any).mockRejectedValueOnce(
      new Error("Something unexpected went wrong")
    );
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /pay with icp/i }));
    fireEvent.click(screen.getByRole("button", { name: /select pro/i }));
    await waitFor(() =>
      expect(screen.getByText("Payment failed. Please try again.")).toBeInTheDocument()
    );
  });

  it("disables the unselected plan button while one plan is loading (ICP)", async () => {
    let resolveSubscribe!: () => void;
    (paymentService.subscribe as any).mockImplementationOnce(
      () => new Promise<void>((res) => { resolveSubscribe = res; })
    );
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /pay with icp/i }));
    fireEvent.click(screen.getByRole("button", { name: /select pro/i }));
    expect(screen.getByRole("button", { name: /select premium/i })).toBeDisabled();
    resolveSubscribe();
  });

  it("calls onClose when the dismiss button is clicked", () => {
    const onClose = vi.fn();
    render(<MemoryRouter><UpgradeModal open onClose={onClose} /></MemoryRouter>);
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
    fireEvent.click(screen.getByRole("button", { name: /upgrade to basic/i }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it("does not throw when onUpgrade is not provided (falls back to navigate)", () => {
    render(
      <MemoryRouter>
        <UpgradeGate feature="Score Breakdown" description="See details." />
      </MemoryRouter>
    );
    // Should render without error
    expect(screen.getByRole("button", { name: /upgrade to basic/i })).toBeInTheDocument();
  });
});
