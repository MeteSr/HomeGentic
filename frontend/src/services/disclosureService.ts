/**
 * Disclosure Service — Epic 10.6
 *
 *  10.6.1  generateDisclosure   — pre-fill disclosure statement from HomeFax data
 *  10.6.2  computeDisclosureScore — 0-100 completeness score
 *  10.6.5  inspectionWaiverReady — score ≥ 88 + 2 key systems verified
 */

import type { Job } from "./job";
import type { Property } from "./property";

const KEY_SYSTEMS = ["HVAC", "Roofing", "Plumbing", "Electrical"];

function isVerified(job: Job): boolean {
  return job.verified || job.status === "verified";
}

// ─── 10.6.2 ──────────────────────────────────────────────────────────────────

/**
 * Scores how complete a seller's disclosure is based on HomeFax data coverage.
 *
 * Rubric (max 100):
 *   +25  Property verified (Basic or Premium)
 *   +25  ≥ 3 verified jobs on record
 *   +25  Key systems documented (prorated: floor(25 × verified / 4))
 *   +15  At least one job has a permit number
 *   +10  At least one material improvement logged
 */
export function computeDisclosureScore(property: Property, jobs: Job[]): number {
  let score = 0;

  if (
    property.verificationLevel === "Basic" ||
    property.verificationLevel === "Premium"
  ) {
    score += 25;
  }

  const verified = jobs.filter(isVerified);

  if (verified.length >= 3) score += 25;

  const keySystemsVerified = KEY_SYSTEMS.filter((s) =>
    verified.some((j) => j.serviceType === s)
  ).length;
  score += Math.floor(25 * keySystemsVerified / 4);

  if (jobs.some((j) => j.permitNumber)) score += 15;

  if (verified.length >= 1) score += 10;

  return Math.min(score, 100);
}

// ─── 10.6.1 ──────────────────────────────────────────────────────────────────

export interface MaterialImprovement {
  title:               string;
  serviceType:         string;
  year:                number;
  verifiedByContractor: boolean;
}

export interface PermitRecord {
  title:        string;
  permitNumber: string;
  year:         number;
}

export interface DisclosureStatement {
  propertyInfo: {
    address:      string;
    city:         string;
    state:        string;
    zipCode:      string;
    yearBuilt:    number;
    squareFeet:   number;
    propertyType: string;
  };
  materialImprovements: MaterialImprovement[];
  permits:              PermitRecord[];
  knownDefects:         string[];
}

/**
 * Pre-fills a seller disclosure statement from HomeFax property and job data.
 * The seller reviews and can annotate before signing.
 */
export function generateDisclosure(
  property: Property,
  jobs: Job[]
): DisclosureStatement {
  const verified = jobs.filter(isVerified);

  return {
    propertyInfo: {
      address:      property.address,
      city:         property.city,
      state:        property.state,
      zipCode:      property.zipCode,
      yearBuilt:    Number(property.yearBuilt),
      squareFeet:   Number(property.squareFeet),
      propertyType: property.propertyType,
    },
    materialImprovements: verified.map((j) => ({
      title:               j.title ?? j.serviceType,
      serviceType:         j.serviceType,
      year:                new Date(j.date).getFullYear(),
      verifiedByContractor: !j.isDiy && j.contractorSigned,
    })),
    permits: jobs
      .filter((j) => j.permitNumber)
      .map((j) => ({
        title:        j.title ?? j.serviceType,
        permitNumber: j.permitNumber!,
        year:         new Date(j.date).getFullYear(),
      })),
    knownDefects: [],
  };
}

// ─── 10.6.5 ──────────────────────────────────────────────────────────────────

/**
 * Returns true when a seller can offer buyers an "inspection waiver" backed by
 * HomeFax data: score ≥ 88 and at least 2 of the 4 key systems are verified.
 */
export function inspectionWaiverReady(score: number, jobs: Job[]): boolean {
  if (score < 88) return false;
  const verified = jobs.filter(isVerified);
  const keySystemsVerified = KEY_SYSTEMS.filter((s) =>
    verified.some((j) => j.serviceType === s)
  ).length;
  return keySystemsVerified >= 2;
}
