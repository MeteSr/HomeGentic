/**
 * @jest-environment node
 *
 * src/homeValueIndex.ts — POST /api/home-value-index: the FHFA House Price
 * Index series for one state, from FHFA's quarterly state file (fetched once a
 * week, cached in KV for every caller). The app turns it into an estimate.
 *
 *  HVI.1 returns the state's series, fetching the file once and caching it
 *  HVI.2 rejects a state that isn't two letters
 *  HVI.3 a state missing from the file is 404, not an error
 *  HVI.4 an FHFA failure or an unreadable file is 502 and isn't cached
 *  HVI.5 HPI_STATE_CSV_URL overrides the file's address
 *  HVI.6 the route is registered and needs a session
 */
import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve } from "path";
import { hpiForState, FHFA_STATE_HPI_URL, HPI_CACHE_TTL_S } from "../src/homeValueIndex";

function fakeKV() {
  const store = new Map<string, string>();
  const puts: Array<{ key: string; ttl?: number }> = [];
  return {
    store,
    puts,
    kv: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string, o?: { expirationTtl?: number }) => {
        store.set(k, v);
        puts.push({ key: k, ttl: o?.expirationTtl });
      },
    } as unknown as KVNamespace,
  };
}

const CSV = "FL,2019,2,250\nFL,2026,2,345\nTX,2019,2,220\n";
const ok = (body: string) => jest.fn(async () => new Response(body, { status: 200 }));

describe("hpiForState", () => {
  it("HVI.1 returns the state's series and caches the file for every caller", async () => {
    const { kv, puts } = fakeKV();
    const fetchImpl = ok(CSV);
    const r = await hpiForState({ state: "fl" }, { RATE_LIMIT: kv }, fetchImpl as unknown as typeof fetch);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      state: "FL",
      series: [
        [2019, 2, 250],
        [2026, 2, 345],
      ],
    });
    expect((r.body as { source: string }).source).toMatch(/FHFA/);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(FHFA_STATE_HPI_URL);
    expect(puts[0].ttl).toBe(HPI_CACHE_TTL_S);

    const again = await hpiForState({ state: "TX" }, { RATE_LIMIT: kv }, fetchImpl as unknown as typeof fetch);
    expect(again.body).toMatchObject({ state: "TX", series: [[2019, 2, 220]] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("HVI.2 rejects a state that isn't two letters", async () => {
    const { kv } = fakeKV();
    const fetchImpl = ok(CSV);
    for (const state of ["", "Florida", 12, undefined]) {
      const r = await hpiForState({ state }, { RATE_LIMIT: kv }, fetchImpl as unknown as typeof fetch);
      expect(r.status).toBe(400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("HVI.3 a state missing from the file is 404", async () => {
    const { kv } = fakeKV();
    const r = await hpiForState({ state: "PR" }, { RATE_LIMIT: kv }, ok(CSV) as unknown as typeof fetch);
    expect(r).toEqual({ status: 404, body: { error: "no_index_for_state" } });
  });

  it("HVI.4 an FHFA failure or unreadable file is 502 and isn't cached", async () => {
    for (const fetchImpl of [
      jest.fn(async () => new Response("down", { status: 503 })),
      ok("<html>moved</html>"),
      jest.fn(async () => {
        throw new Error("network");
      }),
    ]) {
      const { kv, puts } = fakeKV();
      const r = await hpiForState({ state: "FL" }, { RATE_LIMIT: kv }, fetchImpl as unknown as typeof fetch);
      expect(r.status).toBe(502);
      expect(puts).toHaveLength(0);
    }
  });

  it("HVI.5 HPI_STATE_CSV_URL overrides the address", async () => {
    const { kv } = fakeKV();
    const fetchImpl = ok(CSV);
    await hpiForState(
      { state: "FL" },
      { RATE_LIMIT: kv, HPI_STATE_CSV_URL: "https://example.test/hpi.csv" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://example.test/hpi.csv");
  });
});

describe("/api/home-value-index route", () => {
  const SRC = readFileSync(resolve(__dirname, "../src/index.ts"), "utf8");
  it("HVI.6 is registered and session-gated with the other public-data routes", () => {
    expect(SRC).toContain('path === "/api/home-value-index"');
    const routes = SRC.match(/const OFFCHAIN_OUTCALL_ROUTES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
    expect(routes).toContain('"/api/home-value-index"');
  });
});
