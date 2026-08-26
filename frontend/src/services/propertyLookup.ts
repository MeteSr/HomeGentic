/**
 * Property Lookup Service
 *
 * Fetches year built and square footage via the voice agent's Rentcast proxy.
 * Free tier: 50 requests/month — https://rentcast.io
 *
 * Rentcast API key is held server-side in the voice agent (not VITE_RENTCAST_API_KEY which would be exposed in the browser bundle)
 * Returns null (silently) when the lookup fails.
 */

// Rentcast API key is held server-side in the voice agent (not VITE_RENTCAST_API_KEY which would be exposed in the browser bundle)
const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";

export interface PropertyLookupResult {
  yearBuilt?:     number;
  squareFootage?: number;
}

export async function lookupPropertyDetails(
  address:  string,
  city:     string,
  state:    string,
  zipCode:  string,
): Promise<PropertyLookupResult | null> {
  try {
    // POST so address data stays out of server access logs and referrer headers
    const resp = await fetch(`${VOICE_AGENT_URL}/api/rentcast/properties`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key":    (import.meta as any).env?.VITE_VOICE_AGENT_API_KEY ?? "",
      },
      body: JSON.stringify({ address, city, state, zipCode }),
    });
    if (!resp.ok) return null;

    const data = await resp.json();
    const prop = Array.isArray(data) ? data[0] : null;
    if (!prop) return null;

    return {
      yearBuilt:     prop.yearBuilt     ?? undefined,
      squareFootage: prop.squareFootage ?? undefined,
    };
  } catch {
    return null;
  }
}
