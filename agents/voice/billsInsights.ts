/**
 * Bills insights narrative — validates the client's deterministic forecast and
 * turns it into plain-language facts for the model, with a rule-based fallback.
 *
 * The model never sees free text from the client: series are identified by an
 * allowlisted key and every other field is a bounded number or a date, so user-
 * entered provider names can't reach the prompt.
 */

export const SERIES_LABELS: Record<string, string> = {
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

const METHODS     = ["schedule", "seasonal", "average"] as const;
const CONFIDENCES = ["high", "medium", "low"] as const;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
                     "August", "September", "October", "November", "December"];

export interface SeriesFact {
  key: string; method: typeof METHODS[number]; confidence: typeof CONFIDENCES[number]; next12Cents: number;
}

export type InsightFact =
  | { type: "upcoming"; key: string; month: string; amountCents: number }
  | { type: "seasonal"; key: string; peakMonth: number; peakCents: number; troughMonth: number; troughCents: number; swingPct: number }
  | { type: "yoy";      key: string; changePct: number; recentCents: number; priorCents: number; months: number };

export interface InsightsPayload {
  asOf: string; next12TotalCents: number; avgMonthlyCents: number;
  series: SeriesFact[]; insights: InsightFact[];
}

export interface Narrative { summary: string; tips: string[]; source: "ai" | "rules" }

// ─── Validation ────────────────────────────────────────────────────────────────

const MAX_CENTS = 10_000_000_000;   // $100M — far beyond any household bill

const isCents   = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= MAX_CENTS;
const isIntIn   = (v: unknown, lo: number, hi: number): v is number => Number.isSafeInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isKey     = (v: unknown): v is string => typeof v === "string" && Object.hasOwn(SERIES_LABELS, v);
const isOneOf   = <T extends string>(v: unknown, xs: readonly T[]): v is T => typeof v === "string" && (xs as readonly string[]).includes(v);

function parseInsight(raw: any): InsightFact | null {
  if (!raw || typeof raw !== "object" || !isKey(raw.key)) return null;
  switch (raw.type) {
    case "upcoming":
      return typeof raw.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.month) && isCents(raw.amountCents)
        ? { type: "upcoming", key: raw.key, month: raw.month, amountCents: raw.amountCents }
        : null;
    case "seasonal":
      return isIntIn(raw.peakMonth, 1, 12) && isIntIn(raw.troughMonth, 1, 12)
          && isCents(raw.peakCents) && isCents(raw.troughCents) && isIntIn(raw.swingPct, 0, 10_000)
        ? { type: "seasonal", key: raw.key, peakMonth: raw.peakMonth, peakCents: raw.peakCents,
            troughMonth: raw.troughMonth, troughCents: raw.troughCents, swingPct: raw.swingPct }
        : null;
    case "yoy":
      return isIntIn(raw.changePct, -100, 10_000) && isCents(raw.recentCents) && isCents(raw.priorCents)
          && isIntIn(raw.months, 1, 12)
        ? { type: "yoy", key: raw.key, changePct: raw.changePct, recentCents: raw.recentCents,
            priorCents: raw.priorCents, months: raw.months }
        : null;
    default:
      return null;
  }
}

export function parseInsightsPayload(body: any): { ok: true; value: InsightsPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be an object" };
  if (typeof body.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.asOf)) return { ok: false, error: "asOf must be YYYY-MM-DD" };
  if (!isCents(body.next12TotalCents) || !isCents(body.avgMonthlyCents)) return { ok: false, error: "totals must be non-negative integer cents" };
  if (!Array.isArray(body.series) || body.series.length === 0 || body.series.length > Object.keys(SERIES_LABELS).length) {
    return { ok: false, error: "series must be a non-empty array" };
  }
  if (!Array.isArray(body.insights) || body.insights.length > 30) return { ok: false, error: "insights must be an array of at most 30" };

  const series: SeriesFact[] = [];
  for (const s of body.series) {
    if (!s || !isKey(s.key) || !isOneOf(s.method, METHODS) || !isOneOf(s.confidence, CONFIDENCES) || !isCents(s.next12Cents)) {
      return { ok: false, error: "invalid series entry" };
    }
    series.push({ key: s.key, method: s.method, confidence: s.confidence, next12Cents: s.next12Cents });
  }
  const insights: InsightFact[] = [];
  for (const raw of body.insights) {
    const parsed = parseInsight(raw);
    if (!parsed) return { ok: false, error: "invalid insight entry" };
    insights.push(parsed);
  }
  return {
    ok: true,
    value: { asOf: body.asOf, next12TotalCents: body.next12TotalCents, avgMonthlyCents: body.avgMonthlyCents, series, insights },
  };
}

// ─── Rendering facts ───────────────────────────────────────────────────────────

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const monthName = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

function insightLine(i: InsightFact): string {
  const label = SERIES_LABELS[i.key];
  switch (i.type) {
    case "upcoming":
      return `${label}: a ${usd(i.amountCents)} payment is due in ${monthName(i.month)}.`;
    case "yoy":
      return `${label}: ${i.changePct > 0 ? "up" : "down"} ${Math.abs(i.changePct)}% year over year `
        + `(${usd(i.recentCents)} vs ${usd(i.priorCents)} across ${i.months} comparable months).`;
    case "seasonal":
      return `${label}: seasonal — highest in ${MONTH_NAMES[i.peakMonth - 1]} (about ${usd(i.peakCents)}), `
        + `lowest in ${MONTH_NAMES[i.troughMonth - 1]} (about ${usd(i.troughCents)}), a ${i.swingPct}% swing.`;
  }
}

export function describeFacts(p: InsightsPayload): string {
  const lines = [
    `As of ${p.asOf}, projected housing and utility costs for the next 12 months: ${usd(p.next12TotalCents)} total, about ${usd(p.avgMonthlyCents)} per month.`,
    "By category (next 12 months):",
    ...p.series.map((s) => `- ${SERIES_LABELS[s.key]}: ${usd(s.next12Cents)} (${s.method} forecast, ${s.confidence} confidence)`),
  ];
  if (p.insights.length) lines.push("Patterns detected:", ...p.insights.map((i) => `- ${insightLine(i)}`));
  return lines.join("\n");
}

export const NARRATIVE_SYSTEM_PROMPT = `You are HomeGentic's home-expense analyst.
You receive verified facts computed from a homeowner's bills and scheduled housing costs.
Explain the outlook in plain, friendly language and suggest practical actions.
Respond ONLY with valid JSON — no markdown, no prose:
{ "summary": "<2-3 sentences>", "tips": ["<up to 3 short, specific actions>"] }
Rules:
- Use ONLY figures, categories and months that appear in the facts. Never invent amounts, rates, providers or dates.
- Tie each tip to a specific fact (an upcoming payment, a year-over-year change, a seasonal peak, or the largest cost).
- If confidence is low, say the forecast will sharpen as more bills are added.`;

// ─── Rule-based fallback ───────────────────────────────────────────────────────

export function ruleBasedNarrative(p: InsightsPayload): Narrative {
  const largest = [...p.series].sort((a, b) => b.next12Cents - a.next12Cents)[0];
  let summary = `You're projected to spend about ${usd(p.next12TotalCents)} on housing and utilities over the next 12 months — roughly ${usd(p.avgMonthlyCents)} a month.`;
  if (largest) summary += ` ${SERIES_LABELS[largest.key]} is the largest share at ${usd(largest.next12Cents)}.`;
  if (p.series.some((s) => s.confidence === "low")) summary += " The forecast will sharpen as you add more bills.";

  const tips: string[] = [];
  for (const i of p.insights) {
    if (tips.length === 3) break;
    const label = SERIES_LABELS[i.key];
    if (i.type === "upcoming") tips.push(`Set aside ${usd(i.amountCents)} for ${label} due in ${monthName(i.month)}.`);
    else if (i.type === "yoy" && i.changePct > 0) tips.push(`${label} is up ${i.changePct}% year over year — check your usage and rate plan.`);
    else if (i.type === "seasonal") tips.push(`${label} peaks in ${MONTH_NAMES[i.peakMonth - 1]} — budget ahead for that month.`);
  }
  return { summary, tips, source: "rules" };
}

/** Validate the model's JSON; null means fall back to rules. */
export function parseNarrative(text: string): Narrative | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    if (typeof obj.summary !== "string" || !obj.summary.trim() || obj.summary.length > 1_000) return null;
    const tips = Array.isArray(obj.tips)
      ? obj.tips.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0 && t.length <= 300).slice(0, 3)
      : [];
    return { summary: obj.summary.trim(), tips: tips.map((t: string) => t.trim()), source: "ai" };
  } catch {
    return null;
  }
}
