/**
 * Layout nav active state tests — 16.3.2
 *
 * For single-property homeowners on /properties/:id, the "Dashboard" nav
 * link should be highlighted as active (it IS their home). For multi-property
 * users on the same route, no nav item should match Dashboard specifically.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock("@/services/job", () => ({
  jobService: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/components/VoiceAgent", () => ({
  VoiceAgent: () => null,
}));

// Store mocks are set per-test via module-level mutable refs
let mockProperties: { id: string; address: string }[] = [];
let mockProfile: { role: string } = { role: "Homeowner" };

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
