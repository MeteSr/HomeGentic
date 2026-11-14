/**
 * §17.1 — Pre-quote price benchmarking by zip code
 *
 * 17.1.1 — Local: verified local costs from the job canister
 *          (getVerifiedLocalCosts): finished jobs signed by the homeowner and
 *          a HomeGentic-verified contractor at homes whose owners share their
 *          costs, needing 5+ homes and 3+ contractors in the ZIP or its first
 *          three digits. National: the ai_proxy canister's fixed U.S. ranges,
 *          used when an area has too few sharing homes.
 * 17.1.2 — getPriceBenchmark → used by the get_price_benchmark agent tool.
 * 17.1.5 — hasSufficientSamples: hide local figures built on fewer than 5 homes.
 */

import { aiProxyService } from "./aiProxy";
import { lazyActor } from "./lazyActor";
import { idlFactory as jobIdl } from "@homegentic/shared/declarations/job";
import type { _SERVICE as JobCanister } from "@homegentic/shared/types/job";

const JOB_CANISTER_ID = (process.env as any).JOB_CANISTER_ID || "";
const getJobActor = lazyActor<JobCanister>(jobIdl, JOB_CANISTER_ID);

export interface PriceBenchmarkResult {
  serviceType:  string;
  zipCode:      string;
  /** Low estimate in cents */
  low:          number;
  /** Median estimate in cents */
  median:       number;
  /** High estimate in cents */
  high:         number;
  /** "local" = verified costs shared by homes in `area`; "national" = fixed U.S. range */
  source:       "local" | "national";
  /** Homes behind a local range, rounded down to a multiple of 5; 0 for a national range */
  sampleSize:   number;
  /** Local only: the ZIP or ZIP prefix ("327xx") the homes are in */
  area?:        string;
}

async function getLocalBenchmark(serviceType: string, zipCode: string): Promise<PriceBenchmarkResult | null> {
  if (!JOB_CANISTER_ID) return null;
  try {
    const a = await getJobActor();
    const s = (await a.getVerifiedLocalCosts(serviceType, zipCode))[0];
    if (!s) return null;
    return {
      serviceType, zipCode, source: "local",
      low: Number(s.low), median: Number(s.median), high: Number(s.high),
      sampleSize: Number(s.homes), area: s.area,
    };
  } catch {
    return null;
  }
}

/** Verified local costs when the area has enough sharing homes, else the national range. Null on any error. */
export async function getPriceBenchmark(
  serviceType: string,
  zipCode: string
): Promise<PriceBenchmarkResult | null> {
  if (!serviceType || !zipCode) return null;
  const local = await getLocalBenchmark(serviceType, zipCode);
  if (local) return local;
  try {
    const json = await aiProxyService.getPriceBenchmark(serviceType, zipCode);
    if (!json) return null;
    const n = JSON.parse(json);
    return {
      serviceType, zipCode, source: "national", sampleSize: 0,
      low: Number(n.low), median: Number(n.median), high: Number(n.high),
    };
  } catch {
    return null;
  }
}

/** §17.1.5 — confidence gate: national ranges always show; local ones need 5+ homes */
export function hasSufficientSamples(result: PriceBenchmarkResult | null): boolean {
  if (!result) return false;
  return result.source === "national" || result.sampleSize >= 5;
}

/** One line saying where a range comes from, for every surface that shows one. */
export function benchmarkBasis(result: PriceBenchmarkResult): string {
  return result.source === "local"
    ? `From finished jobs at ${result.sampleSize}+ homes in ${result.area ?? result.zipCode} in the last 2 years, each signed off by the homeowner and a HomeGentic-verified contractor. Owners chose to share them; prices are rounded.`
    : "Typical U.S. range, not local prices. Prices in your area may differ.";
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
