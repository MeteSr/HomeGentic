/**
 * PropertyManagerClaimPage — real logic worth locking down:
 *   - not-found state when the invite token doesn't resolve
 *   - expired state when Date.now() has passed invite.expiresAt
 *   - degrades gracefully (still shows "ready") when the property lookup fails
 *   - unauthenticated visitors see a sign-in link instead of an accept button
 *   - authenticated visitors can accept, see a claimed state, and redirect
 *     to /dashboard after 2s
 *   - a failed claim shows the error and lets the visitor retry
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PropertyManagerClaimPage from "@/pages/PropertyManagerClaimPage";
import type { ManagerInvite, Property } from "@/services/property";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ token: "tok-1" }), useNavigate: () => mockNavigate };
});

const { mockGetInvite, mockGetProperty, mockClaimRole } = vi.hoisted(() => ({
  mockGetInvite:  vi.fn(),
  mockGetProperty: vi.fn(),
  mockClaimRole:  vi.fn(),
}));

vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return {
    ...actual,
    propertyService: {
      getManagerInviteByToken: mockGetInvite,
      getProperty: mockGetProperty,
      claimManagerRole: mockClaimRole,
    },
  };
});

const { mockUseAuthStore } = vi.hoisted(() => ({ mockUseAuthStore: vi.fn() }));
vi.mock("@/store/authStore", () => ({ useAuthStore: mockUseAuthStore }));

function makeInvite(overrides: Partial<ManagerInvite> = {}): ManagerInvite {
  return {
    propertyId: "prop-1", token: "tok-1", role: "Manager", displayName: "Jamie Rivera",
    invitedBy: "p-owner", createdAt: Date.now(), expiresAt: Date.now() + 90 * 86400000,
    ...overrides,
  };
}

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PropertyManagerClaimPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuthStore.mockReturnValue({ isAuthenticated: false, isLoading: false, principal: null });
});

describe("PropertyManagerClaimPage — invite resolution", () => {
  it("shows not-found when the token doesn't resolve to an invite", async () => {
    mockGetInvite.mockResolvedValue(null);
    renderPage();
    await waitFor(() => expect(screen.getByText("This link is no longer valid")).toBeInTheDocument());
  });

  it("shows not-found when the lookup throws", async () => {
    mockGetInvite.mockRejectedValue(new Error("network error"));
    renderPage();
    await waitFor(() => expect(screen.getByText("This link is no longer valid")).toBeInTheDocument());
  });

  it("shows expired when the invite's expiresAt has passed", async () => {
    mockGetInvite.mockResolvedValue(makeInvite({ expiresAt: Date.now() - 1000 }));
    renderPage();
    await waitFor(() => expect(screen.getByText("This link has expired")).toBeInTheDocument());
  });

  it("shows the ready state with property details when the property loads", async () => {
    mockGetInvite.mockResolvedValue(makeInvite({ role: "Manager" }));
    mockGetProperty.mockResolvedValue(makeProperty({ address: "123 Main St" }));
    renderPage();
    await waitFor(() => expect(screen.getByText("You've been invited as a Manager")).toBeInTheDocument());
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
  });

  it("degrades gracefully to the property-id fallback when the property lookup fails", async () => {
    mockGetInvite.mockResolvedValue(makeInvite({ propertyId: "prop-99" }));
    mockGetProperty.mockRejectedValue(new Error("not found"));
    renderPage();
    await waitFor(() => expect(screen.getByText("You've been invited as a Manager")).toBeInTheDocument());
    expect(screen.getByText("#prop-99")).toBeInTheDocument();
  });

  it("shows Viewer-specific permissions for a Viewer invite", async () => {
    mockGetInvite.mockResolvedValue(makeInvite({ role: "Viewer" }));
    mockGetProperty.mockResolvedValue(makeProperty());
    renderPage();
    await waitFor(() => expect(screen.getByText("You've been invited as a Viewer")).toBeInTheDocument());
    expect(screen.queryByText(/Add maintenance jobs and notes/)).not.toBeInTheDocument();
    expect(screen.getByText(/View uploaded photos/)).toBeInTheDocument();
  });
});

describe("PropertyManagerClaimPage — unauthenticated", () => {
  it("shows a sign-in link instead of an accept button", async () => {
    mockGetInvite.mockResolvedValue(makeInvite());
    mockGetProperty.mockResolvedValue(makeProperty());
    renderPage();
    await waitFor(() => expect(screen.getByText("Sign in to accept →")).toBeInTheDocument());
    expect(screen.queryByText(/Accept Manager Access/)).not.toBeInTheDocument();
  });

  it("preserves the claim URL as a redirect param on the sign-in link", async () => {
    mockGetInvite.mockResolvedValue(makeInvite());
    mockGetProperty.mockResolvedValue(makeProperty());
    renderPage();
    await waitFor(() => expect(screen.getByText("Sign in to accept →")).toBeInTheDocument());
    expect(screen.getByText("Sign in to accept →").closest("a")).toHaveAttribute(
      "href",
      "/login?redirect=%2Fmanage%2Fclaim%2Ftok-1"
    );
  });
});

describe("PropertyManagerClaimPage — authenticated accept flow", () => {
  beforeEach(() => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: true, isLoading: false, principal: "p-visitor" });
  });

  it("accepts the role and redirects to /dashboard after 2s", async () => {
    mockGetInvite.mockResolvedValue(makeInvite({ role: "Manager" }));
    mockGetProperty.mockResolvedValue(makeProperty());
    mockClaimRole.mockResolvedValue({ propertyId: "prop-1", role: "Manager" });
    renderPage();

    await waitFor(() => expect(screen.getByText("Accept Manager Access →")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Accept Manager Access →"));

    await waitFor(() => expect(mockClaimRole).toHaveBeenCalledWith("tok-1"));
    await waitFor(() => expect(screen.getByText("You're now a Manager")).toBeInTheDocument());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"), { timeout: 3000 });
  }, 8000);

  it("shows an error and lets the user retry when the claim fails", async () => {
    mockGetInvite.mockResolvedValue(makeInvite({ role: "Manager" }));
    mockGetProperty.mockResolvedValue(makeProperty());
    mockClaimRole.mockRejectedValue(new Error("Invite already claimed"));
    renderPage();

    await waitFor(() => expect(screen.getByText("Accept Manager Access →")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Accept Manager Access →"));

    await waitFor(() => expect(screen.getByText("Invite already claimed")).toBeInTheDocument());
    expect(screen.getByText("Accept Manager Access →")).toBeInTheDocument(); // still retryable
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows the accepting principal", async () => {
    mockGetInvite.mockResolvedValue(makeInvite());
    mockGetProperty.mockResolvedValue(makeProperty());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Accepting as:/)).toBeInTheDocument());
    expect(screen.getByText("p-visitor")).toBeInTheDocument();
  });
});
