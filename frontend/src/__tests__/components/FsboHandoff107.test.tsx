/**
 * TDD — Epic 10.7: FSBO → Agent Handoff
 *
 *   10.7.1 — "Find me an agent" one-click button in FsboPanel (shown when FSBO is live)
 *             Creates a ListingBidRequest pre-populated with FSBO data
 *   10.7.2 — Bid request notes include FSBO effort summary (days on market, offer count, list price)
 *             so agents who bid see the seller's FSBO history
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Hoisted mock data ────────────────────────────────────────────────────────

const { doneRecord, step1Record, mockBidRequest, mockOffers } = vi.hoisted(() => {
  const now = Date.now();
  return {
    doneRecord: {
      propertyId:     "prop-1",
      isFsbo:         true,
      listPriceCents: 49_500_000,   // $495,000
      activatedAt:    now - 14 * 86_400_000,   // 14 days ago
      step:           "done" as const,
      hasReport:      true,
    },
    step1Record: {
      propertyId:     "prop-1",
      isFsbo:         false,
      listPriceCents: 0,
      activatedAt:    0,
      step:           1 as const,
      hasReport:      false,
    },
    mockBidRequest: {
      id: "bid-1", propertyId: "prop-1", homeowner: "owner",
      targetListDate: 0, desiredSalePrice: 49_500_000,
      notes: "", bidDeadline: 0, status: "Open" as const, createdAt: Date.now(),
    },
    mockOffers: [
      { id: "fo-1", propertyId: "prop-1", status: "Active" },
      { id: "fo-2", propertyId: "prop-1", status: "Rejected" },
    ],
  };
});

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("@/services/fsbo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsbo")>();
  return {
    ...actual,
    fsboService: {
      getRecord:   vi.fn().mockReturnValue(null),
      setFsboMode: vi.fn(),
      advanceStep: vi.fn(),
      deactivate:  vi.fn(),
    },
  };
});

vi.mock("@/services/fsboOffer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsboOffer")>();
  return {
    ...actual,
    fsboOfferService: {
      getByProperty: vi.fn().mockReturnValue([]),
      logOffer:      vi.fn(),
      accept:        vi.fn(),
      reject:        vi.fn(),
      addCounter:    vi.fn(),
    },
  };
});

vi.mock("@/services/listing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/listing")>();
  return {
    ...actual,
    listingService: {
      createBidRequest:   vi.fn().mockResolvedValue(mockBidRequest),
      getMyBidRequests:   vi.fn().mockResolvedValue([]),
      getOpenBidRequests: vi.fn().mockResolvedValue([]),
      getMyCounters:      vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock("@/services/mlsService", () => ({
  mlsService: { submit: vi.fn() },
}));

vi.mock("@/services/payment", () => ({
  paymentService: {
    getMyAgentCredits: vi.fn(() => Promise.resolve(0)),
    getMySubscription: vi.fn().mockResolvedValue({ tier: "Pro" }),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import FsboPanel from "@/components/FsboPanel";
import { fsboService } from "@/services/fsbo";
import { fsboOfferService } from "@/services/fsboOffer";
import { listingService } from "@/services/listing";

// ─── Render helper ────────────────────────────────────────────────────────────

function renderPanel() {
  return render(
    <MemoryRouter>
      <FsboPanel propertyId="prop-1" score={80} verifiedJobCount={4} hasReport={true} />
    </MemoryRouter>
  );
}

// ─── 10.7.1 — "Find me an agent" button ──────────────────────────────────────

describe("FsboPanel — 'Find me an agent' button (10.7.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsboOfferService.getByProperty).mockReturnValue([]);
    vi.mocked(listingService.createBidRequest).mockResolvedValue(mockBidRequest as any);
  });

  it("shows 'Find me an agent' button when FSBO is live (step = done)", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue(doneRecord as any);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /find me an agent/i })).toBeInTheDocument()
    );
  });

  it("does NOT show the button when FSBO is not yet live (step = 1)", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue(step1Record as any);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText(/enter your asking price/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: /find me an agent/i })).not.toBeInTheDocument();
  });

  it("does NOT show the button when there is no FSBO record", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue(null);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText(/sell this home yourself/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: /find me an agent/i })).not.toBeInTheDocument();
  });

  it("clicking 'Find me an agent' calls listingService.createBidRequest", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue(doneRecord as any);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /find me an agent/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /find me an agent/i }));
    await waitFor(() =>
      expect(listingService.createBidRequest).toHaveBeenCalled()
    );
  });

  it("bid request uses the FSBO propertyId", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue(doneRecord as any);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /find me an agent/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /find me an agent/i }));
    await waitFor(() => expect(listingService.createBidRequest).toHaveBeenCalled());
    const input = vi.mocked(listingService.createBidRequest).mock.calls[0][0];
    expect(input.propertyId).toBe("prop-1");
  });

  it("bid request desiredSalePrice equals the FSBO list price", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue(doneRecord as any);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /find me an agent/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /find me an agent/i }));
    await waitFor(() => expect(listingService.createBidRequest).toHaveBeenCalled());
    const input = vi.mocked(listingService.createBidRequest).mock.calls[0][0];
    expect(input.desiredSalePrice).toBe(49_500_000);
  });

  it("shows a success confirmation after agent handoff", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue(doneRecord as any);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /find me an agent/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /find me an agent/i }));
    await waitFor(() =>
      expect(screen.getByText(/agent request sent|agents will now compete|request submitted/i)).toBeInTheDocument()
    );
  });
});

// ─── 10.7.2 — FSBO effort summary in bid request notes ───────────────────────

describe("FsboPanel — FSBO effort summary in bid notes (10.7.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listingService.createBidRequest).mockResolvedValue(mockBidRequest as any);
  });

  it("bid request notes include the list price", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue(doneRecord as any);
    vi.mocked(fsboOfferService.getByProperty).mockReturnValue([]);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /find me an agent/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /find me an agent/i }));
    await waitFor(() => expect(listingService.createBidRequest).toHaveBeenCalled());
    const { notes } = vi.mocked(listingService.createBidRequest).mock.calls[0][0];
    expect(notes).toMatch(/495,000|495000/);
  });

  it("bid request notes include days on market", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue(doneRecord as any);
    vi.mocked(fsboOfferService.getByProperty).mockReturnValue([]);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /find me an agent/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /find me an agent/i }));
    await waitFor(() => expect(listingService.createBidRequest).toHaveBeenCalled());
    const { notes } = vi.mocked(listingService.createBidRequest).mock.calls[0][0];
    // 14 days on market
    expect(notes).toMatch(/14.*day|days.*14/i);
  });

  it("bid request notes include offer count", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue(doneRecord as any);
    vi.mocked(fsboOfferService.getByProperty).mockReturnValue(mockOffers as any);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /find me an agent/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /find me an agent/i }));
    await waitFor(() => expect(listingService.createBidRequest).toHaveBeenCalled());
    const { notes } = vi.mocked(listingService.createBidRequest).mock.calls[0][0];
    // 2 offers received
    expect(notes).toMatch(/2.*offer|offer.*2/i);
  });

  it("bid request notes say '0 offers' when no offers were received", async () => {
    vi.mocked(fsboService.getRecord).mockReturnValue(doneRecord as any);
    vi.mocked(fsboOfferService.getByProperty).mockReturnValue([]);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /find me an agent/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /find me an agent/i }));
    await waitFor(() => expect(listingService.createBidRequest).toHaveBeenCalled());
    const { notes } = vi.mocked(listingService.createBidRequest).mock.calls[0][0];
    expect(notes).toMatch(/0.*offer|offer.*0/i);
  });
});
