/**
 * buyerLookup — real logic worth locking down:
 *   - normalizeAddress trims, lowercases, collapses whitespace, and
 *     strips a single trailing comma/period
 *   - lookupReport normalizes the address before delegating to
 *     aiProxyService.checkReport
 *   - submitReportRequest surfaces the queued flag from aiProxyService
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCheckReport, mockRequestReport } = vi.hoisted(() => ({
  mockCheckReport: vi.fn(),
  mockRequestReport: vi.fn(),
}));
vi.mock("@/services/aiProxy", () => ({
  aiProxyService: { checkReport: mockCheckReport, requestReport: mockRequestReport },
}));

import { normalizeAddress, lookupReport, submitReportRequest } from "@/services/buyerLookup";

beforeEach(() => vi.clearAllMocks());

describe("normalizeAddress", () => {
  it("trims, lowercases, and collapses internal whitespace", () => {
    expect(normalizeAddress("  123   Main  St  ")).toBe("123 main st");
  });

  it("strips a single trailing comma or period", () => {
    expect(normalizeAddress("123 Main St,")).toBe("123 main st");
    expect(normalizeAddress("123 Main St.")).toBe("123 main st");
  });

  it("leaves an already-normalized address unchanged", () => {
    expect(normalizeAddress("123 main st")).toBe("123 main st");
  });
});

describe("lookupReport", () => {
  it("normalizes the address before calling checkReport", async () => {
    mockCheckReport.mockResolvedValue({ found: true, address: "123 main st" });
    await lookupReport("  123   Main  St.  ");
    expect(mockCheckReport).toHaveBeenCalledWith("123 main st");
  });

  it("returns the result from checkReport", async () => {
    const raw = { found: true, address: "123 main st", verificationLevel: "Gold" };
    mockCheckReport.mockResolvedValue(raw);
    const result = await lookupReport("123 Main St");
    expect(result).toEqual(raw);
  });
});

describe("submitReportRequest", () => {
  it("returns true when the request was queued", async () => {
    mockRequestReport.mockResolvedValue({ queued: true });
    const result = await submitReportRequest("123 Main St", "buyer@example.com");
    expect(result).toBe(true);
    expect(mockRequestReport).toHaveBeenCalledWith("123 Main St", "buyer@example.com");
  });

  it("returns false when the request was not queued", async () => {
    mockRequestReport.mockResolvedValue({ queued: false });
    const result = await submitReportRequest("123 Main St", "buyer@example.com");
    expect(result).toBe(false);
  });
});
