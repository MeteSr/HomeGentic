/**
 * TDD — 10.3.6: mlsService unit tests
 *
 * Thin wrapper around the flat-fee MLS partner API.
 * Tests verify payload construction, response parsing, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mlsService } from "@/services/mlsService";

const mockSuccessResponse = {
  listingId: "mls-listing-001",
  url: "https://mls.example.com/listings/mls-listing-001",
  status: "submitted" as const,
};

describe("mlsService — (10.3.6)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /api/mls/submit with propertyId, listPriceCents, and address", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSuccessResponse), { status: 200 })
    );
    await mlsService.submit("42", 48_500_000, "123 Maple St");
    expect(fetch).toHaveBeenCalledWith(
      "/api/mls/submit",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.propertyId).toBe("42");
    expect(body.listPriceCents).toBe(48_500_000);
    expect(body.address).toBe("123 Maple St");
  });

  it("returns listingId, url, and status from the API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSuccessResponse), { status: 200 })
    );
    const result = await mlsService.submit("42", 48_500_000, "123 Maple St");
    expect(result.listingId).toBe("mls-listing-001");
    expect(result.url).toBe("https://mls.example.com/listings/mls-listing-001");
    expect(result.status).toBe("submitted");
  });

  it("throws when the API response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Bad Request", { status: 400 })
    );
    await expect(mlsService.submit("42", 48_500_000, "123 Maple St")).rejects.toThrow(
      /MLS submission failed/i
    );
  });

  it("throws when fetch rejects (network error)", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));
    await expect(mlsService.submit("42", 48_500_000, "123 Maple St")).rejects.toThrow(
      /Network error/i
    );
  });
});
