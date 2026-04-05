/**
 * Digest Email Service — 8.1.3
 *
 * Renders HTML + plain-text email templates for the weekly Home Pulse digest
 * and provides a send() / sendBatch() interface. In production this would
 * POST to a Resend or SendGrid endpoint; here it's a mock that records sends.
 */

import type { PulseDigest, PulseItem } from "@/services/pulseService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DigestEmailPayload {
  to:      string;
  address: string;
  digest:  PulseDigest;
}

export interface SendResult {
  ok:        boolean;
  messageId: string;
  error?:    string;
}

export interface OutboxEntry {
  to:         string;
  propertyId: string;
  messageId:  string;
  sentAt:     number;
}

// ─── HTML template ────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  high:   "#C94C2E",
  medium: "#8B6914",
  low:    "#5A7A5A",
};

function priorityBadge(priority: string): string {
  const color = PRIORITY_COLORS[priority] ?? "#7A7268";
  return `<span style="display:inline-block;padding:2px 8px;background:${color};color:#fff;font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:0.06em;">${priority}</span>`;
}

function itemHtml(item: PulseItem): string {
  return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #C8C3B8;">
        <div style="margin-bottom:6px;">
          ${priorityBadge(item.priority)}
          <span style="font-family:monospace;font-size:11px;color:#7A7268;margin-left:8px;text-transform:uppercase;letter-spacing:0.05em;">${item.category}</span>
        </div>
        <div style="font-family:'Georgia',serif;font-size:16px;font-weight:700;color:#0E0E0C;margin-bottom:4px;">${item.title}</div>
        <div style="font-family:'Arial',sans-serif;font-size:14px;color:#3A3632;line-height:1.5;">${item.body}</div>
      </td>
    </tr>`.trim();
}

function renderHtml(digest: PulseDigest, address: string): string {
  const itemRows = digest.items.map(itemHtml).join("\n");
  const seasonCap = digest.season.charAt(0).toUpperCase() + digest.season.slice(1);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HomeGentic Weekly Pulse</title></head>
<body style="margin:0;padding:0;background:#F4F1EB;font-family:'Arial',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EB;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #C8C3B8;">
        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:2px solid #0E0E0C;">
            <div style="font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#7A7268;margin-bottom:8px;">HomeGentic · Weekly Home Pulse</div>
            <div style="font-family:'Georgia',serif;font-size:26px;font-weight:900;color:#0E0E0C;line-height:1.2;">${seasonCap} Digest</div>
            <div style="font-family:monospace;font-size:12px;color:#7A7268;margin-top:6px;">${address}</div>
          </td>
        </tr>
        <!-- Headline -->
        <tr>
          <td style="padding:24px 40px 8px;">
            <div style="font-family:'Georgia',serif;font-size:18px;color:#0E0E0C;line-height:1.4;">${digest.headline}</div>
          </td>
        </tr>
        <!-- Items -->
        <tr>
          <td style="padding:8px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${itemRows}
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px 32px;border-top:1px solid #C8C3B8;margin-top:16px;">
            <div style="font-family:monospace;font-size:11px;color:#7A7268;text-transform:uppercase;letter-spacing:0.06em;">HomeGentic — your home's maintenance record on the blockchain.</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Plain-text template ──────────────────────────────────────────────────────

function renderText(digest: PulseDigest, address: string): string {
  const seasonCap = digest.season.charAt(0).toUpperCase() + digest.season.slice(1);
  const lines: string[] = [
    `HomeGentic Weekly Home Pulse — ${seasonCap} Digest`,
    address,
    "=".repeat(50),
    "",
    digest.headline,
    "",
    ...digest.items.flatMap((item) => [
      `[${item.priority.toUpperCase()}] ${item.title}  (${item.category})`,
      item.body,
      "",
    ]),
    "─".repeat(50),
    "HomeGentic — your home's maintenance record on the blockchain.",
  ];
  return lines.join("\n");
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createDigestEmailService() {
  let msgCounter = 0;
  const outbox: OutboxEntry[] = [];

  async function send(payload: DigestEmailPayload): Promise<SendResult> {
    if (!payload.to || payload.to.trim() === "") {
      throw new Error("'to' address is required");
    }

    // In production: POST to Resend/SendGrid API here
    const messageId = `MSG_${Date.now()}_${++msgCounter}`;
    outbox.push({
      to:         payload.to,
      propertyId: payload.digest.propertyId,
      messageId,
      sentAt:     Date.now(),
    });
    return { ok: true, messageId };
  }

  async function sendBatch(payloads: DigestEmailPayload[]): Promise<SendResult[]> {
    return Promise.all(payloads.map(send));
  }

  function getOutbox(): OutboxEntry[] {
    return [...outbox];
  }

  return { renderHtml, renderText, send, sendBatch, getOutbox };
}

export const digestEmailService = createDigestEmailService();
