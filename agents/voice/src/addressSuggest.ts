/**
 * Street-address suggestions for the Add Property form, from Google Places
 * API (New). The key (GOOGLE_PLACES_API_KEY) stays a Worker secret, so the
 * browser never loads Google's script and the key can't be lifted from it.
 *
 *   POST /api/address/suggest  { input, sessionToken }   → { suggestions: [{ placeId, main, secondary }] }
 *   POST /api/address/place    { placeId, sessionToken } → { address, city, state, zipCode }
 *
 * Both are paid per call, so every request needs a session (index.ts) and is
 * metered here, per user and against a global daily budget. A user who keeps
 * hitting the per-minute limit is locked out for 1, 2, 4 … 60 minutes
 * (exponential backoff), and the client backs off the same way on a 429.
 * The sessionToken groups one person's typing and the final pick into one
 * Google billing session.
 *
 * TODO: add the shared human check (Turnstile) here once it lands for the
 * Worker's other paid routes.
 */

import { hitCounter, peekCounter, type KVEnv } from "./rateLimiter";

export interface AddressEnv extends Partial<KVEnv> {
  GOOGLE_PLACES_API_KEY?: string;
  ADDRESS_DAILY_BUDGET?: string;
}

export interface AddressResult {
  status: number;
  body: unknown;
  retryAfter?: number;
}

export const SUGGEST_PER_USER_MINUTE = 40;
export const SUGGEST_PER_USER_DAY = 300;
export const PLACE_PER_USER_DAY = 50;
export const MAX_LOCKOUT_S = 3_600;
const DEFAULT_DAILY_BUDGET = 5_000;
const MAX_INPUT = 200;
const MIN_INPUT = 3;
const MAX_UPSTREAM_BYTES = 64 * 1024;
const TOKEN_RE = /^[A-Za-z0-9-]{8,64}$/;
const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;

const day = () => new Date().toISOString().slice(0, 10);

function budget(v: string | undefined): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_BUDGET;
}

function limited(error: string, retryAfter: number): AddressResult {
  return { status: 429, body: { error, retryAfter }, retryAfter };
}

/**
 * Per-minute limit with exponential lockout. Returns a 429 result when the
 * caller is locked out or has just gone over the minute limit.
 */
async function throttle(env: AddressEnv, principal: string): Promise<AddressResult | null> {
  const lockKey = `addr:lock:${principal}`;
  if ((await peekCounter(env, lockKey)) > 0) return limited("address_lookup_backoff", 60);
  const minute = Math.floor(Date.now() / 60_000);
  const hit = await hitCounter(env, `addr:min:${principal}:${minute}`, SUGGEST_PER_USER_MINUTE, 120);
  if (hit.allowed) return null;
  const strikes = (await hitCounter(env, `addr:strikes:${principal}`, Number.MAX_SAFE_INTEGER, 6 * 3_600)).count;
  const lockout = Math.min(MAX_LOCKOUT_S, 60 * 2 ** Math.max(0, strikes - 1));
  await hitCounter(env, lockKey, 1, lockout);
  return limited("address_lookup_backoff", lockout);
}

/** Consume the per-user daily slot, then the global budget (in that order). */
async function spend(env: AddressEnv, userKey: string, userLimit: number): Promise<boolean> {
  if (!(await hitCounter(env, userKey, userLimit, 2 * 86_400)).allowed) return false;
  return (await hitCounter(env, `addr:global:${day()}`, budget(env.ADDRESS_DAILY_BUDGET), 2 * 86_400)).allowed;
}

async function readUpstream(resp: Response): Promise<any> {
  const text = await resp.text();
  if (text.length > MAX_UPSTREAM_BYTES) throw new Error("upstream response too large");
  return JSON.parse(text);
}

function readToken(v: unknown): string | undefined {
  return typeof v === "string" && TOKEN_RE.test(v) ? v : undefined;
}

export async function suggestAddresses(
  input: unknown,
  principal: string,
  env: AddressEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<AddressResult> {
  if (!env.GOOGLE_PLACES_API_KEY) return { status: 503, body: { error: "Address suggestions not configured" } };
  const b = (input ?? {}) as Record<string, unknown>;
  const text = typeof b.input === "string" ? b.input.trim() : "";
  if (text.length > MAX_INPUT) return { status: 400, body: { error: "input too long" } };
  if (text.length < MIN_INPUT) return { status: 200, body: { suggestions: [] } };

  const throttled = await throttle(env, principal);
  if (throttled) return throttled;
  if (!(await spend(env, `addr:suggest:${principal}:${day()}`, SUGGEST_PER_USER_DAY))) {
    return limited("daily_address_limit_reached", 3_600);
  }

  const sessionToken = readToken(b.sessionToken);
  try {
    const resp = await fetchImpl("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify({
        input: text,
        includedRegionCodes: ["us"],
        includedPrimaryTypes: ["street_address", "premise", "subpremise"],
        ...(sessionToken ? { sessionToken } : {}),
      }),
    });
    if (!resp.ok) return { status: 502, body: { error: "Address suggestions failed" } };
    const data = await readUpstream(resp);
    const suggestions = (Array.isArray(data?.suggestions) ? data.suggestions : [])
      .map((s: any) => s?.placePrediction)
      .filter((p: any) => p && typeof p.placeId === "string")
      .slice(0, 5)
      .map((p: any) => ({
        placeId: p.placeId as string,
        main: String(p.structuredFormat?.mainText?.text ?? ""),
        secondary: String(p.structuredFormat?.secondaryText?.text ?? ""),
      }));
    return { status: 200, body: { suggestions } };
  } catch {
    return { status: 502, body: { error: "Address suggestions failed" } };
  }
}

export interface ParsedAddress {
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

/** Places API (New) addressComponents → the four fields the form uses. */
export function parseAddressComponents(components: unknown): ParsedAddress {
  const list = Array.isArray(components) ? components : [];
  const get = (type: string, short = false): string => {
    const c = list.find((x: any) => Array.isArray(x?.types) && x.types.includes(type));
    return c ? String(short ? (c.shortText ?? "") : (c.longText ?? "")) : "";
  };
  const street = [get("street_number"), get("route", true) || get("route")].filter(Boolean).join(" ");
  const unit = get("subpremise");
  return {
    address: unit ? `${street} #${unit}` : street,
    city: get("locality") || get("postal_town") || get("sublocality") || get("neighborhood"),
    state: get("administrative_area_level_1", true),
    zipCode: get("postal_code"),
  };
}

export async function placeAddress(
  input: unknown,
  principal: string,
  env: AddressEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<AddressResult> {
  if (!env.GOOGLE_PLACES_API_KEY) return { status: 503, body: { error: "Address suggestions not configured" } };
  const b = (input ?? {}) as Record<string, unknown>;
  const placeId = typeof b.placeId === "string" ? b.placeId : "";
  if (!PLACE_ID_RE.test(placeId)) return { status: 400, body: { error: "invalid placeId" } };

  const throttled = await throttle(env, principal);
  if (throttled) return throttled;
  if (!(await spend(env, `addr:place:${principal}:${day()}`, PLACE_PER_USER_DAY))) {
    return limited("daily_address_limit_reached", 3_600);
  }

  const sessionToken = readToken(b.sessionToken);
  const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  try {
    const resp = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${qs}`, {
      headers: { "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": "addressComponents" },
    });
    if (!resp.ok) return { status: resp.status === 404 ? 404 : 502, body: { error: "Address lookup failed" } };
    const data = await readUpstream(resp);
    return { status: 200, body: parseAddressComponents(data?.addressComponents) };
  } catch {
    return { status: 502, body: { error: "Address lookup failed" } };
  }
}
