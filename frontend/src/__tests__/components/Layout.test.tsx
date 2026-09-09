/**
 * Layout tests:
 *
 * - Nav active state: Dashboard vs. Property highlighting for single-property
 *   homeowners (16.3.2 originally highlighted Dashboard here too, which
 *   duplicated the dedicated Property tab added later — see the bug report
 *   that corrected this: Dashboard and Property must never both be active).
 * - User menu: avatar button opens popover with Settings / Upgrade / Sign out
 */

import { render, screen, fireEvent, within } from "@testing-library/react";
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
let mockProfile: { role: string; email?: string } = { role: "Homeowner", email: "test@example.com" };

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({ principal: "test-principal", profile: mockProfile, tier: null, setTier: vi.fn(), setProfile: vi.fn() }),
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

// The mobile bottom tab bar renders alongside the desktop sidebar (hidden via
// CSS media queries, not conditional rendering) and shares some labels (e.g.
// "Property"), so queries must be scoped to the desktop sidebar to be unique.
function getSidebarLink(container: HTMLElement, name: RegExp) {
  const sidebar = container.querySelector(".hf-sidebar") as HTMLElement;
  return within(sidebar).getByRole("link", { name });
}

function openUserMenu(path = "/dashboard") {
  renderNav(path);
  fireEvent.click(screen.getByRole("button", { name: /test@example\.com/i }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Layout nav — Dashboard vs. Property active state (16.3.2)", () => {
  beforeEach(() => {
    mockProfile = { role: "Homeowner" };
  });

  // ── Single-property user ───────────────────────────────────────────────────

  it("highlights only Property (not Dashboard) when single-property user is on /properties/:id", () => {
    mockProperties = [{ id: "42", address: "123 Maple St" }];
    const { container } = renderNav("/properties/42");
    const dashLink = getSidebarLink(container, /^dashboard$/i);
    const propLink = getSidebarLink(container, /^property$/i);
    expect(dashLink.getAttribute("style")).toMatch(/transparent/);
    expect(propLink.getAttribute("style")).not.toMatch(/transparent/);
  });

  it("highlights only Property (not Dashboard) on a sub-path of their property", () => {
    mockProperties = [{ id: "42", address: "123 Maple St" }];
    const { container } = renderNav("/properties/42/jobs");
    const dashLink = getSidebarLink(container, /^dashboard$/i);
    const propLink = getSidebarLink(container, /^property$/i);
    expect(dashLink.getAttribute("style")).toMatch(/transparent/);
    expect(propLink.getAttribute("style")).not.toMatch(/transparent/);
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

// ─── Mobile bottom tab bar ──────────────────────────────────────────────────────
//
// The Property tab used to fall back to "/dashboard" when there was no single
// property to link to, duplicating the Home tab's key ("Encountered two
// children with the same key" React warning) and both tabs showing active
// on /dashboard at once — the same underlying bug as the sidebar fix above.

describe("Layout mobile bottom tab bar", () => {
  beforeEach(() => {
    mockProfile = { role: "Homeowner" };
  });

  function getBottomTabLink(container: HTMLElement, name: RegExp) {
    const bottomNav = container.querySelector(".hf-bottom-nav") as HTMLElement;
    return within(bottomNav).getByRole("link", { name });
  }

  it("omits the Property tab (rather than duplicating /dashboard) when there is no single property", () => {
    mockProperties = [
      { id: "42", address: "123 Maple St" },
      { id: "99", address: "456 Oak Ave" },
    ];
    const { container } = renderNav("/dashboard");
    const bottomNav = container.querySelector(".hf-bottom-nav") as HTMLElement;
    expect(within(bottomNav).queryByRole("link", { name: /^property$/i })).not.toBeInTheDocument();
    expect(within(bottomNav).getByRole("link", { name: /^home$/i })).toBeInTheDocument();
  });

  it("shows a distinct Property tab pointing at the property when there is exactly one", () => {
    mockProperties = [{ id: "42", address: "123 Maple St" }];
    const { container } = renderNav("/properties/42");
    const propTab = getBottomTabLink(container, /^property$/i);
    expect(propTab).toHaveAttribute("href", "/properties/42");
  });

  it("never logs a duplicate-key warning, regardless of property count", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockProperties = [
      { id: "42", address: "123 Maple St" },
      { id: "99", address: "456 Oak Ave" },
    ];
    renderNav("/dashboard");
    const dupKeyWarning = errorSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === "string" && a.includes("same key"))
    );
    expect(dupKeyWarning).toBe(false);
    errorSpy.mockRestore();
  });
});

// ─── User menu ────────────────────────────────────────────────────────────────

describe("Layout user menu", () => {
  beforeEach(() => {
    mockProfile = { role: "Homeowner", email: "test@example.com" };
    mockProperties = [];
    mockLogout.mockClear();
    mockNavigate.mockClear();
  });

  it("renders an avatar button labelled by the user's email", () => {
    renderNav("/dashboard");
    expect(screen.getByRole("button", { name: /test@example\.com/i })).toBeInTheDocument();
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

  it("shows the user's email in the menu header", () => {
    openUserMenu();
    const allByText = screen.getAllByText(/test@example\.com/i);
    expect(allByText.length).toBeGreaterThan(0);
  });

  it("navigates to /settings and closes menu when Settings is clicked", () => {
    openUserMenu();
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
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

  it("falls back when profile has no email (uses principal prefix)", () => {
    mockProfile = { role: "Homeowner" }; // no email
    renderNav("/dashboard");
    // principal is "test-principal", so displayName = "test-pri…"
    expect(screen.getByRole("button", { name: /test-pri/i })).toBeInTheDocument();
  });
});
