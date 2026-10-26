/**
 * src/recalls.ts — CPSC recall check for registered appliances.
 *
 * RECALL.1  CPSC records are trimmed to the fields we keep; only cpsc.gov URLs survive
 * RECALL.2  a model matches when it appears in the recall or a listed model is its prefix
 * RECALL.3  one CPSC call per brand per day (KV), shared by all callers
 * RECALL.4  bad input is 400, an upstream failure 502, items without a model never match
 */

import { describe, it, expect, jest } from "@jest/globals";
import { toRecall, recallMatches, findRecalls, CPSC_RECALL_URL, RECALL_CACHE_TTL_S, MAX_ITEMS } from "../src/recalls";

const RHEEM = {
  RecallID: 9001, RecallNumber: "24-123", RecallDate: "2024-03-07T00:00:00",
  Title: "Rheem Recalls Gas Water Heaters Due to Fire Hazard",
  Description: "This recall involves Rheem gas water heaters.",
  URL: "https://www.cpsc.gov/Recalls/2024/Rheem-Recalls-Gas-Water-Heaters",
  Products: [{ Name: "Gas water heaters", Description: "40- and 50-gallon", Model: "XG40T06EC36U1, XG50T06EC36U1; XE50T" }],
  Hazards: [{ Name: "The gas valve can leak, posing a fire hazard." }],
  Remedies: [{ Name: "Repair" }],
};
const OTHER = { ...RHEEM, RecallID: 9002, URL: "https://evil.example/x", Products: [{ Name: "Dehumidifier", Model: "RDH-50" }], Title: "Dehumidifiers" };

function kv() {
  const m = new Map<string, string>();
  const puts: Array<{ key: string; ttl?: number }> = [];
  return {
    env: { RATE_LIMIT: {
      get: async (k: string) => m.get(k) ?? null,
      put: async (k: string, v: string, o?: { expirationTtl?: number }) => { m.set(k, v); puts.push({ key: k, ttl: o?.expirationTtl }); },
    } as unknown as KVNamespace },
    puts,
  };
}

function cpsc(data: unknown, status = 200) {
  return jest.fn(async (_url: any, _init?: any) => new Response(JSON.stringify(data), { status })) as unknown as typeof fetch & jest.Mock;
}

describe("RECALL.1 toRecall", () => {
  it("keeps id, date, title, hazard, remedy and the cpsc.gov link", () => {
    const r = toRecall(RHEEM);
    expect(r).toMatchObject({
      id: "9001", number: "24-123", date: "2024-03-07", url: RHEEM.URL,
      hazard: "The gas valve can leak, posing a fire hazard.", remedy: "Repair",
    });
    expect(r.models).toEqual(["XG40T06EC36U1", "XG50T06EC36U1", "XE50T"]);
  });
  it("drops non-CPSC links and tolerates missing fields", () => {
    expect(toRecall(OTHER).url).toBe("");
    expect(toRecall({})).toMatchObject({ id: "", title: "", models: [], hazard: "" });
  });
});

describe("RECALL.2 recallMatches", () => {
  const r = toRecall(RHEEM);
  it("matches listed models, ignoring punctuation and case", () => {
    expect(recallMatches(r, "xg40t06ec36u1")).toBe(true);
    expect(recallMatches(r, "XG-50T06EC36U1")).toBe(true);
  });
  it("matches a family prefix", () => {
    expect(recallMatches(r, "XE50T10H45U0")).toBe(true);
  });
  it("does not match other models or too-short numbers", () => {
    expect(recallMatches(r, "PROG50-38N")).toBe(false);
    expect(recallMatches(r, "XG")).toBe(false);
    expect(recallMatches(r, "")).toBe(false);
  });
});

describe("RECALL.3 caching", () => {
  it("asks CPSC once per brand and caches for a day", async () => {
    const { env, puts } = kv();
    const f = cpsc([RHEEM, OTHER]);
    const items = [{ brand: "Rheem", model: "XG40T06EC36U1" }, { brand: "rheem", model: "PROG50" }];
    const a = await findRecalls({ items }, env, f);
    const b = await findRecalls({ items }, env, f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toBe(`${CPSC_RECALL_URL}?format=json&Manufacturer=rheem`);
    expect(puts).toEqual([{ key: "cpsc:mfr:rheem", ttl: RECALL_CACHE_TTL_S }]);
    // checkedAt is the time of each call, so compare everything else.
    const { checkedAt: _a, ...restA } = a.body as any;
    const { checkedAt: _b, ...restB } = b.body as any;
    expect({ ...a, body: restA }).toEqual({ ...b, body: restB });
    const body = a.body as any;
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0]).toMatchObject({ brand: "Rheem", model: "XG40T06EC36U1" });
    expect(body.matches[0].recalls[0]).not.toHaveProperty("text");
  });
});

describe("RECALL.4 errors", () => {
  it("rejects bad input", async () => {
    const { env } = kv();
    expect((await findRecalls({}, env, cpsc([]))).status).toBe(400);
    const many = Array.from({ length: MAX_ITEMS + 1 }, () => ({ brand: "A", model: "B1234" }));
    expect((await findRecalls({ items: many }, env, cpsc([]))).status).toBe(400);
    const brands = Array.from({ length: 11 }, (_, i) => ({ brand: `B${i}`, model: "M1234" }));
    expect((await findRecalls({ items: brands }, env, cpsc([]))).status).toBe(400);
  });
  it("skips items without a model and reports upstream failures", async () => {
    const { env } = kv();
    const f = cpsc([RHEEM]);
    const r = await findRecalls({ items: [{ brand: "Rheem", model: "" }] }, env, f);
    expect(r).toMatchObject({ status: 200, body: { matches: [] } });
    expect(f).not.toHaveBeenCalled();
    expect((await findRecalls({ items: [{ brand: "Rheem", model: "XE50T1" }] }, env, cpsc({}, 500))).status).toBe(502);
  });
});
