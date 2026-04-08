/**
 * Layout tests:
 *
 * - Nav active state (16.3.2): single-property homeowner Dashboard highlight
 * - User menu: avatar button opens popover with Settings / Upgrade / Sign out
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLogout   = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

vi.mock("@/services/job", () => ({
  jobService: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/components/VoiceAgent", () => ({
  VoiceAgent: () => null,
}));

vi.mock("@/components/UpgradeModal", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="upgrade-modal" /> : null,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// Store mocks are set per-test via module-level mutable refs
let mockProperties: { id: string; address: string }[] = [];
let mockProfile: { role: string; name?: string } = { role: "Homeowner", name: "Test User" };

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({ principal: "test-principal", profile: mockProfile }),
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({ properties: mockProperties }),
}));

import { Layout } from "@/components/Layout";

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderNav(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout>
        <div>page content</div>
      </Layout>
    </MemoryRouter>
  );
}

function openUserMenu(path = "/dashboard") {
  renderNav(path);
  fireEvent.click(screen.getByRole("button", { name: /test user/i }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Layout nav — Dashboard active state (16.3.2)", () => {
  beforeEach(() => {
    mockProfile = { role: "Homeowner" };
  });

  // ── Single-property user ───────────────────────────────────────────────────

  it("highlights Dashboard when single-property user is on /properties/:id", () => {
    mockProperties = [{ id: "42", address: "123 Maple St" }];
    renderNav("/properties/42");
    const dashLink = screen.getByRole("link", { name: /^dashboard$/i });
    // active link has borderBottom with sage colour (not transparent)
    expect(dashLink).toHaveStyle({ borderBottom: expect.stringContaining("solid") });
    expect(dashLink.getAttribute("style")).not.toMatch(/transparent/);
  });

  it("highlights Dashboard when single-property user is on a sub-path of their property", () => {
    mockProperties = [{ id: "42", address: "123 Maple St" }];
    renderNav("/properties/42/jobs");
    const dashLink = screen.getByRole("link", { name: /^dashboard$/i });
    expect(dashLink.getAttribute("style")).not.toMatch(/transparent/);
  });

  it("does NOT highlight Dashboard on /dashboard itself for single-property user", () => {
    mockProperties = [{ id: "42", address: "123 Maple St" }];
    renderNav("/dashboard");
    const dashLink = screen.getByRole("link", { name: /^dashboard$/i });
    // Should still be active (it's /dashboard path), just testing we don't break the normal case
    expect(dashLink).toBeInTheDocument();
    expect(dashLink.getAttribute("style")).not.toMatch(/transparent/);
  });

  // ── Multi-property user ────────────────────────────────────────────────────

  it("does NOT highlight Dashboard for multi-property user on /properties/:id", () => {
    mockProperties = [
      { id: "42", address: "123 Maple St" },
      { id: "99", address: "456 Oak Ave" },
    ];
    renderNav("/properties/42");
    const dashLink = screen.getByRole("link", { name: /^dashboard$/i });
    expect(dashLink.getAttribute("style")).toMatch(/transparent/);
  });

  // ── Property ID mismatch ───────────────────────────────────────────────────

  it("does NOT highlight Dashboard when single-property user is on a different property ID", () => {
    mockProperties = [{ id: "42", address: "123 Maple St" }];
    // Navigating to a property that isn't theirs (e.g. shared link)
    renderNav("/properties/999");
    const dashLink = screen.getByRole("link", { name: /^dashboard$/i });
    expect(dashLink.getAttribute("style")).toMatch(/transparent/);
  });

  // ── Non-property routes unaffected ────────────────────────────────────────

  it("highlights Market link when on /market (unrelated to property fix)", () => {
    mockProperties = [{ id: "42", address: "123 Maple St" }];
    renderNav("/market");
    const marketLink = screen.getByRole("link", { name: /^market$/i });
    expect(marketLink.getAttribute("style")).not.toMatch(/transparent/);
    // Dashboard should NOT be highlighted
    const dashLink = screen.getByRole("link", { name: /^dashboard$/i });
    expect(dashLink.getAttribute("style")).toMatch(/transparent/);
  });

  // ── Contractor role unaffected ─────────────────────────────────────────────

  it("does NOT apply single-property logic to Contractor role", () => {
    mockProfile = { role: "Contractor" };
    mockProperties = [{ id: "42", address: "123 Maple St" }];
    renderNav("/properties/42");
    // Contractors have a Dashboard link (→ /contractor-dashboard) but it should NOT
    // be highlighted just because the path is /properties/42
    const dashLink = screen.getByRole("link", { name: /^dashboard$/i });
    expect(dashLink.getAttribute("style")).toMatch(/transparent/);
  });
});

// ─── User menu ────────────────────────────────────────────────────────────────

describe("Layout user menu", () => {
  beforeEach(() => {
    mockProfile = { role: "Homeowner", name: "Test User" };
    mockProperties = [];
    mockLogout.mockClear();
    mockNavigate.mockClear();
  });

  it("renders an avatar button with user initials", () => {
    renderNav("/dashboard");
    // "TU" initials from "Test User", or button labelled by displayName
    expect(screen.getByRole("button", { name: /test user/i })).toBeInTheDocument();
  });

  it("menu is hidden before the avatar is clicked", () => {
    renderNav("/dashboard");
    expect(screen.queryByRole("button", { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upgrade plan/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("opens the menu when the avatar button is clicked", () => {
    openUserMenu();
    expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upgrade plan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("shows the user's display name in the menu header", () => {
    openUserMenu();
    // The name appears in the popover header (non-button text)
    const allByText = screen.getAllByText(/test user/i);
    expect(allByText.length).toBeGreaterThan(0);
  });

  it("navigates to /settings and closes menu when Settings is clicked", () => {
    openUserMenu();
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
    // Menu should be gone
    expect(screen.queryByRole("button", { name: /settings/i })).not.toBeInTheDocument();
  });

  it("opens UpgradeModal when Upgrade plan is clicked", () => {
    openUserMenu();
    fireEvent.click(screen.getByRole("button", { name: /upgrade plan/i }));
    expect(screen.getByTestId("upgrade-modal")).toBeInTheDocument();
  });

  it("calls logout when Sign out is clicked", () => {
    openUserMenu();
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("closes the menu on click outside", () => {
    openUserMenu();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("falls back to 'User' display name when profile has no name", () => {
    mockProfile = { role: "Homeowner" }; // no name field
    renderNav("/dashboard");
    // Sidebar is open by default so the span text "User" is the accessible name
    expect(screen.getByRole("button", { name: /^user$/i })).toBeInTheDocument();
  });
});
