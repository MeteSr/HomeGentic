/**
 * §17.7 — Public System Age Estimator page component tests
 *
 * 17.7.1 — page renders system table without login
 * 17.7.2 — shareable URL shown and updated when inputs change
 * 17.7.3 — "Track this property" CTA links to /properties/new with yearBuilt
 * 17.7.5 — estimator → registration migration (yearBuilt in CTA href)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";

// Mock lucide-react icons to avoid SVG rendering complexity
vi.mock("lucide-react", () => ({
  Share2:  ({ size }: any) => <span data-testid="icon-share"  style={{ width: size }} />,
  Copy:    ({ size }: any) => <span data-testid="icon-copy"   style={{ width: size }} />,
  ArrowRight: ({ size }: any) => <span data-testid="icon-arrow" style={{ width: size }} />,
}));

import HomeSystemsEstimatorPage from "@/pages/HomeSystemsEstimatorPage";

function renderPage(search = "?yearBuilt=1998&type=single-family") {
  return render(
    <MemoryRouter initialEntries={[`/home-systems${search}`]}>
      <Routes>
        <Route path="/home-systems" element={<HomeSystemsEstimatorPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── 17.7.1 — Renders system table without login ──────────────────────────────

describe("HomeSystemsEstimatorPage — system table", () => {
  it("renders the page without crashing", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("shows all 9 system names", () => {
    renderPage();
    expect(screen.getByText("HVAC")).toBeInTheDocument();
    expect(screen.getByText("Roofing")).toBeInTheDocument();
    expect(screen.getByText("Water Heater")).toBeInTheDocument();
    expect(screen.getByText("Plumbing")).toBeInTheDocument();
    expect(screen.getByText("Electrical")).toBeInTheDocument();
    expect(screen.getByText("Windows")).toBeInTheDocument();
    expect(screen.getByText("Flooring")).toBeInTheDocument();
    expect(screen.getByText("Insulation")).toBeInTheDocument();
    expect(screen.getByText("Solar Panels")).toBeInTheDocument();
  });

  it("shows urgency indicators for each system", () => {
    renderPage();
    const indicators = screen.getAllByRole("status");
    expect(indicators.length).toBe(9);
  });

  it("renders the year built from URL params (1998)", () => {
    renderPage("?yearBuilt=1998&type=single-family");
    // heading includes the year built
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("1998");
  });

  it("shows a fallback when yearBuilt param is missing", () => {
    renderPage("?type=single-family");
    // Should render a prompt/form instead of the table
    expect(screen.getByRole("form")).toBeInTheDocument();
    expect(screen.queryByText("HVAC")).not.toBeInTheDocument();
  });

  it("shows replacement cost range for each system", () => {
    renderPage("?yearBuilt=1998");
    // At least one cost range like "$X – $Y" should be visible
    const costRanges = screen.getAllByLabelText(/replacement cost/i);
    expect(costRanges.length).toBeGreaterThan(0);
  });
});

// ── 17.7.2 — Shareable URL ───────────────────────────────────────────────────

describe("HomeSystemsEstimatorPage — shareable URL", () => {
  it("displays the shareable URL section", () => {
    renderPage("?yearBuilt=2005&type=condo");
    expect(screen.getByLabelText("share url")).toBeInTheDocument();
  });

  it("shareable URL contains yearBuilt param", () => {
    renderPage("?yearBuilt=2005&type=condo");
    const shareInput = screen.getByLabelText("share url") as HTMLInputElement;
    expect(shareInput.value).toContain("2005");
  });

  it("copy button is present in the share section", () => {
    renderPage("?yearBuilt=2005");
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });
});

// ── 17.7.3 — "Track this property" CTA ──────────────────────────────────────

describe("HomeSystemsEstimatorPage — registration CTA", () => {
  it("shows the track-this-property CTA", () => {
    renderPage("?yearBuilt=1998");
    expect(screen.getByRole("link", { name: /track this property/i })).toBeInTheDocument();
  });

  it("CTA links to /properties/new", () => {
    renderPage("?yearBuilt=1998");
    const link = screen.getByRole("link", { name: /track this property/i });
    expect(link.getAttribute("href")).toContain("/properties/new");
  });

  // ── 17.7.5 — migration: yearBuilt pre-populated in registration URL ─────────
  it("CTA href carries yearBuilt param for pre-population (17.7.5)", () => {
    renderPage("?yearBuilt=1998&type=single-family");
    const link = screen.getByRole("link", { name: /track this property/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("yearBuilt=1998");
  });

  it("CTA href carries propertyType param when type provided", () => {
    renderPage("?yearBuilt=1998&type=condo");
    const link = screen.getByRole("link", { name: /track this property/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("type=condo");
  });

  it("CTA is visible even for a new house (all Good urgency)", () => {
    renderPage(`?yearBuilt=${new Date().getFullYear()}`);
    expect(screen.getByRole("link", { name: /track this property/i })).toBeInTheDocument();
  });
});
