/**
 * Market Intelligence service
 *
 * Calls the market canister's query functions with data the frontend
 * already holds — no extra round-trips to job/property canisters.
 *
 * Neighbourhood score methods (4.3.4) call the market canister directly
 * and use @dfinity/vetkeys for score authentication.
 */

import { Actor } from "@icp-sdk/core/agent";
import { Job } from "./job";
import type { Property } from "./property";
import { getAgent } from "./actor";

const MARKET_CANISTER_ID = (process.env as any).MARKET_CANISTER_ID || "";

// ─── Neighbourhood Score IDL ──────────────────────────────────────────────────

const neighbourhoodIdlFactory = ({ IDL }: any) => {
  const JobSummary = IDL.Record({
    serviceType:   IDL.Text,
    completedYear: IDL.Nat,
    amountCents:   IDL.Nat,
    isDiy:         IDL.Bool,
    isVerified:    IDL.Bool,
  });
  const StoredScore = IDL.Record({
    score:     IDL.Nat,
    zipCode:   IDL.Text,
    updatedAt: IDL.Int,
  });
  const ZipStats = IDL.Record({
    zipCode:    IDL.Text,
    mean:       IDL.Nat,
    median:     IDL.Nat,
    sampleSize: IDL.Nat,
    grade:      IDL.Text,
  });
  const ScoreEnvelope = IDL.Record({
    encryptedKey: IDL.Vec(IDL.Nat8),
    score:        IDL.Nat,
    zipCode:      IDL.Text,
    updatedAt:    IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound:     IDL.Null,
    Unauthorized: IDL.Null,
    InvalidInput: IDL.Text,
  });
  const Result_StoredScore   = IDL.Variant({ ok: StoredScore,   err: Error });
  const Result_ZipStats      = IDL.Variant({ ok: ZipStats,      err: Error });
  const Result_ScoreEnvelope = IDL.Variant({ ok: ScoreEnvelope, err: Error });
  return IDL.Service({
    submitScore:              IDL.Func([IDL.Vec(JobSummary), IDL.Nat, IDL.Text], [Result_StoredScore],   []),
    getZipStats:              IDL.Func([IDL.Text],                               [Result_ZipStats],      ["query"]),
    getNeighborhoodPublicKey: IDL.Func([],                                       [IDL.Vec(IDL.Nat8)],   []),
    getMyScoreEncrypted:      IDL.Func([IDL.Vec(IDL.Nat8)],                      [Result_ScoreEnvelope],[]),
  });
};

let _neighbourhoodActor: any = null;
async function getNeighbourhoodActor() {
  if (!_neighbourhoodActor) {
    const agent = await getAgent();
    _neighbourhoodActor = Actor.createActor(neighbourhoodIdlFactory, {
      agent,
      canisterId: MARKET_CANISTER_ID,
    });
  }
  return _neighbourhoodActor;
}

// ─── Neighbourhood Score Types ────────────────────────────────────────────────

export interface StoredScore {
  score:     number;
  zipCode:   string;
  updatedAt: bigint;
}

export interface ZipStats {
  zipCode:    string;
  mean:       number;
  median:     number;
  sampleSize: number;
  grade:      string;
}

export interface ScoreEnvelope {
  encryptedKey: Uint8Array;
  score:        number;
  zipCode:      string;
  updatedAt:    bigint;
}

// ─── Neighbourhood Score Canister Calls ──────────────────────────────────────

/** Submit job data; canister computes and stores the composite score. */
export async function submitScore(
  jobs:      JobSummary[],
  yearBuilt: number,
  zipCode:   string,
): Promise<StoredScore> {
  const actor = await getNeighbourhoodActor();
  const result = await actor.submitScore(jobs, BigInt(yearBuilt), zipCode);
  if ("err" in result) throw new Error(JSON.stringify(result.err));
  return {
    score:     Number(result.ok.score),
    zipCode:   result.ok.zipCode,
    updatedAt: result.ok.updatedAt,
  };
}

/** Public zip-level aggregate — no individual data. */
export async function getZipStats(zipCode: string): Promise<ZipStats | null> {
  const actor = await getNeighbourhoodActor();
  const result = await actor.getZipStats(zipCode);
  if ("err" in result) return null;
  return {
    zipCode:    result.ok.zipCode,
    mean:       Number(result.ok.mean),
    median:     Number(result.ok.median),
    sampleSize: Number(result.ok.sampleSize),
    grade:      result.ok.grade,
  };
}

/** Returns the canister's vetKeys public key for the neighbourhood score context. */
export async function getNeighborhoodPublicKey(): Promise<Uint8Array> {
  const actor = await getNeighbourhoodActor();
  const bytes = await actor.getNeighborhoodPublicKey();
  return new Uint8Array(bytes);
}

/** Returns the caller's score encrypted to the given transport public key. */
export async function getMyScoreEncrypted(
  transportPublicKey: Uint8Array,
): Promise<ScoreEnvelope> {
  const actor = await getNeighbourhoodActor();
  const result = await actor.getMyScoreEncrypted(Array.from(transportPublicKey));
  if ("err" in result) throw new Error(JSON.stringify(result.err));
  return {
    encryptedKey: new Uint8Array(result.ok.encryptedKey),
    score:        Number(result.ok.score),
    zipCode:      result.ok.zipCode,
    updatedAt:    result.ok.updatedAt,
  };
}

// ─── Input types (mirror the canister) ────────────────────────────────────────

export interface JobSummary {
  serviceType:   string;
  completedYear: number;
  amountCents:   number;
  isDiy:         boolean;
  isVerified:    boolean;
}

export interface PropertyJobSummary {
  propertyId:   string;
  yearBuilt:    number;
  squareFeet:   number;
  propertyType: string;
  state:        string;
  zipCode:      string;
  jobs:         JobSummary[];
}

export interface PropertyProfile {
  yearBuilt:    number;
  squareFeet:   number;
  propertyType: string;
  state:        string;
  zipCode:      string;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface DimensionScore {
  score:  number;   // 0-100
  grade:  string;   // A | B | C | D | F
  detail: string;
}

export interface CompetitiveAnalysis {
  maintenanceScore:    DimensionScore;
  systemModernization: DimensionScore;
  verificationDepth:   DimensionScore;
  overallScore:        number;
  overallGrade:        string;
  rankOutOf:           number;
  totalCompared:       number;
  strengths:           string[];
  improvements:        string[];
}

export type Priority = "High" | "Medium" | "Low";

export interface ProjectRecommendation {
  name:                string;
  category:            string;
  estimatedCostCents:  number;
  estimatedRoiPercent: number;
  estimatedGainCents:  number;
  paybackMonths:       number;
  priority:            Priority;
  rationale:           string;
  requiresPermit:      boolean;
}

// ─── Adapters ─────────────────────────────────────────────────────────────────

/** Convert a frontend Job to the canister's JobSummary. */
export function jobToSummary(job: Job): JobSummary {
  const year = job.date ? parseInt(job.date.split("-")[0], 10) : new Date().getFullYear();
  return {
    serviceType:   job.serviceType,
    completedYear: year,
    amountCents:   job.amount,
    isDiy:         job.isDiy,
    isVerified:    job.status === "verified",
  };
}

/** Build a PropertyJobSummary from a Property + its Job array. */
export function buildPropertySummary(
  property: Property,
  jobs: Job[]
): PropertyJobSummary {
  return {
    propertyId:   String(property.id),
    yearBuilt:    Number(property.yearBuilt),
    squareFeet:   Number(property.squareFeet),
    propertyType: String(property.propertyType),
    state:        property.state,
    zipCode:      property.zipCode,
    jobs:         jobs.map(jobToSummary),
  };
}

// ─── Mock implementation (swap with actor call once canisters are deployed) ───

function maintenanceScore(jobs: JobSummary[]): number {
  const systems: [string, number][] = [
    ["HVAC", 25], ["Roofing", 25], ["Plumbing", 15],
    ["Electrical", 15], ["Windows", 10], ["other", 10],
  ];
  let total = 0;
  for (const [system, weight] of systems) {
    const match = jobs.find((j) =>
      system === "other"
        ? !["HVAC","Roofing","Plumbing","Electrical","Windows"].includes(j.serviceType)
        : j.serviceType === system
    );
    if (match) {
      const factor = match.isVerified ? 10 : match.isDiy ? 8 : 5;
      total += (weight * factor) / 10;
    }
  }
  return total;
}

function modernizationScore(jobs: JobSummary[], yearBuilt: number): number {
  const year = new Date().getFullYear();
  const systems = [
    { cat: "HVAC",       lifespan: 18, weight: 25 },
    { cat: "Roofing",    lifespan: 25, weight: 25 },
    { cat: "Plumbing",   lifespan: 50, weight: 15 },
    { cat: "Electrical", lifespan: 35, weight: 15 },
    { cat: "Windows",    lifespan: 22, weight: 10 },
    { cat: "Flooring",   lifespan: 25, weight: 10 },
  ];
  let weightedSum = 0;
  let totalWeight = 0;
  for (const sys of systems) {
    totalWeight += sys.weight;
    const match = jobs.find((j) => j.serviceType === sys.cat);
    const lastYear = match ? match.completedYear : yearBuilt;
    const age = Math.max(0, year - lastYear);
    const fraction = age >= sys.lifespan ? 0 : ((sys.lifespan - age) / sys.lifespan) * 100;
    weightedSum += sys.weight * fraction;
  }
  return totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);
}

function verificationDepth(jobs: JobSummary[]): number {
  if (jobs.length === 0) return 0;
  return Math.round((jobs.filter((j) => j.isVerified).length / jobs.length) * 100);
}

function composite(m: number, mod: number, v: number): number {
  return Math.round((m * 40 + mod * 35 + v * 25) / 100);
}

function grade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

function detail(score: number): string {
  if (score >= 90) return "Excellent — top tier maintenance record";
  if (score >= 80) return "Good — well-maintained with minor gaps";
  if (score >= 65) return "Fair — some documentation present";
  if (score >= 50) return "Below average — buyers may discount asking price";
  return "Needs attention — little or no verifiable history";
}

const PROJECT_TEMPLATES = [
  { name: "Energy Efficiency Upgrade",   category: "Insulation", baseCostCents: 400_000,   roiPercent: 102, paybackMonths: 12, requiresPermit: false, minPropertyAge: 10 },
  { name: "Hardwood Floor Refinish",     category: "Flooring",   baseCostCents: 500_000,   roiPercent: 147, paybackMonths: 8,  requiresPermit: false, minPropertyAge: 5  },
  { name: "Minor Kitchen Remodel",       category: "Kitchen",    baseCostCents: 2_700_000, roiPercent: 96,  paybackMonths: 18, requiresPermit: true,  minPropertyAge: 0  },
  { name: "Curb Appeal / Landscaping",   category: "Landscaping",baseCostCents: 500_000,   roiPercent: 87,  paybackMonths: 14, requiresPermit: false, minPropertyAge: 0  },
  { name: "HVAC Replacement",            category: "HVAC",       baseCostCents: 1_200_000, roiPercent: 85,  paybackMonths: 24, requiresPermit: true,  minPropertyAge: 15 },
  { name: "Bathroom Remodel",            category: "Bathroom",   baseCostCents: 2_500_000, roiPercent: 74,  paybackMonths: 20, requiresPermit: true,  minPropertyAge: 0  },
  { name: "Window Replacement",          category: "Windows",    baseCostCents: 2_000_000, roiPercent: 69,  paybackMonths: 28, requiresPermit: true,  minPropertyAge: 20 },
  { name: "Roof Replacement",            category: "Roofing",    baseCostCents: 3_000_000, roiPercent: 61,  paybackMonths: 36, requiresPermit: true,  minPropertyAge: 20 },
  { name: "Solar Installation",          category: "Solar",      baseCostCents: 2_500_000, roiPercent: 50,  paybackMonths: 60, requiresPermit: true,  minPropertyAge: 0  },
];

const LIFESPANS: Record<string, number> = {
  HVAC: 18, Roofing: 25, Plumbing: 50, Electrical: 35, Windows: 22, Flooring: 25,
};

function stateMultiplier(state: string): number {
  if (["CA","NY","MA","WA","OR","CO"].includes(state)) return 115;
  if (["TX","FL","AZ","GA","NC","TN","NV"].includes(state)) return 108;
  return 100;
}

export const marketService = {
  analyzeCompetitivePosition(
    subject: PropertyJobSummary,
    comparisons: PropertyJobSummary[]
  ): CompetitiveAnalysis {
    const mS   = maintenanceScore(subject.jobs);
    const modS = modernizationScore(subject.jobs, subject.yearBuilt);
    const vS   = verificationDepth(subject.jobs);
    const compS = composite(mS, modS, vS);

    const compScores = comparisons.map((c) =>
      composite(
        maintenanceScore(c.jobs),
        modernizationScore(c.jobs, c.yearBuilt),
        verificationDepth(c.jobs)
      )
    );
    const rank = compScores.filter((s) => s > compS).length + 1;

    const strengths: string[] = [];
    const improvements: string[] = [];
    if (mS   >= 70) strengths.push("Strong documented maintenance history");
    if (modS >= 70) strengths.push("Systems are modern and recently updated");
    if (vS   >= 70) strengths.push("High proportion of blockchain-verified records");
    if (mS   < 50)  improvements.push("Add maintenance records — buyers discount undocumented homes 3-5 %");
    if (modS < 50)  improvements.push("Key systems may be near end-of-life — consider targeted upgrades");
    if (vS   < 50)  improvements.push("Get existing jobs co-signed to boost buyer confidence");
    if (strengths.length === 0 && improvements.length === 0) {
      improvements.push("Logging more jobs will increase your competitive score");
    }

    return {
      maintenanceScore:    { score: mS,   grade: grade(mS),   detail: detail(mS)   },
      systemModernization: { score: modS, grade: grade(modS), detail: detail(modS) },
      verificationDepth:   { score: vS,   grade: grade(vS),   detail: detail(vS)   },
      overallScore: compS,
      overallGrade: grade(compS),
      rankOutOf:    rank,
      totalCompared: comparisons.length + 1,
      strengths,
      improvements,
    };
  },

  recommendValueAddingProjects(
    profile: PropertyProfile,
    currentJobs: JobSummary[],
    budgetCents: number    // 0 = no cap
  ): ProjectRecommendation[] {
    const year     = new Date().getFullYear();
    const propAge  = Math.max(0, year - profile.yearBuilt);
    const stateMult = stateMultiplier(profile.state);

    const results: ProjectRecommendation[] = [];

    for (const tmpl of PROJECT_TEMPLATES) {
      if (propAge < tmpl.minPropertyAge) continue;

      const lifespan = LIFESPANS[tmpl.category] ?? 999;
      const alreadyDone = currentJobs.some(
        (j) => j.serviceType === tmpl.category && j.completedYear + lifespan > year
      );
      if (alreadyDone) continue;

      const adjustedCost = Math.round(tmpl.baseCostCents * stateMult / 100);
      if (budgetCents > 0 && adjustedCost > budgetCents) continue;

      const adjustedRoi  = Math.round(tmpl.roiPercent * stateMult / 100);
      const estimatedGain = Math.round(adjustedCost * adjustedRoi / 100);

      const urgency = propAge >= tmpl.minPropertyAge + 10;
      const highRoi  = adjustedRoi >= 85;
      const priority: Priority = urgency && highRoi ? "High" : urgency || highRoi ? "Medium" : "Low";

      const ageNote  = propAge > 0 ? `Your home is ${propAge} years old. ` : "";
      const roiNote  = `National average ROI: ${adjustedRoi} %.`;
      const stateNote = stateMult > 100 ? ` ${profile.state} markets typically realize value faster.` : "";
      const rationale = ageNote + roiNote + stateNote;

      results.push({
        name: tmpl.name,
        category: tmpl.category,
        estimatedCostCents: adjustedCost,
        estimatedRoiPercent: adjustedRoi,
        estimatedGainCents: estimatedGain,
        paybackMonths: tmpl.paybackMonths,
        priority,
        rationale,
        requiresPermit: tmpl.requiresPermit,
      });
    }

    return results.sort((a, b) => b.estimatedRoiPercent - a.estimatedRoiPercent);
  },

  /** Format cents as a dollar string, e.g. 2700000 → "$27,000" */
  formatCost(cents: number): string {
    return `$${(cents / 100).toLocaleString()}`;
  },
};

// ─── Price range estimation ────────────────────────────────────────────────────

export interface PriceRange {
  low:        number;  // cents
  median:     number;  // cents
  high:       number;  // cents
  source:     "local" | "national";
  sampleSize: number;
}

export interface SubCategorySpec {
  label:      string;
  lowCents:   number;
  medianCents: number;
  highCents:  number;
}

/** Subcategories with national price benchmarks (per-system job types). */
export const SERVICE_SUBCATEGORIES: Record<string, SubCategorySpec[]> = {
  HVAC: [
    { label: "Full System Replacement",   lowCents:  800_000, medianCents: 1_100_000, highCents: 1_500_000 },
    { label: "AC Unit Only",              lowCents:  300_000, medianCents:   450_000, highCents:   600_000 },
    { label: "Furnace Only",              lowCents:  250_000, medianCents:   350_000, highCents:   500_000 },
    { label: "Heat Pump",                 lowCents:  400_000, medianCents:   600_000, highCents:   800_000 },
    { label: "Repair / Component Fix",    lowCents:   15_000, medianCents:    40_000, highCents:    80_000 },
    { label: "Duct Cleaning",             lowCents:   30_000, medianCents:    50_000, highCents:    70_000 },
    { label: "Thermostat Replacement",    lowCents:    5_000, medianCents:    15_000, highCents:    30_000 },
  ],
  Roofing: [
    { label: "Full Roof Replacement",     lowCents: 1_500_000, medianCents: 2_200_000, highCents: 3_500_000 },
    { label: "Partial Repair / Patch",    lowCents:    50_000, medianCents:   150_000, highCents:   300_000 },
    { label: "Gutter Replacement",        lowCents:   100_000, medianCents:   200_000, highCents:   400_000 },
    { label: "Skylight Install / Replace",lowCents:   150_000, medianCents:   250_000, highCents:   450_000 },
    { label: "Flashing Repair",           lowCents:    20_000, medianCents:    60_000, highCents:   100_000 },
  ],
  Plumbing: [
    { label: "Full Re-pipe",              lowCents:  800_000, medianCents: 1_200_000, highCents: 2_000_000 },
    { label: "Water Heater Replacement",  lowCents:  120_000, medianCents:   200_000, highCents:   350_000 },
    { label: "Pipe Repair / Leak Fix",    lowCents:   15_000, medianCents:    50_000, highCents:   150_000 },
    { label: "Drain Cleaning",            lowCents:   10_000, medianCents:    20_000, highCents:    50_000 },
    { label: "Fixture Replacement",       lowCents:   20_000, medianCents:    50_000, highCents:   150_000 },
    { label: "Water Softener Install",    lowCents:  100_000, medianCents:   175_000, highCents:   300_000 },
  ],
  Electrical: [
    { label: "Panel Upgrade",             lowCents:  200_000, medianCents:   350_000, highCents:   600_000 },
    { label: "Whole House Rewire",        lowCents:  800_000, medianCents: 1_200_000, highCents: 2_000_000 },
    { label: "Outlet / Switch Replace",   lowCents:    5_000, medianCents:    15_000, highCents:    30_000 },
    { label: "Ceiling Fan Install",       lowCents:   10_000, medianCents:    20_000, highCents:    50_000 },
    { label: "EV Charger Install",        lowCents:   50_000, medianCents:   100_000, highCents:   250_000 },
    { label: "Generator Install",         lowCents:  200_000, medianCents:   400_000, highCents:   800_000 },
  ],
  Windows: [
    { label: "Full Window Replacement",   lowCents:  800_000, medianCents: 1_400_000, highCents: 2_400_000 },
    { label: "Single Window Replace",     lowCents:   50_000, medianCents:    90_000, highCents:   200_000 },
    { label: "Window Repair / Seal",      lowCents:   10_000, medianCents:    25_000, highCents:    60_000 },
    { label: "Door Replacement",          lowCents:   50_000, medianCents:   120_000, highCents:   300_000 },
  ],
  Flooring: [
    { label: "Hardwood Install",          lowCents:  300_000, medianCents:   600_000, highCents: 1_200_000 },
    { label: "Hardwood Refinish",         lowCents:  150_000, medianCents:   280_000, highCents:   500_000 },
    { label: "Tile Install",              lowCents:  200_000, medianCents:   450_000, highCents:   800_000 },
    { label: "Carpet Install",            lowCents:  100_000, medianCents:   250_000, highCents:   500_000 },
    { label: "LVP / Laminate Install",    lowCents:  150_000, medianCents:   300_000, highCents:   600_000 },
  ],
  Painting: [
    { label: "Exterior Paint",            lowCents:  200_000, medianCents:   400_000, highCents:   800_000 },
    { label: "Interior — Whole House",    lowCents:  300_000, medianCents:   600_000, highCents: 1_000_000 },
    { label: "Single Room",              lowCents:   30_000, medianCents:    70_000, highCents:   120_000 },
    { label: "Cabinet Painting",          lowCents:  150_000, medianCents:   280_000, highCents:   500_000 },
  ],
  Landscaping: [
    { label: "Full Landscape Design",     lowCents:  300_000, medianCents:   700_000, highCents: 1_500_000 },
    { label: "Tree Removal",              lowCents:   50_000, medianCents:   150_000, highCents:   500_000 },
    { label: "Irrigation System Install", lowCents:  200_000, medianCents:   350_000, highCents:   600_000 },
    { label: "Fence Install",             lowCents:  150_000, medianCents:   300_000, highCents:   700_000 },
    { label: "Lawn Cleanup / Grading",    lowCents:   50_000, medianCents:   120_000, highCents:   300_000 },
  ],
  Foundation: [
    { label: "Full Foundation Repair",    lowCents:  500_000, medianCents: 1_200_000, highCents: 3_000_000 },
    { label: "Crack Injection",           lowCents:   50_000, medianCents:   100_000, highCents:   300_000 },
    { label: "Waterproofing",             lowCents:  300_000, medianCents:   600_000, highCents: 1_000_000 },
    { label: "Pier / Beam Leveling",      lowCents:  500_000, medianCents:   900_000, highCents: 2_000_000 },
  ],
};

const MIN_LOCAL_SAMPLES = 3;

/**
 * Returns a price range for a given service type + optional subcategory.
 *
 * Priority:
 * 1. Local job history (≥ MIN_LOCAL_SAMPLES completed/verified jobs of the same type)
 * 2. Subcategory benchmark (if subCategory provided and found in SERVICE_SUBCATEGORIES)
 * 3. Top-level Remodeling Magazine template (state-adjusted)
 *
 * @param serviceType  The job service type (matches PROJECT_TEMPLATES category)
 * @param jobs         Pool of jobs to sample — typically the property's own history
 * @param state        Two-letter US state code for cost adjustment (optional)
 * @param subCategory  Specific job subtype from SERVICE_SUBCATEGORIES (optional)
 */
export function getPriceRange(
  serviceType: string,
  jobs: Job[],
  state?: string,
  subCategory?: string
): PriceRange | null {
  const relevant = jobs.filter(
    (j) =>
      j.serviceType === serviceType &&
      (j.status === "completed" || j.status === "verified" || j.verified) &&
      j.amount > 0
  );

  if (relevant.length >= MIN_LOCAL_SAMPLES) {
    const amounts = relevant.map((j) => j.amount).sort((a, b) => a - b);
    const n      = amounts.length;
    const p25    = amounts[Math.floor(n * 0.25)];
    const median = amounts[Math.floor(n * 0.5)];
    const p75    = amounts[Math.floor(n * 0.75)];
    return { low: p25, median, high: p75, source: "local", sampleSize: n };
  }

  const mult = state ? stateMultiplier(state) : 100;

  // Subcategory benchmark
  if (subCategory) {
    const sub = SERVICE_SUBCATEGORIES[serviceType]?.find((s) => s.label === subCategory);
    if (sub) {
      return {
        low:        Math.round(sub.lowCents    * mult / 100),
        median:     Math.round(sub.medianCents * mult / 100),
        high:       Math.round(sub.highCents   * mult / 100),
        source:     "national",
        sampleSize: 0,
      };
    }
  }

  // Fall back to Remodeling Magazine top-level template
  const template = PROJECT_TEMPLATES.find((t) => t.category === serviceType);
  if (!template) return null;

  const base = Math.round(template.baseCostCents * mult / 100);
  return {
    low:        Math.round(base * 0.75),
    median:     base,
    high:       Math.round(base * 1.35),
    source:     "national",
    sampleSize: 0,
  };
}
