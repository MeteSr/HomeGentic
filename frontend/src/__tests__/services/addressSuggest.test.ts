/**
 * services/addressSuggest — Worker calls for Add Property address suggestions,
 * and the client-side backoff that keeps a failing or limited Worker from
 * being hammered.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("@/services/voiceAgentHeaders", () => ({
  voiceAgentFetch: (...a: unknown[]) => fetchMock(...a),
}));

import { suggestAddresses, placeAddress, resetAddressSuggestState } from "@/services/addressSuggest";

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers });
const SUGGESTIONS = [{ placeId: "p1", main: "12 Elm St", secondary: "Orlando, FL, USA" }];

beforeEach(() => {
  resetAddressSuggestState();
  fetchMock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("addressSuggest", () => {
  it("posts the input and session token and returns the suggestions", async () => {
    fetchMock.mockResolvedValue(json({ suggestions: SUGGESTIONS }));
    await expect(suggestAddresses("12 elm", "tok-1")).resolves.toEqual(SUGGESTIONS);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/address\/suggest$/);
    expect(JSON.parse(init.body as string)).toEqual({ input: "12 elm", sessionToken: "tok-1" });
  });

  it("doesn't call the Worker for fewer than 3 characters", async () => {
    await expect(suggestAddresses("12", "tok-1")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pauses for the Retry-After the Worker sends on a 429", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "address_lookup_backoff", retryAfter: 120 }, 429));
    await expect(suggestAddresses("12 elm", "t")).resolves.toEqual([]);
    vi.advanceTimersByTime(119_000);
    await suggestAddresses("12 elm s", "t");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    fetchMock.mockResolvedValue(json({ suggestions: SUGGESTIONS }));
    await expect(suggestAddresses("12 elm st", "t")).resolves.toEqual(SUGGESTIONS);
  });

  it("backs off 2 s, 4 s … after repeated failures", async () => {
    fetchMock.mockResolvedValue(json({ error: "x" }, 502));
    await suggestAddresses("12 elm", "t"); // fail 1 → 2 s
    vi.advanceTimersByTime(1_500);
    await suggestAddresses("12 elm", "t");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(600);
    await suggestAddresses("12 elm", "t"); // fail 2 → 4 s
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(3_500);
    await suggestAddresses("12 elm", "t");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops asking once the Worker says it isn't configured", async () => {
    fetchMock.mockResolvedValue(json({ error: "not configured" }, 503));
    await suggestAddresses("12 elm", "t");
    vi.advanceTimersByTime(3_600_000);
    await suggestAddresses("12 elm", "t");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the place's address parts, or null when the lookup fails", async () => {
    const parts = { address: "12 Elm St", city: "Orlando", state: "FL", zipCode: "32801" };
    fetchMock.mockResolvedValueOnce(json(parts));
    await expect(placeAddress("p1", "t")).resolves.toEqual(parts);
    fetchMock.mockResolvedValueOnce(json({ error: "nope" }, 404));
    await expect(placeAddress("p1", "t")).resolves.toBeNull();
  });
});
