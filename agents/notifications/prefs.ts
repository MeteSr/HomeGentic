/**
 * Per-user push preferences: which kinds of push a user wants.
 *
 * Every kind is on until the user turns it off. Preferences live with the
 * rest of the relay's state (persist.ts) and apply to all of the user's
 * devices and browsers. New-lead alerts aren't here — they're the
 * `notifyPush` flag on the contractor's profile, because the relay picks
 * lead recipients from contractor profiles.
 */
import { loadSection, saveSection } from "./persist";
import type { NotificationKind } from "./types";

export const PREF_KINDS = [
  "job_awaiting_signature",
  "job_awaiting_contractor_signature",
  "bid_accepted",
  "bid_declined",
] as const satisfies readonly NotificationKind[];

export type PrefKind = (typeof PREF_KINDS)[number];
export type PushPrefs = Record<PrefKind, boolean>;

const stored: Record<string, Partial<PushPrefs>> =
  loadSection<Record<string, Partial<PushPrefs>>>("prefs", {});

function isPrefKind(k: string): k is PrefKind {
  return (PREF_KINDS as readonly string[]).includes(k);
}

export function getPrefs(principal: string): PushPrefs {
  const mine = stored[principal] ?? {};
  return Object.fromEntries(PREF_KINDS.map((k) => [k, mine[k] !== false])) as PushPrefs;
}

/**
 * Merge `changes` into the user's preferences. Returns the full result, or
 * null when `changes` has an unknown kind or a non-boolean value.
 */
export function setPrefs(principal: string, changes: unknown): PushPrefs | null {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return null;
  const entries = Object.entries(changes as Record<string, unknown>);
  if (entries.some(([k, v]) => !isPrefKind(k) || typeof v !== "boolean")) return null;
  stored[principal] = { ...stored[principal], ...Object.fromEntries(entries) };
  saveSection("prefs", stored);
  return getPrefs(principal);
}

/** Whether `principal` wants pushes of `kind`. Kinds without a preference always send. */
export function wantsPush(principal: string, kind: string): boolean {
  return isPrefKind(kind) ? getPrefs(principal)[kind] : true;
}
