/**
 * POST /api/risk/flood { propertyId, refresh? } — the FEMA flood zone at a
 * home's address (#718).
 *
 *   1. The property canister gives the address (relayFloodTarget), and only
 *      for a caller with a role on the home. An address in the body is ignored.
 *   2. The Census Bureau's free geocoder turns it into coordinates.
 *   3. FEMA's National Flood Hazard Layer (ArcGIS MapServer) gives the flood
 *      zone polygon at that point (layer 28) and the map panel with its
 *      effective date (layer 3).
 *   4. The result is saved on the property (relaySetFloodZone) and reused for
 *      30 days unless the caller asks to look again.
 *
 * Both services are free and keyless, so there's no paid budget, but the
 * route sits in OFFCHAIN_OUTCALL_ROUTES (session + Turnstile/backoff via
 * gatePaidCall) and each user gets FLOOD_PER_USER_DAY lookups a day.
 *
 * The result is what FEMA's map shows, not a forecast: the app says "FEMA's
 * map shows zone X as of <date>" and links the FEMA Map Service Center.
 */
import { hitCounter, type KVEnv } from "./rateLimiter";

export const CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const NFHL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
/** S_FLD_HAZ_AR, the flood hazard zones. */
export const FEMA_ZONES_URL = `${NFHL}/28/query`;
/** S_FIRM_PAN, the map panels and their effective dates. */
export const FEMA_PANELS_URL = `${NFHL}/3/query`;

export const FLOOD_PER_USER_DAY = 10;
export const FLOOD_CACHE_MS = 30 * 86_400_000;
const PROPERTY_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_UPSTREAM_BYTES = 1024 * 1024;
const TIMEOUT_MS = 10_000;

export type FloodStatus = "Mapped" | "NotMapped";

/** What FEMA's attributes say. */
export interface FemaZone {
  status: FloodStatus;
  zone: string;
  zoneSubtype: string;
  specialFloodHazardArea: boolean;
  baseFloodElevation: string;
  firmPanel: string;
  firmEffectiveDate: string;
}

export interface FloodZoneInput extends FemaZone {
  matchedAddress: string;
  latitude: string;
  longitude: string;
}

export interface FloodZoneRecord extends FloodZoneInput {
  /** ms */
  checkedAt: number;
}

export interface FloodTarget {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  floodZone: FloodZoneRecord | null;
}

export interface FloodDeps {
  /** The home's address and saved result for `user`, or why not. */
  target: (propertyId: string, user: string) => Promise<FloodTarget | "forbidden" | "notfound">;
  save: (propertyId: string, user: string, input: FloodZoneInput) => Promise<FloodZoneRecord>;
  fetch: typeof fetch;
}

export interface FloodResult {
  status: number;
  body: unknown;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** "YYYY-MM-DD" from ArcGIS's epoch-ms date, or "". */
function arcDate(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? new Date(v).toISOString().slice(0, 10) : "";
}

function features(body: any): any[] {
  if (!body || typeof body !== "object" || body.error) throw new Error("FEMA query failed");
  return Array.isArray(body.features) ? body.features : [];
}

/**
 * The zone at the point from FEMA's two query bodies. When the point touches
 * more than one polygon, a special flood hazard area wins (the cautious read).
 */
export function readFemaZone(zonesBody: unknown, panelsBody: unknown): FemaZone {
  const zones = features(zonesBody).map((f) => f?.attributes ?? {});
  const panels = features(panelsBody).map((f) => f?.attributes ?? {});
  const panel = panels[0] ?? {};
  const firmPanel = text(panel.FIRM_PAN, 20);
  const firmEffectiveDate = arcDate(panel.EFF_DATE);
  if (zones.length === 0) {
    return { status: "NotMapped", zone: "", zoneSubtype: "", specialFloodHazardArea: false, baseFloodElevation: "", firmPanel, firmEffectiveDate };
  }
  const z = zones.find((a) => a.SFHA_TF === "T") ?? zones[0];
  const bfe = typeof z.STATIC_BFE === "number" && z.STATIC_BFE > -9999 ? String(z.STATIC_BFE) : "";
  return {
    status: "Mapped",
    zone: text(z.FLD_ZONE, 10),
    zoneSubtype: text(z.ZONE_SUBTY, 120),
    specialFloodHazardArea: z.SFHA_TF === "T",
    baseFloodElevation: bfe,
    firmPanel,
    firmEffectiveDate,
  };
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<any> {
  const resp = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`upstream ${resp.status}`);
  const body = await resp.text();
  if (body.length > MAX_UPSTREAM_BYTES) throw new Error("upstream response too large");
  return JSON.parse(body);
}

function femaQuery(base: string, lng: number, lat: number, outFields: string): string {
  return `${base}?${new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields,
    returnGeometry: "false",
    f: "json",
  })}`;
}

export async function lookupFloodZone(
  input: unknown,
  principal: string,
  env: Partial<KVEnv>,
  deps: FloodDeps,
): Promise<FloodResult> {
  const b = (input ?? {}) as Record<string, unknown>;
  const propertyId = typeof b.propertyId === "string" ? b.propertyId : "";
  if (!PROPERTY_ID_RE.test(propertyId)) return { status: 400, body: { error: "valid propertyId required" } };

  const target = await deps.target(propertyId, principal);
  if (target === "forbidden") return { status: 403, body: { error: "not_authorized" } };
  if (target === "notfound") return { status: 404, body: { error: "property_not_found" } };

  const saved = target.floodZone;
  if (saved && b.refresh !== true && Date.now() - saved.checkedAt < FLOOD_CACHE_MS) {
    return { status: 200, body: { floodZone: saved, cached: true } };
  }

  const day = new Date().toISOString().slice(0, 10);
  if (!(await hitCounter(env, `flood:${principal}:${day}`, FLOOD_PER_USER_DAY, 2 * 86_400)).allowed) {
    return { status: 429, body: { error: "daily_flood_lookup_limit_reached" } };
  }

  let lookedUp: FloodZoneInput;
  try {
    const oneLine = `${target.address}, ${target.city}, ${target.state} ${target.zipCode}`;
    const geo = await getJson(deps.fetch, `${CENSUS_GEOCODER_URL}?${new URLSearchParams({
      address: oneLine, benchmark: "Public_AR_Current", format: "json",
    })}`);
    const match = geo?.result?.addressMatches?.[0];
    const lng = Number(match?.coordinates?.x);
    const lat = Number(match?.coordinates?.y);
    if (!match || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      return { status: 422, body: { error: "address_not_found" } };
    }
    const [zones, panels] = await Promise.all([
      getJson(deps.fetch, femaQuery(FEMA_ZONES_URL, lng, lat, "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DFIRM_ID")),
      getJson(deps.fetch, femaQuery(FEMA_PANELS_URL, lng, lat, "FIRM_PAN,EFF_DATE,PANEL_TYP")),
    ]);
    lookedUp = {
      ...readFemaZone(zones, panels),
      matchedAddress: text(match.matchedAddress, 300),
      latitude: String(lat).slice(0, 20),
      longitude: String(lng).slice(0, 20),
    };
  } catch {
    return { status: 502, body: { error: "flood_lookup_failed" } };
  }

  try {
    const floodZone = await deps.save(propertyId, principal, lookedUp);
    return { status: 200, body: { floodZone, cached: false } };
  } catch {
    return { status: 502, body: { error: "flood_save_failed" } };
  }
}
