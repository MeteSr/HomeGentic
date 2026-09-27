/**
 * Deterministic bills forecasting and pattern detection.
 *
 * All numbers come from here, never from an LLM: housing costs are projected
 * exactly from their schedules, utilities from same-month-last-year scaled by
 * a year-over-year trend (or a recent average when history is short). The AI
 * narrative (billsIntelligence.getBillsNarrative) only explains these figures.
 */

import type { BillRecord, BillType, ExpenseCategory, RecurringExpense, ExpenseFrequency } from "./billService";

export type SeriesKind = "housing" | "utility";

/** Stable, enumerable key per series — also the only category identifier sent to the AI. */
export type SeriesKey = `housing:${ExpenseCategory}` | `utility:${BillType}`;

export const SERIES_LABELS: Record<SeriesKey, string> = {
  "housing:Mortgage":      "Mortgage",
  "housing:PropertyTax":   "Property Tax",
  "housing:HOA":           "HOA Dues",
  "housing:HomeInsurance": "Home Insurance",
  "housing:Other":         "Other Housing",
  "utility:Electric":      "Electric",
  "utility:Gas":           "Gas",
  "utility:Water":         "Water",
  "utility:Internet":      "Internet",
  "utility:Telecom":       "Telecom/Cable",
  "utility:Other":         "Other Utilities",
};

export interface MonthAmount { month: string; cents: number }   // month = YYYY-MM

export interface SeriesForecast {
  key:        SeriesKey;
  label:      string;
  kind:       SeriesKind;
  method:     "schedule" | "seasonal" | "average";
  confidence: "high" | "medium" | "low";
  forecast:   MonthAmount[];   // the next 12 months, zero months included
  next12Cents: number;
}

export type Insight =
  | { type: "upcoming";  key: SeriesKey; month: string; amountCents: number }
  | { type: "seasonal";  key: SeriesKey; peakMonth: number; peakCents: number; troughMonth: number; troughCents: number; swingPct: number }
  | { type: "yoy";       key: SeriesKey; changePct: number; recentCents: number; priorCents: number; months: number };

export interface BillsForecast {
  asOf:            string;   // YYYY-MM-DD
  months:          string[]; // the 12 forecast months, YYYY-MM
  series:          SeriesForecast[];
  monthlyTotals:   { month: string; housingCents: number; utilityCents: number }[];
  next12TotalCents: number;
  avgMonthlyCents:  number;
  insights:        Insight[];
}

const STEP_MONTHS: Record<ExpenseFrequency, number> = { Monthly: 1, Quarterly: 3, SemiAnnual: 6, Annual: 12 };

// Trend is a ratio of this year's to last year's spend on overlapping months;
// clamp it so one odd year can't produce an absurd projection.
const TREND_MIN = 0.75;
const TREND_MAX = 1.33;
const MIN_TREND_PAIRS    = 6;
const SEASONAL_MIN_SWING = 25;   // % swing between peak and trough worth calling out
const YOY_MIN_CHANGE     = 10;   // % year-over-year change worth calling out
const UPCOMING_WINDOW    = 3;    // months ahead to surface non-monthly payments
const STALE_AFTER_MONTHS = 13;   // utility series with no bill this recent are not projected

// ─── Month arithmetic on "YYYY-MM" ─────────────────────────────────────────────

function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

function monthFromIndex(i: number): string {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Month a statement belongs to: the midpoint of its service period. */
export function statementMonth(b: Pick<BillRecord, "periodStart" | "periodEnd">): string | null {
  const start = Date.parse(b.periodStart);
  const end   = Date.parse(b.periodEnd);
  if (Number.isNaN(start)) return null;
  const mid = Number.isNaN(end) || end < start ? start : start + (end - start) / 2;
  return new Date(mid).toISOString().slice(0, 7);
}

// ─── Housing: expand schedules ─────────────────────────────────────────────────

function scheduledOccurrences(e: RecurringExpense, fromIdx: number, toIdx: number): Map<number, number> {
  const out  = new Map<number, number>();
  const step = STEP_MONTHS[e.frequency];
  const startIdx = monthIndex(e.startDate.slice(0, 7));
  const day      = e.startDate.slice(8, 10);
  let i = startIdx;
  if (i < fromIdx) i += Math.ceil((fromIdx - i) / step) * step;
  for (; i <= toIdx; i += step) {
    if (e.endDate && `${monthFromIndex(i)}-${day}` > e.endDate) break;
    out.set(i, (out.get(i) ?? 0) + e.amountCents);
  }
  return out;
}

// ─── Utilities: seasonal-naive with trend ──────────────────────────────────────

function utilityHistory(bills: BillRecord[], type: BillType): Map<number, number> {
  const h = new Map<number, number>();
  for (const b of bills) {
    if (b.billType !== type) continue;
    const m = statementMonth(b);
    if (!m) continue;
    const idx = monthIndex(m);
    h.set(idx, (h.get(idx) ?? 0) + b.amountCents);
  }
  return h;
}

/** Year-over-year ratio over months present in both the last 12 and the 12 before. */
function yoyPairs(h: Map<number, number>, lastIdx: number) {
  let recent = 0, prior = 0, pairs = 0;
  for (let i = lastIdx - 11; i <= lastIdx; i++) {
    const a = h.get(i), b = h.get(i - 12);
    if (a != null && b != null) { recent += a; prior += b; pairs++; }
  }
  return { recent, prior, pairs };
}

function forecastUtility(h: Map<number, number>, lastObservedIdx: number, targets: number[]) {
  const { recent, prior, pairs } = yoyPairs(h, lastObservedIdx);
  const trend = pairs >= MIN_TREND_PAIRS && prior > 0
    ? Math.min(TREND_MAX, Math.max(TREND_MIN, recent / prior))
    : 1;

  const observed = [...h.keys()].sort((a, b) => a - b);
  const lastThree = observed.slice(-3).map((i) => h.get(i)!);
  const recentAvg = lastThree.reduce((s, v) => s + v, 0) / lastThree.length;

  let seasonalHits = 0;
  const forecast = targets.map((t) => {
    const sameMonthLastYear = h.get(t - 12) ?? h.get(t - 24);
    if (sameMonthLastYear != null) {
      seasonalHits++;
      return Math.round(sameMonthLastYear * trend);
    }
    return Math.round(recentAvg);
  });

  const method: SeriesForecast["method"] = seasonalHits >= 9 ? "seasonal" : "average";
  const confidence: SeriesForecast["confidence"] =
    method === "seasonal" && pairs >= MIN_TREND_PAIRS ? "high"
    : method === "seasonal" || observed.length >= 6   ? "medium"
    : "low";
  return { forecast, method, confidence };
}

function seasonalInsight(key: SeriesKey, h: Map<number, number>, lastIdx: number): Insight | null {
  const byCalMonth = new Map<number, number[]>();
  for (const [idx, cents] of h) {
    if (idx <= lastIdx - 24) continue;
    const cal = idx % 12;
    byCalMonth.set(cal, [...(byCalMonth.get(cal) ?? []), cents]);
  }
  if (byCalMonth.size < 12) return null;
  const avgs = [...byCalMonth].map(([cal, v]) => ({ cal, cents: v.reduce((s, x) => s + x, 0) / v.length }));
  const mean   = avgs.reduce((s, a) => s + a.cents, 0) / avgs.length;
  const peak   = avgs.reduce((a, b) => (b.cents > a.cents ? b : a));
  const trough = avgs.reduce((a, b) => (b.cents < a.cents ? b : a));
  if (mean <= 0) return null;
  const swingPct = Math.round(((peak.cents - trough.cents) / mean) * 100);
  if (swingPct < SEASONAL_MIN_SWING) return null;
  return {
    type: "seasonal", key,
    peakMonth: peak.cal + 1,     peakCents: Math.round(peak.cents),
    troughMonth: trough.cal + 1, troughCents: Math.round(trough.cents),
    swingPct,
  };
}

function yoyInsight(key: SeriesKey, h: Map<number, number>, lastIdx: number): Insight | null {
  const { recent, prior, pairs } = yoyPairs(h, lastIdx);
  if (pairs < MIN_TREND_PAIRS || prior <= 0) return null;
  const changePct = Math.round(((recent - prior) / prior) * 100);
  if (Math.abs(changePct) < YOY_MIN_CHANGE) return null;
  return { type: "yoy", key, changePct, recentCents: recent, priorCents: prior, months: pairs };
}

// ─── Public entry point ────────────────────────────────────────────────────────

export function buildBillsForecast(
  bills:    BillRecord[],
  expenses: RecurringExpense[],
  asOf:     string = new Date().toISOString().slice(0, 10),
): BillsForecast {
  const firstIdx = monthIndex(asOf.slice(0, 7)) + 1;   // forecast starts next month
  const targets  = Array.from({ length: 12 }, (_, i) => firstIdx + i);
  const months   = targets.map(monthFromIndex);
  const series: SeriesForecast[] = [];
  const insights: Insight[] = [];

  // Housing — exact from schedules
  const housingKeys = [...new Set(expenses.map((e) => e.category))];
  for (const category of housingKeys) {
    const key: SeriesKey = `housing:${category}`;
    const perMonth = new Map<number, number>();
    for (const e of expenses.filter((x) => x.category === category)) {
      for (const [idx, cents] of scheduledOccurrences(e, firstIdx, targets[11])) {
        perMonth.set(idx, (perMonth.get(idx) ?? 0) + cents);
      }
      if (e.frequency !== "Monthly") {
        for (const [idx, cents] of scheduledOccurrences(e, firstIdx, firstIdx + UPCOMING_WINDOW - 1)) {
          insights.push({ type: "upcoming", key, month: monthFromIndex(idx), amountCents: cents });
        }
      }
    }
    const forecast = targets.map((t) => ({ month: monthFromIndex(t), cents: perMonth.get(t) ?? 0 }));
    const next12Cents = forecast.reduce((s, f) => s + f.cents, 0);
    if (next12Cents > 0) {
      series.push({ key, label: SERIES_LABELS[key], kind: "housing", method: "schedule", confidence: "high", forecast, next12Cents });
    }
  }

  // Utilities — seasonal with trend
  const utilityTypes = [...new Set(bills.map((b) => b.billType))];
  for (const type of utilityTypes) {
    const key: SeriesKey = `utility:${type}`;
    const h = utilityHistory(bills, type);
    if (h.size === 0) continue;
    const lastObservedIdx = Math.max(...h.keys());
    if (lastObservedIdx < firstIdx - STALE_AFTER_MONTHS) continue;

    const { forecast, method, confidence } = forecastUtility(h, lastObservedIdx, targets);
    const points = forecast.map((cents, i) => ({ month: months[i], cents }));
    series.push({
      key, label: SERIES_LABELS[key], kind: "utility", method, confidence,
      forecast: points, next12Cents: points.reduce((s, p) => s + p.cents, 0),
    });

    const seasonal = seasonalInsight(key, h, lastObservedIdx);
    if (seasonal) insights.push(seasonal);
    const yoy = yoyInsight(key, h, lastObservedIdx);
    if (yoy) insights.push(yoy);
  }

  series.sort((a, b) => b.next12Cents - a.next12Cents);
  const rank = { upcoming: 0, yoy: 1, seasonal: 2 } as const;
  insights.sort((a, b) =>
    rank[a.type] - rank[b.type]
    || (a.type === "upcoming" && b.type === "upcoming" ? a.month.localeCompare(b.month) : 0));

  const monthlyTotals = months.map((month, i) => ({
    month,
    housingCents: series.filter((s) => s.kind === "housing").reduce((sum, s) => sum + s.forecast[i].cents, 0),
    utilityCents: series.filter((s) => s.kind === "utility").reduce((sum, s) => sum + s.forecast[i].cents, 0),
  }));
  const next12TotalCents = series.reduce((s, x) => s + x.next12Cents, 0);

  return {
    asOf, months, series, monthlyTotals, next12TotalCents,
    avgMonthlyCents: Math.round(next12TotalCents / 12),
    insights,
  };
}
