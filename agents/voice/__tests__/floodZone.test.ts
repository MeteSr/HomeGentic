/**
 * src/floodZone.ts — POST /api/risk/flood: the FEMA flood zone at a home's
 * address (#718).
 *
 * The fixtures follow the documented response shapes of the Census Bureau
 * geocoder (geocoding.geo.census.gov, onelineaddress) and FEMA's NFHL ArcGIS
 * MapServer query (layer 28 Flood Hazard Zones, layer 3 FIRM Panels). The
 * cloud environment that wrote these tests can't reach either host, so they
 * are built from the published field lists, not recorded live.
 *
 * FLOOD.1  reads FEMA's attributes: zone, subtype, SFHA flag, BFE (-9999 = none),
 *          panel and effective date; a hazard-area polygon wins over another
 *          at the same point; no polygon = not mapped
 * FLOOD.2  the address comes from the property canister, never the body; only
 *          someone with a role on the home may look it up
 * FLOOD.3  a saved result under 30 days old is returned without calling out;
 *          refresh asks again
 * FLOOD.4  unmatched address 422, upstream failure 502, per-user daily limit 429
 */

import { describe, it, expect, jest } from "@jest/globals";
import {
  lookupFloodZone, readFemaZone, FEMA_ZONES_URL, FEMA_PANELS_URL, CENSUS_GEOCODER_URL,
  FLOOD_PER_USER_DAY, FLOOD_CACHE_MS, type FloodDeps, type FloodTarget,
} from "../src/floodZone";

const CENSUS = {
  result: {
    input: { address: { address: "18 Palm Ct, Orlando, FL 32801" } },
    addressMatches: [{
      matchedAddress: "18 PALM CT, ORLANDO, FL, 32801",
      coordinates: { x: -81.379234, y: 28.538336 },
      tigerLine: { side: "L", tigerLineId: "86745471" },
    }],
  },
};
const NO_MATCH = { result: { input: {}, addressMatches: [] } };
const zoneFeature = (attrs: Record<string, unknown>) => ({
  attributes: { FLD_ZONE: "X", ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD", SFHA_TF: "F", STATIC_BFE: -9999, DFIRM_ID: "12095C", ...attrs },
});
const ZONES_AE = {
  displayFieldName: "DFIRM_ID",
  fields: [{ name: "FLD_ZONE" }, { name: "ZONE_SUBTY" }, { name: "SFHA_TF" }, { name: "STATIC_BFE" }, { name: "DFIRM_ID" }],
  features: [zoneFeature({}), zoneFeature({ FLD_ZONE: "AE", ZONE_SUBTY: null, SFHA_TF: "T", STATIC_BFE: 87.5 })],
};
const PANELS = {
  displayFieldName: "FIRM_PAN",
  features: [{ attributes: { FIRM_PAN: "12095C0430F", EFF_DATE: Date.UTC(2009, 8, 25), PANEL_TYP: "Countywide, Panel Printed" } }],
};

const TARGET: FloodTarget = { address: "18 Palm Ct", city: "Orlando", state: "FL", zipCode: "32801", floodZone: null };

function kv() {
  const m = new Map<string, string>();
  return {
    RATE_LIMIT: {
      get: async (k: string) => m.get(k) ?? null,
      put: async (k: string, v: string) => { m.set(k, v); },
    } as unknown as KVNamespace,
  };
}

/** A fetch that answers the geocoder, then FEMA zones, then FEMA panels. */
function upstream(census: unknown = CENSUS, zones: unknown = ZONES_AE, panels: unknown = PANELS, status = 200) {
  return jest.fn(async (url: any) => {
    const u = String(url);
    const body = u.startsWith(CENSUS_GEOCODER_URL) ? census : u.startsWith(FEMA_ZONES_URL) ? zones : u.startsWith(FEMA_PANELS_URL) ? panels : {};
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch & jest.Mock;
}

function deps(over: Partial<FloodDeps> = {}): FloodDeps & { save: jest.Mock; target: jest.Mock } {
  return {
    target: jest.fn(async () => TARGET),
    save: jest.fn(async (_pid: string, _user: string, input: any) => ({ ...input, checkedAt: Date.UTC(2026, 10, 7) })),
    fetch: upstream(),
    ...over,
  } as any;
}

describe("FLOOD.1 readFemaZone", () => {
  it("takes the special flood hazard area polygon at the point, with its elevation", () => {
    expect(readFemaZone(ZONES_AE, PANELS)).toEqual({
      status: "Mapped", zone: "AE", zoneSubtype: "", specialFloodHazardArea: true,
      baseFloodElevation: "87.5", firmPanel: "12095C0430F", firmEffectiveDate: "2009-09-25",
    });
  });
  it("reads a minimal-hazard zone with no elevation", () => {
    expect(readFemaZone({ features: [zoneFeature({})] }, { features: [] })).toEqual({
      status: "Mapped", zone: "X", zoneSubtype: "AREA OF MINIMAL FLOOD HAZARD", specialFloodHazardArea: false,
      baseFloodElevation: "", firmPanel: "", firmEffectiveDate: "",
    });
  });
  it("calls a point with no FEMA polygon not mapped", () => {
    expect(readFemaZone({ features: [] }, { features: [] })).toMatchObject({ status: "NotMapped", zone: "" });
  });
  it("throws on an ArcGIS error body", () => {
    expect(() => readFemaZone({ error: { code: 400, message: "Invalid query" } }, PANELS)).toThrow();
  });
});

describe("FLOOD.2 who may look it up", () => {
  it("geocodes the canister's address, queries FEMA at that point and saves the result for the caller", async () => {
    const d = deps();
    const r = await lookupFloodZone({ propertyId: "prop-1" }, "user-1", kv(), d);
    expect(r.status).toBe(200);
    expect(d.target).toHaveBeenCalledWith("prop-1", "user-1");
    const urls = d.fetch.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls[0]).toContain(encodeURIComponent("18 Palm Ct, Orlando, FL 32801").replace(/%20/g, "+"));
    expect(urls.find((u: string) => u.startsWith(FEMA_ZONES_URL))).toContain("geometry=-81.379234%2C28.538336");
    expect(d.save).toHaveBeenCalledWith("prop-1", "user-1", expect.objectContaining({
      zone: "AE", matchedAddress: "18 PALM CT, ORLANDO, FL, 32801", latitude: "28.538336", longitude: "-81.379234",
    }));
    expect(r.body).toMatchObject({ cached: false, floodZone: { zone: "AE", specialFloodHazardArea: true } });
  });

  it("ignores an address in the body", async () => {
    const d = deps();
    await lookupFloodZone({ propertyId: "prop-1", address: "1 Elsewhere Rd" }, "user-1", kv(), d);
    expect(d.fetch.mock.calls.map((c: any[]) => String(c[0])).join(" ")).not.toContain("Elsewhere");
  });

  it("refuses a bad id, someone not on the home and a missing home", async () => {
    expect((await lookupFloodZone({ propertyId: "bad id!" }, "user-1", kv(), deps())).status).toBe(400);
    expect((await lookupFloodZone({}, "user-1", kv(), deps())).status).toBe(400);
    expect((await lookupFloodZone({ propertyId: "p" }, "user-1", kv(), deps({ target: jest.fn(async () => "forbidden" as const) }))).status).toBe(403);
    expect((await lookupFloodZone({ propertyId: "p" }, "user-1", kv(), deps({ target: jest.fn(async () => "notfound" as const) }))).status).toBe(404);
  });
});

describe("FLOOD.3 cache", () => {
  const saved = (ageMs: number) => ({
    status: "Mapped" as const, zone: "X", zoneSubtype: "", specialFloodHazardArea: false, baseFloodElevation: "",
    firmPanel: "", firmEffectiveDate: "", matchedAddress: "", latitude: "", longitude: "", checkedAt: Date.now() - ageMs,
  });
  it("returns a result under 30 days old without calling out", async () => {
    const d = deps({ target: jest.fn(async () => ({ ...TARGET, floodZone: saved(FLOOD_CACHE_MS - 60_000) })) });
    const r = await lookupFloodZone({ propertyId: "p" }, "user-1", kv(), d);
    expect(r.body).toMatchObject({ cached: true, floodZone: { zone: "X" } });
    expect(d.fetch).not.toHaveBeenCalled();
  });
  it("looks again when it's older, or when asked to", async () => {
    const old = deps({ target: jest.fn(async () => ({ ...TARGET, floodZone: saved(FLOOD_CACHE_MS + 60_000) })) });
    expect((await lookupFloodZone({ propertyId: "p" }, "user-1", kv(), old)).body).toMatchObject({ cached: false });
    const fresh = deps({ target: jest.fn(async () => ({ ...TARGET, floodZone: saved(0) })) });
    expect((await lookupFloodZone({ propertyId: "p", refresh: true }, "user-1", kv(), fresh)).body).toMatchObject({ cached: false });
  });
});

describe("FLOOD.4 failures and limits", () => {
  it("says so when the geocoder can't place the address", async () => {
    const d = deps({ fetch: upstream(NO_MATCH) });
    const r = await lookupFloodZone({ propertyId: "p" }, "user-1", kv(), d);
    expect(r).toMatchObject({ status: 422, body: { error: "address_not_found" } });
    expect(d.save).not.toHaveBeenCalled();
  });
  it("is a 502 when FEMA or the geocoder fails", async () => {
    expect((await lookupFloodZone({ propertyId: "p" }, "user-1", kv(), deps({ fetch: upstream(CENSUS, ZONES_AE, PANELS, 503) }))).status).toBe(502);
    expect((await lookupFloodZone({ propertyId: "p" }, "user-1", kv(), deps({ fetch: upstream(CENSUS, { error: { code: 500 } }) }))).status).toBe(502);
  });
  it("allows a few lookups per user per day", async () => {
    const env = kv();
    for (let i = 0; i < FLOOD_PER_USER_DAY; i++) {
      expect((await lookupFloodZone({ propertyId: "p", refresh: true }, "user-1", env, deps())).status).toBe(200);
    }
    const r = await lookupFloodZone({ propertyId: "p", refresh: true }, "user-1", env, deps());
    expect(r.status).toBe(429);
    expect((await lookupFloodZone({ propertyId: "p", refresh: true }, "user-2", env, deps())).status).toBe(200);
  });
});
