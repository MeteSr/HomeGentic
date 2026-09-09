/**
 * §17.4.1 / §17.4.2 — Buyer Report Lookup service
 *
 * Tests:
 *   - normalizeAddress     → trim, lowercase, collapse whitespace
 *   - lookupReport         → ai_proxy canister → BuyerLookupResult
 *   - submitReportRequest  → buyer leaves a request when no report found
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeAddress,
  lookupReport,
  submitReportRequest,
} from "@/services/buyerLookup";

vi.mock("@/services/aiProxy", () => ({
  aiProxyService: {
    checkReport:   vi.fn(),
    requestReport: vi.fn(),
  },
}));

import { aiProxyService } from "@/services/aiProxy";

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
    vi.mocked(aiProxyService.checkReport).mockResolvedValueOnce({
      found:             true,
      token:             "tok-abc123",
      address:           "123 Main St, Daytona Beach, FL 32114",
      verificationLevel: "Basic",
      propertyType:      "SingleFamily",
      yearBuilt:         1998,
    } as any);

    const result = await lookupReport("123 Main St, Daytona Beach FL");
    expect(result.found).toBe(true);
    expect(result.token).toBe("tok-abc123");
    expect(result.verificationLevel).toBe("Basic");
  });

  it("returns found:false when no report on file", async () => {
    vi.mocked(aiProxyService.checkReport).mockResolvedValueOnce({
      found: false, address: "99 Unknown Rd",
    } as any);

    const result = await lookupReport("99 Unknown Rd");
    expect(result.found).toBe(false);
    expect(result.token).toBeUndefined();
  });

  it("passes normalized address to aiProxyService.checkReport", async () => {
    vi.mocked(aiProxyService.checkReport).mockResolvedValueOnce({
      found: false, address: "",
    } as any);

    await lookupReport("  123 MAIN ST  ");
    expect(aiProxyService.checkReport).toHaveBeenCalledWith("123 main st");
  });
});

// ── submitReportRequest ───────────────────────────────────────────────────────

describe("submitReportRequest", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls aiProxyService.requestReport with address and buyer email", async () => {
    vi.mocked(aiProxyService.requestReport).mockResolvedValueOnce({ queued: true });

    await submitReportRequest("123 Main St", "buyer@example.com");
    expect(aiProxyService.requestReport).toHaveBeenCalledWith("123 Main St", "buyer@example.com");
  });

  it("returns true on success", async () => {
    vi.mocked(aiProxyService.requestReport).mockResolvedValueOnce({ queued: true });
    const result = await submitReportRequest("123 Main St", "buyer@example.com");
    expect(result).toBe(true);
  });

  it("returns false when canister returns queued:false", async () => {
    vi.mocked(aiProxyService.requestReport).mockResolvedValueOnce({ queued: false });
    const result = await submitReportRequest("123 Main St", "buyer@example.com");
    expect(result).toBe(false);
  });
});
