/**
 * PricingPage — real logic worth locking down:
 *   - shows only the Pro plan (the single homeowner plan), annual only
 *   - Get Pro when unauthenticated stamps the checkout intent into the
 *     URL, then logs in — it does NOT navigate to checkout directly
 *   - Get Pro when already authenticated navigates straight to
 *     checkout with the tier/billing query params
 *   - once authenticated with a stamped checkout intent in the URL,
 *     the effect forwards to checkout automatically
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PricingPage from "@/pages/PricingPage";

const { mockLogin, mockDevLogin } = vi.hoisted(() => ({ mockLogin: vi.fn(), mockDevLogin: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin, devLogin: mockDevLogin }),
}));

let mockIsAuthenticated = false;
vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
const { mockSetSearchParams } = vi.hoisted(() => ({ mockSetSearchParams: vi.fn() }));
let mockSearchParams = new URLSearchParams();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams, mockSetSearchParams],
  };
});

function renderPage() {
  return render(<MemoryRouter><PricingPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAuthenticated = false;
  mockSearchParams = new URLSearchParams();
});

describe("PricingPage — plan display", () => {
  it("shows only the Pro plan, annual price", () => {
    renderPage();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("$59")).toBeInTheDocument();
    expect(screen.getByText("/year")).toBeInTheDocument();
    expect(screen.queryByText("ContractorFree")).not.toBeInTheDocument();
    expect(screen.queryByText("ContractorPro")).not.toBeInTheDocument();
  });
});

describe("PricingPage — upgrade when unauthenticated", () => {
  it("stamps the checkout intent into the URL and logs in, without navigating to checkout", async () => {
    mockIsAuthenticated = false;
    renderPage();

    fireEvent.click(screen.getByText("Get Pro"));

    expect(mockSetSearchParams).toHaveBeenCalledWith({ checkout: "Pro", billing: "Yearly" }, { replace: true });
    await vi.waitFor(() => expect(mockLogin.mock.calls.length + mockDevLogin.mock.calls.length).toBeGreaterThan(0));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("PricingPage — upgrade when authenticated", () => {
  it("navigates straight to checkout with tier/billing params", () => {
    mockIsAuthenticated = true;
    renderPage();

    fireEvent.click(screen.getByText("Get Pro"));

    expect(mockNavigate).toHaveBeenCalledWith("/checkout?tier=Pro&billing=Yearly");
    expect(mockLogin).not.toHaveBeenCalled();
  });
});

describe("PricingPage — post-login forwarding", () => {
  it("forwards to checkout once authenticated with a stamped intent in the URL", () => {
    mockIsAuthenticated = true;
    mockSearchParams = new URLSearchParams({ checkout: "Pro", billing: "Yearly" });
    renderPage();

    expect(mockNavigate).toHaveBeenCalledWith("/checkout?tier=Pro&billing=Yearly");
  });

  it("does not forward when unauthenticated even with params present", () => {
    mockIsAuthenticated = false;
    mockSearchParams = new URLSearchParams({ checkout: "Pro", billing: "Yearly" });
    renderPage();

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
