/**
 * src/dbpr.ts — Florida DBPR licence lookup for contractors.
 *
 * DBPR.1  CSV lines, dates, statuses, licence numbers and names are read the way DBPR writes them
 * DBPR.2  the file is streamed until the licence's row; not found vs. a changed layout
 * DBPR.3  checkLicense uses the profile's number, caches 24h, throttles 1h, records the result
 */

import { describe, it, expect, jest } from "@jest/globals";
import {
  parseCsvLine, isoDate, isActive, namesMatch, normLicense, looksLikeFlLicense,
  findInDbprFile, checkLicense, DBPR_CONSTRUCTION_URL, LOOKUP_CACHE_TTL_S, THROTTLE_TTL_S,
  DEFAULT_DBPR_DAILY_DOWNLOADS,
} from "../src/dbpr";

const row = (lic: string, name: string, dba: string, primary = "Current", secondary = "Active", expires = "08/31/2026") =>
  [`"06"`, `"Certified General Contractor"`, `"${name}"`, `"${dba}"`, `"CGC"`, `"12 MAIN ST"`, `""`, `""`,
   `"DELAND"`, `"FL"`, `"32720"`, `"64"`, `"${lic}"`, `"${primary}"`, `"${secondary}"`, `"01/15/2005"`, `"09/01/2024"`, `"${expires}"`,
   `""`, `""`, `""`, `""`].join(",");

const FILE = [
  row("CGC1500001", "SMITH, JOHN A", "SMITH BUILDERS, LLC"),
  row("CBC1260002", "DOE, JANE", "", "Current", "Inactive"),
  row("CGC1234567", "RIVERA, MARIA", "SUNSHINE HOMES INC"),
].join("\r\n") + "\r\n";

function stream(text: string, chunk = 37) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      const bytes = new TextEncoder().encode(text);
      for (let i = 0; i < bytes.length; i += chunk) c.enqueue(bytes.slice(i, i + chunk));
      c.close();
    },
  });
}
const dbpr = (text: string, status = 200) =>
  jest.fn(async (_u: any, _i?: any) => new Response(stream(text), { status, headers: { "last-modified": "Mon, 19 Oct 2026 06:00:00 GMT" } })) as unknown as typeof fetch & jest.Mock;

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

describe("DBPR.1 parsing", () => {
  it("splits quoted fields with commas and doubled quotes", () => {
    expect(parseCsvLine(`"A, B","say ""hi""",,"x"`)).toEqual(["A, B", `say "hi"`, "", "x"]);
  });
  it("turns MM/DD/YYYY into ISO dates", () => {
    expect(isoDate("8/31/2026")).toBe("2026-08-31");
    expect(isoDate("")).toBe("");
  });
  it("counts only Current + Active as active", () => {
    expect(isActive("Current", "Active")).toBe(true);
    expect(isActive("Current", "Inactive")).toBe(false);
    expect(isActive("Delinquent", "Active")).toBe(false);
  });
  it("normalises and recognises Florida licence numbers", () => {
    expect(normLicense(" cgc 123-4567 ")).toBe("CGC1234567");
    expect(looksLikeFlLicense("EC13001234")).toBe(true);
    expect(looksLikeFlLicense("12345")).toBe(false);
  });
  it("matches names regardless of order, punctuation and company suffixes", () => {
    expect(namesMatch("SMITH, JOHN A", "John A Smith")).toBe(true);
    expect(namesMatch("SMITH BUILDERS, LLC", "Smith Builders")).toBe(true);
    expect(namesMatch("SMITH, JOHN A", "Jane Smith")).toBe(false);
    expect(namesMatch("", "Jane")).toBe(false);
  });
});

describe("DBPR.2 findInDbprFile", () => {
  it("finds the row across chunk boundaries and reads its fields", async () => {
    const r = await findInDbprFile("cgc1234567", DBPR_CONSTRUCTION_URL, dbpr(FILE));
    expect(r).toEqual({
      licenseNumber: "CGC1234567", found: true, licenseeName: "RIVERA, MARIA", dbaName: "SUNSHINE HOMES INC",
      licenseType: "Certified General Contractor · CGC", status: "Current, Active", active: true,
      expiresOn: "2026-08-31", sourceDate: "2026-10-19",
    });
  });
  it("reports an inactive licence as found but not active", async () => {
    const r = await findInDbprFile("CBC1260002", DBPR_CONSTRUCTION_URL, dbpr(FILE));
    expect(r.found).toBe(true);
    expect(r.active).toBe(false);
  });
  it("says not found for a number that isn't in the file", async () => {
    const r = await findInDbprFile("CGC9999999", DBPR_CONSTRUCTION_URL, dbpr(FILE));
    expect(r).toMatchObject({ found: false, active: false, licenseeName: "" });
  });
  it("throws instead of saying not found when the layout has changed", async () => {
    await expect(findInDbprFile("CGC9999999", DBPR_CONSTRUCTION_URL, dbpr(`"a","b","c"\n"d","e","f"\n`))).rejects.toThrow(/layout/);
  });
  it("throws on an HTTP error", async () => {
    await expect(findInDbprFile("CGC1234567", DBPR_CONSTRUCTION_URL, dbpr("", 503))).rejects.toThrow(/503/);
  });
});

describe("DBPR.3 checkLicense", () => {
  const deps = (licenseNumber: string | null, name = "Sunshine Homes") => {
    const recorded: any[] = [];
    return {
      recorded,
      d: {
        getProfile: async () => ({ name, licenseNumber }),
        record: async (_p: string, c: any) => { recorded.push(c); },
      },
    };
  };

  it("looks up the profile's number, records the result with a name match, caches and throttles", async () => {
    const { env, puts } = kv();
    const { d, recorded } = deps("CGC 1234567");
    const f = dbpr(FILE);
    const r = await checkLicense("p1", env as any, d, f);
    expect(r.status).toBe(200);
    expect(recorded[0]).toMatchObject({ licenseNumber: "CGC1234567", active: true, nameMatches: true });
    expect(puts.filter((p) => !p.key.startsWith("dbpr:downloads:"))).toEqual([
      { key: "dbpr:lic:CGC1234567", ttl: LOOKUP_CACHE_TTL_S },
      { key: "dbpr:rl:p1", ttl: THROTTLE_TTL_S },
    ]);
    expect((await checkLicense("p1", env as any, d, f)).status).toBe(429);
    // Another contractor with the same number reuses the cached lookup.
    await checkLicense("p2", env as any, d, f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("flags a name that doesn't match the licence", async () => {
    const { env } = kv();
    const { d, recorded } = deps("CGC1234567", "Bob's Roofing");
    await checkLicense("p1", env as any, d, dbpr(FILE));
    expect(recorded[0].nameMatches).toBe(false);
  });

  it("needs a profile with a Florida-looking licence number", async () => {
    const { env } = kv();
    expect((await checkLicense("p1", env as any, deps(null).d, dbpr(FILE))).status).toBe(400);
    expect((await checkLicense("p1", env as any, deps("ABC").d, dbpr(FILE))).status).toBe(400);
    const none = { getProfile: async () => null, record: async () => {} };
    expect((await checkLicense("p1", env as any, none, dbpr(FILE))).status).toBe(404);
  });

  it("caps file downloads across all users per day, but still answers from the cache", async () => {
    const { env } = kv();
    const e = { ...env, DBPR_DAILY_DOWNLOADS: "2" } as any;
    const f = dbpr(FILE);
    expect((await checkLicense("p1", e, deps("CGC1500001", "Smith Builders").d, f)).status).toBe(200);
    expect((await checkLicense("p2", e, deps("CBC1260002", "Jane Doe").d, f)).status).toBe(200);
    const r = await checkLicense("p3", e, deps("CGC1234567").d, f);
    expect(r.status).toBe(429);
    expect(f).toHaveBeenCalledTimes(2);
    // A number already looked up today needs no download.
    expect((await checkLicense("p4", e, deps("CGC1500001", "Smith Builders").d, f)).status).toBe(200);
    expect(DEFAULT_DBPR_DAILY_DOWNLOADS).toBeGreaterThan(0);
  });

  it("is 502 and records nothing when DBPR can't be read", async () => {
    const { env } = kv();
    const { d, recorded } = deps("CGC1234567");
    expect((await checkLicense("p1", env as any, d, dbpr("", 500))).status).toBe(502);
    expect(recorded).toHaveLength(0);
  });
});
