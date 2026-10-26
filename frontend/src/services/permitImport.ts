/**
 * §17.5.1 — Municipal Permit API Integration
 *
 * Fetches permit records from the HomeGentic relay (POST /api/permits/import),
 * which in turn queries OpenPermit.org for supported cities.
 *
 * Pure functions (mapPermitTypeToServiceType, permitToJobInput, isPermitDataAvailable)
 * are exported for testing without network calls.
 */

import type { Job, JobStatus, JobCreateInput } from "./job";
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
  // City of Orlando (Orange County) — Socrata open data, no API key
  "orlando:fl",
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

/**
 * A caveat to show next to the coverage badge, or null. Orlando's feed only
 * has City of Orlando permits, and many homes outside city limits (Orange
 * County, Winter Park, Maitland…) still have an Orlando mailing address.
 */
export function permitCoverageNote(city: string, state: string): string | null {
  const key = `${city.trim().toLowerCase()}:${state.trim().toLowerCase()}`;
  return key === "orlando:fl"
    ? "City of Orlando permits only. Homes outside city limits with an Orlando address won't find any."
    : null;
}

export function isPermitDataAvailable(city: string, state: string): boolean {
  const key = `${city.trim().toLowerCase()}:${state.trim().toLowerCase()}`;
  return SUPPORTED_CITIES.has(key);
}

// ── Canister import ───────────────────────────────────────────────────────────

// Raw shape returned by the ArcGIS AMANDA service (Volusia County)
interface ArcGisFeature {
  attributes?: {
    FOLDERNAME?:        string;
    FOLDERTYPE?:        string;
    FOLDERDESCRIPTION?: string;
    INDATE?:            number | string | null;
    STATUSDESC?:        string;
  };
}
interface ArcGisResponse { features?: ArcGisFeature[] }

// Raw shape returned by OpenPermit.org
interface OpenPermitRow {
  permit_number?:   string;
  id?:              string;
  permit_type?:     string;
  type?:            string;
  description?:     string;
  work_description?: string;
  issued_date?:     string;
  issue_date?:      string;
  status?:          string;
  estimated_value?: number;
  contractor_license?: string;
  contractor_name?:  string;
}
interface OpenPermitResponse { results?: OpenPermitRow[] }

// Raw row from the City of Orlando Socrata "Permit Applications" dataset
export interface OrlandoPermitRow {
  permit_number?:      string;
  application_type?:   string;
  worktype?:           string;
  application_status?: string;
  issue_permit_date?:  string;
  final_date?:         string;
  estimated_cost?:     string;
  contractor?:         string;   // "QUALIFIER NAME (COMPANY LLC)"
  project_name?:       string;
}

const ORLANDO_TYPE_LABEL: Record<string, string> = {
  "Building Permit":   "Building Permit",
  "Electrical":        "Electrical Permit",
  "Plumbing":          "Plumbing Permit",
  "Mechanical Permit": "Mechanical Permit",
  "GAS":               "Gas Permit",
  "Demolition Permit": "Demolition Permit",
};
// Building permits carry the trade in their worktype.
const ORLANDO_BUILDING_WORKTYPE: Record<string, string> = {
  roof: "Roofing Permit", solar: "Solar Permit", window: "Window Permit", windows: "Window Permit",
};

export function parseOrlandoPermit(row: OrlandoPermitRow): OpenPermitRecord {
  const type   = row.application_type ?? "";
  const work   = (row.worktype ?? "").trim();
  const status = (row.application_status ?? "").toLowerCase();
  const company = (row.contractor ?? "").match(/\(([^()]+)\)\s*$/)?.[1] ?? row.contractor ?? "";
  const cost   = Number(row.estimated_cost ?? "");
  return {
    permitNumber: row.permit_number ?? "",
    permitType:   (type === "Building Permit" ? ORLANDO_BUILDING_WORKTYPE[work.toLowerCase()] : undefined)
                  ?? ORLANDO_TYPE_LABEL[type] ?? "Building Permit",
    description:  [work, row.project_name?.trim()].filter(Boolean).join(": ") || type,
    issuedDate:   (row.issue_permit_date ?? "").slice(0, 10),
    status:       /finaled|closed|completed/.test(status) || row.final_date ? "Finaled"
                : status === "void" ? "Cancelled"
                : "Open",
    estimatedValueCents: Number.isFinite(cost) && cost > 0 ? Math.round(cost * 100) : undefined,
    contractorName:      company.trim() || undefined,
  };
}

// Map canister response source → permit records
function mapCanisterResponse(
  source: string,
  data: ArcGisResponse | OpenPermitResponse | OrlandoPermitRow[],
): OpenPermitRecord[] {
  if (source === "orlando") {
    return Array.isArray(data) ? data.map(parseOrlandoPermit) : [];
  }
  if (source === "arcgis") {
    const arcgis = data as ArcGisResponse;
    const AMANDA_MAP: Record<string, string> = {
      elec: "Electrical Permit", mech: "Mechanical Permit",
      plmb: "Plumbing Permit",   roof: "Roofing Permit",
      wind: "Window Permit",     wtrh: "Water Heater Permit",
      solr: "Solar Permit",      insul: "Insulation Permit",
      floor: "Flooring Permit",
    };
    const mapStatus = (s: string): OpenPermitRecord["status"] => {
      const l = s.toLowerCase();
      if (/final|certificate|closed|complet/.test(l)) return "Finaled";
      if (/expir/.test(l))  return "Expired";
      if (/void|cancel|withdraw/.test(l)) return "Cancelled";
      return "Open";
    };
    return (arcgis.features ?? []).map((f) => {
      const a = f.attributes ?? {};
      return {
        permitNumber: a.FOLDERNAME ?? "",
        permitType:   AMANDA_MAP[(a.FOLDERTYPE ?? "").toLowerCase()] ?? "Building Permit",
        description:  a.FOLDERDESCRIPTION ?? "",
        issuedDate:   a.INDATE ? new Date(Number(a.INDATE)).toISOString().slice(0, 10) : "",
        status:       mapStatus(a.STATUSDESC ?? ""),
      };
    });
  }
  if (source === "openpermit") {
    const op = data as OpenPermitResponse;
    const mapStatus = (raw: string): OpenPermitRecord["status"] => {
      const s = raw.toLowerCase();
      if (s.includes("final") || s.includes("closed") || s.includes("complete")) return "Finaled";
      if (s.includes("expir"))  return "Expired";
      if (s.includes("cancel") || s.includes("void")) return "Cancelled";
      return "Open";
    };
    return (op.results ?? []).map((p) => ({
      permitNumber:        p.permit_number ?? p.id ?? "",
      permitType:          p.permit_type ?? p.type ?? "Building Permit",
      description:         p.description ?? p.work_description ?? "",
      issuedDate:          (p.issued_date ?? p.issue_date ?? "").slice(0, 10),
      status:              mapStatus(p.status ?? ""),
      estimatedValueCents: p.estimated_value ? Math.round(p.estimated_value * 100) : undefined,
      contractorLicense:   p.contractor_license,
      contractorName:      p.contractor_name,
    }));
  }
  return [];
}

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

  const { aiProxyService } = await import("./aiProxy");
  const json = await aiProxyService.importPermits(address, city, state, zip);
  if (!json) return { citySupported: true, imported: 0, permits: [] };

  const response = JSON.parse(json) as { source: string; data: ArcGisResponse | OpenPermitResponse | OrlandoPermitRow[] | string };
  if (response.source === "unsupported") {
    return { citySupported: false, imported: 0, permits: [] };
  }

  // data may be a nested JSON string from the canister
  const rawData =
    typeof response.data === "string"
      ? (JSON.parse(response.data) as ArcGisResponse | OpenPermitResponse | OrlandoPermitRow[])
      : response.data;

  const raw = mapCanisterResponse(response.source, rawData);
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
        ...(p.jobInput as JobCreateInput),
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
