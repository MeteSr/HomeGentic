/**
 * Property Lookup Service
 *
 * Fetches year built and square footage from the Rentcast API.
 * Free tier: 50 requests/month — https://rentcast.io
 *
 * Requires VITE_RENTCAST_API_KEY in .env.
 * Returns null (silently) when the key is absent or the lookup fails.
 */

const API_KEY = (import.meta as any).env?.VITE_RENTCAST_API_KEY as string | undefined;

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
  if (!API_KEY) return null;

  const params = new URLSearchParams({
    address: address,
    city:    city,
    state:   state,
    zipCode: zipCode,
    limit:   "1",
  });

  try {
    const res = await fetch(`https://api.rentcast.io/v1/properties?${params}`, {
      headers: { "X-Api-Key": API_KEY },
    });
    if (!res.ok) return null;

    const data = await res.json();
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
