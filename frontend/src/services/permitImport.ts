/**
 * §17.5.1 — Municipal Permit API Integration
 *
 * Fetches permit records from the HomeGentic relay (POST /api/permits/import),
 * which in turn queries OpenPermit.org for supported cities.
 *
 * Pure functions (mapPermitTypeToServiceType, permitToJobInput, isPermitDataAvailable)
 * are exported for testing without network calls.
 */

import type { Job, JobStatus } from "./job";
import { jobService } from "./job";
import type { Property } from "./property";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OpenPermitRecord {
  permitNumber:          string;
  permitType:            string;
  description:           string;
  issuedDate:            string;            // YYYY-MM-DD
  status:                "Open" | "Finaled" | "Expired" | "Cancelled";
  estimatedValueCents?:  number;
  contractorLicense?:    string;
  contractorName?:       string;
}

export type PermitJobInput = Omit<Job,
  "id" | "createdAt" | "photos" | "verified" |
  "homeownerSigned" | "contractorSigned" | "homeowner" | "contractor"
>;

export interface ImportedPermit {
  permit:      OpenPermitRecord;
  serviceType: string;
  jobInput:    PermitJobInput;
}

export interface PermitImportResult {
  citySupported: boolean;
  imported:      number;
  permits:       ImportedPermit[];
}

// ── Permit type → HomeGentic service type ───────────────────────────────────────

const PERMIT_TYPE_MAP: Array<[RegExp, string]> = [
  [/electric/i,                    "Electrical"],
  [/mechanical|hvac|heating|cooling|furnace|air.?condition/i, "HVAC"],
  [/plumb/i,                       "Plumbing"],
  [/roof/i,                        "Roofing"],
  [/window/i,                      "Windows"],
  [/water.?heater|hot.?water/i,    "Water Heater"],
  [/solar/i,                       "Solar Panels"],
  [/insul/i,                       "Insulation"],
  [/floor/i,                       "Flooring"],
];

export function mapPermitTypeToServiceType(permitType: string): string {
  for (const [pattern, serviceType] of PERMIT_TYPE_MAP) {
    if (pattern.test(permitType)) return serviceType;
  }
  return "General";
}

// ── Permit → Job input ────────────────────────────────────────────────────────

const PERMIT_STATUS_MAP: Record<OpenPermitRecord["status"], JobStatus> = {
  Finaled:   "verified",
  Open:      "pending",
  Expired:   "completed",
  Cancelled: "completed",
};

export function permitToJobInput(permit: OpenPermitRecord, propertyId: string): PermitJobInput {
  const serviceType = mapPermitTypeToServiceType(permit.permitType);
  const isDiy       = !permit.contractorName;

  return {
    propertyId,
    serviceType,
    contractorName:  permit.contractorName,
    amount:          permit.estimatedValueCents ?? 0,
    date:            permit.issuedDate,
    description:     permit.description,
    isDiy,
    permitNumber:    permit.permitNumber,
    warrantyMonths:  undefined,
    status:          PERMIT_STATUS_MAP[permit.status] ?? "completed",
  };
}

// ── City coverage ─────────────────────────────────────────────────────────────
//
// OpenPermit MVP coverage: top US cities by homeowner population.
// Keyed as "city:state" (lowercase) for O(1) lookup.

const SUPPORTED_CITIES = new Set([
  // Volusia County, FL — pilot; direct ArcGIS, no API key required
  "daytona beach:fl",
  "deltona:fl",
  "ormond beach:fl",
  "port orange:fl",
  "holly hill:fl",
  "south daytona:fl",
  "new smyrna beach:fl",
  "edgewater:fl",
  "deland:fl",
  "debary:fl",
  "orange city:fl",
  "ponce inlet:fl",
  "oak hill:fl",
  "lake helen:fl",
  "pierson:fl",
  "volusia county:fl",
  // OpenPermit.org coverage
  "los angeles:ca",
  "houston:tx",
  "phoenix:az",
  "philadelphia:pa",
  "san antonio:tx",
  "san diego:ca",
  "dallas:tx",
  "san jose:ca",
  "austin:tx",
  "jacksonville:fl",
  "new york:ny",
  "chicago:il",
  "fort worth:tx",
  "columbus:oh",
  "charlotte:nc",
  "denver:co",
  "seattle:wa",
  "portland:or",
  "las vegas:nv",
  "nashville:tn",
  "miami:fl",
  "atlanta:ga",
  "minneapolis:mn",
  "tampa:fl",
]);

export function isPermitDataAvailable(city: string, state: string): boolean {
  const key = `${city.trim().toLowerCase()}:${state.trim().toLowerCase()}`;
  return SUPPORTED_CITIES.has(key);
}

// ── Relay import ──────────────────────────────────────────────────────────────

const RELAY_URL =
  typeof window !== "undefined"
    ? ((window as any).__VITE_AGENT_URL ?? "http://localhost:3001")
    : "http://localhost:3001";

export async function importPermitsForProperty(
  propertyId: string,
  address:    string,
  city:       string,
  state:      string,
  zip:        string,
): Promise<PermitImportResult> {
  if (!isPermitDataAvailable(city, state)) {
    return { citySupported: false, imported: 0, permits: [] };
  }

  const res = await fetch(`${RELAY_URL}/api/permits/import`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ propertyId, address, city, state, zip }),
  });

  if (!res.ok) {
    throw new Error(`Permit relay error: ${res.status}`);
  }

  const { permits: raw }: { permits: OpenPermitRecord[] } = await res.json();

  const permits: ImportedPermit[] = raw.map((permit) => ({
    permit,
    serviceType: mapPermitTypeToServiceType(permit.permitType),
    jobInput:    permitToJobInput(permit, propertyId),
  }));

  return {
    citySupported: true,
    imported:      permits.length,
    permits,
  };
}

// ── 17.5.2 — createJobsFromPermits ───────────────────────────────────────────

/** Write confirmed permits to the job canister. Call after user reviews. */
export async function createJobsFromPermits(
  _propertyId: string,
  permits: ImportedPermit[],
): Promise<Job[]> {
  if (permits.length === 0) return [];
  return Promise.all(
    permits.map((p) =>
      jobService.create({
        ...(p.jobInput as any),
        permitNumber: p.permit.permitNumber,
      })
    )
  );
}

// ── 17.5.3 — triggerPermitImport ─────────────────────────────────────────────

/**
 * Run after property registration. Fetches permits for the property and
 * returns them for user review — does NOT auto-create jobs.
 * The caller shows the PermitImportReviewPanel, then calls createJobsFromPermits
 * with the confirmed subset.
 */
export async function triggerPermitImport(
  property: Pick<Property, "id" | "address" | "city" | "state" | "zipCode">,
): Promise<PermitImportResult> {
  return importPermitsForProperty(
    String(property.id),
    property.address,
    property.city,
    property.state,
    property.zipCode,
  );
}
