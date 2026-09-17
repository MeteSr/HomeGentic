/**
 * MobileAccountPage — real logic worth locking down:
 *   - plan label/usage lookups fall back to "Basic" for a null/unknown tier
 *   - the header falls back to "Account" when there's no profile email
 *   - property-count pluralization (1 property vs N properties)
 *   - navigation targets for the plan card, shared-access rows, and each
 *     settings row
 *   - Sign out clears auth and navigates home
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MobileAccountPage } from "@/pages/MobileAccountPage";
import type { Property } from "@/services/property";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockUseAuthStore, mockClearAuth } = vi.hoisted(() => ({
  mockUseAuthStore: vi.fn(),
  mockClearAuth: vi.fn(),
}));
vi.mock("@/store/authStore", () => ({ useAuthStore: mockUseAuthStore }));

function makeProperty(id: string): Property {
  return {
    id, owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
  };
}

const { mockUsePropertyStore } = vi.hoisted(() => ({ mockUsePropertyStore: vi.fn() }));
vi.mock("@/store/propertyStore", () => ({ usePropertyStore: mockUsePropertyStore }));

function renderPage() {
  return render(
    <MemoryRouter>
      <MobileAccountPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuthStore.mockReturnValue({ profile: { email: "jamie@example.com" }, tier: "Pro", clearAuth: mockClearAuth });
  mockUsePropertyStore.mockReturnValue({ properties: [makeProperty("prop-1")] });
});

describe("MobileAccountPage — plan display", () => {
  it("shows the plan label and usage copy for a known tier", () => {
    renderPage();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText(/20 properties · 30 photos\/job/)).toBeInTheDocument();
  });

  it("falls back to Basic label/usage for a null tier", () => {
    mockUseAuthStore.mockReturnValue({ profile: { email: "jamie@example.com" }, tier: null, clearAuth: mockClearAuth });
    renderPage();
    expect(screen.getByText("Basic")).toBeInTheDocument();
    expect(screen.getByText(/1 property · 5 photos\/job/)).toBeInTheDocument();
  });

  it("pluralizes property count correctly", () => {
    mockUsePropertyStore.mockReturnValue({ properties: [makeProperty("p1"), makeProperty("p2")] });
    renderPage();
    expect(screen.getByText(/2 properties/)).toBeInTheDocument();
  });

  it("uses singular wording for exactly one property", () => {
    mockUsePropertyStore.mockReturnValue({ properties: [makeProperty("p1")] });
    renderPage();
    expect(screen.getByText(/1 property\b/)).toBeInTheDocument();
  });

  it("navigates to /plans when the plan card is clicked", () => {
    renderPage();
    fireEvent.click(screen.getByText("Change"));
    expect(mockNavigate).toHaveBeenCalledWith("/plans");
  });
});

describe("MobileAccountPage — header fallback", () => {
  it("shows the account email as the header when present", () => {
    renderPage();
    // appears twice: the H1 header and the Profile settings row value
    expect(screen.getAllByText("jamie@example.com")).toHaveLength(2);
  });

  it("falls back to 'Account' when there's no profile email", () => {
    mockUseAuthStore.mockReturnValue({ profile: null, tier: "Pro", clearAuth: mockClearAuth });
    renderPage();
    expect(screen.getByText("Account")).toBeInTheDocument();
  });
});

describe("MobileAccountPage — navigation", () => {
  it("navigates to /people from Manage and Invite someone", () => {
    renderPage();
    fireEvent.click(screen.getByText("Manage"));
    expect(mockNavigate).toHaveBeenCalledWith("/people");

    fireEvent.click(screen.getByText("Invite someone"));
    expect(mockNavigate).toHaveBeenCalledWith("/people");
  });

  it("navigates to the correct settings tab for each row", () => {
    renderPage();
    fireEvent.click(screen.getByText("Profile"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings?tab=profile");

    fireEvent.click(screen.getByText("Notifications"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings?tab=notifications");

    fireEvent.click(screen.getByText("Security"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings?tab=security");
  });

  it("clears auth and navigates home on Sign out", () => {
    renderPage();
    fireEvent.click(screen.getByText("Sign out"));
    expect(mockClearAuth).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
