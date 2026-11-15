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
 *   review_request                    —     Job Verified               —
 *   showing_request                   yes   Showing Requests           —
 *   weekly_pulse                      —     Weekly Home Pulse          —
 *   product_recall                    yes   in the Weekly Home Pulse   —
 *   succession_claim_*                —     always (no row)            —
 *   visit_* (times offered, booked,   yes   Visit Times                —
 *     confirmed, new times asked,
 *     cancelled, day-before reminder)
 *   job_payment_* (bank payment on   yes   Payments                   —
 *     its way, paid, receipt, failed)
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
  "product_recall",
] as const satisfies readonly NotificationKind[];
export type PushPrefKind = (typeof PUSH_PREF_KINDS)[number];

/** Visit times on an accepted quote: no push setting, one email row. */
export const VISIT_NOTIFICATION_KINDS = [
  "visit_times_offered",
  "visit_booked",
  "visit_confirmed",
  "visit_new_times_requested",
  "visit_cancelled",
  "visit_reminder",
] as const satisfies readonly NotificationKind[];

/** In-app job payments: no push setting, one email row. */
export const PAYMENT_NOTIFICATION_KINDS = [
  "job_payment_processing",
  "job_payment_paid",
  "job_payment_receipt",
  "job_payment_failed",
] as const satisfies readonly NotificationKind[];

/** Kinds that are pushed at all (new_lead's opt-in lives on the contractor profile). */
export const PUSH_KINDS: readonly NotificationKind[] = [
  ...PUSH_PREF_KINDS, "new_lead", "showing_request", ...VISIT_NOTIFICATION_KINDS, ...PAYMENT_NOTIFICATION_KINDS,
];

/** Email preference keys — one per Settings row — and the kinds each covers. */
export const EMAIL_GROUPS = {
  new_lead:       ["new_lead"],
  bid_outcome:    ["bid_accepted", "bid_declined"],
  job_verified:   ["job_verified", "review_request"],
  quote_received: ["quote_received"],
  job_updates:    ["job_awaiting_signature", "sensor_alert"],
  weekly_pulse:   ["weekly_pulse"],
  showing_requests: ["showing_request"],
  visits:         VISIT_NOTIFICATION_KINDS,
  payments:       PAYMENT_NOTIFICATION_KINDS,
} as const satisfies Record<string, readonly NotificationKind[]>;
export type EmailPrefKey = keyof typeof EMAIL_GROUPS;
export const EMAIL_PREF_KEYS = Object.keys(EMAIL_GROUPS) as EmailPrefKey[];

/**
 * Defaults match what the Settings rows showed before they were wired up.
 * The weekly Home Pulse is on by default (the product promises it); every
 * one has a one-click unsubscribe link.
 */
export const EMAIL_DEFAULTS: Record<EmailPrefKey, boolean> = {
  new_lead:       true,
  bid_outcome:    false,
  job_verified:   true,
  quote_received: true,
  job_updates:    false,
  weekly_pulse:   true,
  showing_requests: true,
  visits:         true,
  payments:       true,
};

/**
 * #724: successor-claim emails (a claim opened on a home, reminders during
 * the 30-day wait, the review outcome, a cancellation). They let a living
 * owner stop someone taking over their record, so no setting turns them off.
 */
export const REQUIRED_EMAIL_KINDS: readonly NotificationKind[] = [
  "succession_claim_opened",
  "succession_claim_reminder",
  "succession_claim_approved",
  "succession_claim_rejected",
  "succession_claim_cancelled",
];

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
