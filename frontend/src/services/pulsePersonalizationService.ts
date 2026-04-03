/**
 * Pulse Personalization Service — 8.1.6
 *
 * Tracks which Pulse items the user acted on and derives topic weights that
 * the pulseService uses to reorder digest items. Weights are persisted in
 * localStorage so they survive page refreshes.
 */

export type PulseActionType = "clicked" | "booked" | "dismissed" | "expanded";

// Points awarded per action type
const ACTION_POINTS: Record<PulseActionType, number> = {
  booked:    10,
  clicked:    3,
  expanded:   1,
  dismissed: -2,
};

const DECAY_FACTOR = 0.85;    // multiply weights by this on each weekly decay
const STORAGE_KEY  = "pulse_weights";

export type TopicWeights = Record<string, number>;

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createPulsePersonalizationService() {
  // Load persisted weights or start fresh
  let weights: TopicWeights = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  })();

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(weights)); } catch { /* noop in test env */ }
  }

  function recordAction(topic: string, action: PulseActionType): void {
    const points = ACTION_POINTS[action] ?? 0;
    weights[topic] = Math.max(0, (weights[topic] ?? 0) + points);
    persist();
  }

  function getWeights(): TopicWeights {
    return { ...weights };
  }

  function applyDecay(): void {
    for (const topic of Object.keys(weights)) {
      weights[topic] = Math.max(0, weights[topic] * DECAY_FACTOR);
    }
    persist();
  }

  function getTopTopics(limit: number): string[] {
    return Object.entries(weights)
      .filter(([, w]) => w > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([topic]) => topic);
  }

  return { recordAction, getWeights, applyDecay, getTopTopics };
}

export const pulsePersonalizationService = createPulsePersonalizationService();
