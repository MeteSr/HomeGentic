/**
 * "Thinking of selling?": a yearly nudge toward Bid to List, where verified
 * agents bid for the listing and the seller chooses.
 *
 * Each home gets its own week of the year, picked from its id so the prompts
 * spread out: Home Pulse mentions it that week, and the dashboard shows a card
 * for four weeks from then (the owner can dismiss it until the next year).
 * Both only appear where enough verified agents serve the home's city
 * (agent.countVerifiedAgentsForCities), since an auction with one or two bids
 * helps nobody.
 *
 * Dependency-free: used by the frontend and the notifications relay.
 */

/** Verified agents a city needs before Bid to List is offered there. */
export const MIN_VERIFIED_AGENTS = 3;

/** How many weeks the dashboard card stays up each year. */
export const SELL_PROMPT_DASHBOARD_WEEKS = 4;

const WEEK_MS = 7 * 86_400_000;

/** The ISO week number (1-53) of a moment, in UTC. */
export function isoWeekNumber(ms: number): number {
  const d = new Date(ms);
  const day = d.getUTCDay() || 7;
  const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - day);
  const year = new Date(thursday).getUTCFullYear();
  return Math.floor((thursday - Date.UTC(year, 0, 1)) / WEEK_MS) + 1;
}

/** The home's prompt week, 1-52, stable for its id. */
export function sellPromptWeek(propertyId: string): number {
  let h = 2166136261;
  for (let i = 0; i < propertyId.length; i++) {
    h ^= propertyId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 52) + 1;
}

/** Home Pulse mentions selling in the home's week only. */
export function sellPromptInPulse(propertyId: string, nowMs: number): boolean {
  return isoWeekNumber(nowMs) === sellPromptWeek(propertyId);
}

/** Whole weeks since the home's week this year (wrapping), or null in a week 53. */
function weeksSincePromptWeek(propertyId: string, nowMs: number): number | null {
  const now = isoWeekNumber(nowMs);
  if (now > 52) return null;
  return (now - sellPromptWeek(propertyId) + 52) % 52;
}

/** The dashboard card shows for four weeks from the home's week. */
export function sellPromptOnDashboard(propertyId: string, nowMs: number): boolean {
  const since = weeksSincePromptWeek(propertyId, nowMs);
  return since !== null && since < SELL_PROMPT_DASHBOARD_WEEKS;
}

/**
 * Where the dashboard remembers "Not now" for this home: one key per yearly
 * window, named by the year the window started (so a window that runs over
 * New Year stays dismissed).
 */
export function sellPromptDismissKey(propertyId: string, nowMs: number): string {
  const since = weeksSincePromptWeek(propertyId, nowMs) ?? 0;
  const start = since < SELL_PROMPT_DASHBOARD_WEEKS ? nowMs - since * WEEK_MS : nowMs;
  return `hg_sell_prompt_dismissed:${propertyId}:${new Date(start).getUTCFullYear()}`;
}

/** Whether a city with this many verified agents gets the prompt. */
export function bidToListOpen(verifiedAgents: number): boolean {
  return verifiedAgents >= MIN_VERIFIED_AGENTS;
}
