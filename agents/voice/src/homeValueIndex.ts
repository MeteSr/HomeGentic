/**
 * POST /api/home-value-index — the FHFA House Price Index series for one
 * state, for the app's index-based home value (packages/shared/src/homeValueIndex.ts).
 *
 * FHFA publishes the state file quarterly as free public data. It is fetched
 * at most once a week and cached in KV for every caller. Session required (the
 * route is in OFFCHAIN_OUTCALL_ROUTES).
 */
import { parseStateHpiCsv, HPI_SOURCE, type HpiPoint } from "../../../packages/shared/src/homeValueIndex";

export const FHFA_STATE_HPI_URL = "https://www.fhfa.gov/hpi/download/quarterly_datasets/hpi_at_state.csv";
export const HPI_CACHE_TTL_S = 7 * 86_400;
const CACHE_KEY = "fhfa:hpi:state:v1";
const MAX_UPSTREAM_BYTES = 8 * 1024 * 1024;

interface HpiEnv {
  RATE_LIMIT: KVNamespace;
  /** Optional: where FHFA's state file lives, if it moves. */
  HPI_STATE_CSV_URL?: string;
}

async function stateFile(env: HpiEnv, fetchImpl: typeof fetch): Promise<Record<string, HpiPoint[]>> {
  const cached = await env.RATE_LIMIT.get(CACHE_KEY);
  if (cached) return JSON.parse(cached);
  const resp = await fetchImpl(env.HPI_STATE_CSV_URL || FHFA_STATE_HPI_URL, { headers: { Accept: "text/csv" } });
  if (!resp.ok) throw new Error(`FHFA ${resp.status}`);
  const text = await resp.text();
  if (text.length > MAX_UPSTREAM_BYTES) throw new Error("FHFA file too large");
  const byState = parseStateHpiCsv(text);
  if (Object.keys(byState).length === 0) throw new Error("FHFA file unreadable");
  await env.RATE_LIMIT.put(CACHE_KEY, JSON.stringify(byState), { expirationTtl: HPI_CACHE_TTL_S });
  return byState;
}

export async function hpiForState(
  input: unknown,
  env: HpiEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; body: unknown }> {
  const raw = (input as { state?: unknown } | null)?.state;
  const state = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(state)) return { status: 400, body: { error: "state must be a two-letter code" } };
  let byState: Record<string, HpiPoint[]>;
  try {
    byState = await stateFile(env, fetchImpl);
  } catch {
    return { status: 502, body: { error: "Home price index lookup failed" } };
  }
  const series = byState[state];
  if (!series?.length) return { status: 404, body: { error: "no_index_for_state" } };
  return { status: 200, body: { state, series, source: HPI_SOURCE } };
}
