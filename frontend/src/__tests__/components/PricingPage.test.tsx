/**
 * PricingPage tests
 *
 * Plan display
 *   - renders Basic, Pro, Premium homeowner plans by default
 *   - shows monthly prices
 *   - annual toggle switches to yearly prices
 *
 * Upgrade flow — authenticated user
 *   - navigates directly to /checkout with tier and Monthly billing
 *   - annual billing passes Yearly to checkout URL
 *
 * Upgrade flow — unauthenticated user
 *   - calls handleLogin
 *   - does not navigate to /checkout directly
 *
 * Post-login redirect
 *   - when isAuthenticated=true with ?checkout and ?billing params, navigates to /checkout
 *   - does not navigate when params are absent
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

const mockDevLogin = vi.fn().mockResolvedValue(undefined);
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: vi.fn(), devLogin: mockDevLogin, logout: vi.fn() }),
}));

vi.mock("@/services/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/payment")>();
  return {
    ...actual,
    paymentService: {
      ...actual.paymentService,
      getMySubscription: vi.fn().mockResolvedValue({ tier: "Free", expiresAt: null }),
    },
  };
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import PricingPage from "@/pages/PricingPage";
import { useAuthStore } from "@/store/authStore";

// ── helpers ───────────────────────────────────────────────────────────────────

function renderPricing(authenticated = false, search = "") {
  vi.mocked(useAuthStore).mockImplementation((sel?: any) => {
    const state = {
      isAuthenticated: authenticated,
      principal: authenticated ? "test-principal" : null,
      profile: null,
    };
    return sel ? sel(state) : state;
  });
  return render(
    <MemoryRouter initialEntries={[`/pricing${search}`]}>
      <Routes>
        <Route path="/pricing" element={<PricingPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── plan display ──────────────────────────────────────────────────────────────

describe("PricingPage — plan display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    localStorage.clear();
  });

  it("renders Basic, Pro and Premium plan headings by default", () => {
    renderPricing();
    expect(screen.getAllByText("Basic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Premium").length).toBeGreaterThan(0);
  });

  it("shows monthly prices by default", () => {
    renderPricing();
    expect(screen.getAllByText(/\$10/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$20/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$40/).length).toBeGreaterThan(0);
  });

  it("annual toggle switches to yearly prices (10× monthly)", () => {
    renderPricing();
    fireEvent.click(screen.getByRole("button", { name: /annual/i }));
    expect(screen.getAllByText(/\$100/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$200/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$400/).length).toBeGreaterThan(0);
  });
});

// ── authenticated upgrade ─────────────────────────────────────────────────────

describe("PricingPage — authenticated upgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    localStorage.clear();
  });

  it("navigates to /checkout with Monthly billing", async () => {
    renderPricing(true);
    fireEvent.click(screen.getByRole("button", { name: /start with basic/i }));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/checkout?tier=Basic&billing=Monthly")
    );
  });

  it("navigates with Yearly billing when annual toggle is active", async () => {
    renderPricing(true);
    fireEvent.click(screen.getByRole("button", { name: /annual/i }));
    fireEvent.click(screen.getByRole("button", { name: /start with basic/i }));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/checkout?tier=Basic&billing=Yearly")
    );
  });

  it("passes the correct tier to the checkout URL", async () => {
    renderPricing(true);
    fireEvent.click(screen.getByRole("button", { name: /get pro/i }));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining("tier=Pro")
      )
    );
  });
});

// ── unauthenticated upgrade ───────────────────────────────────────────────────

describe("PricingPage — unauthenticated upgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    mockDevLogin.mockReset();
    localStorage.clear();
  });

  it("calls handleLogin when an unauthenticated user clicks a plan", async () => {
    renderPricing(false);
    fireEvent.click(screen.getByRole("button", { name: /start with basic/i }));
    await waitFor(() => expect(mockDevLogin).toHaveBeenCalledTimes(1));
  });

  it("does not navigate to /checkout directly (waits for login)", async () => {
    mockDevLogin.mockImplementation(() => new Promise(() => {})); // never resolves
    renderPricing(false);
    fireEvent.click(screen.getByRole("button", { name: /start with basic/i }));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.stringContaining("/checkout")
    );
  });
});

// ── post-login redirect ───────────────────────────────────────────────────────

describe("PricingPage — post-login redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    localStorage.clear();
  });

  it("navigates to /checkout when authenticated with ?checkout params", () => {
    renderPricing(true, "?checkout=Pro&billing=Monthly");
    expect(mockNavigate).toHaveBeenCalledWith("/checkout?tier=Pro&billing=Monthly");
  });

  it("navigates with the correct tier from URL params", () => {
    renderPricing(true, "?checkout=Premium&billing=Yearly");
    expect(mockNavigate).toHaveBeenCalledWith("/checkout?tier=Premium&billing=Yearly");
  });

  it("does not navigate to /checkout when params are absent", () => {
    renderPricing(true, "");
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.stringContaining("/checkout")
    );
  });
});
