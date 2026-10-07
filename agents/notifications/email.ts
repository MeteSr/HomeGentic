/**
 * Notification email through Resend (https://resend.com/docs/api-reference/emails/send-email).
 *
 * Configured by RESEND_API_KEY and NOTIFY_EMAIL_FROM (e.g.
 * "HomeGentic <notifications@homegentic.app>"); APP_URL is the web app's
 * origin for links. Without RESEND_API_KEY email is off: emailConfigured()
 * is false and the Settings email rows are hidden.
 *
 * Every send carries an Idempotency-Key derived from the outbox event, so a
 * relay that crashes mid-poll and resends doesn't email anyone twice.
 */
import type { PushPayload } from "./types";
import { webPathFor } from "./links";

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function appUrl(): string {
  return (process.env.APP_URL ?? "https://homegentic.app").replace(/\/$/, "");
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface EmailMessage {
  subject: string;
  text:    string;
  html:    string;
}

export function renderEmail(payload: PushPayload): EmailMessage {
  const link     = `${appUrl()}${webPathFor(payload.route)}`;
  const settings = `${appUrl()}/settings?tab=notifications`;
  const text = [
    payload.body,
    "",
    `Open HomeGentic: ${link}`,
    "",
    `You're getting this because of your notification settings. Change them: ${settings}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#141414;line-height:1.5">
<p style="font-size:16px;margin:0 0 16px">${escapeHtml(payload.body)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="color:#2B34FF">Open HomeGentic</a></p>
<p style="font-size:12px;color:#6B6B6B;margin:0">You're getting this because of your notification settings.
<a href="${escapeHtml(settings)}" style="color:#6B6B6B">Change them</a>.</p>
</body></html>`;
  return { subject: payload.title, text, html };
}

/** Send one notification email. Throws on a non-2xx response. */
export async function sendEmail(to: string, payload: PushPayload, idempotencyKey: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const msg = renderEmail(payload);
  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      Authorization:     `Bearer ${key}`,
      "Content-Type":    "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from:    process.env.NOTIFY_EMAIL_FROM ?? "HomeGentic <notifications@homegentic.app>",
      to:      [to],
      subject: msg.subject,
      text:    msg.text,
      html:    msg.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
