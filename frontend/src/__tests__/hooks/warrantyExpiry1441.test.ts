/**
 * TDD — 14.4.1: Warranty expiry timestamp overflow
 *
 * warrantyExpiryMs(startDateStr, warrantyMonths) must clamp to year 2100
 * so extreme inputs never produce a value beyond JS Number.MAX_SAFE_INTEGER.
 */

import { describe, it, expect } from "vitest";
import { warrantyExpiryMs } from "@/hooks/useVoiceAgent";

const MAX_EXPIRY_MS = new Date("2100-01-01").getTime();

describe("warrantyExpiryMs — overflow clamp (14.4.1)", () => {
  it("normal case: 12-month warranty from 2023 is well below the cap", () => {
    const result = warrantyExpiryMs("2023-01-01", 12);
    expect(result).toBeLessThan(MAX_EXPIRY_MS);
    expect(result).toBeGreaterThan(new Date("2023-06-01").getTime());
  });

  it("extreme case: year 2090 start + 200-month warranty is clamped to 2100-01-01", () => {
    const result = warrantyExpiryMs("2090-01-01", 200);
    expect(result).toBe(MAX_EXPIRY_MS);
  });

  it("exact boundary: year 2099 + 24-month warranty clamps to 2100", () => {
    const result = warrantyExpiryMs("2099-01-01", 24);
    expect(result).toBe(MAX_EXPIRY_MS);
  });

  it("just under boundary: year 2098 + 12-month warranty is NOT clamped", () => {
    const result = warrantyExpiryMs("2098-01-01", 12);
    expect(result).toBeLessThan(MAX_EXPIRY_MS);
    expect(result).toBeGreaterThan(0);
  });

  it("zero months: returns start date timestamp unchanged (no expiry advance)", () => {
    const start = new Date("2024-06-01").getTime();
    const result = warrantyExpiryMs("2024-06-01", 0);
    expect(result).toBe(start);
  });

  it("result is always a safe integer", () => {
    const extreme = warrantyExpiryMs("2099-12-31", 9999);
    expect(Number.isSafeInteger(extreme)).toBe(true);
  });

  it("result is always ≤ MAX_EXPIRY_MS regardless of input", () => {
    const cases: [string, number][] = [
      ["2024-01-01", 6],
      ["2050-01-01", 120],
      ["2090-01-01", 600],
      ["2099-12-31", 99999],
    ];
    for (const [date, months] of cases) {
      expect(warrantyExpiryMs(date, months)).toBeLessThanOrEqual(MAX_EXPIRY_MS);
    }
  });
});
