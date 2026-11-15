/**
 * POST /api/recalls — CPSC recall check for the appliances a homeowner has
 * registered (fixtures with a brand and model).
 *
 * Every recall naming each brand is fetched from CPSC (cached in KV for a
 * day, shared by all callers) and matched with packages/shared/src/recalls.ts,
 * which explains the matching rule and why a match is only a possible recall.
 *
 * Session required (the route is in OFFCHAIN_OUTCALL_ROUTES).
 */

import {
  CPSC_RECALL_URL, toRecall, recallMatches, type Recall, type RecallItem, type RecallMatch,
} from "../../../packages/shared/src/recalls";

export { CPSC_RECALL_URL, toRecall, recallMatches };
export type { Recall, RecallItem, RecallMatch };

export const RECALL_CACHE_TTL_S = 86_400;
export const MAX_ITEMS  = 50;
export const MAX_BRANDS = 10;
const MAX_UPSTREAM_BYTES = 8 * 1024 * 1024;

interface RecallEnv { RATE_LIMIT: KVNamespace }

const s = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Every recall naming this brand, from KV or CPSC. Throws on upstream failure. */
export async function recallsForBrand(brand: string, env: RecallEnv, fetchImpl: typeof fetch = fetch): Promise<Recall[]> {
  const key = `cpsc:mfr:${brand.toLowerCase()}`;
  const cached = await env.RATE_LIMIT.get(key);
  if (cached) return JSON.parse(cached);
  const resp = await fetchImpl(`${CPSC_RECALL_URL}?${new URLSearchParams({ format: "json", Manufacturer: brand })}`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`CPSC ${resp.status}`);
  const body = await resp.text();
  if (body.length > MAX_UPSTREAM_BYTES) throw new Error("CPSC response too large");
  const data = JSON.parse(body);
  const recalls = (Array.isArray(data) ? data : []).map(toRecall);
  await env.RATE_LIMIT.put(key, JSON.stringify(recalls), { expirationTtl: RECALL_CACHE_TTL_S });
  return recalls;
}

export function readItems(input: unknown): RecallItem[] | string {
  const items = (input as any)?.items;
  if (!Array.isArray(items)) return "items must be an array";
  if (items.length > MAX_ITEMS) return `at most ${MAX_ITEMS} items`;
  const out: RecallItem[] = [];
  for (const it of items) {
    const brand = s(it?.brand, 80);
    const model = s(it?.model, 80);
    if (brand && model) out.push({ brand, model });
  }
  return out;
}

export async function findRecalls(
  input: unknown,
  env: RecallEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; body: unknown }> {
  const items = readItems(input);
  if (typeof items === "string") return { status: 400, body: { error: items } };

  const brands = [...new Set(items.map((i) => i.brand.toLowerCase()))];
  if (brands.length > MAX_BRANDS) return { status: 400, body: { error: `at most ${MAX_BRANDS} brands` } };

  const byBrand = new Map<string, Recall[]>();
  try {
    await Promise.all(brands.map(async (b) => {
      byBrand.set(b, await recallsForBrand(b, env, fetchImpl));
    }));
  } catch {
    return { status: 502, body: { error: "Recall lookup failed" } };
  }

  const matches: RecallMatch[] = [];
  for (const it of items) {
    const hits = (byBrand.get(it.brand.toLowerCase()) ?? []).filter((r) => recallMatches(r, it.model));
    if (hits.length) {
      matches.push({ brand: it.brand, model: it.model, recalls: hits.map(({ models: _m, text: _t, ...r }) => r) });
    }
  }
  return { status: 200, body: { matches, checkedAt: new Date().toISOString() } };
}
