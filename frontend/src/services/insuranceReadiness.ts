/**
 * Florida insurance inspection readiness.
 *
 * Florida carriers commonly ask for a 4-point inspection (roof, electrical,
 * plumbing, HVAC) on older homes, and give wind-mitigation credits based on
 * the state's uniform mitigation form (OIR-B1-1802). This module compares
 * what those inspections look at with what the home's record already shows,
 * so the homeowner can see what's documented and what's missing before the
 * inspector comes.
 *
 * It only reports what the record holds. It never says a home will pass or
 * what a carrier will charge; age notes are phrased as what carriers commonly
 * look at, not as rules.
 */

import type { Job } from "./job";
import type { SystemAges } from "./systemAges";

/** documented: the record covers it · partial: some of it · missing: nothing yet ·
 *  onSite: only the inspector can establish it (attic, roof, panel cover off). */
export type ReadinessStatus = "documented" | "partial" | "missing" | "onSite";

export interface ReadinessItem {
  key:      string;
  label:    string;
  status:   ReadinessStatus;
  /** What the record shows, one line each. */
  evidence: string[];
  /** What the inspector will ask that the record doesn't show yet. */
  missing:  string[];
  /** Age in whole years, when an install year (or the build year) is known. */
  ageYears: number | null;
  /** A carrier-attention note for an older system. */
  ageNote?: string;
}

export interface PropertyFacts {
  yearBuilt: number;
  state:     string;
}

export const isFlorida = (p: PropertyFacts) => p.state.trim().toUpperCase() === "FL" || /^florida$/i.test(p.state.trim());

const latestFirst = (a: Job, b: Job) => b.date.localeCompare(a.date);

function jobLine(j: Job): string {
  const who = j.isDiy ? "DIY" : (j.contractorName || "contractor");
  const tag = j.status === "verified" ? "verified" : "self-reported";
  const desc = j.description.trim();
  return `${j.date}: ${desc ? (desc.length > 80 ? desc.slice(0, 77) + "…" : desc) : j.serviceType} (${who}, ${tag})` +
    (j.permitNumber ? ` · permit ${j.permitNumber}` : "");
}

interface SystemSpec {
  key:          string;
  label:        string;
  serviceTypes: string[];
  ageSystem:    keyof SystemAges;
  /** Age at which carriers commonly look closer, and the note to show. */
  attentionAge: number;
  attentionNote: string;
  /** What the 4-point form asks that we don't track. */
  untracked:    string[];
}

const FOUR_POINT: SystemSpec[] = [
  {
    key: "roof", label: "Roof", serviceTypes: ["Roofing"], ageSystem: "Roofing",
    attentionAge: 15, attentionNote: "Many Florida carriers look closely at roofs 15 years and older.",
    untracked: ["Roof covering type (shingle, tile, metal)"],
  },
  {
    key: "electrical", label: "Electrical", serviceTypes: ["Electrical"], ageSystem: "Electrical",
    attentionAge: 40, attentionNote: "Original wiring and panels in older homes get closer review.",
    untracked: ["Panel brand and amperage", "Wiring type (copper, aluminum, cloth)"],
  },
  {
    key: "plumbing", label: "Plumbing", serviceTypes: ["Plumbing"], ageSystem: "Plumbing",
    attentionAge: 40, attentionNote: "Original supply lines in older homes get closer review.",
    untracked: ["Supply pipe material (copper, PEX, CPVC, galvanized, polybutylene)"],
  },
  {
    key: "hvac", label: "HVAC", serviceTypes: ["HVAC"], ageSystem: "HVAC",
    attentionAge: 15, attentionNote: "Carriers often ask about HVAC systems 15 years and older.",
    untracked: [],
  },
];

function ageOf(installYear: number | undefined, yearBuilt: number, nowYear: number): { years: number | null; fromBuild: boolean } {
  if (installYear && installYear > 1800) return { years: Math.max(0, nowYear - installYear), fromBuild: false };
  if (yearBuilt > 1800) return { years: Math.max(0, nowYear - yearBuilt), fromBuild: true };
  return { years: null, fromBuild: false };
}

/** The four systems of a 4-point inspection against the home's record. */
export function fourPointReadiness(p: PropertyFacts, jobs: Job[], ages: SystemAges, now = new Date()): ReadinessItem[] {
  const nowYear = now.getFullYear();
  return FOUR_POINT.map((spec) => {
    const own = jobs.filter((j) => spec.serviceTypes.includes(j.serviceType)).sort(latestFirst);
    const installYear = ages[spec.ageSystem];
    const age = ageOf(installYear, p.yearBuilt, nowYear);
    const evidence: string[] = [];
    const missing: string[] = [];

    if (installYear) evidence.push(`Installed ${installYear} (from your system ages)`);
    else missing.push(`${spec.label} install year (set it with "Set install years", or the inspector will estimate it)`);
    own.slice(0, 3).forEach((j) => evidence.push(jobLine(j)));
    if (own.length === 0) missing.push(`An invoice or record of ${spec.label.toLowerCase()} work`);
    missing.push(...spec.untracked);

    if (spec.key === "plumbing") {
      const wh = ages["Water Heater"];
      if (wh) evidence.push(`Water heater installed ${wh} (from your system ages)`);
      else missing.push("Water heater age");
    }

    const known = (installYear ? 1 : 0) + (own.length ? 1 : 0);
    const status: ReadinessStatus = known === 2 && spec.untracked.length === 0 ? "documented"
      : known > 0 ? "partial" : "missing";

    const item: ReadinessItem = { key: spec.key, label: spec.label, status, evidence, missing, ageYears: age.years };
    if (age.years !== null && age.years >= spec.attentionAge) {
      item.ageNote = spec.attentionNote + (age.fromBuild ? ` (Age from the year the home was built; no install year is set.)` : "");
    }
    return item;
  });
}

const OPENING_PROTECTION = /impact|hurricane|shutter|storm panel/i;

/** The wind-mitigation form's main credits against the home's record. */
export function windMitigationReadiness(p: PropertyFacts, jobs: Job[]): ReadinessItem[] {
  const roofJobs = jobs.filter((j) => j.serviceType === "Roofing").sort(latestFirst);
  const permitted = roofJobs.find((j) => j.permitNumber);
  const openings = jobs.filter((j) => (j.serviceType === "Windows" || j.serviceType === "Other" || j.serviceType === "GeneralHandyman" || j.serviceType === "General Handyman")
    && OPENING_PROTECTION.test(j.description)).sort(latestFirst);

  const items: ReadinessItem[] = [];

  items.push(p.yearBuilt >= 2002
    ? { key: "code", label: "Building code", status: "partial", ageYears: null,
        evidence: [`Built in ${p.yearBuilt}. Homes permitted after March 1, 2002 fall under the Florida Building Code`],
        missing: ["The original building permit date (the inspector confirms it)"] }
    : { key: "code", label: "Building code", status: "onSite", ageYears: null,
        evidence: [`Built in ${p.yearBuilt}, before the Florida Building Code`],
        missing: ["The inspector rates the roof covering and attachments instead"] });

  items.push(permitted
    ? { key: "roofCovering", label: "Roof covering", status: "documented", ageYears: null,
        evidence: [jobLine(permitted)], missing: [] }
    : roofJobs.length
    ? { key: "roofCovering", label: "Roof covering", status: "partial", ageYears: null,
        evidence: [jobLine(roofJobs[0])], missing: ["The permit number for the last roof replacement"] }
    : { key: "roofCovering", label: "Roof covering", status: "missing", ageYears: null,
        evidence: [], missing: ["A record of the last roof replacement, with its permit number"] });

  items.push(openings.length
    ? { key: "openings", label: "Opening protection", status: "partial", ageYears: null,
        evidence: openings.slice(0, 2).map(jobLine),
        missing: ["Product approval numbers for every window, door and garage door"] }
    : { key: "openings", label: "Opening protection", status: "missing", ageYears: null,
        evidence: [], missing: ["Records of impact windows, doors or shutters, with product approval numbers"] });

  items.push({
    key: "attic", label: "Roof deck, roof-to-wall attachment, secondary water barrier, roof shape",
    status: "onSite", ageYears: null, evidence: [],
    missing: ["The inspector checks these in the attic and on the roof"],
  });
  return items;
}

/** One-line summary: how many of the items the record covers. */
export function readinessCounts(items: ReadinessItem[]): { documented: number; partial: number; missing: number; onSite: number } {
  const c = { documented: 0, partial: 0, missing: 0, onSite: 0 };
  for (const i of items) c[i.status] += 1;
  return c;
}

/** Quote-request prefill for booking an inspector through the existing quote flow. */
export function inspectionQuotePrefill(kind: "fourPoint" | "windMit", propertyId: string): Record<string, string> {
  return {
    propertyId,
    serviceType: "Other",
    description: kind === "fourPoint"
      ? "4-point insurance inspection (roof, electrical, plumbing, HVAC) for my homeowners insurance."
      : "Wind mitigation inspection (OIR-B1-1802 form) for my homeowners insurance.",
  };
}
