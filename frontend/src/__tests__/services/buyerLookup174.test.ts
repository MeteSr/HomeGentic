/**
 * §17.4.1 / §17.4.2 — Buyer Report Lookup service
 *
 * Tests:
 *   - normalizeAddress     → trim, lowercase, collapse whitespace
 *   - lookupReport         → relay fetch → BuyerLookupResult
 *   - submitReportRequest  → buyer leaves a request when no report found
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeAddress,
  lookupReport,
  submitReportRequest,
  type BuyerLookupResult,
} from "@/services/buyerLookup";

// ── normalizeAddress ──────────────────────────────────────────────────────────

describe("normalizeAddress", () => {
  it("lowercases the input", () => {
    expect(normalizeAddress("123 MAIN ST")).toBe("123 main st");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeAddress("  456 Oak Ave  ")).toBe("456 oak ave");
  });

  it("collapses multiple spaces to one", () => {
    expect(normalizeAddress("789  Pine  Rd")).toBe("789 pine rd");
  });

  it("strips trailing comma or period", () => {
    expect(normalizeAddress("321 Elm St,")).toBe("321 elm st");
  });

  it("handles empty string", () => {
    expect(normalizeAddress("")).toBe("");
  });
});

// ── lookupReport ──────────────────────────────────────────────────────────────

describe("lookupReport", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns found:true with token and verificationLevel when report exists", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok:   true,
      json: async () => ({
        found:             true,
        token:             "tok-abc123",
        address:           "123 Main St, Daytona Beach, FL 32114",
        verificationLevel: "Basic",
        propertyType:      "SingleFamily",
        yearBuilt:         1998,
      }),
    } as any);

    const result = await lookupReport("123 Main St, Daytona Beach FL");
    expect(result.found).toBe(true);
    expect(result.token).toBe("tok-abc123");
    expect(result.verificationLevel).toBe("Basic");
  });

  it("returns found:false when no report on file", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ found: false, address: "99 Unknown Rd" }),
    } as any);

    const result = await lookupReport("99 Unknown Rd");
    expect(result.found).toBe(false);
    expect(result.token).toBeUndefined();
  });

  it("sends normalized address to the relay", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, json: async () => ({ found: false, address: "" }),
    } as any);

    await lookupReport("  123 MAIN ST  ");
    const url: string = (global.fetch as any).mock.calls[0][0];
    expect(url).toContain("123+main+st");
  });

  it("calls /api/check endpoint on the relay", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, json: async () => ({ found: false, address: "" }),
    } as any);

    await lookupReport("456 Oak Ave");
    const url: string = (global.fetch as any).mock.calls[0][0];
    expect(url).toContain("/api/check");
  });

  it("throws when relay returns non-OK response", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 } as any);
    await expect(lookupReport("123 Main St")).rejects.toThrow();
  });
});

// ── submitReportRequest ───────────────────────────────────────────────────────

describe("submitReportRequest", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls the relay with address and buyer email", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, json: async () => ({ queued: true }),
    } as any);

    await submitReportRequest("123 Main St", "buyer@example.com");
    const [url, opts] = (global.fetch as any).mock.calls[0];
    expect(url).toContain("/api/report-request");
    const body = JSON.parse(opts.body);
    expect(body.address).toBe("123 Main St");
    expect(body.buyerEmail).toBe("buyer@example.com");
  });

  it("returns true on success", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, json: async () => ({ queued: true }),
    } as any);
    const result = await submitReportRequest("123 Main St", "buyer@example.com");
    expect(result).toBe(true);
  });

  it("returns false when relay errors", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 } as any);
    const result = await submitReportRequest("123 Main St", "buyer@example.com");
    expect(result).toBe(false);
  });
});
