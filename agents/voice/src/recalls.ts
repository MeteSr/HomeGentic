/**
 * POST /api/recalls — CPSC recall check for the appliances a homeowner has
 * registered (fixtures with a brand and model).
 *
 * The CPSC Recalls API (saferproducts.gov/RestWebServices/Recall) has no
 * reliable model-number search, so we ask it for every recall naming the
 * brand as manufacturer (cached in KV for a day, shared by all callers) and
 * match the model here. A match means the model number appears in the recall
 * text, or a model number the recall lists is a prefix of it (recalls often
 * name a model family, e.g. "XE50T"). That can be wrong both ways, so the app
 * shows matches as "possible recall, check the model on the CPSC page", never
 * as confirmed. No model number → no match: a brand alone is too broad.
 *
 * Session required (the route is in OFFCHAIN_OUTCALL_ROUTES).
 */

export const CPSC_RECALL_URL = "https://www.saferproducts.gov/RestWebServices/Recall";
export const RECALL_CACHE_TTL_S = 86_400;
export const MAX_ITEMS  = 50;
export const MAX_BRANDS = 10;
const MAX_UPSTREAM_BYTES = 8 * 1024 * 1024;
/** Shorter model numbers match too much text to mean anything. */
const MIN_MODEL_CHARS = 4;
/** Shortest recall-listed model we treat as a family prefix. */
const MIN_PREFIX_CHARS = 5;

export interface RecallItem { brand: string; model: string }

/** The fields we keep from a CPSC recall (and cache). */
export interface Recall {
  id:      string;
  number:  string;
  date:    string;   // YYYY-MM-DD
  title:   string;
  url:     string;
  hazard:  string;
  remedy:  string;
  /** Model numbers and product text, uppercased alphanumerics, for matching. */
  models:  string[];
  text:    string;
}

export interface RecallMatch {
  brand:   string;
  model:   string;
  recalls: Array<Omit<Recall, "models" | "text">>;
}

interface RecallEnv { RATE_LIMIT: KVNamespace }

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const s = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const names = (v: unknown) =>
  Array.isArray(v) ? v.map((x) => s((x as any)?.Name)).filter(Boolean).join("; ") : "";

/** One CPSC API record → the fields we keep. Tolerates missing fields. */
export function toRecall(r: any): Recall {
  const products: any[] = Array.isArray(r?.Products) ? r.Products : [];
  const models = products
    .flatMap((p) => s(p?.Model, 2000).split(/[,;/\n]| and | or /i))
    .map(norm)
    .filter((m) => m.length >= MIN_MODEL_CHARS);
  const text = norm([
    s(r?.Title), s(r?.Description, 4000),
    ...products.flatMap((p) => [s(p?.Name), s(p?.Description, 2000), s(p?.Model, 2000)]),
  ].join(" "));
  return {
    id:     String(r?.RecallID ?? ""),
    number: s(r?.RecallNumber, 40),
    date:   s(r?.RecallDate, 10),
    title:  s(r?.Title, 300),
    url:    /^https:\/\/(www\.)?cpsc\.gov\//.test(s(r?.URL)) ? s(r?.URL) : "",
    hazard: names(r?.Hazards),
    remedy: names(r?.Remedies),
    models,
    text,
  };
}

/** Does this recall name this model? See the file comment for the rule. */
export function recallMatches(recall: Recall, model: string): boolean {
  const m = norm(model);
  if (m.length < MIN_MODEL_CHARS) return false;
  if (recall.text.includes(m)) return true;
  return recall.models.some((rm) => rm.length >= MIN_PREFIX_CHARS && m.startsWith(rm));
}

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
