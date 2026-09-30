/**
 * Answer cards — the ask bar's reply to a decision question about one of the
 * home's systems ("should I replace my water heater?", "how long will the
 * roof last?").
 *
 * Instead of opening a single panel, the answer composes several sources the
 * app already has: the system's age and remaining life (ten-year forecast),
 * the replacement cost range, local closed-bid prices (ai_proxy price
 * benchmark), the homeowner's own utility trend (bills forecast), and how
 * many pros on HomeGentic do the work (contractor canister). Deterministic —
 * no AI call; the voice agent is still one tap away for open-ended questions.
 */
import type { SystemEstimate } from "@/services/systemAgeEstimator";
import type { PriceBenchmarkResult } from "@/services/priceBenchmark";
import { SERIES_LABELS, type Insight, type SeriesKey } from "@/services/billsForecast";

export type FactTone = "good" | "warn" | "bad" | "neutral";

export interface AnswerFact {
  label:   string;
  value:   string;
  detail:  string;
  tone:    FactTone;
}

export interface SystemAnswer {
  systemName:  string;
  /** Service-type label for the quote request this answer can open. */
  serviceType: string;
  title:       string;
  verdict:     string;
  facts:       AnswerFact[];
  /** Which records the answer was built from, shown under the card. */
  sources:     string[];
  /** The install year is assumed from the build year — the owner can set it. */
  installYearAssumed: boolean;
  quoteDescription:   string;
}

// ── Question matching ────────────────────────────────────────────────────────

// Checked in order, so the more specific phrases come first.
const SYSTEM_WORDS: { system: string; words: string[] }[] = [
  { system: "Water Heater", words: ["water heater", "hot water", "tankless"] },
  { system: "Solar Panels", words: ["solar"] },
  { system: "HVAC",         words: ["hvac", "air condition", "a/c", " ac ", "ac unit", "furnace", "heat pump", "heating", "cooling"] },
  { system: "Roofing",      words: ["roof", "shingle"] },
  { system: "Windows",      words: ["window"] },
  { system: "Electrical",   words: ["electrical", "breaker", "wiring", "electric panel"] },
  { system: "Plumbing",     words: ["plumbing", "pipes", "repipe"] },
  { system: "Flooring",     words: ["floor", "carpet"] },
  { system: "Insulation",   words: ["insulation", "insulate"] },
];

const DECISION_WORDS = [
  "replace", "replacing", "replacement", "should i", "how old", "how long", "last",
  "lifespan", "life left", "worth", "repair", "fix", "new ", "upgrade", "when",
];

/** The system a decision question is about, or null if it isn't one. */
export function matchSystemQuestion(query: string): string | null {
  const q = ` ${query.toLowerCase()} `;
  if (!DECISION_WORDS.some((w) => q.includes(w))) return null;
  return SYSTEM_WORDS.find((s) => s.words.some((w) => q.includes(w)))?.system ?? null;
}

// ── Building the answer ──────────────────────────────────────────────────────

/** Maintenance system name → the service type a quote request uses. */
export const SYSTEM_SERVICE_TYPE: Record<string, string> = {
  "HVAC": "HVAC", "Roofing": "Roofing", "Water Heater": "Plumbing", "Windows": "Windows",
  "Electrical": "Electrical", "Plumbing": "Plumbing", "Flooring": "Flooring",
  "Insulation": "Insulation", "Solar Panels": "Solar",
};

/** Utilities whose bills a system's condition shows up in. */
const SYSTEM_UTILITIES: Record<string, SeriesKey[]> = {
  "HVAC": ["utility:Electric", "utility:Gas"],
  "Water Heater": ["utility:Gas", "utility:Electric"],
  "Windows": ["utility:Electric", "utility:Gas"],
  "Insulation": ["utility:Electric", "utility:Gas"],
  "Solar Panels": ["utility:Electric"],
  "Plumbing": ["utility:Water"],
};

const URGENCY_TONE: Record<SystemEstimate["urgency"], FactTone> = {
  Critical: "bad", Soon: "warn", Watch: "neutral", Good: "good",
};

function dollars(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}
function cents(n: number): string {
  return dollars(n / 100);
}
function years(n: number): string {
  return `${n} ${n === 1 ? "year" : "years"}`;
}

export interface AnswerInput {
  system:       SystemEstimate;
  yearBuilt:    number;
  zipCode:      string;
  billInsights: Insight[];
  hasBills:     boolean;
  /** null while loading or when there isn't enough local data. */
  benchmark:    PriceBenchmarkResult | null;
  /** null while loading or if the directory couldn't be reached. */
  proCount:     number | null;
}

export function buildSystemAnswer(input: AnswerInput): SystemAnswer {
  const s = input.system;
  const name = s.systemName.toLowerCase();
  const serviceType = SYSTEM_SERVICE_TYPE[s.systemName] ?? "Other";
  const installYearAssumed = s.installYear === input.yearBuilt;
  const facts: AnswerFact[] = [];
  const sources = ["Ten-year forecast"];

  facts.push({
    label: "Age",
    value: years(s.ageYears),
    detail: `Installed ${s.installYear}${installYearAssumed ? " (assumed from the build year)" : ""} · ${Math.min(999, Math.round(s.percentLifeUsed))}% of a ${s.lifespanYears}-year life`,
    tone: URGENCY_TONE[s.urgency],
  });

  facts.push({
    label: "Replacement",
    value: `${dollars(s.replacementCostLow)}–${dollars(s.replacementCostHigh)}`,
    detail: "Typical full-replacement range",
    tone: "neutral",
  });

  const b = input.benchmark;
  if (b && b.sampleSize >= 5) {
    facts.push({
      label: "Local prices",
      value: `${cents(b.low)}–${cents(b.high)}`,
      detail: `${b.sampleSize} closed ${serviceType} bids near ${input.zipCode}, median ${cents(b.median)}`,
      tone: "neutral",
    });
    sources.push("Local prices");
  }

  const utilities = SYSTEM_UTILITIES[s.systemName] ?? [];
  if (utilities.length) {
    const trend = input.billInsights.find(
      (i): i is Extract<Insight, { type: "yoy" }> => i.type === "yoy" && utilities.includes(i.key),
    );
    if (trend) {
      const up = trend.changePct > 0;
      facts.push({
        label: "Your bills",
        value: `${SERIES_LABELS[trend.key]} ${up ? "up" : "down"} ${Math.abs(trend.changePct)}%`,
        detail: `Compared with the same ${trend.months} months last year`,
        tone: up ? "warn" : "good",
      });
      sources.push("Your bills");
    } else if (input.hasBills) {
      facts.push({
        label: "Your bills",
        value: "Steady",
        detail: `No unusual change in ${utilities.map((k) => SERIES_LABELS[k].toLowerCase()).join(" or ")} bills`,
        tone: "good",
      });
      sources.push("Your bills");
    } else {
      facts.push({
        label: "Your bills",
        value: "Not tracked",
        detail: "Add utility bills to see whether it's costing you more to run",
        tone: "neutral",
      });
    }
  }

  if (input.proCount != null) {
    facts.push({
      label: "Pros",
      value: String(input.proCount),
      detail: input.proCount ? `Contractors on HomeGentic who list ${serviceType}` : `No contractors list ${serviceType} yet — a request still reaches the wider network`,
      tone: "neutral",
    });
    sources.push("Contractor directory");
  }

  const left = s.yearsRemaining;
  const title = left <= 0
    ? `Your ${name} is ${years(s.ageYears)} old and past its expected life`
    : `Your ${name} is ${years(s.ageYears)} old with about ${years(left)} left`;

  const verdict = {
    Critical: "Plan the replacement now. A planned swap costs less than an emergency one.",
    Soon:     "Start collecting quotes this year so you can replace it on your schedule.",
    Watch:    "It's aging but fine. A service visit now is cheaper than a surprise later.",
    Good:     "No action needed yet.",
  }[s.urgency];

  return {
    systemName: s.systemName,
    serviceType,
    title,
    verdict,
    facts,
    sources,
    installYearAssumed,
    quoteDescription: `${s.systemName} is about ${years(s.ageYears)} old (installed ${s.installYear}). Looking for ${s.urgency === "Critical" || s.urgency === "Soon" ? "replacement" : "service and inspection"} quotes.`,
  };
}
