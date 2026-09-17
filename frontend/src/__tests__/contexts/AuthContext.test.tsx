/**
 * AuthContext — 0 tests before this (flagged in the security audit as the one
 * contexts/ file with no coverage). Covers the real branching logic in
 * login/devLogin/logout: contractor redirect, the pendingVerification/
 * pendingCheckout sessionStorage handoffs (used by PaymentSuccessPage and
 * PricingPage's pre-login checkout intent), and the homeownerDestination
 * single-property shortcut.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const { mockNavigate, mockStore } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockStore: {
    setAuthenticated: vi.fn(),
    setProfile:        vi.fn(),
    setLastLoginAt:    vi.fn(),
    setTier:           vi.fn(),
    clearAuth:         vi.fn(),
    setLoading:        vi.fn(),
  },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => mockStore,
}));

const { mockIiLogin, mockIiLogout, mockIsAuthenticated, mockGetPrincipal, mockLoginWithLocalIdentity } = vi.hoisted(() => ({
  mockIiLogin:              vi.fn().mockResolvedValue(undefined),
  mockIiLogout:             vi.fn().mockResolvedValue(undefined),
  mockIsAuthenticated:      vi.fn().mockResolvedValue(false),
  mockGetPrincipal:         vi.fn().mockResolvedValue("test-principal"),
  mockLoginWithLocalIdentity: vi.fn().mockResolvedValue("local-principal"),
}));

vi.mock("@/services/actor", () => ({
  login: mockIiLogin,
  logout: mockIiLogout,
  isAuthenticated: mockIsAuthenticated,
  getPrincipal: mockGetPrincipal,
  loginWithLocalIdentity: mockLoginWithLocalIdentity,
}));

const { mockGetProfile, mockRecordLogin } = vi.hoisted(() => ({
  mockGetProfile:  vi.fn(),
  mockRecordLogin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/auth", () => ({
  authService: { getProfile: mockGetProfile, recordLogin: mockRecordLogin },
}));

const { mockGetMySubscription } = vi.hoisted(() => ({
  mockGetMySubscription: vi.fn().mockResolvedValue({ tier: "Free" }),
}));

vi.mock("@/services/payment", () => ({
  paymentService: { getMySubscription: mockGetMySubscription },
}));

const { mockGetMyProperties } = vi.hoisted(() => ({
  mockGetMyProperties: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/property", () => ({
  propertyService: { getMyProperties: mockGetMyProperties },
}));

const HOMEOWNER_PROFILE = {
  principal: "test-principal", role: "Homeowner" as const,
  email: "test@example.com", phone: "5125550100",
  createdAt: BigInt(0), updatedAt: BigInt(0), isActive: true, lastLoggedIn: null,
  onboardingComplete: true,
};

function Harness() {
  const { login, devLogin, logout } = useAuth();
  return (
    <div>
      <button onClick={login}>login</button>
      <button onClick={devLogin}>devLogin</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function renderHarness() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Harness />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAuthenticated.mockResolvedValue(false);
  mockIiLogin.mockResolvedValue(undefined);
  mockGetPrincipal.mockResolvedValue("test-principal");
  mockLoginWithLocalIdentity.mockResolvedValue("local-principal");
  mockGetMySubscription.mockResolvedValue({ tier: "Free" });
  mockGetMyProperties.mockResolvedValue([]);
  sessionStorage.clear();
});

describe("AuthContext — login()", () => {
  it("navigates to /contractor-dashboard for a Contractor profile", async () => {
    mockGetProfile.mockResolvedValue({ ...HOMEOWNER_PROFILE, role: "Contractor" });
    renderHarness();

    fireEvent.click(screen.getByText("login"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/contractor-dashboard"));
    expect(mockStore.setAuthenticated).toHaveBeenCalledWith("test-principal");
  });

  it("returns to the stashed pendingVerification URL and clears it", async () => {
    sessionStorage.setItem("pendingVerification", "/payment-success?subscription_id=sub_1");
    mockGetProfile.mockResolvedValue(HOMEOWNER_PROFILE);
    renderHarness();

    fireEvent.click(screen.getByText("login"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/payment-success?subscription_id=sub_1"));
    expect(sessionStorage.getItem("pendingVerification")).toBeNull();
  });

  it("resumes a stashed pendingCheckout intent (tier/billing) and clears it", async () => {
    sessionStorage.setItem("pendingCheckout", JSON.stringify({ tier: "Pro", billing: "Yearly" }));
    mockGetProfile.mockResolvedValue(HOMEOWNER_PROFILE);
    renderHarness();

    fireEvent.click(screen.getByText("login"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/checkout?tier=Pro&billing=Yearly"));
    expect(sessionStorage.getItem("pendingCheckout")).toBeNull();
  });

  it("falls through to homeownerDestination when pendingCheckout is malformed JSON", async () => {
    sessionStorage.setItem("pendingCheckout", "{not json");
    mockGetProfile.mockResolvedValue(HOMEOWNER_PROFILE);
    mockGetMyProperties.mockResolvedValue([]);
    renderHarness();

    fireEvent.click(screen.getByText("login"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"));
  });

  it("homeownerDestination shortcuts to the single property when onboarding is complete", async () => {
    mockGetProfile.mockResolvedValue(HOMEOWNER_PROFILE);
    mockGetMyProperties.mockResolvedValue([{ id: "prop-42" }]);
    renderHarness();

    fireEvent.click(screen.getByText("login"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/properties/prop-42"));
  });

  it("homeownerDestination goes to /dashboard when onboarding is incomplete, even with one property", async () => {
    mockGetProfile.mockResolvedValue({ ...HOMEOWNER_PROFILE, onboardingComplete: false });
    mockGetMyProperties.mockResolvedValue([{ id: "prop-42" }]);
    renderHarness();

    fireEvent.click(screen.getByText("login"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"));
    expect(mockGetMyProperties).not.toHaveBeenCalled();
  });

  it("navigates to /register when the user has no profile yet", async () => {
    mockGetProfile.mockRejectedValue(new Error("not found"));
    renderHarness();

    fireEvent.click(screen.getByText("login"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/register"));
  });

  it("does nothing when the II login itself fails", async () => {
    mockIiLogin.mockRejectedValue(new Error("user cancelled"));
    renderHarness();

    fireEvent.click(screen.getByText("login"));

    await waitFor(() => expect(mockIiLogin).toHaveBeenCalled());
    expect(mockStore.setAuthenticated).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("AuthContext — devLogin()", () => {
  it("navigates to /dashboard (not /register) when the user has no profile yet", async () => {
    mockGetProfile.mockRejectedValue(new Error("not found"));
    renderHarness();

    fireEvent.click(screen.getByText("devLogin"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"));
  });

  it("resumes a stashed pendingCheckout intent same as login()", async () => {
    sessionStorage.setItem("pendingCheckout", JSON.stringify({ tier: "Basic", billing: "Monthly" }));
    mockGetProfile.mockResolvedValue(HOMEOWNER_PROFILE);
    renderHarness();

    fireEvent.click(screen.getByText("devLogin"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/checkout?tier=Basic&billing=Monthly"));
  });
});

describe("AuthContext — logout()", () => {
  it("navigates home before clearing auth state (so ProtectedRoute doesn't race-redirect)", async () => {
    const callOrder: string[] = [];
    mockNavigate.mockImplementation(() => callOrder.push("navigate"));
    mockStore.clearAuth.mockImplementation(() => callOrder.push("clearAuth"));

    renderHarness();
    fireEvent.click(screen.getByText("logout"));

    await waitFor(() => expect(mockStore.clearAuth).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith("/");
    expect(callOrder).toEqual(["navigate", "clearAuth"]);
  });

  it("still clears local state when the II logout call itself fails", async () => {
    mockIiLogout.mockRejectedValue(new Error("identity provider unreachable"));
    renderHarness();

    fireEvent.click(screen.getByText("logout"));

    await waitFor(() => expect(mockStore.clearAuth).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
