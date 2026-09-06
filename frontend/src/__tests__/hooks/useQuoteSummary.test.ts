/**
 * Unit tests — useQuoteSummary
 *
 * QS.1  quoteRequests and bidCountMap are empty on mount (canister error path)
 * QS.2  Loads quote requests from quoteService on mount
 * QS.3  bidCountMap is fetched when requests are present
 * QS.4  reload re-fetches requests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { QuoteRequest } from "@/services/quote";

const mockGetRequests    = vi.fn();
const mockGetBidCountMap = vi.fn();

vi.mock("@/services/quote", () => ({
  quoteService: {
    getRequests:    (...a: any[]) => mockGetRequests(...a),
    getBidCountMap: (...a: any[]) => mockGetBidCountMap(...a),
  },
}));

import { useQuoteSummary } from "@/hooks/useQuoteSummary";

const REQ: QuoteRequest = {
  id: "r1", propertyId: "p1", homeowner: "principal-1",
  serviceType: "HVAC", urgency: "medium",
  description: "Annual tune-up", status: "open",
  createdAt: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRequests.mockResolvedValue([REQ]);
  mockGetBidCountMap.mockResolvedValue({ r1: 2 });
});

// ── QS.1 ─────────────────────────────────────────────────────────────────────

describe("QS.1 — graceful error path: returns empty collections", () => {
  it("stays empty when quoteService throws", async () => {
    mockGetRequests.mockRejectedValueOnce(new Error("canister down"));
    const { result } = renderHook(() => useQuoteSummary());
    await waitFor(() => {
      // hook swallows the error; state stays at initial empty values
      expect(mockGetRequests).toHaveBeenCalledTimes(1);
    });
    expect(result.current.quoteRequests).toHaveLength(0);
    expect(result.current.bidCountMap).toEqual({});
  });
});

// ── QS.2 ─────────────────────────────────────────────────────────────────────

describe("QS.2 — loads quote requests from quoteService", () => {
  it("populates quoteRequests", async () => {
    const { result } = renderHook(() => useQuoteSummary());
    await waitFor(() => {
      expect(result.current.quoteRequests).toHaveLength(1);
    });
    expect(result.current.quoteRequests[0].id).toBe("r1");
  });
});

// ── QS.3 ─────────────────────────────────────────────────────────────────────

describe("QS.3 — bidCountMap is fetched when requests are present", () => {
  it("maps request id to bid count", async () => {
    const { result } = renderHook(() => useQuoteSummary());
    await waitFor(() => {
      expect(result.current.bidCountMap["r1"]).toBe(2);
    });
    expect(mockGetBidCountMap).toHaveBeenCalledWith(["r1"]);
  });
});

// ── QS.4 ─────────────────────────────────────────────────────────────────────

describe("QS.4 — reload re-fetches requests", () => {
  it("calls getRequests a second time on reload", async () => {
    const { result } = renderHook(() => useQuoteSummary());
    await waitFor(() => { expect(result.current.quoteRequests).toHaveLength(1); });
    await act(async () => { await result.current.reload(); });
    expect(mockGetRequests).toHaveBeenCalledTimes(2);
  });
});
