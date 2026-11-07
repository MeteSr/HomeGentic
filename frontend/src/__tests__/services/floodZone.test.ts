import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockActor = {
  getFloodZone: vi.fn(async (pid: string) =>
    pid === "none" ? { ok: [] } : {
      ok: [{
        status: { Mapped: null }, zone: "AE", zoneSubtype: "", specialFloodHazardArea: true, baseFloodElevation: "8",
        firmPanel: "12095C0430F", firmEffectiveDate: "2009-09-25", matchedAddress: "18 PALM CT", latitude: "28.5",
        longitude: "-81.3", checkedAt: 1_762_473_600_000_000_000n,
      }],
    }),
};
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));
vi.mock("@/services/voiceAgentHeaders", () => ({ voiceAgentFetch: mockFetch }));

import { floodZoneService, describeZone, femaMapUrl, type FloodZone } from "@/services/floodZone";

const AE: FloodZone = {
  status: "Mapped", zone: "AE", zoneSubtype: "", specialFloodHazardArea: true, baseFloodElevation: "8",
  firmPanel: "12095C0430F", firmEffectiveDate: "2009-09-25", matchedAddress: "18 PALM CT", latitude: "28.5",
  longitude: "-81.3", checkedAt: 1_762_473_600_000,
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  delete (window as any).__e2e_flood_zones;
});

describe("floodZoneService", () => {
  it("reads the saved zone from the canister", async () => {
    expect(await floodZoneService.get("p1")).toEqual(AE);
    expect(await floodZoneService.get("none")).toBeNull();
  });

  it("asks the Worker to look it up, with only the property id", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ floodZone: AE, cached: false }), { status: 200 }));
    expect(await floodZoneService.lookUp("p1", true)).toEqual(AE);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/api\/risk\/flood$/);
    expect(JSON.parse(init.body)).toEqual({ propertyId: "p1", refresh: true });
  });

  it("explains the Worker's refusals in plain words", async () => {
    const fail = (status: number, error: string) =>
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error }), { status }));
    fail(422, "address_not_found");
    await expect(floodZoneService.lookUp("p1")).rejects.toThrow(/couldn't find this address/i);
    fail(429, "daily_flood_lookup_limit_reached");
    await expect(floodZoneService.lookUp("p1")).rejects.toThrow(/tomorrow/i);
    fail(502, "flood_lookup_failed");
    await expect(floodZoneService.lookUp("p1")).rejects.toThrow(/FEMA's map service didn't answer/i);
  });

  it("uses window.__e2e_flood_zones for both", async () => {
    (window as any).__e2e_flood_zones = { p1: AE };
    expect(await floodZoneService.get("p1")).toEqual(AE);
    expect(await floodZoneService.get("p2")).toBeNull();
    expect(await floodZoneService.lookUp("p1")).toEqual(AE);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("describeZone keeps to what FEMA says", () => {
  it("calls A and V zones FEMA's high-risk areas", () => {
    expect(describeZone(AE)).toMatch(/special flood hazard area/i);
    expect(describeZone({ ...AE, zone: "VE" })).toMatch(/coastal/i);
  });
  it("calls X and B/C zones moderate to low risk, and says floods happen there too", () => {
    const x = describeZone({ ...AE, zone: "X", specialFloodHazardArea: false });
    expect(x).toMatch(/moderate.to.low/i);
    expect(x).toMatch(/outside/i);
  });
  it("handles D zones and unmapped points", () => {
    expect(describeZone({ ...AE, zone: "D", specialFloodHazardArea: false })).toMatch(/undetermined/i);
    expect(describeZone({ ...AE, status: "NotMapped", zone: "" })).toMatch(/no flood zone/i);
  });
  it("never promises the home won't flood", () => {
    for (const z of ["AE", "X", "D", "VE", "A"]) {
      expect(describeZone({ ...AE, zone: z, specialFloodHazardArea: /^[AV]/.test(z) })).not.toMatch(/won't flood|safe from|no risk|guarantee/i);
    }
  });
});

describe("femaMapUrl", () => {
  it("links the FEMA Map Service Center search for the address", () => {
    expect(femaMapUrl("18 Palm Ct, Orlando, FL 32801")).toBe(
      "https://msc.fema.gov/portal/search?AddressQuery=18%20Palm%20Ct%2C%20Orlando%2C%20FL%2032801",
    );
  });
});
