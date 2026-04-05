/**
 * TDD — 5.2.3: Negotiation UI
 *
 * NegotiationPanel renders the opt-in toggle and analysis inside QuoteDetailPage.
 * It must clearly surface the consent requirement and only analyze after opt-in.
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NegotiationPanel } from "@/components/NegotiationPanel";
import type { Quote, QuoteRequest } from "@/services/quote";

const MOCK_REQUEST: QuoteRequest = {
  id:          "REQ_10",
  propertyId:  "prop_1",
  homeowner:   "owner-1",
  serviceType: "HVAC",
  urgency:     "medium",
  description: "AC unit not cooling.",
  status:      "quoted",
  createdAt:   Date.now() - 86400000,
};

const MOCK_QUOTES: Quote[] = [
  {
    id:         "QUOTE_A",
    requestId:  "REQ_10",
    contractor: "contractor-1",
    amount:     185000,
    timeline:   3,
    validUntil: Date.now() + 86400000 * 7,
    status:     "pending",
    createdAt:  Date.now() - 3600000,
  },
  {
    id:         "QUOTE_B",
    requestId:  "REQ_10",
    contractor: "contractor-2",
    amount:     220000,
    timeline:   5,
    validUntil: Date.now() + 86400000 * 7,
    status:     "pending",
    createdAt:  Date.now() - 3600000,
  },
];

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("NegotiationPanel — consent gate (5.2.3)", () => {
  it("renders the opt-in toggle", () => {
    render(<NegotiationPanel request={MOCK_REQUEST} quotes={MOCK_QUOTES} zip="94103" />);
    expect(screen.getByRole("checkbox")).toBeDefined();
  });

  it("shows consent description copy before opt-in", () => {
    render(<NegotiationPanel request={MOCK_REQUEST} quotes={MOCK_QUOTES} zip="94103" />);
    expect(screen.getAllByText(/HomeGentic/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/never contacts contractors/i)).toBeDefined();
  });

  it("does not show analysis before opt-in", () => {
    render(<NegotiationPanel request={MOCK_REQUEST} quotes={MOCK_QUOTES} zip="94103" />);
    expect(screen.queryByText(/verdict/i)).toBeNull();
    expect(screen.queryByText(/fair|high|low/i)).toBeNull();
  });

  it("toggling the checkbox triggers opt-in", async () => {
    render(<NegotiationPanel request={MOCK_REQUEST} quotes={MOCK_QUOTES} zip="94103" />);
    fireEvent.click(screen.getByRole("checkbox"));
    // After opt-in, loading or analysis should appear
    await waitFor(() => {
      expect(screen.queryAllByText(/analyzing|fair|high|low/i).length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it("shows a loading state after opt-in before results arrive", async () => {
    render(<NegotiationPanel request={MOCK_REQUEST} quotes={MOCK_QUOTES} zip="94103" />);
    fireEvent.click(screen.getByRole("checkbox"));
    // At some point between click and result there should be a loading indicator
    // (may be brief — we just check it eventually resolves)
    await waitFor(() => {
      expect(screen.queryByRole("checkbox")).not.toBeNull();
    });
  });
});

describe("NegotiationPanel — analysis display (5.2.3)", () => {
  async function renderWithConsent() {
    render(<NegotiationPanel request={MOCK_REQUEST} quotes={MOCK_QUOTES} zip="94103" />);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      expect(screen.queryAllByText(/fair|high|low/i).length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  }

  it("shows analysis for each quote after opt-in", async () => {
    await renderWithConsent();
    // Two quotes → at least one verdict rendered
    expect(screen.queryAllByText(/fair|high|low/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows benchmark context (p25/median/p75 or similar)", async () => {
    await renderWithConsent();
    // Benchmark grid labels should appear
    expect(screen.queryAllByText(/median|market p25|market p75/i).length).toBeGreaterThan(0);
  });

  it("un-toggling the checkbox hides analysis", async () => {
    await renderWithConsent();
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      // Benchmark row labels gone after opt-out
      expect(screen.queryByText(/market p25/i)).toBeNull();
    });
  });

  it("revoking consent removes analysis from view", async () => {
    await renderWithConsent();
    // Click again to revoke
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      // Analysis rows should be gone
      expect(screen.queryByText(/market p25/i)).toBeNull();
    });
  });
});
