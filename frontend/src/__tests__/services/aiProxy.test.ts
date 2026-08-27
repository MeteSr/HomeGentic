/**
 * Unit tests for aiProxyService
 *
 * All ICP actor calls are mocked at the module level so no network is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mock actor transport ───────────────────────────────────────────────────────
vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));

// ── mock the IDL (just needs to be a function so Actor.createActor doesn't throw)
vi.mock("@/declarations/ai_proxy", () => ({
  idlFactory: vi.fn(),
}));

// ── mock @icp-sdk/core/agent so Actor.createActor returns our mock actor ───────
const mockActor = {
  getPriceBenchmark:  vi.fn(),
  instantForecast:    vi.fn(),
  importPermits:      vi.fn(),
  sendEmail:          vi.fn(),
  sendInviteEmail:    vi.fn(),
  checkReport:        vi.fn(),
  lookupYearBuilt:    vi.fn(),
  requestReport:      vi.fn(),
};

vi.mock("@icp-sdk/core/agent", () => ({
  Actor: {
    createActor: vi.fn(() => mockActor),
  },
  HttpAgent: vi.fn(),
}));

import { aiProxyService } from "@/services/aiProxy";

// Reset internal _actor reference between tests by resetting module-level state.
// We achieve this by clearing all mock implementations between tests.
beforeEach(() => {
  vi.clearAllMocks();
  // Re-attach default no-op implementations so tests that don't need specific
  // return values won't throw.
  mockActor.getPriceBenchmark.mockResolvedValue({ err: "not found" });
  mockActor.importPermits.mockResolvedValue({ err: "not found" });
  mockActor.checkReport.mockResolvedValue(JSON.stringify({ found: false, address: "test" }));
  mockActor.lookupYearBuilt.mockResolvedValue(JSON.stringify({ address: "test", yearBuilt: null }));
  mockActor.requestReport.mockResolvedValue(undefined);
});

// ── getPriceBenchmark ─────────────────────────────────────────────────────────

describe("aiProxyService.getPriceBenchmark", () => {
  it("returns empty string when actor returns err variant", async () => {
    mockActor.getPriceBenchmark.mockResolvedValueOnce({ err: "NotFound" });
    const result = await aiProxyService.getPriceBenchmark("Roofing", "37201");
    expect(result).toBe("");
  });

  it("returns the ok payload as string", async () => {
    mockActor.getPriceBenchmark.mockResolvedValueOnce({ ok: '{"low":5000,"high":10000}' });
    const result = await aiProxyService.getPriceBenchmark("Roofing", "37201");
    expect(result).toBe('{"low":5000,"high":10000}');
  });

  it("returns empty string when actor throws", async () => {
    mockActor.getPriceBenchmark.mockRejectedValueOnce(new Error("network error"));
    const result = await aiProxyService.getPriceBenchmark("HVAC", "12345");
    expect(result).toBe("");
  });
});

// ── importPermits ─────────────────────────────────────────────────────────────

describe("aiProxyService.importPermits", () => {
  it("returns empty string when result has err", async () => {
    mockActor.importPermits.mockResolvedValueOnce({ err: "UnsupportedCity" });
    const result = await aiProxyService.importPermits("123 Main", "Nashville", "TN", "37201");
    expect(result).toBe("");
  });

  it("returns ok payload when successful", async () => {
    const payload = '{"source":"openpermit","data":[]}';
    mockActor.importPermits.mockResolvedValueOnce({ ok: payload });
    const result = await aiProxyService.importPermits("123 Main", "Nashville", "TN", "37201");
    expect(result).toBe(payload);
  });

  it("returns empty string when actor throws", async () => {
    mockActor.importPermits.mockRejectedValueOnce(new Error("timeout"));
    const result = await aiProxyService.importPermits("123 Main", "Nashville", "TN", "37201");
    expect(result).toBe("");
  });
});

// ── checkReport ───────────────────────────────────────────────────────────────

describe("aiProxyService.checkReport", () => {
  it("returns { found: false } on actor error", async () => {
    mockActor.checkReport.mockRejectedValueOnce(new Error("canister not found"));
    const result = await aiProxyService.checkReport("123 Main St");
    expect(result.found).toBe(false);
  });

  it("parses and returns the found report", async () => {
    mockActor.checkReport.mockResolvedValueOnce(
      JSON.stringify({ found: true, address: "123 Main St" })
    );
    const result = await aiProxyService.checkReport("123 Main St");
    expect(result.found).toBe(true);
    expect(result.address).toBe("123 Main St");
  });

  it("handles JSON parse errors by returning { found: false }", async () => {
    mockActor.checkReport.mockResolvedValueOnce("INVALID JSON{{{{");
    const result = await aiProxyService.checkReport("bad address");
    expect(result.found).toBe(false);
  });
});

// ── lookupYearBuilt ───────────────────────────────────────────────────────────

describe("aiProxyService.lookupYearBuilt", () => {
  it("returns null yearBuilt when actor throws", async () => {
    mockActor.lookupYearBuilt.mockRejectedValueOnce(new Error("no response"));
    const result = await aiProxyService.lookupYearBuilt("456 Oak Ave");
    expect(result.yearBuilt).toBeNull();
    expect(result.address).toBe("456 Oak Ave");
  });

  it("parses yearBuilt from response JSON", async () => {
    mockActor.lookupYearBuilt.mockResolvedValueOnce(
      JSON.stringify({ address: "456 Oak Ave", yearBuilt: 1985 })
    );
    const result = await aiProxyService.lookupYearBuilt("456 Oak Ave");
    expect(result.yearBuilt).toBe(1985);
  });
});

// ── requestReport ─────────────────────────────────────────────────────────────

describe("aiProxyService.requestReport", () => {
  it("returns { queued: true } on success", async () => {
    mockActor.requestReport.mockResolvedValueOnce(undefined);
    const result = await aiProxyService.requestReport("789 Pine Rd", "buyer@example.com");
    expect(result.queued).toBe(true);
  });

  it("returns { queued: false } when actor throws", async () => {
    mockActor.requestReport.mockRejectedValueOnce(new Error("canister paused"));
    const result = await aiProxyService.requestReport("789 Pine Rd", "buyer@example.com");
    expect(result.queued).toBe(false);
  });
});
