/**
 * HomeGentic Score Service
 *
 * The score itself comes from @homegentic/shared/score, the same formula the
 * market canister uses for certificates and the FSBO index:
 *
 *   score = maintenance coverage × 40 % + system modernization × 35 %
 *         + verification depth × 25 %
 *
 * This file adapts app jobs/properties to it, applies the dashboard's decay
 * adjustments (scoreDecayService), and persists weekly snapshots to
 * localStorage so the Dashboard can render a sparkline.
 */

import type { Job } from "@/services/job";
import type { Property } from "@/services/property";
import { SCORE_DECAY_FLOOR } from "@/services/scoreDecayService";
import {
  scoreBreakdown, weightedPoints, REPLACEMENT_MIN_CENTS,
  type ScoreBreakdown as SharedBreakdown, type ScoreJob,
} from "@homegentic/shared/score";

export interface ScoreSnapshot {
  score: number;
  timestamp: number; // ms epoch
}

const historyKey = (propertyId?: string | null) =>
  propertyId ? `homegentic_score_${propertyId}` : "homegentic_score_history";
const MAX_SNAPSHOTS = 12; // keep ~3 months of weekly snapshots

/** R2: a verified job counts unless its contractor signature came from an
 *  unverified contractor profile (mirrors job.countsAsVerified on-chain). */
const countsAsVerified = (j: Job) => j.verified && !j.contractorUnverified;

const currentYear = () => new Date().getFullYear();

/** The shared formula's view of one job. */
export function toScoreJob(j: Job): ScoreJob {
  const year = parseInt((j.date ?? "").slice(0, 4), 10);
  return {
    serviceType:   j.serviceType,
    completedYear: Number.isFinite(year) ? year : currentYear(),
    amountCents:   j.amount,
    isDiy:         j.isDiy,
    isVerified:    countsAsVerified(j),
  };
}

/** Score dimensions (0–100 each) plus the points each adds to the total. */
export interface ScoreBreakdown extends SharedBreakdown {
  maintenancePts:   number;   // of 40
  modernizationPts: number;   // of 35
  verificationPts:  number;   // of 25
}

function withPoints(b: SharedBreakdown): ScoreBreakdown {
  return {
    ...b,
    maintenancePts:   weightedPoints(b.maintenance, "maintenance"),
    modernizationPts: weightedPoints(b.modernization, "modernization"),
    verificationPts:  weightedPoints(b.verification, "verification"),
  };
}

/**
 * The breakdown for one property, or the average over several (each scored
 * on its own jobs). With no property the house's age is unknown, so systems
 * are treated as new; pass the property whenever you have it.
 */
const EMPTY: ScoreBreakdown = { maintenance: 0, modernization: 0, verification: 0, total: 0, maintenancePts: 0, modernizationPts: 0, verificationPts: 0 };

export function computeBreakdown(jobs: Job[], properties: Property[]): ScoreBreakdown {
  // No record, no score (the market canister returns null here too).
  if (jobs.length === 0) return EMPTY;
  const year = currentYear();
  if (properties.length <= 1) {
    const yearBuilt = properties[0] ? Number(properties[0].yearBuilt) : year;
    return withPoints(scoreBreakdown(jobs.map(toScoreJob), yearBuilt, year));
  }
  const each = properties.filter((p) => jobs.some((j) => String(j.propertyId) === String(p.id))).map((p) =>
    scoreBreakdown(jobs.filter((j) => String(j.propertyId) === String(p.id)).map(toScoreJob), Number(p.yearBuilt), year));
  if (each.length === 0) return withPoints(scoreBreakdown(jobs.map(toScoreJob), Number(properties[0].yearBuilt), year));
  const avg = (k: keyof SharedBreakdown) => Math.floor(each.reduce((s, b) => s + b[k], 0) / each.length);
  return withPoints({ maintenance: avg("maintenance"), modernization: avg("modernization"), verification: avg("verification"), total: avg("total") });
}

export function computeScore(jobs: Job[], properties: Property[]): number {
  return computeBreakdown(jobs, properties).total;
}

/** The score change if `jobs` became `after` — for "this adds N points" copy. */
export function scoreChange(jobs: Job[], after: Job[], properties: Property[]): number {
  return computeScore(after, properties) - computeScore(jobs, properties);
}

export interface ScoreSuggestion {
  action: string;
  pts:    number;    // points it would add now, from the real formula
  isFree: boolean;   // needs no new work, only a sign-off
}

const KEY_SYSTEMS_BY_WEIGHT = ["HVAC", "Roofing", "Plumbing", "Electrical", "Windows"];

function hypotheticalJob(base: Partial<Job>, propertyId: string): Job {
  return {
    id: "hypothetical", propertyId, homeowner: "", serviceType: "Other", contractorName: undefined,
    amount: 0, date: `${currentYear()}-01-01`, description: "", isDiy: false, permitNumber: undefined,
    warrantyMonths: undefined, status: "verified", verified: true, homeownerSigned: true,
    contractorSigned: true, photos: [], createdAt: Date.now(), ...base,
  } as Job;
}

/**
 * The next things that would raise this property's score, cheapest first, each
 * with the points it would add today. Every number comes from simulating the
 * change against the real formula, so the copy can't drift from the score.
 */
export function scoreSuggestions(jobs: Job[], property: Property | null): ScoreSuggestion[] {
  const props = property ? [property] : [];
  const pid = property ? String(property.id) : "";
  const out: ScoreSuggestion[] = [];

  const unsigned = jobs.filter((j) => !j.verified && !j.isDiy);
  if (unsigned.length > 0) {
    const after = jobs.map((j) => (!j.verified && !j.isDiy ? { ...j, verified: true, status: "verified" as Job["status"] } : j));
    const pts = scoreChange(jobs, after, props);
    if (pts > 0) out.push({
      action: `Get the contractor to sign off on ${unsigned.length === 1 ? `your ${unsigned[0].serviceType} job` : `your ${unsigned.length} unsigned jobs`}`,
      pts, isFree: true,
    });
  }

  const missing = KEY_SYSTEMS_BY_WEIGHT.find((sys) => !jobs.some((j) => j.serviceType === sys));
  if (missing) {
    const pts = scoreChange(jobs, [...jobs, hypotheticalJob({ serviceType: missing }, pid)], props);
    if (pts > 0) out.push({ action: `Log a verified ${missing} service — that system has nothing on record yet`, pts, isFree: false });
  }

  if (property) {
    let best: ScoreSuggestion | null = null;
    for (const [sys, min] of Object.entries(REPLACEMENT_MIN_CENTS)) {
      const pts = scoreChange(jobs, [...jobs, hypotheticalJob({ serviceType: sys, amount: min }, pid)], props);
      if (pts > 0 && (!best || pts > best.pts)) best = { action: `Replace or upgrade your ${sys} (and log it) — of all your systems it would add the most remaining life`, pts, isFree: false };
    }
    if (best) out.push(best);
  }

  return out;   // cheapest first: a sign-off, then routine service, then a replacement
}

/**
 * Applies decay pts to the raw score and clamps to the decay floor (8.7.1–8.7.4, 8.7.8).
 * Use this in place of computeScore() when decay events are available.
 */
export function computeScoreWithDecay(
  jobs: Job[],
  properties: Property[],
  decayPts: number,
): number {
  const raw = computeScore(jobs, properties);
  if (decayPts === 0) return raw;
  // Floor only applies when decay brings score below zero (not as a universal minimum)
  return decayPts >= raw ? SCORE_DECAY_FLOOR : raw - decayPts;
}

export function getScoreGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

export function loadHistory(propertyId?: string | null): ScoreSnapshot[] {
  try {
    const raw = localStorage.getItem(historyKey(propertyId));
    return raw ? (JSON.parse(raw) as ScoreSnapshot[]) : [];
  } catch {
    return [];
  }
}

/**
 * Record a new score snapshot if at least 6 days have passed since the last
 * one (prevents duplicate daily snapshots while still capturing weekly drift).
 */
export function recordSnapshot(score: number, propertyId?: string | null): ScoreSnapshot[] {
  const history = loadHistory(propertyId);
  const now = Date.now();
  const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

  const last = history[history.length - 1];
  if (last && now - last.timestamp < SIX_DAYS_MS) {
    // Update the most recent snapshot in-place instead of appending
    const updated = [...history.slice(0, -1), { score, timestamp: last.timestamp }];
    localStorage.setItem(historyKey(propertyId), JSON.stringify(updated));
    return updated;
  }

  const next = [...history, { score, timestamp: now }].slice(-MAX_SNAPSHOTS);
  localStorage.setItem(historyKey(propertyId), JSON.stringify(next));
  return next;
}

/**
 * Returns the point change vs. the previous snapshot (or 0 if none).
 */
export function scoreDelta(history: ScoreSnapshot[]): number {
  if (history.length < 2) return 0;
  return history[history.length - 1].score - history[history.length - 2].score;
}

/**
 * Determines whether a property qualifies for the HomeGentic Certified™ designation.
 * Criteria (front-end heuristic; canister enforcement is a Tier 3 item):
 *   - HomeGentic Score ≥ 88
 *   - At least 3 verified jobs on record
 *   - At least 2 of the 4 key systems have a verified job: HVAC, Roofing, Plumbing, Electrical
 */
export function isCertified(score: number, jobs: Job[]): boolean {
  if (score < 88) return false;
  const verified = jobs.filter((j) => (j.verified || j.status === "verified") && !j.contractorUnverified);
  if (verified.length < 3) return false;
  const KEY_SYSTEMS = ["HVAC", "Roofing", "Plumbing", "Electrical"];
  return KEY_SYSTEMS.filter((sys) => verified.some((j) => j.serviceType === sys)).length >= 2;
}

export interface CertPayload {
  address:     string;
  score:       number;
  grade:       string;
  certified:   boolean;
  generatedAt: number; // ms
  planTier?:   string;
  breakdown?:  ScoreBreakdown;
}

export function generateCertToken(payload: CertPayload): string {
  return btoa(JSON.stringify(payload)).replace(/=/g, "");
}

export function parseCertToken(token: string): CertPayload | null {
  try {
    const padded = token + "=".repeat((4 - token.length % 4) % 4);
    return JSON.parse(atob(padded)) as CertPayload;
  } catch {
    return null;
  }
}

/**
 * Estimates the home-value dollar change corresponding to a HomeGentic score increase.
 * Returns null if the delta is zero or negative, or if toScore is below 40.
 *
 * Dollar-per-point rates are calibrated to the backlog example (8.2.4):
 *   score 74 → 77 (3 pts) ≈ $4,200 → $1,400/pt in the 70–84 band.
 * Result is rounded to the nearest $100.
 */
export function scoreValueDelta(fromScore: number, toScore: number): number | null {
  if (toScore <= fromScore || toScore < 40) return null;

  const avg = (fromScore + toScore) / 2;
  let dollarPerPt: number;
  if (avg < 55)      dollarPerPt = 333;   // ~$333/pt  ($3K–$8K band)
  else if (avg < 70) dollarPerPt = 467;   // ~$467/pt  ($8K–$15K band)
  else if (avg < 85) dollarPerPt = 1_400; // ~$1,400/pt ($15K–$25K band)
  else               dollarPerPt = 1_000; // ~$1,000/pt ($20K–$35K band)

  return Math.round((toScore - fromScore) * dollarPerPt / 100) * 100;
}

/**
 * Estimates the buyer-premium dollar range associated with a HomeGentic score.
 * Based on industry research: verified maintenance history lifts sale price
 * 1–10% in typical US markets. Returns null below score 40 (not enough signal).
 *
 * NOTE: These are heuristic ranges pending real market-data integration (5.3.2).
 */
export function premiumEstimate(score: number): { low: number; high: number } | null {
  if (score < 40) return null;
  if (score < 55) return { low: 3_000,  high: 8_000  };
  if (score < 70) return { low: 8_000,  high: 15_000 };
  if (score < 85) return { low: 15_000, high: 25_000 };
  return               { low: 20_000, high: 35_000 };
}

// ─── Zip-aware premium model (6.1.2) ─────────────────────────────────────────

/**
 * Regional median home values keyed by zip prefix (first 3 digits).
 * Source: 2024 NAR / Zillow metro-level estimates. Pending real data from 5.3.2.
 */
const MEDIAN_BY_PREFIX: Record<string, number> = {
  // New York metro
  "100": 750_000, "101": 750_000, "102": 750_000, "103": 650_000, "104": 600_000,
  "110": 580_000, "111": 560_000, "112": 520_000, "113": 500_000, "114": 540_000,
  // Los Angeles / Southern California
  "900": 700_000, "901": 700_000, "902": 680_000, "903": 620_000, "904": 600_000,
  "905": 580_000, "906": 560_000, "907": 540_000, "908": 520_000,
  // San Francisco Bay Area
  "940": 1_100_000, "941": 1_050_000, "942": 950_000, "943": 900_000, "944": 850_000,
  "945": 820_000, "946": 800_000, "947": 780_000, "948": 760_000, "949": 740_000,
  // Seattle
  "980": 650_000, "981": 620_000, "982": 580_000, "983": 520_000, "984": 500_000,
  // Boston
  "021": 580_000, "022": 560_000, "023": 520_000, "024": 500_000, "025": 480_000,
  // DC metro
  "200": 580_000, "201": 560_000, "202": 540_000, "203": 520_000, "204": 500_000,
  "205": 480_000,
  // Miami / South Florida
  "331": 560_000, "332": 530_000, "333": 500_000, "334": 470_000, "335": 440_000,
  "336": 410_000, "337": 390_000, "338": 370_000, "339": 350_000,
  // Chicago
  "606": 340_000, "607": 310_000, "608": 290_000, "609": 270_000, "600": 320_000,
  "601": 310_000, "602": 300_000, "603": 290_000, "604": 280_000, "605": 270_000,
  // Houston
  "770": 290_000, "771": 280_000, "772": 270_000, "773": 260_000, "774": 250_000,
  "775": 245_000, "776": 240_000, "777": 235_000,
  // Dallas / Fort Worth
  "750": 350_000, "751": 340_000, "752": 330_000, "753": 320_000, "754": 300_000,
  "755": 290_000, "756": 280_000, "757": 270_000, "758": 260_000, "759": 250_000,
  // Phoenix
  "850": 410_000, "851": 395_000, "852": 380_000, "853": 360_000, "854": 340_000,
  "855": 320_000, "856": 300_000, "857": 290_000, "858": 280_000, "859": 270_000,
  // Atlanta
  "300": 360_000, "301": 345_000, "302": 330_000, "303": 315_000, "304": 300_000,
  "305": 285_000, "306": 270_000, "307": 260_000,
  // Denver
  "800": 520_000, "801": 500_000, "802": 480_000, "803": 460_000, "804": 440_000,
  "805": 420_000, "806": 400_000,
  // Minneapolis
  "554": 310_000, "555": 300_000, "556": 290_000, "557": 280_000,
  // Portland OR
  "970": 450_000, "971": 430_000, "972": 410_000, "973": 390_000, "974": 370_000,
  // San Diego
  "919": 760_000, "920": 730_000, "921": 700_000, "922": 670_000,
  // Las Vegas
  "890": 380_000, "891": 365_000, "892": 350_000,
  // Philadelphia
  "191": 310_000, "192": 295_000, "193": 280_000, "194": 265_000, "195": 250_000,
  // Nashville
  "370": 380_000, "371": 365_000, "372": 350_000,
  // Austin
  "787": 460_000, "786": 440_000, "785": 420_000,
  // Charlotte
  "282": 360_000, "281": 340_000, "280": 320_000,
  // Raleigh
  "275": 370_000, "276": 350_000, "277": 330_000,
  // Salt Lake City
  "841": 440_000, "840": 420_000, "842": 400_000,
  // San Antonio
  "782": 270_000, "781": 260_000, "780": 250_000,
  // Indianapolis
  "462": 260_000, "461": 245_000, "460": 230_000,
  // Columbus OH
  "432": 270_000, "431": 255_000, "430": 240_000,
};

const NATIONAL_DEFAULT_MEDIAN = 330_000;

/**
 * Returns the estimated regional median home value for a zip code.
 * Uses the first 3 digits as a metro-area key; falls back to national default.
 */
export function getMedianHomeValue(zip: string): number {
  const prefix = zip.slice(0, 3);
  return MEDIAN_BY_PREFIX[prefix] ?? NATIONAL_DEFAULT_MEDIAN;
}

/**
 * Score band → [lowPct, highPct] of median home value that the HomeGentic premium
 * represents. Based on 2024 industry research: verified history lifts price 0.5–9%.
 */
const SCORE_BANDS: Array<{ minScore: number; lowPct: number; highPct: number }> = [
  { minScore: 85, lowPct: 0.050, highPct: 0.090 },
  { minScore: 70, lowPct: 0.030, highPct: 0.060 },
  { minScore: 55, lowPct: 0.015, highPct: 0.030 },
  { minScore: 40, lowPct: 0.005, highPct: 0.015 },
];

/**
 * Zip-aware premium estimate (6.1.2).
 * Returns a { low, high } dollar range = score-band % × regional median home value.
 * Values are rounded to the nearest $500.
 * Returns null for scores below 40.
 */
export function premiumEstimateByZip(
  score: number,
  zip:   string
): { low: number; high: number } | null {
  if (score < 40) return null;
  const band = SCORE_BANDS.find((b) => score >= b.minScore);
  if (!band) return null;
  const median = getMedianHomeValue(zip);
  const round500 = (n: number) => Math.round(n / 500) * 500;
  return {
    low:  round500(median * band.lowPct),
    high: round500(median * band.highPct),
  };
}

/**
 * Score for a report snapshot's job list (report pages use the score the
 * canister stored with the report when there is one; this is the fallback).
 * A report that hides amounts has 0 for every amount, so replacements can't
 * be recognised and modernization counts from the year built.
 */
export function scoreFromReportJobs(
  jobs: Array<{ serviceType: string; date: string; amountCents: number; isDiy: boolean; isVerified: boolean }>,
  yearBuilt: number,
): number {
  if (jobs.length === 0) return 0;
  const year = currentYear();
  return scoreBreakdown(jobs.map((j) => {
    const y = parseInt((j.date ?? "").slice(0, 4), 10);
    return { serviceType: j.serviceType, completedYear: Number.isFinite(y) ? y : year, amountCents: j.amountCents, isDiy: j.isDiy, isVerified: j.isVerified };
  }), yearBuilt, year).total;
}
