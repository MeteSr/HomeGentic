/**
 * PropertyTransferClaimPage — unit tests
 *
 * Covers: loading state, not-found / expired error states, unauthenticated
 * visitor flow, authenticated claim flow, and successful transfer redirect.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/services/property", () => ({
  propertyService: {
    getPendingTransferByToken: vi.fn(),
    getProperty:               vi.fn(),
    claimTransfer:             vi.fn(),
  },
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

// ── Imports (after vi.mock declarations) ─────────────────────────────────────

import PropertyTransferClaimPage from "@/pages/PropertyTransferClaimPage";
import type { PendingTransfer, Property } from "@/services/property";
import { propertyService as _ps } from "@/services/property";
import { useAuthStore as _useAuthStore } from "@/store/authStore";

const mockNavigate = vi.fn();

// Typed handles for the mocked functions
const mockGetPendingTransferByToken = vi.mocked(_ps.getPendingTransferByToken);
const mockGetProperty               = vi.mocked(_ps.getProperty);
const mockClaimTransfer             = vi.mocked(_ps.claimTransfer);
const mockUseAuthStore              = vi.mocked(_useAuthStore);

// ── Constants ─────────────────────────────────────────────────────────────────

const NOW_MS     = Date.now();
const EXPIRY_MS  = NOW_MS + 90 * 24 * 3600 * 1000;  // 90 days from now — always in the future
const PAST_MS    = NOW_MS - 1;                        // already expired

const MOCK_PENDING: PendingTransfer = {
  propertyId:  BigInt(42),
  from:        "seller-principal",
  token:       "test-token-123",
  initiatedAt: NOW_MS,
  expiresAt:   EXPIRY_MS,
};

const MOCK_PROPERTY: Property = {
  id:                BigInt(42),
  owner:             "seller-principal",
  address:           "123 Main St",
  city:              "Tampa",
  state:             "FL",
  zipCode:           "33601",
  propertyType:      "SingleFamily",
  yearBuilt:         BigInt(2005),
  squareFeet:        BigInt(2000),
  verificationLevel: "Basic",
  tier:              "Pro",
  createdAt:         BigInt(NOW_MS) * BigInt(1_000_000),
  updatedAt:         BigInt(NOW_MS) * BigInt(1_000_000),
  isActive:          true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage(token = "test-token-123", authenticated = false, principal = "buyer-principal") {
  mockUseAuthStore.mockReturnValue({
    isAuthenticated: authenticated,
    isLoading:       false,
    principal:       authenticated ? principal : null,
  });

  return render(
    <MemoryRouter initialEntries={[`/transfer/claim/${token}`]}>
      <Routes>
        <Route path="/transfer/claim/:token" element={<PropertyTransferClaimPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PropertyTransferClaimPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Loading ────────────────────────────────────────────────────────────────

  it("shows a loading spinner while fetching the pending transfer", () => {
    mockGetPendingTransferByToken.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText(/loading transfer/i)).toBeTruthy();
  });

  // ── Not found ──────────────────────────────────────────────────────────────

  it("shows not-found state when token does not exist", async () => {
    mockGetPendingTransferByToken.mockResolvedValue(null);
    renderPage("bad-token");
    await waitFor(() => {
      expect(screen.getByText(/no longer valid/i)).toBeTruthy();
    });
  });

  it("shows not-found state when service throws", async () => {
    mockGetPendingTransferByToken.mockRejectedValue(new Error("Network error"));
    renderPage("bad-token");
    await waitFor(() => {
      expect(screen.getByText(/no longer valid/i)).toBeTruthy();
    });
  });

  // ── Expired ────────────────────────────────────────────────────────────────

  it("shows expired state when token is past its expiresAt date", async () => {
    const expiredPending: PendingTransfer = { ...MOCK_PENDING, expiresAt: PAST_MS };
    mockGetPendingTransferByToken.mockResolvedValue(expiredPending);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/this link has expired/i)).toBeTruthy();
    });
  });

  // ── Unauthenticated visitor ────────────────────────────────────────────────

  it("shows property details and sign-in prompt for unauthenticated visitor", async () => {
    mockGetPendingTransferByToken.mockResolvedValue(MOCK_PENDING);
    mockGetProperty.mockResolvedValue(MOCK_PROPERTY);
    renderPage("test-token-123", false);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /claim this property/i })).toBeTruthy();
    });
    expect(screen.getByText("123 Main St")).toBeTruthy();
    expect(screen.getByText(/sign in to claim/i)).toBeTruthy();
    expect(screen.queryByText(/accept.*become owner/i)).toBeNull();
  });

  it("encodes the token in the login redirect URL", async () => {
    mockGetPendingTransferByToken.mockResolvedValue(MOCK_PENDING);
    mockGetProperty.mockResolvedValue(MOCK_PROPERTY);
    renderPage("test-token-123", false);

    await waitFor(() => screen.getByText(/sign in to claim/i));
    const link = screen.getByText(/sign in to claim/i).closest("a");
    expect(link?.getAttribute("href")).toContain("test-token-123");
  });

  // ── Authenticated buyer ────────────────────────────────────────────────────

  it("shows claim button for authenticated buyer", async () => {
    mockGetPendingTransferByToken.mockResolvedValue(MOCK_PENDING);
    mockGetProperty.mockResolvedValue(MOCK_PROPERTY);
    renderPage("test-token-123", true);

    await waitFor(() => {
      expect(screen.getByText(/accept.*become owner/i)).toBeTruthy();
    });
    expect(screen.queryByText(/sign in to claim/i)).toBeNull();
  });

  it("shows the buyer's principal on the claim page", async () => {
    mockGetPendingTransferByToken.mockResolvedValue(MOCK_PENDING);
    mockGetProperty.mockResolvedValue(MOCK_PROPERTY);
    renderPage("test-token-123", true, "my-principal-id");

    await waitFor(() => screen.getByText(/accept.*become owner/i));
    expect(screen.getByText("my-principal-id")).toBeTruthy();
  });

  // ── Successful claim ───────────────────────────────────────────────────────

  it("calls claimTransfer and shows success then redirects", async () => {
    mockGetPendingTransferByToken.mockResolvedValue(MOCK_PENDING);
    mockGetProperty.mockResolvedValue(MOCK_PROPERTY);
    mockClaimTransfer.mockResolvedValue({ ...MOCK_PROPERTY, owner: "buyer-principal" });

    renderPage("test-token-123", true);
    await waitFor(() => screen.getByText(/accept.*become owner/i));

    fireEvent.click(screen.getByText(/accept.*become owner/i));

    await waitFor(() => {
      expect(mockClaimTransfer).toHaveBeenCalledWith("test-token-123");
    });
    await waitFor(() => {
      expect(screen.getByText(/you're the new owner/i)).toBeTruthy();
    });

    // The component fires a 1.8s setTimeout before navigating — wait for it
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/properties/42");
    }, { timeout: 3000 });
  });

  // ── Failed claim ───────────────────────────────────────────────────────────

  it("shows error and restores claim button when claimTransfer throws", async () => {
    mockGetPendingTransferByToken.mockResolvedValue(MOCK_PENDING);
    mockGetProperty.mockResolvedValue(MOCK_PROPERTY);
    mockClaimTransfer.mockRejectedValue(new Error("Transfer link has expired."));

    renderPage("test-token-123", true);
    await waitFor(() => screen.getByText(/accept.*become owner/i));

    fireEvent.click(screen.getByText(/accept.*become owner/i));

    await waitFor(() => {
      expect(screen.getByText(/Transfer link has expired/i)).toBeTruthy();
    });
    expect(screen.getByText(/accept.*become owner/i)).toBeTruthy();
  });

  // ── What transfers panel ───────────────────────────────────────────────────

  it("lists the data categories that transfer to the buyer", async () => {
    mockGetPendingTransferByToken.mockResolvedValue(MOCK_PENDING);
    mockGetProperty.mockResolvedValue(MOCK_PROPERTY);
    renderPage("test-token-123", true);

    await waitFor(() => screen.getByText(/what you'll receive/i));
    expect(screen.getByText(/maintenance.*job history/i)).toBeTruthy();
    expect(screen.getByText(/utility bill records/i)).toBeTruthy();
  });
});
