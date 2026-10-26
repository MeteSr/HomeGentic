/**
 * buyerLookup — real logic worth locking down:
 *   - normalizeAddress trims, lowercases, collapses whitespace, and
 *     strips a single trailing comma/period
 *   - lookupReport sends the normalized address to the report canister's
 *     findPublicReport and maps a match to a found result
 *   - submitReportRequest posts to the notification relay and reports
 *     whether it was saved (false when the relay is unset, errors or refuses)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockFind } = vi.hoisted(() => ({ mockFind: vi.fn() }));
vi.mock("@/services/report", () => ({ reportService: { findPublicReport: mockFind } }));

async function load(relayUrl = "https://relay.test") {
  vi.resetModules();
  vi.stubEnv("VITE_NOTIFICATIONS_URL", relayUrl);
  return import("@/services/buyerLookup");
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("normalizeAddress", () => {
  it("trims, lowercases, and collapses internal whitespace", async () => {
    const { normalizeAddress } = await load();
    expect(normalizeAddress("  123   Main  St  ")).toBe("123 main st");
    expect(normalizeAddress("123 MAIN ST")).toBe("123 main st");
  });

  it("strips a single trailing comma or period", async () => {
    const { normalizeAddress } = await load();
    expect(normalizeAddress("123 Main St,")).toBe("123 main st");
    expect(normalizeAddress("123 Main St.")).toBe("123 main st");
  });
});

describe("lookupReport", () => {
  it("normalizes the address before asking the report canister", async () => {
    const { lookupReport } = await load();
    mockFind.mockResolvedValue(null);
    await lookupReport("  123   Main  St.  ");
    expect(mockFind).toHaveBeenCalledWith("123 main st");
  });

  it("returns not found with the typed address when nothing matches", async () => {
    const { lookupReport } = await load();
    mockFind.mockResolvedValue(null);
    expect(await lookupReport("99 Unknown Rd")).toEqual({ found: false, address: "99 Unknown Rd" });
  });

  it("maps a match to the report token and property facts", async () => {
    const { lookupReport } = await load();
    mockFind.mockResolvedValue({
      token: "RPT_abc", address: "123 Main St", city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: "SingleFamily", yearBuilt: 1998, verificationLevel: "Basic",
    });
    expect(await lookupReport("123 main st")).toEqual({
      found: true, token: "RPT_abc", address: "123 Main St, Orlando, FL 32801",
      verificationLevel: "Basic", propertyType: "SingleFamily", yearBuilt: 1998,
    });
  });
});

describe("submitReportRequest", () => {
  it("posts the normalized address and email to the relay", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { submitReportRequest } = await load();
    expect(await submitReportRequest("123 Main St.", " buyer@example.com ")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://relay.test/api/report-alerts", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ address: "123 main st", email: "buyer@example.com" });
  });

  it("returns false when the relay refuses or is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    let mod = await load();
    expect(await mod.submitReportRequest("1 A St", "b@example.com")).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    mod = await load();
    expect(await mod.submitReportRequest("1 A St", "b@example.com")).toBe(false);
  });

  it("returns false without a request when no relay is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { submitReportRequest } = await load("");
    expect(await submitReportRequest("1 A St", "b@example.com")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
