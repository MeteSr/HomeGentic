/**
 * ForProsPage — real logic worth locking down:
 *   - "Join free" (ContractorFree) always triggers login, regardless of auth state
 *   - a paid tier CTA triggers login when unauthenticated, or navigates to
 *     /checkout with the tier and Monthly billing when authenticated
 *   - the plan fee/price labels are derived from the real referralService
 *     and planConstants values, not hardcoded
 *   - the mobile hamburger menu toggles open/closed
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ForProsPage from "@/pages/ForProsPage";
import { referralService } from "@/services/referralService";
import { PLANS } from "@/services/planConstants";

const { mockNavigate, mockDevLogin, mockLogin, mockUseAuthStore } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockDevLogin: vi.fn(),
  mockLogin: vi.fn(),
  mockUseAuthStore: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ login: mockLogin, devLogin: mockDevLogin, logout: vi.fn() }) }));
vi.mock("@/store/authStore", () => ({ useAuthStore: mockUseAuthStore }));

function renderPage() {
  return render(<MemoryRouter><ForProsPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuthStore.mockReturnValue({ isAuthenticated: false });
});

describe("ForProsPage — plan labels", () => {
  it("derives the fee/price labels from the real referralService and planConstants", () => {
    renderPage();
    const feeLabel = `${referralService.REFERRAL_FEE_RATE * 100}%`;
    const floorLabel = `$${referralService.REFERRAL_FEE_FLOOR_CENTS / 100}`;
    const proPrice = `$${PLANS.find((p) => p.tier === "ContractorPro")?.price}/mo`;
    const expectedFeeText = `+ ${feeLabel} of each winning bid, ${floorLabel} minimum`;

    expect(screen.getAllByText(expectedFeeText).length).toBeGreaterThan(0);
    expect(screen.getByText(proPrice)).toBeInTheDocument();
  });
});

describe("ForProsPage — handleUpgrade", () => {
  it("triggers devLogin for the free tier regardless of auth state", async () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: true });
    renderPage();
    fireEvent.click(screen.getByText("Join free"));
    expect(mockDevLogin).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/checkout"));
  });

  it("triggers login when unauthenticated and clicking the paid tier CTA", () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: false });
    renderPage();
    fireEvent.click(screen.getByText("Go Pro"));
    expect(mockDevLogin).toHaveBeenCalled();
  });

  it("navigates to /checkout with tier and Monthly billing when authenticated", () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: true });
    renderPage();
    fireEvent.click(screen.getByText("Go Pro"));
    expect(mockNavigate).toHaveBeenCalledWith("/checkout?tier=ContractorPro&billing=Monthly");
  });
});

describe("ForProsPage — mobile menu", () => {
  it("toggles aria-expanded on the hamburger button", () => {
    renderPage();
    const hamburger = screen.getByLabelText("Open menu");
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(hamburger);
    expect(screen.getByLabelText("Close menu")).toHaveAttribute("aria-expanded", "true");
  });
});
