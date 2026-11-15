/**
 * getStateHpi: the FHFA house price index series for a state, from the voice
 * Worker's /api/home-value-index (cached here per state for the session).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("@/services/voiceAgentHeaders", () => ({ voiceAgentFetch: (...a: unknown[]) => fetchMock(...a) }));

import { getStateHpi, clearHpiCache } from "@/services/homeValueIndex";

const SERIES = [
  [2019, 2, 250],
  [2026, 2, 345],
];

beforeEach(() => {
  vi.clearAllMocks();
  clearHpiCache();
});
afterEach(() => {
  delete (window as any).__e2e_hpi;
});

describe("getStateHpi", () => {
  it("posts the state and returns the series, once per state", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ state: "FL", series: SERIES }), { status: 200 }));
    expect(await getStateHpi("fl")).toEqual(SERIES);
    expect(await getStateHpi("FL")).toEqual(SERIES);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/home-value-index$/);
    expect(JSON.parse(init.body)).toEqual({ state: "FL" });
  });

  it("returns null for no state, a missing state or a failure, without caching the failure", async () => {
    expect(await getStateHpi("")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect(await getStateHpi("PR")).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await getStateHpi("TX")).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ series: SERIES }), { status: 200 }));
    expect(await getStateHpi("TX")).toEqual(SERIES);
  });

  it("uses the e2e series when one is set", async () => {
    (window as any).__e2e_hpi = { FL: SERIES };
    expect(await getStateHpi("FL")).toEqual(SERIES);
    expect(await getStateHpi("TX")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
