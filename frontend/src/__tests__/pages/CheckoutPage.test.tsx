/**
 * CheckoutPage — real logic worth locking down:
 *   - shows a fallback message for an unrecognized ?tier=
 *   - shows the LoginStep when unauthenticated, the payment form when
 *     authenticated
 *   - the ICP payment button calls subscribeAnnual for Yearly billing and
 *     subscribe otherwise, then navigates to /payment-success on success
 *   - icpUserMessage-style error mapping surfaces a friendly message via
 *     onError when the ICP payment call rejects
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import CheckoutPage from "@/pages/CheckoutPage";

const { mockNavigate, mockUseAuthStore, mockDevLogin, mockLogin, mockSubscribe, mockSubscribeAnnual } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseAuthStore: vi.fn(),
  mockDevLogin: vi.fn(),
  mockLogin: vi.fn(),
  mockSubscribe: vi.fn(),
  mockSubscribeAnnual: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock("@/store/authStore", () => ({ useAuthStore: mockUseAuthStore }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ login: mockLogin, devLogin: mockDevLogin, logout: vi.fn() }) }));
vi.mock("@/services/payment", () => ({ paymentService: { subscribe: mockSubscribe, subscribeAnnual: mockSubscribeAnnual } }));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn(() => Promise.resolve({})) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: any) => <div data-testid="stripe-elements">{children}</div>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({}),
  useElements: () => ({}),
}));

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><CheckoutPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuthStore.mockImplementation((selector: any) =>
    selector({ isAuthenticated: false, principal: null, profile: null })
  );
});

describe("CheckoutPage — unknown plan", () => {
  it("shows a fallback message for an unrecognized tier", () => {
    renderAt("/checkout?tier=NotARealTier");
    expect(screen.getByText(/Unknown plan/)).toBeInTheDocument();
  });
});

describe("CheckoutPage — auth gating", () => {
  it("shows the login step when unauthenticated", () => {
    renderAt("/checkout?tier=Pro&billing=Monthly");
    expect(screen.getByText("Verify your identity first")).toBeInTheDocument();
  });

  it("shows the payment method toggle once authenticated", () => {
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: true, principal: "my-principal", profile: { email: "jane@example.com" } })
    );
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ clientSecret: "cs_test", subscriptionId: "sub_1" }) });
    renderAt("/checkout?tier=Pro&billing=Monthly");
    expect(screen.getByText("Identity verified")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
    expect(screen.getByText("ICP")).toBeInTheDocument();
  });
});

describe("CheckoutPage — ICP payment", () => {
  beforeEach(() => {
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: true, principal: "my-principal", profile: { email: "jane@example.com" } })
    );
  });

  it("calls subscribeAnnual for Yearly billing and navigates to payment-success on success", async () => {
    mockSubscribeAnnual.mockResolvedValue(undefined);
    renderAt("/checkout?tier=Pro&billing=Yearly");
    fireEvent.click(screen.getByText("ICP"));
    fireEvent.click(screen.getByText("Pay with ICP"));

    await waitFor(() => expect(mockSubscribeAnnual).toHaveBeenCalledWith("Pro", expect.any(Function)));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("/payment-success?tier=Pro&billing=Yearly"));
  });

  it("calls subscribe (not subscribeAnnual) for Monthly billing", async () => {
    mockSubscribe.mockResolvedValue(undefined);
    renderAt("/checkout?tier=Pro&billing=Monthly");
    fireEvent.click(screen.getByText("ICP"));
    fireEvent.click(screen.getByText("Pay with ICP"));

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledWith("Pro", expect.any(Function)));
    expect(mockSubscribeAnnual).not.toHaveBeenCalled();
  });

  it("shows a friendly error message when the ICP payment call rejects", async () => {
    mockSubscribe.mockRejectedValue(new Error("insufficient balance"));
    renderAt("/checkout?tier=Pro&billing=Monthly");
    fireEvent.click(screen.getByText("ICP"));
    fireEvent.click(screen.getByText("Pay with ICP"));

    expect(await screen.findByText("Insufficient ICP balance.")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
