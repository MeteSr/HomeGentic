/**
 * §17.5.1 — Volusia County Permit Adapter
 *
 * Queries the Volusia County ArcGIS CurrentProjects MapServer (layer 1) —
 * the AMANDA open permits dataset. No API key required; fully public.
 *
 * Endpoint: https://maps5.vcgov.org/arcgis/rest/services/CurrentProjects/MapServer/1/query
 * Fields: FOLDERNAME, FOLDERTYPE, STATUSDESC, INDATE (ms), FOLDERDESCRIPTION, FOLDERLINK
 */

import type { OpenPermitRecord } from "./permitImport";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AmandaFeature {
  attributes: {
    FOLDERNAME:        string | null;
    FOLDERTYPE:        string | null;
    STATUSDESC:        string | null;
    INDATE:            number | null;   // Unix ms timestamp
    FOLDERDESCRIPTION: string | null;
    FOLDERLINK:        string | null;
  };
}

// ── City coverage ─────────────────────────────────────────────────────────────

const VOLUSIA_CITIES = new Set([
  "daytona beach",
  "deltona",
  "ormond beach",
  "port orange",
  "holly hill",
  "south daytona",
  "new smyrna beach",
  "edgewater",
  "deland",
  "debary",
  "orange city",
  "ponce inlet",
  "oak hill",
  "lake helen",
  "pierson",
  "osteen",
  "enterprise",
  "volusia county",
]);

export function isVolusiaCounty(city: string, state: string): boolean {
  if (state.trim().toLowerCase() !== "fl") return false;
  return VOLUSIA_CITIES.has(city.trim().toLowerCase());
}

// ── FOLDERTYPE → permit type label ────────────────────────────────────────────

const FOLDER_TYPE_MAP: Record<string, string> = {
  elec:  "Electrical",
  mech:  "HVAC",
  plmb:  "Plumbing",
  roof:  "Roofing",
  wind:  "Windows",
  wtrh:  "Water Heater",
  solr:  "Solar Panels",
  insul: "Insulation",
  floor: "Flooring",
};

/** Returns the HomeFax service type for an AMANDA FOLDERTYPE code. */
export function mapAmandaFolderType(code: string): string {
  return FOLDER_TYPE_MAP[code.trim().toLowerCase()] ?? "General";
}

/** Converts a HomeFax service type to a human-readable permit type label. */
function toPermitTypeLabel(serviceType: string): string {
  if (serviceType === "General")      return "Building Permit";
  if (serviceType === "HVAC")         return "Mechanical Permit";
  if (serviceType === "Water Heater") return "Water Heater Permit";
  if (serviceType === "Solar Panels") return "Solar Permit";
  return `${serviceType} Permit`;
}

// ── STATUSDESC → OpenPermit status ───────────────────────────────────────────

export function mapAmandaStatus(
  statusDesc: string,
): "Open" | "Finaled" | "Expired" | "Cancelled" {
  const s = statusDesc.toLowerCase();
  if (/final|certificate|closed|complet/.test(s)) return "Finaled";
  if (/expir/.test(s))                             return "Expired";
  if (/void|cancel|withdraw/.test(s))              return "Cancelled";
  return "Open";
}

// ── ArcGIS feature → OpenPermitRecord ────────────────────────────────────────

export function parseAmandaRecord(feature: AmandaFeature): OpenPermitRecord {
  const a = feature.attributes;

  const issuedDate = a.INDATE
    ? new Date(a.INDATE).toISOString().slice(0, 10)
    : "";

  const serviceType = mapAmandaFolderType(a.FOLDERTYPE ?? "");

  return {
    permitNumber: a.FOLDERNAME ?? "",
    permitType:   toPermitTypeLabel(serviceType),
    description:  a.FOLDERDESCRIPTION ?? "",
    issuedDate,
    status:       mapAmandaStatus(a.STATUSDESC ?? ""),
    // Estimated value and contractor not available in AMANDA open layer
    estimatedValueCents: undefined,
    contractorName:      undefined,
  };
}

// ── Live fetch ────────────────────────────────────────────────────────────────

const ARCGIS_URL =
  "https://maps5.vcgov.org/arcgis/rest/services/CurrentProjects/MapServer/1/query";

/** Fetch permits for a street address from the Volusia County ArcGIS layer.
 *  Searches FOLDERDESCRIPTION for the street address (case-insensitive LIKE). */
export async function fetchVolusiaPermits(
  address: string,
): Promise<OpenPermitRecord[]> {
  // Strip unit numbers etc — use the street portion only for the LIKE search
  const street = address.split(",")[0].trim();

  const params = new URLSearchParams({
    where:          `FOLDERDESCRIPTION LIKE '%${street}%'`,
    outFields:      "FOLDERNAME,FOLDERTYPE,STATUSDESC,INDATE,FOLDERDESCRIPTION,FOLDERLINK",
    resultRecordCount: "50",
    f:              "json",
  });

  const res = await fetch(`${ARCGIS_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Volusia ArcGIS error: ${res.status}`);

  const data = await res.json();
  const features: AmandaFeature[] = data.features ?? [];
  return features.map(parseAmandaRecord);
}
