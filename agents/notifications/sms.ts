/**
 * SMS through Twilio.
 *
 * A number only receives texts after its owner confirms it: startVerification
 * has Twilio Verify text a code, checkVerification confirms it, and only then
 * does the relay store the number (prefs.setVerifiedPhone). That stops anyone
 * pointing alerts at someone else's phone.
 *
 * Configuration:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN   — API credentials
 *   TWILIO_VERIFY_SERVICE_SID               — Verify service for the codes
 *   TWILIO_MESSAGING_SERVICE_SID            — sender for alerts (or TWILIO_FROM_NUMBER)
 * Without all of these SMS is off: smsConfigured() is false and the Settings
 * SMS rows are hidden.
 */
import type { PushPayload } from "./types";
import { webPathFor } from "./links";

/** E.164: "+" then 8–15 digits, no leading zero. */
export const E164 = /^\+[1-9]\d{7,14}$/;

// ── Where codes may go (cycle-drain audit CD-4, 2026-10-31) ──────────────────
// "SMS pumping": fraudsters request codes to premium-rate numbers they are
// paid for. We serve the US and Canada, so only those numbers get codes or
// alerts. +1 also covers Caribbean countries (the classic pumping targets)
// and the US 900 premium-rate code, so those area codes are refused.
// SMS_ALLOWED_COUNTRY_CODES adds other calling codes ("44,61") if we expand.

/** +1 area codes that aren't the US or Canada, plus 900 (premium rate). */
const NANP_REFUSED = new Set([
  "242", "246", "264", "268", "284", "345", "441", "473", "649", "658", "664",
  "721", "758", "767", "784", "809", "829", "849", "868", "869", "876", "900",
]);

/** Whether `phone` (E.164) is somewhere we text. */
export function smsCountryAllowed(phone: string): boolean {
  if (!E164.test(phone)) return false;
  if (phone.startsWith("+1")) return phone.length === 12 && !NANP_REFUSED.has(phone.slice(2, 5));
  const extra = (process.env.SMS_ALLOWED_COUNTRY_CODES ?? "")
    .split(",")
    .map((c) => c.trim().replace(/^\+/, ""))
    .filter((c) => /^[2-9]\d{0,2}$/.test(c));
  return extra.some((c) => phone.startsWith(`+${c}`));
}

export function smsConfigured(): boolean {
  const e = process.env;
  return !!(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_VERIFY_SERVICE_SID &&
    (e.TWILIO_MESSAGING_SERVICE_SID || e.TWILIO_FROM_NUMBER));
}

function auth(): string {
  return "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
}

async function twilio(url: string, form: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method:  "POST",
    headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams(form).toString(),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Twilio ${res.status}: ${body?.message ?? "request failed"}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body;
}

const verifyBase = () => `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}`;

/** Text a confirmation code to `phone`. */
export async function startVerification(phone: string): Promise<void> {
  await twilio(`${verifyBase()}/Verifications`, { To: phone, Channel: "sms" });
}

/** Whether `code` is the current code for `phone`. */
export async function checkVerification(phone: string, code: string): Promise<boolean> {
  try {
    const body = await twilio(`${verifyBase()}/VerificationCheck`, { To: phone, Code: code });
    return body?.status === "approved";
  } catch (err) {
    // Twilio answers 404 when there's no pending verification (expired or used).
    if ((err as { status?: number }).status === 404) return false;
    throw err;
  }
}

export function renderSms(payload: PushPayload): string {
  const app = (process.env.APP_URL ?? "https://homegentic.app").replace(/\/$/, "");
  return `HomeGentic: ${payload.body} ${app}${webPathFor(payload.route)} Reply STOP to opt out.`;
}

/** Send one alert text. Throws on a non-2xx response. */
export async function sendSms(phone: string, payload: PushPayload): Promise<void> {
  if (!smsConfigured() || !smsCountryAllowed(phone)) return;
  const sender: Record<string, string> = process.env.TWILIO_MESSAGING_SERVICE_SID
    ? { MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID }
    : { From: process.env.TWILIO_FROM_NUMBER as string };
  await twilio(
    `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
    { To: phone, Body: renderSms(payload), ...sender },
  );
}

// ── Code-send limit ──────────────────────────────────────────────────────────
// Each code costs money and texts a stranger if the number is wrong, so a
// user may request at most CODE_LIMIT codes per hour.

const CODE_LIMIT = 5;
const HOUR_MS = 3_600_000;
const codeRequests = new Map<string, number[]>();

/** Records a code request; false when the user is over the hourly limit. */
export function allowCodeRequest(principal: string, now = Date.now()): boolean {
  const recent = (codeRequests.get(principal) ?? []).filter((t) => now - t < HOUR_MS);
  if (recent.length >= CODE_LIMIT) {
    codeRequests.set(principal, recent);
    return false;
  }
  recent.push(now);
  codeRequests.set(principal, recent);
  return true;
}

// Per destination number and relay-wide caps, so many principals can't pump
// codes to one number (harassment) or rack up Twilio cost overall. CD-4: the
// relay-wide caps were 200/hour with no daily cap; a sign-up wave that needs
// more can raise them with the env vars. The counters are in memory, which is
// right for the one Fly machine we run (fly.toml); a second machine would
// need them in shared storage.
const PHONE_HOURLY_LIMIT  = 3;
const PHONE_DAILY_LIMIT   = 6;
const envLimit = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};
const globalHourlyLimit = () => envLimit(process.env.SMS_GLOBAL_HOURLY_LIMIT, 50);
const globalDailyLimit  = () => envLimit(process.env.SMS_GLOBAL_DAILY_LIMIT, 300);
const DAY_MS = 24 * HOUR_MS;
const MAX_TRACKED_PHONES = 50_000;
const phoneRequests = new Map<string, number[]>();
let globalRequests: number[] = [];

/** Records a code send to `phone`; false when that number or the relay is over its cap. */
export function allowCodeToPhone(phone: string, now = Date.now()): boolean {
  globalRequests = globalRequests.filter((t) => now - t < DAY_MS);
  const globalLastHour = globalRequests.filter((t) => now - t < HOUR_MS).length;
  const recent = (phoneRequests.get(phone) ?? []).filter((t) => now - t < DAY_MS);
  const lastHour = recent.filter((t) => now - t < HOUR_MS).length;
  if (globalLastHour >= globalHourlyLimit() || globalRequests.length >= globalDailyLimit() ||
      lastHour >= PHONE_HOURLY_LIMIT || recent.length >= PHONE_DAILY_LIMIT) {
    phoneRequests.set(phone, recent);
    return false;
  }
  if (phoneRequests.size >= MAX_TRACKED_PHONES && !phoneRequests.has(phone)) {
    for (const [k, v] of phoneRequests) if (!v.some((t) => now - t < DAY_MS)) phoneRequests.delete(k);
  }
  recent.push(now);
  phoneRequests.set(phone, recent);
  globalRequests.push(now);
  return true;
}

export function resetCodeLimits(): void {
  codeRequests.clear();
  phoneRequests.clear();
  globalRequests = [];
}
