/**
 * PropertyTransferClaimPage — real logic worth locking down:
 *   - not_found when the token has no pending transfer, or the
 *     lookup rejects; expired when past pending.expiresAt
 *   - unauthenticated visitors see a sign-in link (with a redirect
 *     back to this claim URL), not the claim button
 *   - authenticated visitors see the claim button; a successful claim
 *     shows the claimed state and navigates to the property after a
 *     short delay
 *   - a failed claim surfaces its error message and returns to the
 *     ready state so the visitor can retry
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PropertyTransferClaimPage from "@/pages/PropertyTransferClaimPage";
import type { PendingTransfer, Property } from "@/services/property";

const { mockGetPendingTransfer, mockGetProperty, mockClaimTransfer } = vi.hoisted(() => ({
  mockGetPendingTransfer: vi.fn(),
  mockGetProperty: vi.fn(),
  mockClaimTransfer: vi.fn(),
}));
vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return {
    ...actual,
    propertyService: {
      getPendingTransferByToken: mockGetPendingTransfer,
      getProperty: mockGetProperty,
      claimTransfer: mockClaimTransfer,
    },
  };
});

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockAuthState = { isAuthenticated: false, isLoading: false, principal: null as string | null };
vi.mock("@/store/authStore", () => ({ useAuthStore: () => mockAuthState }));

function makePending(overrides: Partial<PendingTransfer> = {}): PendingTransfer {
  return { propertyId: "prop-1", from: "seller-principal", token: "tok-123", initiatedAt: Date.now(), expiresAt: Date.now() + 90 * 86400000, ...overrides };
}

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "seller-principal", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "Basic" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function renderAt(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/transfer/claim/${token}`]}>
      <Routes><Route path="/transfer/claim/:token" element={<PropertyTransferClaimPage />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthState = { isAuthenticated: false, isLoading: false, principal: null };
});

describe("PropertyTransferClaimPage — not found / expired", () => {
  it("shows not-found when no pending transfer exists for the token", async () => {
    mockGetPendingTransfer.mockResolvedValue(null);
    renderAt("tok-bad");
    expect(await screen.findByText("This link is no longer valid")).toBeInTheDocument();
  });

  it("shows not-found when the lookup rejects", async () => {
    mockGetPendingTransfer.mockRejectedValue(new Error("network down"));
    renderAt("tok-err");
    expect(await screen.findByText("This link is no longer valid")).toBeInTheDocument();
  });

  it("shows expired when past the transfer's expiresAt", async () => {
    mockGetPendingTransfer.mockResolvedValue(makePending({ expiresAt: Date.now() - 1000 }));
    renderAt("tok-old");
    expect(await screen.findByText("This link has expired")).toBeInTheDocument();
  });
});

describe("PropertyTransferClaimPage — unauthenticated", () => {
  it("shows a sign-in link with a redirect back to this claim URL", async () => {
    mockGetPendingTransfer.mockResolvedValue(makePending());
    mockGetProperty.mockResolvedValue(makeProperty());
    renderAt("tok-123");

    const link = await screen.findByText("Sign in to claim →");
    expect(link).toHaveAttribute("href", "/login?redirect=%2Ftransfer%2Fclaim%2Ftok-123");
    expect(screen.queryByText("Accept & Become Owner →")).not.toBeInTheDocument();
  });
});

describe("PropertyTransferClaimPage — authenticated claim flow", () => {
  it("claims successfully, shows the claimed state, and navigates after a delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockAuthState = { isAuthenticated: true, isLoading: false, principal: "buyer-principal" };
    mockGetPendingTransfer.mockResolvedValue(makePending());
    mockGetProperty.mockResolvedValue(makeProperty());
    mockClaimTransfer.mockResolvedValue(makeProperty({ id: "prop-1" }));
    renderAt("tok-123");

    fireEvent.click(await screen.findByText("Accept & Become Owner →"));
    expect(await screen.findByText("You're the new owner")).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(1800); });
    expect(mockNavigate).toHaveBeenCalledWith("/properties/prop-1");
    vi.useRealTimers();
  });

  it("shows the claim error and returns to the ready state on failure", async () => {
    mockAuthState = { isAuthenticated: true, isLoading: false, principal: "buyer-principal" };
    mockGetPendingTransfer.mockResolvedValue(makePending());
    mockGetProperty.mockResolvedValue(makeProperty());
    mockClaimTransfer.mockRejectedValue(new Error("Transfer already claimed"));
    renderAt("tok-123");

    fireEvent.click(await screen.findByText("Accept & Become Owner →"));

    expect(await screen.findByText("Transfer already claimed")).toBeInTheDocument();
    expect(screen.getByText("Accept & Become Owner →")).toBeInTheDocument();
  });
});
