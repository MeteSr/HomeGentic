/**
 * ContractorDashboardPage — real logic worth locking down:
 *   - open requests sort emergency-first, then by recency
 *   - clicking a filter chip narrows the list to that service type; "All"
 *     falls back to the contractor's own specialties when set
 *   - win rate and total earnings are computed only from resolved bids
 *   - submitting a quote marks the request as already-quoted (no duplicate
 *     submission) and calls quoteService.submitQuote with the right values
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ContractorDashboardPage from "@/pages/ContractorDashboardPage";
import type { ContractorProfile } from "@/services/contractor";
import type { QuoteRequest, Quote } from "@/services/quote";
import type { Job } from "@/services/job";

const {
  mockGetMyProfile, mockGetReviewsForContractor, mockGetOpenRequests,
  mockGetJobsPendingMySignature, mockGetMyBids, mockSubmitQuote, mockVerifyJob,
  mockUseAuthStore, mockUseBreakpoint,
} = vi.hoisted(() => ({
  mockGetMyProfile: vi.fn(),
  mockGetReviewsForContractor: vi.fn(() => Promise.resolve([])),
  mockGetOpenRequests: vi.fn(),
  mockGetJobsPendingMySignature: vi.fn(() => Promise.resolve([] as Job[])),
  mockGetMyBids: vi.fn(),
  mockSubmitQuote: vi.fn(),
  mockVerifyJob: vi.fn(),
  mockUseAuthStore: vi.fn(),
  mockUseBreakpoint: vi.fn(() => ({ isMobile: false, isTablet: false })),
}));

vi.mock("@/services/contractor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/contractor")>();
  return { ...actual, contractorService: { getMyProfile: mockGetMyProfile, getReviewsForContractor: mockGetReviewsForContractor } };
});
vi.mock("@/services/quote", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/quote")>();
  return { ...actual, quoteService: { getOpenRequests: mockGetOpenRequests, getMyBids: mockGetMyBids, submitQuote: mockSubmitQuote } };
});
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return { ...actual, jobService: { getJobsPendingMySignature: mockGetJobsPendingMySignature, verifyJob: mockVerifyJob } };
});
vi.mock("@/store/authStore", () => ({ useAuthStore: mockUseAuthStore }));
vi.mock("@/hooks/useBreakpoint", () => ({ useBreakpoint: mockUseBreakpoint }));
vi.mock("@/components/Layout", () => ({ Layout: ({ children }: any) => <div data-testid="layout">{children}</div> }));

function makeRequest(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    id: "req-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
    urgency: "medium", description: "AC repair needed", status: "open",
    createdAt: Date.now() - 60_000,
    ...overrides,
  };
}

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return { id: "q-1", requestId: "req-1", contractor: "me", amount: 50000, timeline: 3, validUntil: Date.now() + 1000, status: "pending", createdAt: Date.now(), ...overrides };
}

function renderPage() {
  return render(<MemoryRouter><ContractorDashboardPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuthStore.mockReturnValue({ lastLoginAt: 0 });
  mockGetMyProfile.mockResolvedValue(null);
  mockGetOpenRequests.mockResolvedValue([]);
  mockGetMyBids.mockResolvedValue([]);
  mockGetJobsPendingMySignature.mockResolvedValue([]);
});

describe("ContractorDashboardPage — request sorting", () => {
  it("sorts emergency requests before lower-urgency ones regardless of creation order", async () => {
    mockGetOpenRequests.mockResolvedValue([
      makeRequest({ id: "low-req", serviceType: "Roofing", urgency: "low", createdAt: Date.now() }),
      makeRequest({ id: "emergency-req", serviceType: "Plumbing", urgency: "emergency", createdAt: Date.now() - 100_000 }),
    ]);
    renderPage();

    // Wait for BOTH cards to be present (a single findAllByText can resolve
    // as soon as just one has committed, since React updates from the
    // parallel Promise.all loads don't always land in a single paint).
    const [plumbing, roofing] = await waitFor(() => {
      const p = screen.getByText("Plumbing", { selector: "span" });
      const r = screen.getByText("Roofing", { selector: "span" });
      return [p, r];
    });
    expect(plumbing.compareDocumentPosition(roofing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("ContractorDashboardPage — filter chips", () => {
  it("filters the list to only the selected service type", async () => {
    mockGetOpenRequests.mockResolvedValue([
      makeRequest({ id: "r1", serviceType: "HVAC" }),
      makeRequest({ id: "r2", serviceType: "Roofing" }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText("HVAC", { selector: "span" })).toBeInTheDocument());
    fireEvent.click(screen.getByText("Roofing", { selector: "button" }));

    await waitFor(() => expect(screen.queryByText("HVAC", { selector: "span" })).not.toBeInTheDocument());
    expect(screen.getByText("Roofing", { selector: "span" })).toBeInTheDocument();
  });

  it("'All' scopes to the contractor's own specialties when set", async () => {
    mockGetMyProfile.mockResolvedValue({ id: "c1", specialties: ["HVAC"], trustScore: 80, jobsCompleted: 10, isVerified: true } as unknown as ContractorProfile);
    mockGetOpenRequests.mockResolvedValue([
      makeRequest({ id: "r1", serviceType: "HVAC" }),
      makeRequest({ id: "r2", serviceType: "Roofing" }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText("HVAC", { selector: "span" })).toBeInTheDocument());
    expect(screen.queryByText("Roofing", { selector: "span" })).not.toBeInTheDocument();
  });
});

describe("ContractorDashboardPage — win rate / earnings", () => {
  it("shows 'em dash' win rate/earnings when there are no resolved bids", async () => {
    mockGetMyBids.mockResolvedValue([makeQuote({ status: "pending" })]);
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Win Rate").length).toBeGreaterThan(0));
    // pending-only bids never resolve, so both stats show the placeholder
    // (the page renders the stat twice: a card and a progress-bar label)
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("computes win rate and earnings only from resolved (accepted/rejected) bids", async () => {
    mockGetMyBids.mockResolvedValue([
      makeQuote({ id: "won", status: "accepted", amount: 100000 }),
      makeQuote({ id: "lost", status: "rejected", amount: 50000 }),
      makeQuote({ id: "still-pending", status: "pending", amount: 999999 }),
    ]);
    renderPage();

    // 1 won / 2 resolved = 50%
    await waitFor(() => expect(screen.getAllByText("50%").length).toBeGreaterThan(0));
    expect(screen.getAllByText("$1,000").length).toBeGreaterThan(0);
  });
});

describe("ContractorDashboardPage — submitting a quote", () => {
  it("calls submitQuote with the entered amount/timeline and marks the request as quoted", async () => {
    mockGetOpenRequests.mockResolvedValue([makeRequest({ id: "req-1", serviceType: "HVAC" })]);
    mockSubmitQuote.mockResolvedValue(undefined);
    renderPage();

    // Expand the lead card, then open the submit-quote modal. Query by
    // selector "span" to target the request card's service-type label,
    // not the identically-labeled filter chip <button> above it.
    fireEvent.click(await screen.findByText("HVAC", { selector: "span" }));
    fireEvent.click(await screen.findByText("Submit Quote"));

    fireEvent.change(screen.getByPlaceholderText("e.g. 850"), { target: { value: "500" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 3"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Send Quote"));

    await waitFor(() => expect(mockSubmitQuote).toHaveBeenCalledWith("req-1", 50000, 5, expect.any(Number)));
    expect(await screen.findByText("Quote submitted")).toBeInTheDocument();
  });

  it("keeps the Send Quote button disabled until both amount and timeline are valid", async () => {
    mockGetOpenRequests.mockResolvedValue([makeRequest({ id: "req-1", serviceType: "HVAC" })]);
    renderPage();

    fireEvent.click(await screen.findByText("HVAC", { selector: "span" }));
    fireEvent.click(await screen.findByText("Submit Quote"));

    expect(screen.getByText("Send Quote").closest("button")).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("e.g. 850"), { target: { value: "500" } });
    expect(screen.getByText("Send Quote").closest("button")).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("e.g. 3"), { target: { value: "5" } });
    expect(screen.getByText("Send Quote").closest("button")).not.toBeDisabled();
  });
});
