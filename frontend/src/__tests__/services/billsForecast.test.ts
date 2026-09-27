import { describe, it, expect } from "vitest";
import { buildBillsForecast } from "@/services/billsForecast";
import type { BillRecord, BillType, RecurringExpense } from "@/services/billService";

const AS_OF = "2026-09-15";   // forecast covers 2026-10 … 2027-09

function bill(billType: BillType, month: string, amountCents: number): BillRecord {
  return {
    id: `${billType}-${month}`, propertyId: "p", homeowner: "o", billType, provider: "X",
    periodStart: `${month}-01`, periodEnd: `${month}-28`, amountCents,
    uploadedAt: 0, anomalyFlag: false,
  };
}

function expense(overrides: Partial<RecurringExpense>): RecurringExpense {
  return {
    id: "R", propertyId: "p", homeowner: "o", category: "Mortgage", provider: "Lender",
    amountCents: 200_000, frequency: "Monthly", startDate: "2020-01-05",
    createdAt: 0, updatedAt: 0, ...overrides,
  };
}

/** Monthly electric bills for every month in [fromYm, toYm], amount chosen per calendar month. */
function electricSeries(fromYm: string, toYm: string, amountFor: (calMonth: number, year: number) => number) {
  const out: BillRecord[] = [];
  let [y, m] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(bill("Electric", `${y}-${String(m).padStart(2, "0")}`, amountFor(m, y)));
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

describe("buildBillsForecast — shape", () => {
  it("forecasts the 12 months after asOf", () => {
    const f = buildBillsForecast([], [], AS_OF);
    expect(f.months[0]).toBe("2026-10");
    expect(f.months[11]).toBe("2027-09");
    expect(f.series).toEqual([]);
    expect(f.next12TotalCents).toBe(0);
  });
});

describe("housing — exact from schedule", () => {
  it("monthly mortgage lands in every month", () => {
    const f = buildBillsForecast([], [expense({})], AS_OF);
    const s = f.series[0];
    expect(s).toMatchObject({ key: "housing:Mortgage", method: "schedule", confidence: "high", next12Cents: 2_400_000 });
    expect(s.forecast.every((p) => p.cents === 200_000)).toBe(true);
  });

  it("annual property tax falls only in its anniversary month and is surfaced when due soon", () => {
    const tax = expense({ category: "PropertyTax", frequency: "Annual", amountCents: 612_000, startDate: "2019-11-01" });
    const f = buildBillsForecast([], [tax], AS_OF);
    const s = f.series[0];
    expect(s.forecast.filter((p) => p.cents > 0)).toEqual([{ month: "2026-11", cents: 612_000 }]);
    expect(f.insights).toContainEqual({ type: "upcoming", key: "housing:PropertyTax", month: "2026-11", amountCents: 612_000 });
  });

  it("quarterly HOA steps from its start month", () => {
    const hoa = expense({ category: "HOA", frequency: "Quarterly", amountCents: 45_000, startDate: "2022-02-01" });
    const months = buildBillsForecast([], [hoa], AS_OF).series[0].forecast.filter((p) => p.cents > 0).map((p) => p.month);
    expect(months).toEqual(["2026-11", "2027-02", "2027-05", "2027-08"]);
  });

  it("stops at endDate and ignores expenses that start after the window", () => {
    const ending = expense({ endDate: "2027-01-10" });                 // Oct, Nov, Dec, Jan (Jan 5 ≤ Jan 10)
    const future = expense({ id: "F", category: "HOA", startDate: "2030-01-01" });
    const f = buildBillsForecast([], [ending, future], AS_OF);
    expect(f.series).toHaveLength(1);
    expect(f.series[0].next12Cents).toBe(4 * 200_000);
  });

  it("does not flag monthly costs as upcoming lump sums", () => {
    expect(buildBillsForecast([], [expense({})], AS_OF).insights).toEqual([]);
  });

  it("sums multiple entries in the same category (e.g. first + second mortgage)", () => {
    const f = buildBillsForecast([], [expense({}), expense({ id: "R2", amountCents: 50_000 })], AS_OF);
    expect(f.series).toHaveLength(1);
    expect(f.series[0].forecast[0].cents).toBe(250_000);
  });
});

describe("utilities — seasonal with trend", () => {
  // Summer-peaking electric: $300 in Jun–Aug, $150 otherwise; this year 20% higher than last.
  const summer = (m: number) => (m >= 6 && m <= 8 ? 30_000 : 15_000);
  const bills = electricSeries("2024-09", "2026-08", (m, y) =>
    Math.round(summer(m) * (y === 2026 || (y === 2025 && m >= 9) ? 1.2 : 1)));

  it("projects same-month-last-year scaled by the YoY trend", () => {
    const s = buildBillsForecast(bills, [], AS_OF).series[0];
    expect(s).toMatchObject({ key: "utility:Electric", method: "seasonal", confidence: "high" });
    // Oct 2026 ← Oct 2025 ($180) × trend 1.2 = $216; Jul 2027 ← Jul 2026 ($360) × 1.2 = $432
    expect(s.forecast[0]).toEqual({ month: "2026-10", cents: 21_600 });
    expect(s.forecast[9]).toEqual({ month: "2027-07", cents: 43_200 });
  });

  it("reports the year-over-year increase and the summer peak", () => {
    const { insights } = buildBillsForecast(bills, [], AS_OF);
    expect(insights).toContainEqual(expect.objectContaining({ type: "yoy", key: "utility:Electric", changePct: 20, months: 12 }));
    const seasonal = insights.find((i) => i.type === "seasonal");
    expect(seasonal).toMatchObject({ key: "utility:Electric", troughMonth: expect.any(Number) });
    expect([6, 7, 8]).toContain((seasonal as any).peakMonth);
  });

  it("clamps an extreme trend", () => {
    const spike = electricSeries("2024-09", "2026-08", (_m, y) => (y === 2026 || (y === 2025) ? 40_000 : 10_000));
    const s = buildBillsForecast(spike, [], AS_OF).series[0];
    expect(s.forecast[0].cents).toBe(Math.round(40_000 * 1.33));
  });

  it("falls back to the recent average with little history", () => {
    const few = [bill("Water", "2026-06", 6_000), bill("Water", "2026-07", 7_000), bill("Water", "2026-08", 8_000)];
    const s = buildBillsForecast(few, [], AS_OF).series[0];
    expect(s).toMatchObject({ method: "average", confidence: "low" });
    // Months with a same-month-last-year bill reuse it; the rest use the $70 recent average.
    expect(s.forecast.map((p) => p.cents)).toEqual([
      7_000, 7_000, 7_000, 7_000, 7_000, 7_000, 7_000, 7_000, 6_000, 7_000, 8_000, 7_000,
    ]);
    expect(buildBillsForecast(few, [], AS_OF).insights).toEqual([]);
  });

  it("skips a utility with no bill in over a year (e.g. a cancelled service)", () => {
    const old = [bill("Gas", "2025-06", 5_000)];
    expect(buildBillsForecast(old, [], AS_OF).series).toEqual([]);
  });

  it("assigns a statement to the month of its service-period midpoint", () => {
    const straddle: BillRecord = { ...bill("Water", "2026-07", 9_000), periodStart: "2026-07-20", periodEnd: "2026-08-25" };
    const s = buildBillsForecast([straddle], [], AS_OF).series[0];
    expect(s.forecast[0].cents).toBe(9_000);   // single point → flat average
  });

  it("does not report flat usage as seasonal or trending", () => {
    const flat = electricSeries("2024-09", "2026-08", () => 12_000);
    expect(buildBillsForecast(flat, [], AS_OF).insights).toEqual([]);
  });
});

describe("totals and ordering", () => {
  it("splits monthly totals into housing and utilities and averages the year", () => {
    const f = buildBillsForecast(
      [bill("Water", "2026-08", 6_000)],
      [expense({}), expense({ id: "T", category: "PropertyTax", frequency: "Annual", amountCents: 600_000, startDate: "2019-11-01" })],
      AS_OF,
    );
    expect(f.monthlyTotals[0]).toEqual({ month: "2026-10", housingCents: 200_000, utilityCents: 6_000 });
    expect(f.monthlyTotals[1]).toEqual({ month: "2026-11", housingCents: 800_000, utilityCents: 6_000 });
    expect(f.next12TotalCents).toBe(2_400_000 + 600_000 + 72_000);
    expect(f.avgMonthlyCents).toBe(256_000);
    expect(f.series.map((s) => s.key)).toEqual(["housing:Mortgage", "housing:PropertyTax", "utility:Water"]);
  });

  it("lists upcoming payments first, in date order", () => {
    const f = buildBillsForecast(
      electricSeries("2024-09", "2026-08", (m, y) => (m >= 6 && m <= 8 ? 30_000 : 15_000) * (y >= 2026 ? 2 : 1)),
      [
        expense({ id: "I", category: "HomeInsurance", frequency: "Annual", amountCents: 300_000, startDate: "2020-12-01" }),
        expense({ id: "T", category: "PropertyTax",   frequency: "Annual", amountCents: 600_000, startDate: "2019-10-01" }),
      ],
      AS_OF,
    );
    expect(f.insights.slice(0, 2).map((i) => i.type === "upcoming" && i.month)).toEqual(["2026-10", "2026-12"]);
  });
});
