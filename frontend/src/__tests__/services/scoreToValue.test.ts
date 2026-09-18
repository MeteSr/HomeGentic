/**
 * scoreToValue — real logic worth locking down:
 *   - scoreToValueByHomePrice returns null for score < 40 or homeValue <= 0,
 *     otherwise a band-based % of homeValue rounded to the nearest $500
 *   - getDocumentedValueEstimate priority: homeValue → zip → flat heuristic
 *   - estimateJobValueDelta returns null below score 40, otherwise
 *     2 pts × the $/pt rate for the current band, rounded to the nearest $100
 *   - formatValueRange renders "$X–$Y" with thousands separators
 */

import { describe, it, expect } from "vitest";
import { scoreToValueByHomePrice, getDocumentedValueEstimate, estimateJobValueDelta, formatValueRange } from "@/services/scoreToValue";

describe("scoreToValueByHomePrice", () => {
  it("returns null for score < 40", () => {
    expect(scoreToValueByHomePrice(39, 400_000)).toBeNull();
  });

  it("returns null for non-positive home value", () => {
    expect(scoreToValueByHomePrice(90, 0)).toBeNull();
  });

  it("computes the top band (85+) as 5%-9% rounded to nearest $500", () => {
    const result = scoreToValueByHomePrice(90, 400_000);
    expect(result).toEqual({ low: 20_000, high: 36_000 });
  });

  it("computes the 40-54 band as 0.5%-1.5%", () => {
    const result = scoreToValueByHomePrice(45, 400_000);
    expect(result).toEqual({ low: 2_000, high: 6_000 });
  });
});

describe("getDocumentedValueEstimate", () => {
  it("returns null for score < 40 regardless of options", () => {
    expect(getDocumentedValueEstimate(30, { homeValueDollars: 400_000 })).toBeNull();
  });

  it("prioritizes user-entered home value over zip or heuristic", () => {
    const result = getDocumentedValueEstimate(90, { homeValueDollars: 400_000, zip: "78701" });
    expect(result).toEqual(scoreToValueByHomePrice(90, 400_000));
  });

  it("falls back to the flat heuristic when neither homeValue nor zip is given", () => {
    const result = getDocumentedValueEstimate(90, {});
    expect(result).not.toBeNull();
  });
});

describe("estimateJobValueDelta", () => {
  it("returns null for score < 40", () => {
    expect(estimateJobValueDelta("HVAC", 39)).toBeNull();
  });

  it("computes 2 pts at the correct $/pt rate for each band, rounded to $100", () => {
    expect(estimateJobValueDelta("HVAC", 50)).toBe(700);  // 2 * 333 = 666 -> round to 700
    expect(estimateJobValueDelta("HVAC", 60)).toBe(900);  // 2 * 467 = 934 -> round to 900
    expect(estimateJobValueDelta("HVAC", 75)).toBe(2_800); // 2 * 1400 = 2800
    expect(estimateJobValueDelta("HVAC", 90)).toBe(2_000); // 2 * 1000 = 2000
  });
});

describe("formatValueRange", () => {
  it("renders low-high with thousands separators", () => {
    expect(formatValueRange({ low: 2000, high: 36000 })).toBe("$2,000–$36,000");
  });
});
