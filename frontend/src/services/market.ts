/**
 * Market Intelligence service
 *
 * Calls the market canister's query functions with data the frontend
 * already holds — no extra round-trips to job/property canisters.
 */

import { Job } from "./job";
import type { Property } from "./property";

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
