/**
 * §17.1 — Pre-quote price benchmarking by zip code
 *
 * 17.1.1 — Seed data aggregated from closed HomeGentic bids + Homewyse/RSMeans baseline.
 *           Real-time data served by the relay at GET /api/price-benchmark.
 * 17.1.2 — getPriceBenchmark → used by the get_price_benchmark agent tool.
 * 17.1.5 — hasSufficientSamples: hide widget when sampleSize < 5.
 */

const RELAY_BASE =
  typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_VOICE_AGENT_URL
    ? (import.meta as any).env.VITE_VOICE_AGENT_URL
    : "http://localhost:3001";

export interface PriceBenchmarkResult {
  serviceType:  string;
  zipCode:      string;
  /** Low estimate in cents */
  low:          number;
  /** Median estimate in cents */
  median:       number;
  /** High estimate in cents */
  high:         number;
  /** Number of closed bids used to compute the range */
  sampleSize:   number;
  /** "YYYY-MM" string representing freshness */
  lastUpdated:  string;
}

/** Fetch benchmark data from the relay. Returns null on any error or missing data. */
export async function getPriceBenchmark(
  serviceType: string,
  zipCode: string
): Promise<PriceBenchmarkResult | null> {
  if (!serviceType || !zipCode) return null;

  try {
    const params = new URLSearchParams({ service: serviceType, zip: zipCode });
    const res = await fetch(`${RELAY_BASE}/api/price-benchmark?${params}`);
    if (!res.ok) return null;
    return await res.json() as PriceBenchmarkResult;
  } catch {
    return null;
  }
}

/** §17.1.5 — confidence gate: only show widget when sample is large enough */
export function hasSufficientSamples(result: PriceBenchmarkResult | null): boolean {
  return result !== null && result.sampleSize >= 5;
}

/** Format low–high range as "$X,XXX–$Y,YYY" (dollars, rounded) */
export function formatBenchmarkRange(result: PriceBenchmarkResult): string {
  const fmt = (cents: number) =>
    "$" + Math.round(cents / 100).toLocaleString("en-US");
  return `${fmt(result.low)}–${fmt(result.high)}`;
}

/** Build a shareable /prices?service=...&zip=... URL */
export function buildPriceLookupUrl(serviceType: string, zipCode: string): string {
  const params = new URLSearchParams({ service: serviceType, zip: zipCode });
  return `/prices?${params}`;
}
