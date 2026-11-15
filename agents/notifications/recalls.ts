/**
 * Recall alerts for the weekly run (pulse.ts). Each week the relay reads the
 * appliances saved on an owner's homes (property.getPulseAppliances), checks
 * them against CPSC recalls with the shared matcher
 * (packages/shared/src/recalls.ts), and tells the owner about each possible
 * recall once: as a RECALL item in the Home Pulse email and, with the
 * product_recall push setting on, by push. Owners who turned the weekly email
 * off still get the push.
 *
 * A match is only a possible recall (the matcher explains why), so the copy
 * always says "may cover" and asks the owner to compare the model number on
 * the CPSC notice.
 *
 * What each owner has been told is saved (persist section "recallAlerts") as
 * owner|home|model|recall id, and only after the email or push went out.
 */
import { CPSC_RECALL_URL, normModel, recallMatches, toRecall, type Recall } from "../../packages/shared/src/recalls";
import { loadSection, saveSection } from "./persist";
import type { PulseAppliance, PushPayload } from "./types";
import type { PulseItem } from "./pulse";

const DAY_MS = 86_400_000;
const MAX_UPSTREAM_BYTES = 8 * 1024 * 1024;
/** Kept at most; the oldest are dropped first (an owner might hear about one again). */
const MAX_NOTIFIED = 50_000;
/** Brands checked per owner per week. */
const MAX_BRANDS = 20;
const CPSC_RECALLS_PAGE = "https://www.cpsc.gov/Recalls";

export type ApplianceRecall = PulseAppliance & { recall: Omit<Recall, "models" | "text"> };

/** CPSC recalls naming a brand, cached in memory for a day per brand. Throws on failure (not cached). */
export function brandRecallFetcher(fetchImpl: typeof fetch = fetch, now: () => number = Date.now) {
  const cache = new Map<string, { at: number; recalls: Recall[] }>();
  return async (brand: string): Promise<Recall[]> => {
    const key = brand.trim().toLowerCase();
    const hit = cache.get(key);
    if (hit && now() - hit.at < DAY_MS) return hit.recalls;
    const resp = await fetchImpl(
      `${CPSC_RECALL_URL}?${new URLSearchParams({ format: "json", Manufacturer: brand.trim() })}`,
      {
        headers: { Accept: "application/json" },
      },
    );
    if (!resp.ok) throw new Error(`CPSC ${resp.status}`);
    const body = await resp.text();
    if (body.length > MAX_UPSTREAM_BYTES) throw new Error("CPSC response too large");
    const data = JSON.parse(body);
    const recalls = (Array.isArray(data) ? data : []).map(toRecall);
    cache.set(key, { at: now(), recalls });
    return recalls;
  };
}

let notified: string[] = loadSection<string[]>("recallAlerts", []);
let notifiedSet = new Set(notified);

const keyOf = (owner: string, m: ApplianceRecall) => `${owner}|${m.propertyId}|${normModel(m.model)}|${m.recall.id}`;

/** Possible recalls on `owner`'s appliances that they haven't been told about. A failed brand is skipped. */
export async function newRecallMatches(
  owner: string,
  appliances: PulseAppliance[],
  forBrand: (brand: string) => Promise<Recall[]>,
): Promise<ApplianceRecall[]> {
  const brands = [...new Set(appliances.map((a) => a.brand.trim().toLowerCase()))].slice(0, MAX_BRANDS);
  const byBrand = new Map<string, Recall[]>();
  for (const b of brands) {
    const original = appliances.find((a) => a.brand.trim().toLowerCase() === b)!.brand;
    try {
      byBrand.set(b, await forBrand(original));
    } catch (err) {
      console.warn(`[recalls] ${original}: lookup failed:`, err instanceof Error ? err.message : err);
    }
  }
  const out: ApplianceRecall[] = [];
  for (const a of appliances) {
    for (const r of byBrand.get(a.brand.trim().toLowerCase()) ?? []) {
      if (!recallMatches(r, a.model)) continue;
      const { models: _m, text: _t, ...recall } = r;
      const m = { ...a, recall };
      if (!notifiedSet.has(keyOf(owner, m))) out.push(m);
    }
  }
  return out;
}

/** Remember that `owner` was told about these. */
export function markRecallsNotified(owner: string, matches: ApplianceRecall[]): void {
  const fresh = matches.map((m) => keyOf(owner, m)).filter((k) => !notifiedSet.has(k));
  if (fresh.length === 0) return;
  notified = [...notified, ...fresh].slice(-MAX_NOTIFIED);
  notifiedSet = new Set(notified);
  saveSection("recallAlerts", notified);
}

/** Test hook. */
export function resetRecallAlerts(): void {
  notified = [];
  notifiedSet = new Set();
  saveSection("recallAlerts", notified);
}

export function recallItem(m: ApplianceRecall): PulseItem {
  const what = m.recall.title || "a CPSC recall";
  const hazard = m.recall.hazard ? ` Hazard: ${m.recall.hazard}` : "";
  return {
    tag: "RECALL",
    title: `Possible recall: ${m.brand} ${m.model}${m.room ? ` (${m.room})` : ""}`,
    body: `"${what}" may cover the ${m.brand} you saved with model ${m.model}.${hazard} Compare the model number on the notice with the label on your appliance; if it matches, the notice says what to do.`,
    link: { label: "CPSC recall notice", url: m.recall.url || CPSC_RECALLS_PAGE },
  };
}

export function recallPush(matches: ApplianceRecall[]): PushPayload {
  const first = matches[0];
  return matches.length === 1
    ? {
        title: `Possible recall: ${first.brand} ${first.model}`,
        body: "A CPSC recall may cover an appliance you saved. Compare the model number on the notice.",
        route: "dashboard",
      }
    : {
        title: `${matches.length} possible recalls on your appliances`,
        body: "CPSC recalls may cover appliances you saved. Compare the model numbers on the notices.",
        route: "dashboard",
      };
}
