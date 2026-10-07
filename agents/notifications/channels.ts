/**
 * Which channels each kind of notification can go out on, and which Settings
 * row controls it.
 *
 *   kind                              push  email (Settings row)       SMS
 *   job_awaiting_signature            yes   Job Updates                yes
 *   job_awaiting_contractor_signature yes   —                          yes
 *   job_verified                      —     Job Verified               —
 *   sensor_alert                      —     Job Updates                yes
 *   bid_accepted                      yes   Bid Outcome                yes
 *   bid_declined                      yes   Bid Outcome                —
 *   quote_received                    —     Quote Received             —
 *   new_lead                          yes*  New Lead                   —
 *
 * * new-lead pushes follow the contractor profile's notifyPush instead of a
 *   relay preference.
 *
 * SMS is one switch ("SMS Alerts") covering the time-sensitive kinds, and only
 * goes to a phone number the user confirmed with a code.
 */
import type { NotificationKind } from "./types";

export const PUSH_PREF_KINDS = [
  "job_awaiting_signature",
  "job_awaiting_contractor_signature",
  "bid_accepted",
  "bid_declined",
] as const satisfies readonly NotificationKind[];
export type PushPrefKind = (typeof PUSH_PREF_KINDS)[number];

/** Kinds that are pushed at all (new_lead's opt-in lives on the contractor profile). */
export const PUSH_KINDS: readonly NotificationKind[] = [...PUSH_PREF_KINDS, "new_lead"];

/** Email preference keys — one per Settings row — and the kinds each covers. */
export const EMAIL_GROUPS = {
  new_lead:       ["new_lead"],
  bid_outcome:    ["bid_accepted", "bid_declined"],
  job_verified:   ["job_verified"],
  quote_received: ["quote_received"],
  job_updates:    ["job_awaiting_signature", "sensor_alert"],
} as const satisfies Record<string, readonly NotificationKind[]>;
export type EmailPrefKey = keyof typeof EMAIL_GROUPS;
export const EMAIL_PREF_KEYS = Object.keys(EMAIL_GROUPS) as EmailPrefKey[];

/** Defaults match what the Settings rows showed before they were wired up. */
export const EMAIL_DEFAULTS: Record<EmailPrefKey, boolean> = {
  new_lead:       true,
  bid_outcome:    false,
  job_verified:   true,
  quote_received: true,
  job_updates:    false,
};

export const SMS_KINDS: readonly NotificationKind[] = [
  "job_awaiting_signature",
  "job_awaiting_contractor_signature",
  "bid_accepted",
  "sensor_alert",
];

export function emailGroupFor(kind: string): EmailPrefKey | null {
  for (const key of EMAIL_PREF_KEYS) {
    if ((EMAIL_GROUPS[key] as readonly string[]).includes(kind)) return key;
  }
  return null;
}
