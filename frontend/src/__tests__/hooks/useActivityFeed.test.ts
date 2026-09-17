/**
 * useActivityFeed — real logic worth locking down:
 *   - does not fetch until openFeed is called; feedLoaded flips true
 *     once the parallel job/quote/bill fetches settle (even if some
 *     reject, since each source is individually caught)
 *   - unread count is derived by comparing each event's timestamp to
 *     lastReadAt, which openFeed bumps to now and persists to
 *     localStorage
 *   - closeFeed hides the feed without re-fetching or touching
 *     lastReadAt
 *   - bills are fetched per property and flattened
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Property } from "@/services/property";
import type { ActivityEvent } from "@/services/activityFeed";

const mockGetAllJobs = vi.fn();
vi.mock("@/services/job", () => ({ jobService: { getAll: (...a: any[]) => mockGetAllJobs(...a) } }));

const mockGetRequests = vi.fn();
vi.mock("@/services/quote", () => ({ quoteService: { getRequests: (...a: any[]) => mockGetRequests(...a) } }));

const mockGetBillsForProperty = vi.fn();
vi.mock("@/services/billService", () => ({ billService: { getBillsForProperty: (...a: any[]) => mockGetBillsForProperty(...a) } }));

const mockDeriveEvents = vi.fn();
vi.mock("@/services/activityFeed", () => ({ deriveEvents: (...a: any[]) => mockDeriveEvents(...a) }));

import { useActivityFeed } from "@/hooks/useActivityFeed";

const PROP1: Property = {
  id: "p1", owner: "owner-1", address: "1 Main", city: "Austin", state: "TX",
  zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: BigInt(2000),
  squareFeet: BigInt(1800), verificationLevel: "Basic" as any, tier: "Basic" as any,
  createdAt: BigInt(0), updatedAt: BigInt(0), isActive: true,
};
const PROP2: Property = { ...PROP1, id: "p2" };

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return { id: "e1", type: "recent_job", title: "Job logged", detail: "", href: "/x", timestamp: 5000, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockGetAllJobs.mockResolvedValue([]);
  mockGetRequests.mockResolvedValue([]);
  mockGetBillsForProperty.mockResolvedValue([]);
  mockDeriveEvents.mockReturnValue([]);
});

describe("useActivityFeed — initial state", () => {
  it("starts closed and unloaded, and does not fetch before openFeed", () => {
    const { result } = renderHook(() => useActivityFeed([PROP1]));
    expect(result.current.feedOpen).toBe(false);
    expect(result.current.feedLoaded).toBe(false);
    expect(mockGetAllJobs).not.toHaveBeenCalled();
  });
});

describe("useActivityFeed — loading on open", () => {
  it("fetches jobs, quotes, and per-property bills once opened, then marks loaded", async () => {
    mockGetAllJobs.mockResolvedValue([{ id: "j1" }]);
    const { result } = renderHook(() => useActivityFeed([PROP1, PROP2]));

    act(() => result.current.openFeed());

    await waitFor(() => expect(result.current.feedLoaded).toBe(true));
    expect(mockGetAllJobs).toHaveBeenCalled();
    expect(mockGetRequests).toHaveBeenCalled();
    expect(mockGetBillsForProperty).toHaveBeenCalledWith("p1");
    expect(mockGetBillsForProperty).toHaveBeenCalledWith("p2");
  });

  it("still marks loaded even when a source rejects", async () => {
    mockGetAllJobs.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useActivityFeed([PROP1]));

    act(() => result.current.openFeed());

    await waitFor(() => expect(result.current.feedLoaded).toBe(true));
  });

  it("does not re-fetch on a second openFeed once already loaded", async () => {
    const { result } = renderHook(() => useActivityFeed([PROP1]));
    act(() => result.current.openFeed());
    await waitFor(() => expect(result.current.feedLoaded).toBe(true));

    mockGetAllJobs.mockClear();
    act(() => result.current.closeFeed());
    act(() => result.current.openFeed());

    expect(mockGetAllJobs).not.toHaveBeenCalled();
  });
});

describe("useActivityFeed — unread count", () => {
  it("counts events newer than lastReadAt as unread", () => {
    mockDeriveEvents.mockReturnValue([makeEvent({ timestamp: 5000 }), makeEvent({ id: "e2", timestamp: 500 })]);
    const { result } = renderHook(() => useActivityFeed([PROP1]));
    // lastReadAt defaults to 0 (nothing in localStorage) so both would be unread
    // until openFeed bumps it — check the pre-open baseline first
    expect(result.current.unread).toBe(2);
  });

  it("openFeed bumps lastReadAt to now, persists it, and reduces unread going forward", () => {
    mockDeriveEvents.mockReturnValue([makeEvent({ timestamp: 5000 })]);
    const { result } = renderHook(() => useActivityFeed([PROP1]));

    act(() => result.current.openFeed());

    expect(result.current.lastReadAt).toBeGreaterThan(5000);
    expect(result.current.unread).toBe(0);
    expect(localStorage.getItem("homegentic_feed_read")).toBe(String(result.current.lastReadAt));
  });

  it("loads a previously persisted lastReadAt from localStorage", () => {
    localStorage.setItem("homegentic_feed_read", "9999999999999");
    mockDeriveEvents.mockReturnValue([makeEvent({ timestamp: 5000 })]);
    const { result } = renderHook(() => useActivityFeed([PROP1]));
    expect(result.current.unread).toBe(0);
  });
});

describe("useActivityFeed — closeFeed", () => {
  it("hides the feed without touching lastReadAt", () => {
    const { result } = renderHook(() => useActivityFeed([PROP1]));
    act(() => result.current.openFeed());
    const readAt = result.current.lastReadAt;

    act(() => result.current.closeFeed());

    expect(result.current.feedOpen).toBe(false);
    expect(result.current.lastReadAt).toBe(readAt);
  });
});
