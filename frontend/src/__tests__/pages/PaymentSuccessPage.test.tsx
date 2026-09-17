/**
 * PaymentSuccessPage — was completely untested despite real branching logic
 * tied to the payment-security fixes in this PR (verify-session/verify-subscription).
 *
 * Covers:
 *   - legacy session_id flow: subscription success, gift result, verification error
 *   - no session_id / no subscription_id -> error state
 *   - subscriptionId present + not authenticated -> "awaiting-login" state,
 *     stamps sessionStorage.pendingVerification so AuthContext can return here
 *   - subscriptionId present + authenticated -> calls verify-subscription and
 *     renders the welcome state with the resolved tier
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PaymentSuccessPage from "@/pages/PaymentSuccessPage";

const { mockVerifyStripeSession, mockRedeemQuorumCoupon, mockGetPrincipal, mockIsAuthenticated } = vi.hoisted(() => ({
  mockVerifyStripeSession: vi.fn(),
  mockRedeemQuorumCoupon:  vi.fn().mockResolvedValue(undefined),
  mockGetPrincipal:        vi.fn().mockResolvedValue("test-principal"),
  mockIsAuthenticated:     { value: true },
}));

vi.mock("@/services/payment", () => ({
  paymentService: { verifyStripeSession: mockVerifyStripeSession },
}));

vi.mock("@/services/benefit", () => ({
  redeemQuorumCoupon: mockRedeemQuorumCoupon,
}));

vi.mock("@/services/actor", () => ({
  getPrincipal: mockGetPrincipal,
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(() => ({ isAuthenticated: mockIsAuthenticated.value })),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({ login: vi.fn(), devLogin: vi.fn() })),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PaymentSuccessPage />
    </MemoryRouter>
  );
}

describe("PaymentSuccessPage — legacy session_id flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated.value = true;
    sessionStorage.clear();
  });

  it("shows an error when neither session_id nor subscription_id is present", async () => {
    renderAt("/payment-success");
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
    expect(screen.getByText(/no session id found/i)).toBeInTheDocument();
  });

  it("renders the welcome state with the resolved tier on subscription success", async () => {
    mockVerifyStripeSession.mockResolvedValue({ type: "subscription", tier: "Premium" });
    renderAt("/payment-success?session_id=cs_test_123");
    await waitFor(() => expect(mockVerifyStripeSession).toHaveBeenCalledWith("cs_test_123"));
    await waitFor(() => expect(screen.getByText(/welcome to premium/i)).toBeInTheDocument());
  });

  it("redeems a quorum coupon on subscription success when one is present in the URL", async () => {
    mockVerifyStripeSession.mockResolvedValue({ type: "subscription", tier: "Pro" });
    renderAt("/payment-success?session_id=cs_test_123&quorum_coupon=QRM-ABC");
    await waitFor(() => expect(mockRedeemQuorumCoupon).toHaveBeenCalledWith("QRM-ABC"));
  });

  it("renders the gift state with the token when the session is a gift", async () => {
    mockVerifyStripeSession.mockResolvedValue({ type: "gift", giftToken: "GIFT-XYZ" });
    renderAt("/payment-success?session_id=cs_test_gift");
    await waitFor(() => expect(screen.getByText(/gift is on its way/i)).toBeInTheDocument());
    expect(screen.getByText("GIFT-XYZ")).toBeInTheDocument();
  });

  it("renders an error state with the failure message when verification rejects", async () => {
    mockVerifyStripeSession.mockRejectedValue(new Error("Payment not complete"));
    renderAt("/payment-success?session_id=cs_test_bad");
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
    expect(screen.getByText("Payment not complete")).toBeInTheDocument();
  });
});

describe("PaymentSuccessPage — PaymentElement flow (subscription_id)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated.value = true;
    sessionStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("stamps pendingVerification and shows the awaiting-login state when not authenticated", async () => {
    mockIsAuthenticated.value = false;
    renderAt("/payment-success?subscription_id=sub_123&tier=Pro&billing=Yearly");

    await waitFor(() => expect(screen.getByText(/payment confirmed/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /set up my account/i })).toBeInTheDocument();
    // The component reads the real window.location (not MemoryRouter's virtual
    // path) to build the return URL, so only presence — not exact content — is
    // testable here; it must still stamp something for AuthContext to return to.
    expect(sessionStorage.getItem("pendingVerification")).not.toBeNull();
  });

  it("verifies the subscription server-side and renders the welcome state when authenticated", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ tier: "Premium" }),
    }) as any;

    renderAt("/payment-success?subscription_id=sub_123&tier=Basic");

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/stripe/verify-subscription"),
      expect.objectContaining({ method: "POST" }),
    ));
    await waitFor(() => expect(screen.getByText(/welcome to premium/i)).toBeInTheDocument());
  });

  it("renders an error state when the server reports a verification failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: "PaymentIntent not succeeded" }),
    }) as any;

    renderAt("/payment-success?subscription_id=sub_bad");

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
    expect(screen.getByText("PaymentIntent not succeeded")).toBeInTheDocument();
  });
});
