/**
 * Payment outcome pages — PaymentSuccessPage & PaymentFailurePage
 * Covers: render states, verifyStripeSession integration, gift vs subscription branching.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import * as paymentService from "@/services/payment";
import PaymentSuccessPage from "@/pages/PaymentSuccessPage";
import PaymentFailurePage from "@/pages/PaymentFailurePage";

// ── mocks ─────────────────────────────────────────────────────────────────────
vi.mock("@/services/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof paymentService>();
  return {
    ...actual,
    paymentService: {
      ...actual.paymentService,
      verifyStripeSession: vi.fn(),
    },
  };
});

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({ isAuthenticated: true, tier: null, setTier: vi.fn(), setProfile: vi.fn() }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: vi.fn(), devLogin: vi.fn(), logout: vi.fn() }),
}));

vi.mock("@/services/actor", () => ({
  getPrincipal: vi.fn().mockResolvedValue("test-principal"),
}));

const mockVerify = vi.mocked(paymentService.paymentService.verifyStripeSession);

function renderSuccess(search = "?session_id=cs_test_abc123") {
  return render(
    <MemoryRouter initialEntries={[`/payment-success${search}`]}>
      <Routes>
        <Route path="/payment-success" element={<PaymentSuccessPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderFailure() {
  return render(
    <MemoryRouter>
      <PaymentFailurePage />
    </MemoryRouter>
  );
}

describe("PaymentFailurePage", () => {
  it("renders cancellation message and back-to-pricing link", () => {
    renderFailure();
    expect(screen.getByText(/Payment cancelled/i)).toBeTruthy();
    expect(screen.getByText(/Back to Pricing/i)).toBeTruthy();
    expect(screen.getByText(/Return to Dashboard/i)).toBeTruthy();
  });
});

describe("PaymentSuccessPage", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows verifying state initially", () => {
    mockVerify.mockReturnValue(new Promise(() => {})); // never resolves
    renderSuccess();
    expect(screen.getByText(/Confirming your payment/i)).toBeTruthy();
  });

  it("shows subscription success screen after verify returns subscription", async () => {
    mockVerify.mockResolvedValue({ type: "subscription" });
    renderSuccess();
    await waitFor(() => {
      expect(screen.getByText(/Welcome to/i)).toBeTruthy();
      expect(screen.getByText(/Go to Dashboard/i)).toBeTruthy();
    });
    expect(mockVerify).toHaveBeenCalledWith("cs_test_abc123");
  });

  it("shows gift-sent screen with token when verify returns gift", async () => {
    mockVerify.mockResolvedValue({ type: "gift", giftToken: "cs_test_abc123" });
    renderSuccess();
    await waitFor(() => {
      expect(screen.getByText(/Gift is on its way/i)).toBeTruthy();
      expect(screen.getByText("cs_test_abc123")).toBeTruthy();
    });
  });

  it("shows error state when verifyStripeSession throws", async () => {
    mockVerify.mockRejectedValue(new Error("Payment not complete"));
    renderSuccess();
    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/i)).toBeTruthy();
      expect(screen.getByText(/Payment not complete/i)).toBeTruthy();
    });
  });

  it("shows error state when session_id param is missing", async () => {
    renderSuccess(""); // no query string
    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/i)).toBeTruthy();
    });
  });
});
