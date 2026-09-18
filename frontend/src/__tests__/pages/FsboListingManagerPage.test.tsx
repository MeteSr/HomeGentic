/**
 * FsboListingManagerPage — real logic worth locking down:
 *   - listing state (not-activated / in-progress / live) is derived from the
 *     FsboRecord's step field
 *   - the live dashboard shows real stats (days on market, showing/offer
 *     counts, list price) sourced from the mocked services
 *   - handleSavePrice rejects invalid/non-positive input and otherwise
 *     updates price + logs the change
 *   - the take-down confirmation flow calls deactivate only after confirming
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import FsboListingManagerPage from "@/pages/FsboListingManagerPage";
import type { FsboRecord } from "@/services/fsbo";

const {
  mockGetRecord, mockGetPriceHistory, mockUpdatePrice, mockLogPriceChange, mockDeactivate,
  mockGetPanoramas, mockShowingGetByProperty, mockOfferGetByProperty,
} = vi.hoisted(() => ({
  mockGetRecord: vi.fn(),
  mockGetPriceHistory: vi.fn(() => []),
  mockUpdatePrice: vi.fn(),
  mockLogPriceChange: vi.fn(),
  mockDeactivate: vi.fn(),
  mockGetPanoramas: vi.fn(() => Promise.resolve([])),
  mockShowingGetByProperty: vi.fn(() => []),
  mockOfferGetByProperty: vi.fn(() => []),
}));

vi.mock("@/services/fsbo", () => ({
  fsboService: {
    getRecord: mockGetRecord, getPriceHistory: mockGetPriceHistory,
    updatePrice: mockUpdatePrice, logPriceChange: mockLogPriceChange, deactivate: mockDeactivate,
  },
}));
vi.mock("@/services/listing", () => ({ listingService: { getPanoramas: mockGetPanoramas, removePanorama: vi.fn() } }));
vi.mock("@/services/showingRequest", () => ({ showingRequestService: { getByProperty: mockShowingGetByProperty } }));
vi.mock("@/services/fsboOffer", () => ({ fsboOfferService: { getByProperty: mockOfferGetByProperty } }));
vi.mock("@/components/ShowingInbox", () => ({ default: () => <div data-testid="showing-inbox" /> }));
vi.mock("@/components/ShowingCalendar", () => ({ default: () => <div data-testid="showing-calendar" /> }));
vi.mock("@/components/FsboOfferPanel", () => ({ default: () => <div data-testid="offer-panel" /> }));
vi.mock("@/components/FsboPanel", () => ({ default: () => <div data-testid="fsbo-panel" /> }));
vi.mock("@/components/ListingPhotoManager", () => ({ default: () => <div data-testid="photo-manager" /> }));

function makeRecord(overrides: Partial<FsboRecord> = {}): FsboRecord {
  return {
    propertyId: "prop-1", isFsbo: true, listPriceCents: 45_000_000,
    activatedAt: Date.now() - 5 * 86_400_000, step: "done", hasReport: true,
    ...overrides,
  };
}

function renderAt(propertyId: string) {
  return render(
    <MemoryRouter initialEntries={[`/my-listing/${propertyId}`]}>
      <Routes><Route path="/my-listing/:propertyId" element={<FsboListingManagerPage />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPriceHistory.mockReturnValue([]);
  mockGetPanoramas.mockResolvedValue([]);
  mockShowingGetByProperty.mockReturnValue([]);
  mockOfferGetByProperty.mockReturnValue([]);
});

describe("FsboListingManagerPage — listing state", () => {
  it("shows the activation CTA when there is no FsboRecord", () => {
    mockGetRecord.mockReturnValue(null);
    renderAt("prop-1");
    expect(screen.getByText("Your home isn't listed yet.")).toBeInTheDocument();
    expect(screen.getByTestId("listing-status-badge")).toHaveTextContent("Not Listed");
  });

  it("shows the in-progress wizard when step is 1-3", () => {
    mockGetRecord.mockReturnValue(makeRecord({ step: 2 }));
    renderAt("prop-1");
    expect(screen.getByTestId("listing-status-badge")).toHaveTextContent("Activating");
    expect(screen.getByTestId("fsbo-panel")).toBeInTheDocument();
  });

  it("shows the full live dashboard when step is 'done'", () => {
    mockGetRecord.mockReturnValue(makeRecord({ step: "done" }));
    renderAt("prop-1");
    expect(screen.getByTestId("listing-status-badge")).toHaveTextContent("Live");
    expect(screen.getByTestId("listing-stats-bar")).toBeInTheDocument();
  });
});

describe("FsboListingManagerPage — live stats", () => {
  it("shows real stats from the mocked services", () => {
    mockGetRecord.mockReturnValue(makeRecord({ listPriceCents: 50_000_000 }));
    mockShowingGetByProperty.mockReturnValue([{}, {}] as any);
    mockOfferGetByProperty.mockReturnValue([{}] as any);
    renderAt("prop-1");

    expect(screen.getByTestId("stat-showings")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-offers")).toHaveTextContent("1");
    expect(screen.getByTestId("stat-list-price")).toHaveTextContent("$500,000");
  });
});

describe("FsboListingManagerPage — price editing", () => {
  it("does not call updatePrice for a non-positive or invalid amount", () => {
    mockGetRecord.mockReturnValue(makeRecord());
    renderAt("prop-1");

    fireEvent.change(screen.getByTestId("price-edit-input"), { target: { value: "0" } });
    fireEvent.click(screen.getByTestId("save-price-btn"));
    expect(mockUpdatePrice).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("price-edit-input"), { target: { value: "abc" } });
    fireEvent.click(screen.getByTestId("save-price-btn"));
    expect(mockUpdatePrice).not.toHaveBeenCalled();
  });

  it("updates price and logs the change for a valid amount", () => {
    mockGetRecord.mockReturnValue(makeRecord());
    renderAt("prop-1");

    fireEvent.change(screen.getByTestId("price-edit-input"), { target: { value: "475000" } });
    fireEvent.click(screen.getByTestId("save-price-btn"));

    expect(mockUpdatePrice).toHaveBeenCalledWith("prop-1", 47_500_000);
    expect(mockLogPriceChange).toHaveBeenCalledWith("prop-1", 47_500_000);
  });
});

describe("FsboListingManagerPage — take down flow", () => {
  it("shows the confirmation dialog and only deactivates on explicit confirm", () => {
    mockGetRecord.mockReturnValue(makeRecord());
    renderAt("prop-1");

    fireEvent.click(screen.getByTestId("take-down-btn"));
    expect(screen.getByTestId("take-down-confirm-dialog")).toBeInTheDocument();
    expect(mockDeactivate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("take-down-confirm"));
    expect(mockDeactivate).toHaveBeenCalledWith("prop-1");
  });

  it("cancel dismisses the dialog without deactivating", () => {
    mockGetRecord.mockReturnValue(makeRecord());
    renderAt("prop-1");

    fireEvent.click(screen.getByTestId("take-down-btn"));
    fireEvent.click(screen.getByTestId("take-down-cancel"));
    expect(screen.queryByTestId("take-down-confirm-dialog")).not.toBeInTheDocument();
    expect(mockDeactivate).not.toHaveBeenCalled();
  });
});
