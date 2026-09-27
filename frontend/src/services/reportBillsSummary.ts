/**
 * Builds the monthly-costs summary a homeowner can attach to a shared report.
 *
 * Buyers and agents see typical carrying costs, not statements: utilities are
 * averaged over the trailing 12 months that have bills, and property tax, HOA
 * and insurance come from their recurring schedules. Mortgage and "Other"
 * housing costs are never included.
 */
import { type BillRecord, type BillType, type RecurringExpense, isActiveOn, monthlyEquivalentCents } from "./billService";
import { statementMonth } from "./billsForecast";
import type { BillsSummary, BillsSummaryCategory, BillsSummaryLine } from "./report";

const WINDOW_MONTHS = 12;
// Mirrors the report canister's per-line ceiling ($1M/month); anything above is a typo.
const MAX_MONTHLY_CENTS = 100_000_000;

const UTILITY_CATEGORY: Record<BillType, BillsSummaryCategory> = {
  Electric: "Electric", Gas: "Gas", Water: "Water",
  Internet: "Internet", Telecom: "Telecom", Other: "OtherUtility",
};

const SHAREABLE_HOUSING = ["PropertyTax", "HOA", "HomeInsurance"] as const;

function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

export function buildReportBillsSummary(
  bills:    BillRecord[],
  expenses: RecurringExpense[],
  asOf:     string,   // YYYY-MM-DD
): BillsSummary {
  const lastIdx  = monthIndex(asOf.slice(0, 7));
  const firstIdx = lastIdx - WINDOW_MONTHS + 1;
  const lines: BillsSummaryLine[] = [];

  // Utilities: total per month, then average over the months that have bills.
  const perCategory = new Map<BillsSummaryCategory, Map<number, number>>();
  for (const b of bills) {
    const ym = statementMonth(b);
    if (!ym) continue;
    const idx = monthIndex(ym);
    if (idx < firstIdx || idx > lastIdx) continue;
    const cat = UTILITY_CATEGORY[b.billType];
    const months = perCategory.get(cat) ?? new Map<number, number>();
    months.set(idx, (months.get(idx) ?? 0) + b.amountCents);
    perCategory.set(cat, months);
  }
  for (const cat of Object.values(UTILITY_CATEGORY)) {
    const months = perCategory.get(cat);
    if (!months || months.size === 0) continue;
    const total = [...months.values()].reduce((s, c) => s + c, 0);
    lines.push({ category: cat, avgMonthlyCents: Math.round(total / months.size), statementMonths: months.size });
  }

  // Scheduled housing costs active today, summed per category.
  for (const cat of SHAREABLE_HOUSING) {
    const cents = expenses
      .filter((e) => e.category === cat && isActiveOn(e, asOf))
      .reduce((s, e) => s + monthlyEquivalentCents(e), 0);
    if (cents > 0) lines.push({ category: cat, avgMonthlyCents: cents, statementMonths: null });
  }

  return { lines: lines.filter((l) => l.avgMonthlyCents > 0 && l.avgMonthlyCents <= MAX_MONTHLY_CENTS), asOf };
}
