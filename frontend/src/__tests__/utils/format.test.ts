import { describe, it, expect } from "vitest";
import { formatCents, formatDollars, formatIsoDate } from "@/utils/format";

describe("format", () => {
  it("formats whole dollars", () => {
    expect(formatDollars(1234.4)).toBe("$1,234");
    expect(formatDollars(0)).toBe("$0");
  });

  it("formats integer cents as whole dollars", () => {
    expect(formatCents(38_800_000)).toBe("$388,000");
    expect(formatCents(123_450)).toBe("$1,235");
  });

  it("formats YYYY-MM-DD without a timezone shift", () => {
    expect(formatIsoDate("2024-06-01")).toBe("Jun 1, 2024");
    expect(formatIsoDate("2026-12-31")).toBe("Dec 31, 2026");
    expect(formatIsoDate("")).toBe("");
  });
});
