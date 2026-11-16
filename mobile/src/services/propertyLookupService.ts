/**
 * Address suggestions (Google Places) and the home's public record (ATTOM)
 * for the add-home form, through the voice Worker as on the web
 * (frontend/src/services/addressSuggest.ts and aiProxy.lookupPropertyDetails),
 * so no Google or ATTOM key is in the app. Every failure returns nothing and
 * the form stays plain fields. A 503 or 401 (not set up, signed out) stops
 * suggestions until the next launch; a 429 pauses them for a minute.
 */
import { SESSION_HEADER } from "@homegentic/shared/agentSession";
import { getAgentSessionToken } from "./agentSession";
import type { NewPropertyType } from "./onboardingForm";

const VOICE_AGENT_URL = process.env.EXPO_PUBLIC_VOICE_AGENT_URL ?? "http://localhost:8787";

export interface AddressSuggestion {
  placeId: string;
  main: string;
  secondary: string;
}
export interface AddressParts {
  address: string;
  city: string;
  state: string;
  zipCode: string;
}
export interface PropertyDetails {
  yearBuilt: number | null;
  squareFeet: number | null;
  propertyType: NewPropertyType | null;
}

let disabled = false;
let pausedUntil = 0;

/** For tests: forget a stop or pause. */
export function resetAddressLookup(): void {
  disabled = false;
  pausedUntil = 0;
}

/** A new token per typing session, so Google bills the session once. */
export function newAddressSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function post(path: string, body: object): Promise<Response | null> {
  try {
    const token = await getAgentSessionToken();
    return await fetch(`${VOICE_AGENT_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { [SESSION_HEADER]: token } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

async function addressPost<T>(path: string, body: object): Promise<T | null> {
  if (disabled || Date.now() < pausedUntil) return null;
  const res = await post(path, body);
  if (!res) return null;
  if (res.ok) return (await res.json()) as T;
  if (res.status === 503 || res.status === 401) disabled = true;
  else if (res.status === 429) pausedUntil = Date.now() + 60_000;
  return null;
}

/** Up to 5 US street addresses for what's been typed (3+ characters); [] otherwise. */
export async function suggestAddresses(input: string, sessionToken: string): Promise<AddressSuggestion[]> {
  if (input.trim().length < 3) return [];
  const r = await addressPost<{ suggestions?: AddressSuggestion[] }>("/api/address/suggest", { input, sessionToken });
  return r?.suggestions ?? [];
}

/** The picked suggestion's street, city, state and ZIP; null when unavailable. */
export function placeAddress(placeId: string, sessionToken: string): Promise<AddressParts | null> {
  return addressPost<AddressParts>("/api/address/place", { placeId, sessionToken });
}

const TYPE_MAP: Record<string, NewPropertyType> = {
  SFR: "SingleFamily",
  "SINGLE FAMILY": "SingleFamily",
  CONDO: "Condo",
  CONDOMINIUM: "Condo",
  TOWNHOUSE: "Townhouse",
  TOWNHOME: "Townhouse",
  MFR: "MultiFamily",
  "MULTI FAMILY": "MultiFamily",
};

/** Year built, size and type from the home's public record; null when there's none or it can't be read. */
export async function lookupPropertyDetails(a: AddressParts): Promise<PropertyDetails | null> {
  const res = await post("/api/property/details", { address: a.address, city: a.city, state: a.state, zip: a.zipCode });
  if (!res || !res.ok) return null;
  const data: any = await res.json().catch(() => null);
  const prop = data?.property?.[0];
  if (!prop) return null;
  const year = prop?.building?.summary?.yearbuilt ?? prop?.summary?.yearbuilt;
  const size = prop?.building?.size?.universalsize ?? prop?.building?.size?.grosssize;
  const rawType = prop?.summary?.proptype;
  return {
    yearBuilt: typeof year === "number" ? year : null,
    squareFeet: typeof size === "number" ? size : null,
    propertyType: rawType ? (TYPE_MAP[String(rawType).toUpperCase()] ?? null) : null,
  };
}
