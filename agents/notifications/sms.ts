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
  if (!smsConfigured()) return;
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

export function resetCodeLimits(): void {
  codeRequests.clear();
}
