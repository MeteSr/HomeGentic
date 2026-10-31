/**
 * Street-address suggestions for the Add Property form. The voice Worker asks
 * Google Places (agents/voice/src/addressSuggest.ts), so the Google key never
 * reaches the browser and the page loads no Google script.
 *
 * Backoff: a 429 pauses suggestions for the Retry-After the Worker sends
 * (which doubles while a caller keeps hitting the limit); other failures
 * pause for 2 s, 4 s, 8 s … up to a minute. A 503 (not configured) turns
 * suggestions off until the page reloads. The field keeps working as a plain
 * text input in every case.
 *
 * E2E: window.__e2e_address_suggestions (AddressSuggestion[]) and
 * window.__e2e_address_place (AddressParts) replace the Worker.
 */
import { voiceAgentFetch } from "./voiceAgentHeaders";

const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";
const MAX_ERROR_PAUSE_MS = 60_000;

export interface AddressSuggestion {
  placeId: string;
  main: string; // "12 Elm St"
  secondary: string; // "Orlando, FL, USA"
}

export interface AddressParts {
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

let pausedUntil = 0;
let errorStreak = 0;
let disabled = false;

/** For tests: forget any pause or disable. */
export function resetAddressSuggestState(): void {
  pausedUntil = 0;
  errorStreak = 0;
  disabled = false;
}

/** A new token per typing session, so Google bills the session once. */
export function newAddressSessionToken(): string {
  return crypto.randomUUID();
}

function e2e<T>(key: string): T | undefined {
  return typeof window !== "undefined" ? ((window as any)[key] as T | undefined) : undefined;
}

async function post<T>(path: string, body: object): Promise<T | null> {
  if (disabled || Date.now() < pausedUntil) return null;
  let res: Response;
  try {
    res = await voiceAgentFetch(`${VOICE_AGENT_URL}${path}`, { method: "POST", body: JSON.stringify(body) });
  } catch {
    res = new Response(null, { status: 599 });
  }
  if (res.ok) {
    errorStreak = 0;
    return (await res.json()) as T;
  }
  if (res.status === 503 || res.status === 401) {
    disabled = true; // not configured, or signed out: stop asking
  } else if (res.status === 429) {
    const data = (await res.json().catch(() => ({}))) as { retryAfter?: number };
    const s = Number(res.headers.get("Retry-After") ?? data.retryAfter ?? 60);
    pausedUntil = Date.now() + (Number.isFinite(s) && s > 0 ? s : 60) * 1000;
  } else if (res.status !== 400 && res.status !== 404) {
    errorStreak++;
    pausedUntil = Date.now() + Math.min(MAX_ERROR_PAUSE_MS, 1000 * 2 ** errorStreak);
  }
  return null;
}

/** Up to 5 US street addresses for what's been typed; [] when paused or failing. */
export async function suggestAddresses(input: string, sessionToken: string): Promise<AddressSuggestion[]> {
  const mock = e2e<AddressSuggestion[]>("__e2e_address_suggestions");
  if (mock) return input.trim().length >= 3 ? mock : [];
  if (input.trim().length < 3) return [];
  const r = await post<{ suggestions: AddressSuggestion[] }>("/api/address/suggest", { input, sessionToken });
  return r?.suggestions ?? [];
}

/** The picked suggestion's street, city, state and ZIP; null when unavailable. */
export async function placeAddress(placeId: string, sessionToken: string): Promise<AddressParts | null> {
  const mock = e2e<AddressParts>("__e2e_address_place");
  if (mock) return mock;
  return post<AddressParts>("/api/address/place", { placeId, sessionToken });
}
