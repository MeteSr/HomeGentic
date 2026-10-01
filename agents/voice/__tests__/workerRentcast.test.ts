/**
 * src/rentcast.ts — Worker port of POST /api/rentcast/properties
 *
 * RENT.1  503 when RENTCAST_API_KEY isn't configured
 * RENT.2  400 when address is missing
 * RENT.3  400 when a field isn't a string or is too long
 * RENT.4  forwards to Rentcast with the key in X-Api-Key and returns its JSON
 * RENT.5  passes Rentcast's error status through
 * RENT.6  502 when the upstream request throws
 */

import { describe, it, expect, jest } from "@jest/globals";
import { lookupRentcast } from "../src/rentcast";

const okFetch = (data: unknown) =>
  jest.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(data), { status: 200 })) as unknown as typeof fetch;

describe("lookupRentcast (Worker)", () => {
  it("RENT.1 503 without an API key", async () => {
    const r = await lookupRentcast({ address: "1 Main St" }, undefined);
    expect(r.status).toBe(503);
  });

  it("RENT.2 400 without an address", async () => {
    const r = await lookupRentcast({ city: "Austin" }, "key");
    expect(r).toEqual({ status: 400, body: { error: "address is required" } });
  });

  it("RENT.3 400 on non-string or oversized fields", async () => {
    expect((await lookupRentcast({ address: 42 }, "key")).status).toBe(400);
    expect((await lookupRentcast({ address: "x".repeat(201) }, "key")).status).toBe(400);
    expect((await lookupRentcast(null, "key")).status).toBe(400);
  });

  it("RENT.4 forwards the lookup with the key and returns Rentcast's JSON", async () => {
    const data = [{ yearBuilt: 1998, squareFootage: 2100 }];
    const f = okFetch(data);
    const r = await lookupRentcast({ address: "1 Main St", city: "Austin", state: "TX", zipCode: "78701" }, "secret", f);
    expect(r).toEqual({ status: 200, body: data });
    const [url, init] = (f as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.rentcast.io/v1/properties?address=1+Main+St&city=Austin&state=TX&zipCode=78701");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("secret");
  });

  it("RENT.5 passes an upstream error status through", async () => {
    const f = jest.fn(async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    const r = await lookupRentcast({ address: "1 Main St" }, "key", f);
    expect(r).toEqual({ status: 404, body: { error: "Rentcast lookup failed" } });
  });

  it("RENT.6 502 when the request throws", async () => {
    const f = jest.fn(async () => { throw new Error("network"); }) as unknown as typeof fetch;
    const r = await lookupRentcast({ address: "1 Main St" }, "key", f);
    expect(r.status).toBe(502);
  });
});
