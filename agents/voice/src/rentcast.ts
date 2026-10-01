/**
 * POST /api/rentcast/properties — server-side proxy for Rentcast property
 * lookups (year built, square footage) used by the Add Property wizard.
 *
 * The API key stays in the Worker (RENTCAST_API_KEY secret) and never reaches
 * the browser bundle (H-19). POST, not GET, so the address stays out of access
 * logs and referrer headers. Mirrors the route in the legacy Express server.
 */

export interface RentcastResult {
  status: number;
  body:   unknown;
}

const MAX_FIELD = 200;

export async function lookupRentcast(
  input: unknown,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<RentcastResult> {
  if (!apiKey) return { status: 503, body: { error: "Rentcast not configured" } };

  const { address, city, state, zipCode } = (input ?? {}) as Record<string, unknown>;
  const fields = { address, city, state, zipCode };
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && (typeof value !== "string" || value.length > MAX_FIELD)) {
      return { status: 400, body: { error: `${name} must be a string of at most ${MAX_FIELD} characters` } };
    }
  }
  if (!address) return { status: 400, body: { error: "address is required" } };

  const params = new URLSearchParams();
  params.set("address", address as string);
  if (city)    params.set("city",    city as string);
  if (state)   params.set("state",   state as string);
  if (zipCode) params.set("zipCode", zipCode as string);

  try {
    const upstream = await fetchImpl(`https://api.rentcast.io/v1/properties?${params}`, {
      headers: { "X-Api-Key": apiKey },
    });
    if (!upstream.ok) return { status: upstream.status, body: { error: "Rentcast lookup failed" } };
    return { status: 200, body: await upstream.json() };
  } catch {
    return { status: 502, body: { error: "Rentcast request failed" } };
  }
}
