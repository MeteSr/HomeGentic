/**
 * CPSC recall records and model matching, shared by the voice Worker
 * (POST /api/recalls, for the dashboard) and the notification relay (the
 * weekly Home Pulse recall alert).
 *
 * The CPSC Recalls API (saferproducts.gov/RestWebServices/Recall) has no
 * reliable model-number search, so callers fetch every recall naming the brand
 * as manufacturer and match the model here. A match means the model number
 * appears in the recall text, or a model number the recall lists is a prefix
 * of it (recalls often name a model family, e.g. "XE50T"). That can be wrong
 * both ways, so a match is always shown as "possible recall, check the model
 * on the CPSC page", never as confirmed. No model number → no match.
 */

export const CPSC_RECALL_URL = "https://www.saferproducts.gov/RestWebServices/Recall";
/** Shorter model numbers match too much text to mean anything. */
const MIN_MODEL_CHARS = 4;
/** Shortest recall-listed model we treat as a family prefix. */
const MIN_PREFIX_CHARS = 5;

export interface RecallItem {
  brand: string;
  model: string;
}

/** The fields we keep from a CPSC recall (and cache). */
export interface Recall {
  id: string;
  number: string;
  date: string; // YYYY-MM-DD
  title: string;
  url: string;
  hazard: string;
  remedy: string;
  /** Model numbers and product text, uppercased alphanumerics, for matching. */
  models: string[];
  text: string;
}

export interface RecallMatch {
  brand: string;
  model: string;
  recalls: Array<Omit<Recall, "models" | "text">>;
}

export const normModel = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const s = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const names = (v: unknown) =>
  Array.isArray(v)
    ? v
        .map((x) => s((x as any)?.Name))
        .filter(Boolean)
        .join("; ")
    : "";

/** One CPSC API record → the fields we keep. Tolerates missing fields. */
export function toRecall(r: any): Recall {
  const products: any[] = Array.isArray(r?.Products) ? r.Products : [];
  const models = products
    .flatMap((p) => s(p?.Model, 2000).split(/[,;/\n]| and | or /i))
    .map(normModel)
    .filter((m) => m.length >= MIN_MODEL_CHARS);
  const text = normModel(
    [
      s(r?.Title),
      s(r?.Description, 4000),
      ...products.flatMap((p) => [s(p?.Name), s(p?.Description, 2000), s(p?.Model, 2000)]),
    ].join(" "),
  );
  return {
    id: String(r?.RecallID ?? ""),
    number: s(r?.RecallNumber, 40),
    date: s(r?.RecallDate, 10),
    title: s(r?.Title, 300),
    url: /^https:\/\/(www\.)?cpsc\.gov\//.test(s(r?.URL)) ? s(r?.URL) : "",
    hazard: names(r?.Hazards),
    remedy: names(r?.Remedies),
    models,
    text,
  };
}

/** Does this recall name this model? See the file comment for the rule. */
export function recallMatches(recall: Recall, model: string): boolean {
  const m = normModel(model);
  if (m.length < MIN_MODEL_CHARS) return false;
  if (recall.text.includes(m)) return true;
  return recall.models.some((rm) => rm.length >= MIN_PREFIX_CHARS && m.startsWith(rm));
}
