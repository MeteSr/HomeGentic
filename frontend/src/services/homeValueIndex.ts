/**
 * The FHFA House Price Index series for a state, from the voice Worker's
 * /api/home-value-index (free public data, cached there for a week). The
 * index-based estimate itself is worked out in
 * @homegentic/shared/homeValueIndex.
 *
 * E2E: window.__e2e_hpi = { [state]: HpiPoint[] }.
 */
import { voiceAgentFetch } from "./voiceAgentHeaders";
import type { HpiPoint } from "@homegentic/shared/homeValueIndex";

const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";
const cache = new Map<string, HpiPoint[]>();

export function clearHpiCache(): void {
  cache.clear();
}

/** The state's quarterly index, oldest first, or null when there's none or it couldn't be read. */
export async function getStateHpi(state: string): Promise<HpiPoint[] | null> {
  const key = state.trim().toUpperCase();
  if (!key) return null;
  const fake = typeof window !== "undefined" ? (window as any).__e2e_hpi : undefined;
  if (fake) return (fake[key] as HpiPoint[] | undefined) ?? null;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const res = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/home-value-index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: key }),
    });
    if (!res.ok) return null;
    const { series } = (await res.json()) as { series?: HpiPoint[] };
    if (!Array.isArray(series) || series.length === 0) return null;
    cache.set(key, series);
    return series;
  } catch {
    return null;
  }
}
