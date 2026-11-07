/**
 * #718: the FEMA flood zone at the home's address. The voice Worker geocodes
 * the address the property canister holds and reads FEMA's National Flood
 * Hazard Layer at that point (agents/voice/src/floodZone.ts); the result is
 * saved on the property and reused for 30 days.
 *
 * Copy limits: say what FEMA's map shows and when, never that a home won't
 * flood, and no insurance requirements beyond FEMA's own descriptions. Link
 * the FEMA Map Service Center for the official map.
 *
 * E2E: window.__e2e_flood_zones = { [propertyId]: FloodZone } (read and look-up).
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import type * as PropertyTypes from "@homegentic/shared/types/property";
import { canisterError } from "./candid";
import { voiceAgentFetch } from "./voiceAgentHeaders";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const getActor = lazyActor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID);
const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";

export interface FloodZone {
  status: "Mapped" | "NotMapped";
  zone: string;
  zoneSubtype: string;
  specialFloodHazardArea: boolean;
  /** Feet, as FEMA gives it; "" when FEMA lists none. */
  baseFloodElevation: string;
  firmPanel: string;
  /** "YYYY-MM-DD" or "". */
  firmEffectiveDate: string;
  matchedAddress: string;
  latitude: string;
  longitude: string;
  /** When it was looked up (ms). */
  checkedAt: number;
}

function fromCanister(r: PropertyTypes.FloodZoneRecord): FloodZone {
  return {
    status: "Mapped" in r.status ? "Mapped" : "NotMapped",
    zone: r.zone,
    zoneSubtype: r.zoneSubtype,
    specialFloodHazardArea: r.specialFloodHazardArea,
    baseFloodElevation: r.baseFloodElevation,
    firmPanel: r.firmPanel,
    firmEffectiveDate: r.firmEffectiveDate,
    matchedAddress: r.matchedAddress,
    latitude: r.latitude,
    longitude: r.longitude,
    checkedAt: Math.floor(Number(r.checkedAt) / 1_000_000),
  };
}

function e2e(): Record<string, FloodZone> | undefined {
  return typeof window !== "undefined" ? (window as any).__e2e_flood_zones : undefined;
}

const LOOKUP_ERRORS: Record<string, string> = {
  address_not_found:
    "The Census Bureau's address search couldn't find this address, so FEMA's map can't be checked for it. Look it up on FEMA's map instead.",
  daily_flood_lookup_limit_reached: "You've reached today's flood zone lookups. Try again tomorrow.",
  flood_lookup_failed: "FEMA's map service didn't answer. Try again in a few minutes.",
  flood_save_failed: "FEMA answered but the result couldn't be saved. Try again in a few minutes.",
  not_authorized: "You don't have access to this home.",
};

export const floodZoneService = {
  /** The saved result, or null when the address hasn't been looked up. */
  async get(propertyId: string): Promise<FloodZone | null> {
    const s = e2e();
    if (s) return s[propertyId] ?? null;
    const res = await (await getActor()).getFloodZone(propertyId);
    if ("err" in res) throw canisterError(res.err);
    return res.ok.length ? fromCanister(res.ok[0]) : null;
  },

  /** Look the address up with FEMA (or get the saved result if it's under 30 days old). */
  async lookUp(propertyId: string, refresh = false): Promise<FloodZone> {
    const s = e2e();
    if (s) {
      if (!s[propertyId]) throw new Error(LOOKUP_ERRORS.address_not_found);
      return s[propertyId];
    }
    const res = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/risk/flood`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, refresh }),
    });
    const body = (await res.json().catch(() => ({}))) as { floodZone?: FloodZone; error?: string };
    if (!res.ok || !body.floodZone) {
      throw new Error(LOOKUP_ERRORS[body.error ?? ""] ?? "The flood zone lookup failed. Try again in a few minutes.");
    }
    return body.floodZone;
  },
};

/** FEMA's own description of the zone, in plain words. */
export function describeZone(z: FloodZone): string {
  if (z.status === "NotMapped") {
    return "FEMA's digital flood map shows no flood zone at this point. Some areas haven't been mapped digitally yet; check FEMA's map for a paper map.";
  }
  const zone = z.zone.toUpperCase();
  if (zone.startsWith("V")) {
    return "FEMA calls this a coastal high hazard area: a special flood hazard area (1% or more chance of flooding in any year) that also gets storm waves.";
  }
  if (z.specialFloodHazardArea || zone.startsWith("A")) {
    return 'FEMA calls this a special flood hazard area: land with a 1% or more chance of flooding in any year (the "100-year flood").';
  }
  if (zone === "D") {
    return "FEMA lists the flood hazard here as undetermined: possible, but not studied.";
  }
  return "FEMA's map shows a moderate-to-low risk zone, outside the special flood hazard area. FEMA notes that many flood claims come from outside high-risk areas.";
}

/** The FEMA Map Service Center search for an address. */
export function femaMapUrl(address: string): string {
  return `https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(address)}`;
}
