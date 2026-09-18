/**
 * propertyLookup — real logic worth locking down:
 *   - POSTs address/city/state/zip as JSON to the Rentcast proxy
 *   - takes the first entry of the response array and maps
 *     yearBuilt/squareFootage, defaulting missing fields to undefined
 *   - returns null (never throws) for a non-ok response, an empty
 *     array, a null-ish payload, or a network exception
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { lookupPropertyDetails } from "@/services/propertyLookup";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("lookupPropertyDetails — request shape", () => {
  it("POSTs the address fields as JSON", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => [{ yearBuilt: 1998, squareFootage: 2000 }] });

    await lookupPropertyDetails("123 Main St", "Austin", "TX", "78701");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/rentcast/properties"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ address: "123 Main St", city: "Austin", state: "TX", zipCode: "78701" }),
      })
    );
  });
});

describe("lookupPropertyDetails — response parsing", () => {
  it("maps yearBuilt/squareFootage from the first array entry", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => [{ yearBuilt: 1998, squareFootage: 2000 }, { yearBuilt: 2020 }] });

    const result = await lookupPropertyDetails("123 Main St", "Austin", "TX", "78701");
    expect(result).toEqual({ yearBuilt: 1998, squareFootage: 2000 });
  });

  it("defaults missing fields to undefined", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => [{}] });

    const result = await lookupPropertyDetails("123 Main St", "Austin", "TX", "78701");
    expect(result).toEqual({ yearBuilt: undefined, squareFootage: undefined });
  });
});

describe("lookupPropertyDetails — failure handling", () => {
  it("returns null for a non-ok response", async () => {
    (fetch as any).mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await lookupPropertyDetails("a", "b", "c", "d")).toBeNull();
  });

  it("returns null for an empty response array", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => [] });
    expect(await lookupPropertyDetails("a", "b", "c", "d")).toBeNull();
  });

  it("returns null for a non-array payload", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ error: "not found" }) });
    expect(await lookupPropertyDetails("a", "b", "c", "d")).toBeNull();
  });

  it("returns null (not a throw) when fetch rejects", async () => {
    (fetch as any).mockRejectedValue(new Error("network down"));
    await expect(lookupPropertyDetails("a", "b", "c", "d")).resolves.toBeNull();
  });
});
