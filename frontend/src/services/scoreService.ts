/**
 * HomeGentic Score Service
 *
 * Computes a 0–100 score from local job + property data and persists
 * weekly snapshots to localStorage so the Dashboard can render a sparkline.
 *
 * Scoring rubric (sum ≤ 100):
 *   • Verified jobs    – 4 pts each, max 40 pts
 *   • Total value      – 1 pt per $2,500, max 20 pts
 *   • Verification     – 10 pts per Premium property, 5 pts per Basic, max 20 pts
 *   • Job diversity    – 4 pts per unique service type, max 20 pts
 */

import type { Job } from "@/services/job";
import type { Property } from "@/services/property";
import { SCORE_DECAY_FLOOR } from "@/services/scoreDecayService";

export interface ScoreSnapshot {
  score: number;
  timestamp: number; // ms epoch
}

const historyKey = (propertyId?: string | null) =>
  propertyId ? `homegentic_score_${propertyId}` : "homegentic_score_history";
const MAX_SNAPSHOTS = 12; // keep ~3 months of weekly snapshots

export function computeScore(jobs: Job[], properties: Property[]): number {
  let score = 0;

  const verifiedJobs = jobs.filter((j) => j.verified);
  score += Math.min(verifiedJobs.length * 4, 40);

  const totalValueDollars = jobs.reduce((sum, j) => sum + j.amount, 0) / 100;
  score += Math.min(Math.floor(totalValueDollars / 2500), 20);

  let verificationPts = 0;
  for (const p of properties) {
    if (p.verificationLevel === "Premium") verificationPts += 10;
    else if (p.verificationLevel === "Basic") verificationPts += 5;
  }
  score += Math.min(verificationPts, 20);

  const uniqueTypes = new Set(jobs.map((j) => j.serviceType)).size;
  score += Math.min(uniqueTypes * 4, 20);

  return Math.min(Math.round(score), 100);
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
  const verified = jobs.filter((j) => j.verified || j.status === "verified");
  if (verified.length < 3) return false;
  const KEY_SYSTEMS = ["HVAC", "Roofing", "Plumbing", "Electrical"];
  return KEY_SYSTEMS.filter((sys) => verified.some((j) => j.serviceType === sys)).length >= 2;
}

/**
 * Lender certificate — encodes a summary as a base64 URL token so the lender
 * can view score + certified status without accessing any job details.
 * NOTE: This is a frontend-only placeholder until canister cert issuance (4.2.1).
 */
export interface ScoreBreakdown {
  verifiedJobPts:  number;
  valuePts:        number;
  verificationPts: number;
  diversityPts:    number;
}

export function computeBreakdown(jobs: Job[], properties: Property[]): ScoreBreakdown {
  const verifiedJobPts  = Math.min(jobs.filter((j) => j.verified).length * 4, 40);
  const totalValueDollars = jobs.reduce((sum, j) => sum + j.amount, 0) / 100;
  const valuePts        = Math.min(Math.floor(totalValueDollars / 2500), 20);
  let rawVerificationPts = 0;
  for (const p of properties) {
    if (p.verificationLevel === "Premium")      rawVerificationPts += 10;
    else if (p.verificationLevel === "Basic")   rawVerificationPts += 5;
  }
  const verificationPts = Math.min(rawVerificationPts, 20);
  const diversityPts    = Math.min(new Set(jobs.map((j) => j.serviceType)).size * 4, 20);
  return { verifiedJobPts, valuePts, verificationPts, diversityPts };
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
