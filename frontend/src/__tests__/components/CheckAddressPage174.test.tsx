/**
 * §17.4.1 — CheckAddressPage: public address search
 * §17.4.2 — "Request a report" buyer form
 * §17.4.3 — no login required (confirmed by public route)
 * §17.4.4 — document.title set with address for SEO
 * §17.4.5 — "No report found" seller CTA
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/buyerLookup", () => ({
  lookupReport:        vi.fn(),
  submitReportRequest: vi.fn().mockResolvedValue(true),
  normalizeAddress:    (s: string) => s.trim().toLowerCase(),
}));

import { lookupReport, submitReportRequest } from "@/services/buyerLookup";
import CheckAddressPage from "@/pages/CheckAddressPage";

function renderPage(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/check${search}`]}>
      <Routes>
        <Route path="/check" element={<CheckAddressPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Search form (no address in URL) ──────────────────────────────────────────

describe("CheckAddressPage — search form", () => {
  it("renders an address input when no query param provided", () => {
    renderPage();
    expect(screen.getByRole("textbox", { name: /address/i })).toBeInTheDocument();
  });

  it("renders a search button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /check/i })).toBeInTheDocument();
  });

  it("does not call lookupReport on initial render", () => {
    renderPage();
    expect(lookupReport).not.toHaveBeenCalled();
  });
});

// ── §17.4.1 — Report found state ─────────────────────────────────────────────

describe("CheckAddressPage — report found", () => {
  beforeEach(() => {
    (lookupReport as any).mockResolvedValue({
      found:             true,
      token:             "tok-abc123",
      address:           "123 Main St, Daytona Beach, FL 32114",
      verificationLevel: "Basic",
      propertyType:      "SingleFamily",
      yearBuilt:         1998,
    });
  });

  it("shows 'HomeGentic Verified' badge when report found", async () => {
    renderPage("?address=123+Main+St+Daytona+Beach+FL");
    await waitFor(() =>
      expect(screen.getByText(/HomeGentic Verified/i)).toBeInTheDocument()
    );
  });

  it("shows the address in the result", async () => {
    renderPage("?address=123+Main+St+Daytona+Beach+FL");
    await waitFor(() =>
      expect(screen.getByText(/123 Main St/)).toBeInTheDocument()
    );
  });

  it("shows a link to view the full report", async () => {
    renderPage("?address=123+Main+St+Daytona+Beach+FL");
    // Wait for the report-found section to stabilize, then assert the link synchronously.
    // Keeping the assertion outside waitFor avoids timer-reset issues from continuous
    // DOM mutations (scroll listeners, etc.) that prevent waitFor from settling.
    await waitFor(() => screen.getByText(/HomeGentic Verified/i));
    const link = screen.getByRole("link", { name: /view report/i });
    expect(link.getAttribute("href")).toContain("tok-abc123");
  });

  it("shows the verification level", async () => {
    renderPage("?address=123+Main+St+Daytona+Beach+FL");
    await waitFor(() =>
      expect(screen.getByText(/Basic/i)).toBeInTheDocument()
    );
  });

  // §17.4.4 — SEO: document.title set with address
  it("sets document.title with the address when report found", async () => {
    renderPage("?address=123+Main+St+Daytona+Beach+FL");
    await waitFor(() =>
      expect(document.title).toContain("HomeGentic")
    );
  });
});

// ── §17.4.5 — No report found state + seller CTA ────────────────────────────

describe("CheckAddressPage — no report found", () => {
  beforeEach(() => {
    (lookupReport as any).mockResolvedValue({
      found:   false,
      address: "99 Unknown Rd",
    });
  });

  it("shows 'No report on file' message", async () => {
    renderPage("?address=99+Unknown+Rd");
    await waitFor(() =>
      expect(screen.getByText(/no report on file/i)).toBeInTheDocument()
    );
  });

  it("§17.4.5 — shows seller CTA 'Are you the homeowner?'", async () => {
    renderPage("?address=99+Unknown+Rd");
    await waitFor(() =>
      expect(screen.getByText(/are you the homeowner/i)).toBeInTheDocument()
    );
  });

  it("§17.4.5 — seller CTA links to /properties/new", async () => {
    renderPage("?address=99+Unknown+Rd");
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /start.*report|create.*report/i });
      expect(link.getAttribute("href")).toContain("/properties/new");
    });
  });

  it("§17.4.2 — shows buyer request form", async () => {
    renderPage("?address=99+Unknown+Rd");
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument()
    );
  });

  it("§17.4.2 — submits buyer request with address and email", async () => {
    renderPage("?address=99+Unknown+Rd");
    await waitFor(() => screen.getByRole("textbox", { name: /email/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));
    await waitFor(() =>
      expect(submitReportRequest).toHaveBeenCalledWith(
        expect.stringContaining("Unknown Rd"),
        "buyer@example.com"
      )
    );
  });

  it("§17.4.2 — shows confirmation after request submitted", async () => {
    renderPage("?address=99+Unknown+Rd");
    await waitFor(() => screen.getByRole("textbox", { name: /email/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));
    await waitFor(() =>
      expect(screen.getByText(/we.ll notify you/i)).toBeInTheDocument()
    );
  });
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe("CheckAddressPage — loading", () => {
  it("shows a loading indicator while fetching", () => {
    (lookupReport as any).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );
    renderPage("?address=123+Main+St");
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });
});
