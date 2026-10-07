/**
 * Notification preferences kept by the notification relay
 * (agents/notifications/prefs.ts): push kinds, email rows and SMS alerts.
 * They apply to every device the user signs in on.
 *
 * Requests carry the agent session token (fetchWithAgentSession); the relay
 * works out whose preferences they are from it. SMS only goes to a number the
 * user confirmed with a texted code (startSmsVerification → confirmSms).
 */
import { fetchWithAgentSession } from "./agentSession";

const RELAY_URL: string = (import.meta.env?.VITE_NOTIFICATIONS_URL ?? "").replace(/\/$/, "");

/** Kinds of push a user can turn off. */
export type PushPrefKind =
  | "job_awaiting_signature"
  | "job_awaiting_contractor_signature"
  | "bid_accepted"
  | "bid_declined";

/** One key per Settings email row (agents/notifications/channels.ts). */
export type EmailPrefKey = "new_lead" | "bid_outcome" | "job_verified" | "quote_received" | "job_updates";

export interface NotificationPrefs {
  push:  Record<PushPrefKind, boolean>;
  email: Record<EmailPrefKey, boolean>;
  /** `phone` is masked ("•••• 0142"); null until a number is confirmed. */
  sms:   { enabled: boolean; phone: string | null };
}

/** Which optional channels the relay can send on. */
export interface NotificationChannels {
  email: boolean;
  sms:   boolean;
}

export interface PrefsState {
  prefs:    NotificationPrefs;
  channels: NotificationChannels;
}

export interface PrefsChanges {
  push?:  Partial<Record<PushPrefKind, boolean>>;
  email?: Partial<Record<EmailPrefKey, boolean>>;
  sms?:   { enabled: boolean };
}

/** Whether a notification relay is configured for this build. */
export function notificationsConfigured(): boolean {
  return !!RELAY_URL;
}

const ERRORS: Record<string, string> = {
  session_required: "Sign in again to change notifications",
  sms_unavailable:  "Text alerts aren't available right now",
  too_many_codes:   "Too many codes requested — try again in an hour",
  send_failed:      "Couldn't send a code to that number",
  wrong_code:       "That code isn't right, or it has expired",
  check_failed:     "Couldn't check the code — try again",
};

async function call<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  if (!RELAY_URL) throw new Error("Notifications aren't configured");
  const res = await fetchWithAgentSession(`${RELAY_URL}${path}`, init);
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    if (res.status === 401) throw new Error(ERRORS.session_required);
    const known = body.error ? ERRORS[body.error] : undefined;
    // The relay's other 400s are already readable ("phone must be in international format…").
    throw new Error(known ?? (res.status === 400 && body.error ? body.error : fallback));
  }
  return body;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body:    JSON.stringify(body),
});

export function getNotificationPrefs(): Promise<PrefsState> {
  return call<PrefsState>("/api/prefs", { method: "GET" }, "Couldn't load notification settings");
}

/** Change some preferences; resolves to the full, saved set. */
export function setNotificationPrefs(changes: PrefsChanges): Promise<PrefsState> {
  return call<PrefsState>("/api/prefs", json("PUT", { prefs: changes }), "Couldn't save notification settings");
}

/**
 * "(512) 555-0142", "512-555-0142", "+44 20 7946 0958" → E.164.
 * Ten-digit numbers are taken as US; anything else needs its country code.
 * Returns null when the input can't be a phone number.
 */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  let e164: string;
  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (digits.length === 10) e164 = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) e164 = `+${digits}`;
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** Text a confirmation code to `phone` (E.164). */
export async function startSmsVerification(phone: string): Promise<void> {
  await call<{ ok: true }>("/api/sms/start", json("POST", { phone }), "Couldn't send a code");
}

/** Confirm `phone` with the texted code; turns SMS alerts on. */
export function confirmSms(phone: string, code: string): Promise<PrefsState> {
  return call<PrefsState>("/api/sms/confirm", json("POST", { phone, code }), "Couldn't confirm that number");
}

/** Forget the confirmed number and turn SMS alerts off. */
export function removeSmsPhone(): Promise<PrefsState> {
  return call<PrefsState>("/api/sms", { method: "DELETE" }, "Couldn't remove that number");
}
