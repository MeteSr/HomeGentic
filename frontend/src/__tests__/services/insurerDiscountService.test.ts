/**
 * insurerDiscountService (estimateInsurerDiscount) — real logic worth locking
 * down against the deterministic mock fallback (voice agent offline in test
 * env, since VITE_VOICE_AGENT_URL is unset → falls back to mockResult):
 *   - qualifying categories flip to "qualifying" only when the matching
 *     device/verified-job-type is present
 *   - discount range is capped at [0,5] low / [0,35] high based on qualifying count
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { estimateInsurerDiscount, type InsurerDiscountRequest } from "@/services/insurerDiscountService";

function makeRequest(overrides: Partial<InsurerDiscountRequest> = {}): InsurerDiscountRequest {
  return {
    state: "FL", zipCode: "32114", properties: [], devices: [], criticalEventCount: 0,
    verifiedJobTypes: [], totalVerifiedJobs: 0,
    ...overrides,
  };
}

describe("estimateInsurerDiscount — mock fallback (voice agent offline)", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it("marks no categories qualifying when there are no devices or verified jobs", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));
    const result = await estimateInsurerDiscount(makeRequest());
    expect(result.qualifyingCategories.every((c) => c.status !== "qualifying")).toBe(true);
    expect(result.discountRangeMin).toBe(0);
  });

  it("marks the water leak category qualifying when a MoenFlo device is present", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));
    const result = await estimateInsurerDiscount(makeRequest({ devices: [{ source: "MoenFlo", name: "Flo by Moen" }] }));
    const water = result.qualifyingCategories.find((c) => c.name === "Smart Water Leak Detection");
    expect(water?.status).toBe("qualifying");
  });

  it("marks Roofing/Electrical categories qualifying from verifiedJobTypes", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));
    const result = await estimateInsurerDiscount(makeRequest({ verifiedJobTypes: ["Roofing", "Electrical"] }));
    expect(result.qualifyingCategories.find((c) => c.name.includes("Roof"))?.status).toBe("qualifying");
    expect(result.qualifyingCategories.find((c) => c.name.includes("Electrical"))?.status).toBe("qualifying");
  });

  it("increases the discount range as more categories qualify", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));
    const noneQualify = await estimateInsurerDiscount(makeRequest());
    const someQualify = await estimateInsurerDiscount(makeRequest({
      devices: [{ source: "MoenFlo", name: "Flo" }, { source: "Nest", name: "Thermostat" }],
      verifiedJobTypes: ["Roofing", "Electrical"],
    }));
    expect(someQualify.discountRangeMax).toBeGreaterThan(noneQualify.discountRangeMax);
  });

  it("always includes the standard insurer programs", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));
    const result = await estimateInsurerDiscount(makeRequest());
    expect(result.programs.map((p) => p.insurer)).toContain("Hippo Insurance");
  });
});
