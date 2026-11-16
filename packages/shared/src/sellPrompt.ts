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
 * The dashboard card also shows outside those weeks when the home's
 * HomeGentic score or its index-based value (homeValueIndex.ts) has risen
 * enough to make selling worth a look: see scoreRise and indexValueRise.
 * Only rises count; a fall is not a reason to suggest selling.
 *
 * Dependency-free: used by the frontend and the notifications relay.
 */
import { indexEstimate, type HpiPoint, type Quarter } from "./homeValueIndex";

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

/** Points the HomeGentic score must rise to prompt. */
export const SCORE_MOVE_POINTS = 10;

/** The rise is counted over this many days of score history. */
export const SCORE_MOVE_DAYS = 90;

/** Percent the state index must rise over the last four quarters to prompt. */
export const VALUE_MOVE_PCT = 5;

const DAY_MS = 86_400_000;

export interface ScoreRise {
  from: number;
  to: number;
  /** When the `from` score was recorded. */
  sinceMs: number;
}

/**
 * The score rose by SCORE_MOVE_POINTS or more since the earliest snapshot in
 * the last SCORE_MOVE_DAYS days, and (when the owner said "Not now" to a
 * move before) by that much over the score they dismissed at.
 */
export function scoreRise(
  history: { score: number; timestamp: number }[],
  scoreNow: number,
  nowMs: number,
  dismissedAt: number | null = null,
): ScoreRise | null {
  const since = nowMs - SCORE_MOVE_DAYS * DAY_MS;
  const first = history.filter((s) => s.timestamp >= since).sort((a, b) => a.timestamp - b.timestamp)[0];
  if (!first || scoreNow - first.score < SCORE_MOVE_POINTS) return null;
  if (dismissedAt !== null && scoreNow - dismissedAt < SCORE_MOVE_POINTS) return null;
  return { from: first.score, to: scoreNow, sinceMs: first.timestamp };
}

export interface ValueRise {
  /** The index estimate since the loan was made, dollars rounded to $1,000. */
  estimate: number;
  /** Whole percent rise of the state index from `from` to `to`. */
  changePct: number;
  from: Quarter;
  to: Quarter;
}

const quarterIndex = (q: Quarter) => q.year * 4 + q.quarter - 1;

/**
 * The state index rose VALUE_MOVE_PCT or more over the last four quarters (or
 * since the loan, when it's under a year old), and (after a "Not now") the
 * estimate is that much above the value the owner dismissed at.
 */
export function indexValueRise(
  originalValue: number | null,
  series: HpiPoint[],
  loanStart: Quarter | null,
  dismissedAt: number | null = null,
): ValueRise | null {
  const est = indexEstimate(originalValue, series, loanStart);
  if (!est || !loanStart) return null;
  const latest = series[series.length - 1];
  const yearBack = quarterIndex({ year: latest[0], quarter: latest[1] }) - 4;
  const fromIdx = Math.max(yearBack, quarterIndex(loanStart));
  const from = series.find(([y, q]) => quarterIndex({ year: y, quarter: q }) === fromIdx);
  if (!from) return null;
  const ratio = latest[2] / from[2];
  if (ratio < 1 + VALUE_MOVE_PCT / 100) return null;
  if (dismissedAt !== null && est.estimate < dismissedAt * (1 + VALUE_MOVE_PCT / 100)) return null;
  return {
    estimate: est.estimate,
    changePct: Math.round((ratio - 1) * 100),
    from: { year: from[0], quarter: from[1] },
    to: est.to,
  };
}

/** Where the dashboard remembers the score and value at the last "Not now", for this home. */
export function sellPromptMoveKey(propertyId: string): string {
  return `hg_sell_prompt_move:${propertyId}`;
}
