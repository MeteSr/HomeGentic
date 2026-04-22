/**
 * CheckoutPage tests
 *
 * Card / ICP toggle
 *   - LoginStep shown when not authenticated
 *   - Card selected by default after authentication
 *   - ICP tab shows Pay with ICP button
 *   - Switching tabs clears the error
 *
 * ICP payment path
 *   - calls paymentService.subscribe for Monthly billing
 *   - calls paymentService.subscribeAnnual for Yearly billing
 *   - navigates to /payment-success on success
 *   - shows step label while in-flight
 *
 * ICP error message classification
 *   - balance / insufficient  → "Insufficient ICP balance."
 *   - wasm / IC0 / canister   → "Payment service is temporarily unavailable."
 *   - approve / identity      → "Approval cancelled or timed out."
 *   - unknown                 → "Payment failed. Please try again."
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@stripe/react-stripe-js", () => ({
  Elements:       ({ children }: any) => <>{children}</>,
  PaymentElement: () => <div data-testid="stripe-payment-element" />,
  useStripe:      () => null,
  useElements:    () => null,
}));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn(() => Promise.resolve(null)) }));

vi.mock("@/services/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/payment")>();
  return {
    ...actual,
    paymentService: {
      ...actual.paymentService,
      subscribe:        vi.fn().mockResolvedValue(undefined),
      subscribeAnnual:  vi.fn().mockResolvedValue(undefined),
      getMyAgentCredits: vi.fn(() => Promise.resolve(0)),
      getMySubscription: vi.fn().mockResolvedValue({ tier: "Free", expiresAt: null }),
    },
  };
});

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: vi.fn(), devLogin: vi.fn(), logout: vi.fn() }),
}));

// Suppress console.error noise from icpUserMessage
vi.spyOn(console, "error").mockImplementation(() => {});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import CheckoutPage from "@/pages/CheckoutPage";
import { paymentService } from "@/services/payment";
import { useAuthStore } from "@/store/authStore";

// ── helpers ───────────────────────────────────────────────────────────────────

function renderCheckout(
  search = "?tier=Pro&billing=Monthly",
  authenticated = true,
) {
  vi.mocked(useAuthStore).mockImplementation((sel?: any) => {
    const state = {
      isAuthenticated: authenticated,
      principal: authenticated ? "test-principal" : null,
      profile: authenticated ? { email: "test@example.com" } : null,
      tier: null,
      setTier: vi.fn(),
      setProfile: vi.fn(),
    };
    return sel ? sel(state) : state;
  });

  return render(
    <MemoryRouter initialEntries={[`/checkout${search}`]}>
      <Routes>
        <Route path="/checkout" element={<CheckoutPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── LoginStep ─────────────────────────────────────────────────────────────────

describe("CheckoutPage — unauthenticated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  it("shows the login step when not authenticated", () => {
    renderCheckout("?tier=Pro&billing=Monthly", false);
    expect(screen.getByText(/sign in to continue/i)).toBeInTheDocument();
  });

  it("does not show the Card/ICP toggle when not authenticated", () => {
    renderCheckout("?tier=Pro&billing=Monthly", false);
    expect(screen.queryByRole("button", { name: /^card$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^icp$/i })).not.toBeInTheDocument();
  });

  it("shows unknown-plan fallback for an invalid tier", () => {
    renderCheckout("?tier=InvalidTier&billing=Monthly", false);
    expect(screen.getByText(/unknown plan/i)).toBeInTheDocument();
  });
});

// ── Card / ICP toggle ─────────────────────────────────────────────────────────

describe("CheckoutPage — payment method toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  it("shows Card and ICP buttons when authenticated", () => {
    renderCheckout();
    expect(screen.getByRole("button", { name: /^card$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^icp$/i })).toBeInTheDocument();
  });

  it("Card is selected by default (Stripe skeleton / form visible)", () => {
    renderCheckout();
    // The Stripe payment element or skeleton is present; ICP button is not
    expect(screen.queryByRole("button", { name: /pay with icp/i })).not.toBeInTheDocument();
  });

  it("switching to ICP shows Pay with ICP button", () => {
    renderCheckout();
    fireEvent.click(screen.getByRole("button", { name: /^icp$/i }));
    expect(screen.getByRole("button", { name: /pay with icp/i })).toBeInTheDocument();
  });

  it("switching back to Card hides Pay with ICP button", () => {
    renderCheckout();
    fireEvent.click(screen.getByRole("button", { name: /^icp$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^card$/i }));
    expect(screen.queryByRole("button", { name: /pay with icp/i })).not.toBeInTheDocument();
  });
});

// ── ICP payment path ──────────────────────────────────────────────────────────

describe("CheckoutPage — ICP payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  async function goToIcp(search = "?tier=Pro&billing=Monthly") {
    renderCheckout(search);
    fireEvent.click(screen.getByRole("button", { name: /^icp$/i }));
  }

  it("calls paymentService.subscribe for Monthly billing", async () => {
    await goToIcp("?tier=Pro&billing=Monthly");
    fireEvent.click(screen.getByRole("button", { name: /pay with icp/i }));
    await waitFor(() =>
      expect(paymentService.subscribe).toHaveBeenCalledWith("Pro", expect.any(Function))
    );
  });

  it("calls paymentService.subscribeAnnual for Yearly billing", async () => {
    await goToIcp("?tier=Pro&billing=Yearly");
    fireEvent.click(screen.getByRole("button", { name: /pay with icp/i }));
    await waitFor(() =>
      expect(paymentService.subscribeAnnual).toHaveBeenCalledWith("Pro", expect.any(Function))
    );
  });

  it("navigates to /payment-success after successful ICP payment", async () => {
    await goToIcp();
    fireEvent.click(screen.getByRole("button", { name: /pay with icp/i }));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining("/payment-success")
      )
    );
  });

  it("disables Pay with ICP button while in-flight", async () => {
    let resolve!: () => void;
    vi.mocked(paymentService.subscribe).mockImplementationOnce(
      (_tier: any, onStep: any) => new Promise<void>((r) => {
        onStep?.("quoting");   // triggers the disabled + step-label state
        resolve = r;
      })
    );
    await goToIcp();
    fireEvent.click(screen.getByRole("button", { name: /pay with icp/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /fetching icp price/i })).toBeDisabled()
    );
    resolve();
  });
});

// ── ICP error message classification ─────────────────────────────────────────

describe("CheckoutPage — ICP error messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  async function triggerIcpError(message: string) {
    vi.mocked(paymentService.subscribe).mockRejectedValueOnce(new Error(message));
    renderCheckout();
    fireEvent.click(screen.getByRole("button", { name: /^icp$/i }));
    fireEvent.click(screen.getByRole("button", { name: /pay with icp/i }));
  }

  it("shows 'Insufficient ICP balance.' for balance errors", async () => {
    await triggerIcpError("Insufficient ICP balance");
    await waitFor(() =>
      expect(screen.getByText("Insufficient ICP balance.")).toBeInTheDocument()
    );
  });

  it("shows 'Insufficient ICP balance.' for 'balance too low' variant", async () => {
    await triggerIcpError("balance too low for this transaction");
    await waitFor(() =>
      expect(screen.getByText("Insufficient ICP balance.")).toBeInTheDocument()
    );
  });

  it("shows 'Payment service is temporarily unavailable.' for IC0537 / wasm errors", async () => {
    await triggerIcpError(
      "Requested canister has no wasm module Error code: IC0537"
    );
    await waitFor(() =>
      expect(
        screen.getByText("Payment service is temporarily unavailable.")
      ).toBeInTheDocument()
    );
  });

  it("shows 'Payment service is temporarily unavailable.' for reject errors", async () => {
    await triggerIcpError("The replica returned a rejection error: Reject code: 5");
    await waitFor(() =>
      expect(
        screen.getByText("Payment service is temporarily unavailable.")
      ).toBeInTheDocument()
    );
  });

  it("shows 'Approval cancelled or timed out.' for approve errors", async () => {
    await triggerIcpError("User cancelled approve in Internet Identity");
    await waitFor(() =>
      expect(screen.getByText("Approval cancelled or timed out.")).toBeInTheDocument()
    );
  });

  it("shows 'Payment failed. Please try again.' for unknown errors", async () => {
    await triggerIcpError("Something unexpected went wrong");
    await waitFor(() =>
      expect(screen.getByText("Payment failed. Please try again.")).toBeInTheDocument()
    );
  });

  it("logs the full error to console.error", async () => {
    await triggerIcpError("IC0537: no wasm");
    await waitFor(() => expect(console.error).toHaveBeenCalledWith(
      "[ICP payment]", expect.any(Error)
    ));
  });
});
