/**
 * Buyer report alerts for the public /check page.
 *
 * A buyer who looks up an address with no public HomeGentic report can leave
 * an email. The relay keeps it (persisted, never on-chain), asks the report
 * canister's anonymous findPublicReport query every CHECK_INTERVAL_MS, and
 * sends one email with the report link once a public report exists. The
 * request is then deleted. Requests that never match are dropped after
 * MAX_AGE_MS, which the page tells the buyer.
 *
 * Limits keep this from being used to mail strangers: one pending request per
 * email and address, MAX_PER_EMAIL addresses per email, MAX_PER_ADDRESS emails
 * per address and MAX_TOTAL overall, plus a per-IP rate limit on the endpoint
 * (server.ts). The email itself only ever links to a report the owner chose
 * to make public.
 */
import crypto from "crypto";
import * as icp from "./icp";
import { loadSection, saveSection } from "./persist";
import { appUrl, emailConfigured, escapeHtml, sendRawEmail, type EmailMessage } from "./email";

export interface ReportAlert {
  id:        string;
  address:   string;   // normalized by the web app (lowercase, single spaces)
  email:     string;   // lowercased
  createdAt: number;   // ms
}

export interface PublicReportMatch {
  token:   string;
  address: string;
  city:    string;
  state:   string;
  zipCode: string;
}

export const MAX_AGE_MS      = 180 * 24 * 60 * 60 * 1000;
export const MAX_PER_EMAIL   = 5;
export const MAX_PER_ADDRESS = 20;
export const MAX_TOTAL       = 20_000;
const CHECK_INTERVAL_MS      = Number(process.env.REPORT_ALERT_INTERVAL_MS) || 60 * 60 * 1000;
const SECTION                = "reportAlerts";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

let alerts: ReportAlert[] = loadSection<ReportAlert[]>(SECTION, []);

function save(): void {
  saveSection(SECTION, alerts);
}

export function listAlerts(): ReportAlert[] {
  return [...alerts];
}

/** Tests only. */
export function resetAlerts(): void {
  alerts = [];
  save();
}

export function normalizeAddress(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/[,.]$/, "").trim();
}

export type AddResult = "added" | "exists" | "invalid" | "limit";

/** Save a request. "exists" is a success for the caller (nothing new to store). */
export function addAlert(rawAddress: unknown, rawEmail: unknown, nowMs = Date.now()): AddResult {
  if (typeof rawAddress !== "string" || typeof rawEmail !== "string") return "invalid";
  const address = normalizeAddress(rawAddress);
  const email   = rawEmail.trim().toLowerCase();
  if (address.length < 5 || address.length > 300 || !/\d/.test(address)) return "invalid";
  if (email.length > 254 || !EMAIL_RE.test(email)) return "invalid";

  pruneExpired(nowMs);
  if (alerts.some((a) => a.email === email && a.address === address)) return "exists";
  if (alerts.length >= MAX_TOTAL) return "limit";
  if (alerts.filter((a) => a.email === email).length >= MAX_PER_EMAIL) return "limit";
  if (alerts.filter((a) => a.address === address).length >= MAX_PER_ADDRESS) return "limit";

  alerts.push({ id: crypto.randomUUID(), address, email, createdAt: nowMs });
  save();
  return "added";
}

function pruneExpired(nowMs: number): void {
  const kept = alerts.filter((a) => nowMs - a.createdAt < MAX_AGE_MS);
  if (kept.length !== alerts.length) {
    alerts = kept;
    save();
  }
}

export function renderReportAlert(match: PublicReportMatch): EmailMessage {
  const link  = `${appUrl()}/report/${encodeURIComponent(match.token)}`;
  const place = `${match.address}, ${match.city}, ${match.state} ${match.zipCode}`;
  const text = [
    `A HomeGentic report is now public for ${place}.`,
    "",
    `View it: ${link}`,
    "",
    "You asked us to tell you on homegentic.app/check. This is the only email we'll send about it, and we've deleted your request.",
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#141414;line-height:1.5">
<p style="font-size:16px;margin:0 0 16px">A HomeGentic report is now public for ${escapeHtml(place)}.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="color:#2B34FF">View the report</a></p>
<p style="font-size:12px;color:#6B6B6B;margin:0">You asked us to tell you on homegentic.app/check. This is the only email we'll send about it, and we've deleted your request.</p>
</body></html>`;
  return { subject: `HomeGentic report available: ${match.address}`, text, html };
}

export interface ReportAlertDeps {
  emailEnabled: () => boolean;
  find:         (address: string) => Promise<PublicReportMatch | null>;
  send:         (to: string, msg: EmailMessage, idempotencyKey: string) => Promise<void>;
}

const defaultDeps: ReportAlertDeps = {
  emailEnabled: emailConfigured,
  find:         icp.findPublicReport,
  send:         sendRawEmail,
};

let running = false;

/** One pass: look up each pending address once and email every match. Returns emails sent. */
export async function runReportAlerts(nowMs = Date.now(), deps: ReportAlertDeps = defaultDeps): Promise<number> {
  if (running || !deps.emailEnabled()) return 0;
  running = true;
  let sent = 0;
  try {
    pruneExpired(nowMs);
    const addresses = [...new Set(alerts.map((a) => a.address))];
    for (const address of addresses) {
      let match: PublicReportMatch | null;
      try {
        match = await deps.find(address);
      } catch (err) {
        console.error("[report-alerts] lookup failed:", err instanceof Error ? err.message : err);
        continue;
      }
      if (!match) continue;
      for (const a of alerts.filter((x) => x.address === address)) {
        try {
          await deps.send(a.email, renderReportAlert(match), `report-alert-${a.id}`);
          sent += 1;
          alerts = alerts.filter((x) => x.id !== a.id);
          save();
        } catch (err) {
          console.error("[report-alerts] send failed:", err instanceof Error ? err.message : err);
        }
      }
    }
  } finally {
    running = false;
  }
  return sent;
}

let handle: ReturnType<typeof setInterval> | null = null;

export function startReportAlerts(): void {
  if (handle) return;
  if (!emailConfigured()) {
    console.warn("[report-alerts] RESEND_API_KEY not set — buyer report alerts are off");
    return;
  }
  if (!process.env.CANISTER_ID_REPORT) {
    console.warn("[report-alerts] CANISTER_ID_REPORT not set — buyer report alerts are off");
    return;
  }
  handle = setInterval(() => { void runReportAlerts(); }, CHECK_INTERVAL_MS);
  void runReportAlerts();
}

/** Whether the endpoint should accept requests (it can't deliver without these). */
export function reportAlertsEnabled(): boolean {
  return emailConfigured() && !!process.env.CANISTER_ID_REPORT;
}
