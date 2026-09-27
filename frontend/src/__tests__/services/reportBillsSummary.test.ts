import { describe, it, expect } from "vitest";
import { buildReportBillsSummary } from "@/services/reportBillsSummary";
import type { BillRecord, BillType, RecurringExpense } from "@/services/billService";

const AS_OF = "2026-09-15";   // trailing window is 2025-10 … 2026-09

function bill(billType: BillType, month: string, amountCents: number, id = `${billType}-${month}`): BillRecord {
  return {
    id, propertyId: "p", homeowner: "o", billType, provider: "X",
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

describe("buildReportBillsSummary — utilities", () => {
  it("averages over the months that have bills and records the count", () => {
    const s = buildReportBillsSummary(
      [bill("Electric", "2026-07", 20_000), bill("Electric", "2026-08", 16_000), bill("Electric", "2026-09", 12_000)],
      [], AS_OF,
    );
    expect(s).toEqual({ asOf: AS_OF, lines: [{ category: "Electric", avgMonthlyCents: 16_000, statementMonths: 3 }] });
  });

  it("ignores bills outside the trailing 12 months", () => {
    const s = buildReportBillsSummary(
      [bill("Water", "2025-09", 99_999), bill("Water", "2025-10", 4_000), bill("Water", "2026-10", 99_999)],
      [], AS_OF,
    );
    expect(s.lines).toEqual([{ category: "Water", avgMonthlyCents: 4_000, statementMonths: 1 }]);
  });

  it("sums two statements in the same month before averaging", () => {
    const s = buildReportBillsSummary(
      [bill("Gas", "2026-01", 3_000, "a"), bill("Gas", "2026-01", 2_000, "b"), bill("Gas", "2026-02", 5_000)],
      [], AS_OF,
    );
    expect(s.lines).toEqual([{ category: "Gas", avgMonthlyCents: 5_000, statementMonths: 2 }]);
  });

  it("maps Other bills to OtherUtility", () => {
    const s = buildReportBillsSummary([bill("Other", "2026-05", 2_500)], [], AS_OF);
    expect(s.lines[0].category).toBe("OtherUtility");
  });
});

describe("buildReportBillsSummary — housing", () => {
  it("includes active tax/HOA/insurance as scheduled monthly equivalents", () => {
    const s = buildReportBillsSummary([], [
      expense({ id: "t", category: "PropertyTax",   amountCents: 600_000, frequency: "SemiAnnual" }),
      expense({ id: "h", category: "HOA",           amountCents: 35_000,  frequency: "Monthly" }),
      expense({ id: "i", category: "HomeInsurance", amountCents: 240_000, frequency: "Annual" }),
    ], AS_OF);
    expect(s.lines).toEqual([
      { category: "PropertyTax",   avgMonthlyCents: 100_000, statementMonths: null },
      { category: "HOA",           avgMonthlyCents: 35_000,  statementMonths: null },
      { category: "HomeInsurance", avgMonthlyCents: 20_000,  statementMonths: null },
    ]);
  });

  it("never includes the mortgage or Other housing costs", () => {
    const s = buildReportBillsSummary([], [
      expense({ id: "m", category: "Mortgage" }),
      expense({ id: "o", category: "Other", amountCents: 5_000 }),
    ], AS_OF);
    expect(s.lines).toEqual([]);
  });

  it("skips expenses that ended or haven't started", () => {
    const s = buildReportBillsSummary([], [
      expense({ id: "old",    category: "HOA", amountCents: 10_000, endDate: "2026-06-30" }),
      expense({ id: "future", category: "HOA", amountCents: 20_000, startDate: "2027-01-01" }),
    ], AS_OF);
    expect(s.lines).toEqual([]);
  });
});

describe("buildReportBillsSummary — bounds", () => {
  it("drops lines above the canister's per-line ceiling", () => {
    const s = buildReportBillsSummary([bill("Electric", "2026-09", 100_000_001)], [], AS_OF);
    expect(s.lines).toEqual([]);
  });

  it("emits at most one line per category", () => {
    const s = buildReportBillsSummary(
      [bill("Electric", "2026-08", 1_000), bill("Electric", "2026-09", 3_000)],
      [expense({ id: "a", category: "HOA", amountCents: 1_000 }), expense({ id: "b", category: "HOA", amountCents: 2_000 })],
      AS_OF,
    );
    expect(s.lines.map((l) => l.category)).toEqual(["Electric", "HOA"]);
    expect(s.lines[1].avgMonthlyCents).toBe(3_000);
  });
});
