/**
 * CPSC recall check for the appliances on a property (room fixtures with a
 * brand and model). The voice Worker queries the CPSC Recalls API and
 * matches model numbers (agents/voice/src/recalls.ts). A match is a possible
 * recall, not a confirmed one, so the app always links to the CPSC notice
 * for the homeowner to compare models.
 *
 * Results are kept in localStorage for a day per set of appliances.
 * E2E: window.__e2e_recalls (RecallMatch[]) replaces the Worker.
 */
import { voiceAgentFetch } from "./voiceAgentHeaders";
import type { Room } from "./room";

const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";
const CACHE_MS = 24 * 3600 * 1000;
const MAX_ITEMS = 50;

export interface RecallNotice {
  id:     string;
  number: string;
  date:   string;   // YYYY-MM-DD
  title:  string;
  url:    string;   // cpsc.gov notice, "" when CPSC gave none
  hazard: string;
  remedy: string;
}

export interface RecallMatch {
  brand:   string;
  model:   string;
  recalls: RecallNotice[];
}

/** The appliances worth checking: fixtures with both a brand and a model, deduplicated. */
export function recallItems(rooms: Room[]): Array<{ brand: string; model: string }> {
  const seen = new Set<string>();
  const out: Array<{ brand: string; model: string }> = [];
  for (const r of rooms) {
    for (const f of r.fixtures) {
      const brand = f.brand.trim();
      const model = f.model.trim();
      const key = `${brand}|${model}`.toLowerCase();
      if (!brand || !model || seen.has(key)) continue;
      seen.add(key);
      out.push({ brand, model });
    }
  }
  return out.slice(0, MAX_ITEMS);
}

export async function checkRecalls(items: Array<{ brand: string; model: string }>): Promise<RecallMatch[]> {
  if (typeof window !== "undefined" && (window as any).__e2e_recalls) return (window as any).__e2e_recalls;
  if (items.length === 0) return [];
  const key = `hg_recalls_${JSON.stringify(items).toLowerCase()}`;
  try {
    const hit = JSON.parse(localStorage.getItem(key) ?? "null");
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.matches;
  } catch { /* storage blocked or corrupt: ask again */ }

  const res = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/recalls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error("Recall check failed");
  const { matches } = (await res.json()) as { matches: RecallMatch[] };
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), matches })); } catch { /* best effort */ }
  return matches;
}
