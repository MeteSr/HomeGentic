import { describe, it, expect } from "vitest";
import { buildQuoteUsageSummary, relevantUsageCategories } from "@/services/quoteUsage";
import type { BillRecord, BillType } from "@/services/billService";

const AS_OF = "2026-09-15";   // window is 2025-10 … 2026-09

function bill(billType: BillType, month: string, amountCents: number, usage?: [number, string], id = `${billType}-${month}`): BillRecord {
  return {
    id, propertyId: "p", homeowner: "o", billType, provider: "X",
    periodStart: `${month}-01`, periodEnd: `${month}-28`, amountCents,
    usageAmount: usage?.[0], usageUnit: usage?.[1],
    uploadedAt: 0, anomalyFlag: false,
  };
}

describe("relevantUsageCategories", () => {
  it("matches the quote canister's table", () => {
    expect(relevantUsageCategories("HVAC")).toEqual(["Electric", "Gas"]);
    expect(relevantUsageCategories("Windows")).toEqual(["Electric", "Gas"]);
    expect(relevantUsageCategories("Electrical")).toEqual(["Electric"]);
    expect(relevantUsageCategories("Plumbing")).toEqual(["Water"]);
    expect(relevantUsageCategories("Landscaping")).toEqual(["Water"]);
    expect(relevantUsageCategories("Insulation")).toEqual(["Electric", "Gas"]);
    expect(relevantUsageCategories("Solar")).toEqual(["Electric"]);
    expect(relevantUsageCategories("Pool")).toEqual(["Water", "Electric"]);
    for (const t of ["Roofing", "Painting", "Flooring", "Foundation", "Kitchen Remodel", "General Handyman", "Other"]) {
      expect(relevantUsageCategories(t)).toEqual([]);
    }
  });
});

describe("buildQuoteUsageSummary", () => {
  it("shares only the service's utilities, oldest month first", () => {
    const s = buildQuoteUsageSummary([
      bill("Electric", "2026-08", 23_900, [1655, "kWh"]),
      bill("Electric", "2026-07", 21_400, [1480, "kWh"]),
      bill("Water",    "2026-08", 6_100,  [4200, "gallons"]),
      bill("Internet", "2026-08", 7_999),
    ], "Electrical", AS_OF);
    expect(s).toEqual({
      asOf: AS_OF,
      series: [{
        category: "Electric", unit: "kWh",
        months: [
          { month: "2026-07", amountCents: 21_400, usage: 1480 },
          { month: "2026-08", amountCents: 23_900, usage: 1655 },
        ],
      }],
    });
  });

  it("keeps only the trailing 12 months", () => {
    const s = buildQuoteUsageSummary([
      bill("Water", "2025-09", 1), bill("Water", "2025-10", 2), bill("Water", "2026-10", 3),
    ], "Plumbing", AS_OF);
    expect(s.series[0].months.map((m) => m.month)).toEqual(["2025-10"]);
  });

  it("sums two statements in one month", () => {
    const s = buildQuoteUsageSummary([
      bill("Gas", "2026-01", 3_000, [40, "therms"], "a"),
      bill("Gas", "2026-01", 2_000, [25, "therms"], "b"),
    ], "HVAC", AS_OF);
    expect(s.series).toEqual([{ category: "Gas", unit: "therms", months: [{ month: "2026-01", amountCents: 5_000, usage: 65 }] }]);
  });

  it("drops a month's usage when any bill lacks it or uses another unit", () => {
    const s = buildQuoteUsageSummary([
      bill("Electric", "2026-05", 10_000, [900, "kWh"]),
      bill("Electric", "2026-06", 11_000, [950, "kWh"], "a"),
      bill("Electric", "2026-06", 1_000, undefined, "b"),
      bill("Electric", "2026-07", 12_000, [1.2, "MWh"]),
    ], "Electrical", AS_OF);
    expect(s.series[0].unit).toBe("kWh");
    expect(s.series[0].months.map((m) => m.usage)).toEqual([900, null, null]);
    expect(s.series[0].months[1].amountCents).toBe(12_000);
  });

  it("reports no unit and no usage when bills never had any", () => {
    const s = buildQuoteUsageSummary([bill("Water", "2026-03", 4_000)], "Landscaping", AS_OF);
    expect(s.series).toEqual([{ category: "Water", unit: null, months: [{ month: "2026-03", amountCents: 4_000, usage: null }] }]);
  });

  it("is empty for services with nothing relevant", () => {
    expect(buildQuoteUsageSummary([bill("Electric", "2026-08", 1)], "Roofing", AS_OF).series).toEqual([]);
  });
});
