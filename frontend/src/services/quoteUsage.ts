/**
 * Utility usage a homeowner can attach to a quote request so contractors can
 * size the job — e.g. 12 months of electric and gas for an HVAC replacement.
 *
 * Only the utilities relevant to the service type can be shared; the quote
 * canister enforces the same table, so a roofer never receives bill data.
 */
import { billService, type BillRecord, type BillType } from "./billService";
import { quoteService } from "./quote";
import { statementMonth } from "./billsForecast";

export type UsageCategory = "Electric" | "Gas" | "Water";

export interface UsageMonth {
  month:       string;          // YYYY-MM
  amountCents: number;
  usage:       number | null;   // metered usage in the series unit
}

export interface UsageSeries {
  category: UsageCategory;
  unit:     string | null;
  months:   UsageMonth[];       // oldest first
}

export interface UsageSummary {
  series: UsageSeries[];
  asOf:   string;               // YYYY-MM-DD
}

/** Mirrors relevantUsage() in backend/quote/main.mo. */
const RELEVANT: Record<string, UsageCategory[]> = {
  HVAC:        ["Electric", "Gas"],
  Windows:     ["Electric", "Gas"],
  Electrical:  ["Electric"],
  Plumbing:    ["Water"],
  Landscaping: ["Water"],
};

export function relevantUsageCategories(serviceType: string): UsageCategory[] {
  return RELEVANT[serviceType] ?? [];
}

export const USAGE_LABELS: Record<UsageCategory, string> = {
  Electric: "Electricity",
  Gas:      "Gas",
  Water:    "Water",
};

const WINDOW_MONTHS = 12;

function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

/**
 * Trailing-12-month history for the utilities relevant to `serviceType`.
 * Monthly usage is reported only when every bill that month has usage in the
 * series' unit, so a partial month never understates consumption.
 */
export function buildQuoteUsageSummary(
  bills:       BillRecord[],
  serviceType: string,
  asOf:        string,   // YYYY-MM-DD
): UsageSummary {
  const lastIdx  = monthIndex(asOf.slice(0, 7));
  const firstIdx = lastIdx - WINDOW_MONTHS + 1;
  const series: UsageSeries[] = [];

  for (const category of relevantUsageCategories(serviceType)) {
    const inWindow = bills
      .filter((b) => b.billType === (category as BillType))
      .map((b) => ({ b, ym: statementMonth(b) }))
      .filter((x): x is { b: BillRecord; ym: string } => {
        if (!x.ym) return false;
        const idx = monthIndex(x.ym);
        return idx >= firstIdx && idx <= lastIdx;
      });
    if (inWindow.length === 0) continue;

    // The unit most bills report in; bills in another unit don't count toward usage.
    const unitCounts = new Map<string, number>();
    for (const { b } of inWindow) {
      if (b.usageUnit) unitCounts.set(b.usageUnit, (unitCounts.get(b.usageUnit) ?? 0) + 1);
    }
    const unit = [...unitCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const byMonth = new Map<string, { amountCents: number; usage: number; complete: boolean }>();
    for (const { b, ym } of inWindow) {
      const m = byMonth.get(ym) ?? { amountCents: 0, usage: 0, complete: true };
      m.amountCents += b.amountCents;
      if (unit !== null && b.usageUnit === unit && b.usageAmount != null) m.usage += b.usageAmount;
      else m.complete = false;
      byMonth.set(ym, m);
    }

    series.push({
      category,
      unit,
      months: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, m]) => ({
          month,
          amountCents: m.amountCents,
          usage: unit !== null && m.complete ? Math.round(m.usage * 10) / 10 : null,
        })),
    });
  }

  return { series, asOf };
}

/**
 * Attach the homeowner's relevant bill history to a just-created request.
 * Returns false when there's nothing relevant to share (no bills yet, or a
 * service type with no relevant utilities); throws if the canister refuses.
 */
export async function shareBillsWithRequest(
  requestId:   string,
  propertyId:  string,
  serviceType: string,
): Promise<boolean> {
  if (relevantUsageCategories(serviceType).length === 0) return false;
  const bills   = await billService.getBillsForProperty(propertyId);
  const summary = buildQuoteUsageSummary(bills, serviceType, new Date().toISOString().slice(0, 10));
  if (summary.series.length === 0) return false;
  await quoteService.attachUsage(requestId, summary);
  return true;
}
