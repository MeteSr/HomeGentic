/**
 * Year-in-Review Email Service — 8.5.3
 *
 * Builds a structured annual summary and renders it as HTML + plain-text.
 * The "year" window is the 12 months preceding nowMs.
 *
 * Estimated value added: verified contractor jobs return ~80 cents on the
 * dollar in appraised value uplift (based on Remodeling Magazine Cost vs
 * Value data). We surface this as a conservative estimate.
 */

import { getScoreGrade } from "@/services/scoreService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface YearInReviewJob {
  id:             string;
  serviceType:    string;
  amountCents:    number;
  date:           string;   // YYYY-MM-DD
  verified:       boolean;
  isDiy:          boolean;
  warrantyMonths?: number;
  contractorName?: string;
}

export interface YearInReviewContext {
  propertyId:  string;
  address:     string;
  city:        string;
  state:       string;
  zipCode:     string;
  ownerName:   string;
  yearJoined:  number;
  jobs:        YearInReviewJob[];
  scoreStart:  number;
  scoreEnd:    number;
  nowMs:       number;
}

export interface YearInReviewSummary {
  propertyId:            string;
  reviewYear:            number;
  jobsLogged:            number;
  verifiedCount:         number;
  diyCount:              number;
  warrantiesSet:         number;
  totalSpentCents:       number;
  estimatedValueAddedCents: number;
  scoreStart:            number;
  scoreEnd:              number;
  scoreChange:           number;
  topServiceTypes:       string[];
}

export interface SendResult {
  ok:        boolean;
  messageId: string;
}

export interface OutboxEntry {
  to:         string;
  propertyId: string;
  messageId:  string;
  sentAt:     number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cents(n: number): string {
  return `$${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function scoreChangeLabel(delta: number): string {
  if (delta > 0) return `+${delta} points`;
  if (delta < 0) return `${delta} points`;
  return "unchanged";
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createYearInReviewService() {
  let msgCounter = 0;
  const outbox: OutboxEntry[] = [];

  // ── buildSummary ────────────────────────────────────────────────────────────

  function buildSummary(ctx: YearInReviewContext): YearInReviewSummary {
    const cutoff = ctx.nowMs - 365.25 * 24 * 60 * 60 * 1000;
    const yearJobs = ctx.jobs.filter(
      (j) => new Date(j.date).getTime() >= cutoff
    );

    const jobsLogged    = yearJobs.length;
    const verifiedCount = yearJobs.filter((j) => j.verified).length;
    const diyCount      = yearJobs.filter((j) => j.isDiy).length;
    const warrantiesSet = yearJobs.filter((j) => j.warrantyMonths != null && j.warrantyMonths > 0).length;
    const totalSpentCents = yearJobs.reduce((s, j) => s + j.amountCents, 0);

    // Conservative value-add: verified contractor jobs → 80% ROI
    const estimatedValueAddedCents = Math.round(
      yearJobs
        .filter((j) => j.verified && !j.isDiy)
        .reduce((s, j) => s + j.amountCents, 0) * 0.8
    );

    // Top service types by frequency
    const freq: Record<string, number> = {};
    for (const j of yearJobs) freq[j.serviceType] = (freq[j.serviceType] ?? 0) + 1;
    const topServiceTypes = Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .map(([type]) => type);

    const reviewYear = new Date(ctx.nowMs).getFullYear() - 1;

    return {
      propertyId: ctx.propertyId,
      reviewYear,
      jobsLogged,
      verifiedCount,
      diyCount,
      warrantiesSet,
      totalSpentCents,
      estimatedValueAddedCents,
      scoreStart:  ctx.scoreStart,
      scoreEnd:    ctx.scoreEnd,
      scoreChange: ctx.scoreEnd - ctx.scoreStart,
      topServiceTypes,
    };
  }

  // ── renderHtml ──────────────────────────────────────────────────────────────

  function renderHtml(ctx: YearInReviewContext): string {
    const s         = buildSummary(ctx);
    const grade     = getScoreGrade(s.scoreEnd);
    const delta     = scoreChangeLabel(s.scoreChange);
    const topTypes  = s.topServiceTypes.slice(0, 3).join(", ") || "—";
    const statLabel = "font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:#7A7268;padding:8px 0 2px;";
    const statVal   = "font-family:'Georgia',serif;font-size:22px;font-weight:900;color:#0E0E0C;padding:0 0 12px;";
    const valueAdded = s.estimatedValueAddedCents > 0
      ? `<tr><td style="${statLabel}">Est. Value Added</td><td style="${statVal}">${cents(s.estimatedValueAddedCents)}</td></tr>`
      : "";

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HomeGentic ${s.reviewYear} Year in Review</title></head>
<body style="margin:0;padding:0;background:#F4F1EB;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EB;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #C8C3B8;">

        <!-- Header -->
        <tr>
          <td style="padding:40px 40px 28px;border-bottom:3px solid #0E0E0C;">
            <div style="font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#7A7268;margin-bottom:10px;">HomeGentic · Annual Report</div>
            <div style="font-family:'Georgia',serif;font-size:32px;font-weight:900;color:#0E0E0C;line-height:1.1;">${s.reviewYear}<br>Year in Review</div>
            <div style="font-family:monospace;font-size:12px;color:#7A7268;margin-top:10px;">${ctx.address} · ${ctx.city}, ${ctx.state}</div>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:28px 40px 0;">
            <p style="font-family:'Georgia',serif;font-size:17px;color:#0E0E0C;line-height:1.5;margin:0;">
              Hi ${ctx.ownerName}, here's what you accomplished for your home this year.
            </p>
          </td>
        </tr>

        <!-- Stats grid -->
        <tr>
          <td style="padding:24px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #C8C3B8;">
              <tr>
                <td width="50%" style="padding-right:20px;vertical-align:top;">
                  <table cellpadding="0" cellspacing="0">
                    <tr><td style="${statLabel}">Jobs Logged</td></tr>
                    <tr><td style="${statVal}">${s.jobsLogged}</td></tr>
                    <tr><td style="${statLabel}">Verified Records</td></tr>
                    <tr><td style="${statVal}">${s.verifiedCount}</td></tr>
                    <tr><td style="${statLabel}">Warranties Registered</td></tr>
                    <tr><td style="${statVal}">${s.warrantiesSet}</td></tr>
                    ${valueAdded}
                  </table>
                </td>
                <td width="50%" style="vertical-align:top;border-left:1px solid #C8C3B8;padding-left:20px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr><td style="${statLabel}">HomeGentic Score</td></tr>
                    <tr><td style="${statVal}">${s.scoreEnd} <span style="font-size:14px;color:#7A7268;">${grade}</span></td></tr>
                    <tr><td style="${statLabel}">Score Change</td></tr>
                    <tr><td style="${statVal};color:${s.scoreChange >= 0 ? "#2A6E3A" : "#C94C2E"};">${delta}</td></tr>
                    <tr><td style="${statLabel}">Top Work Categories</td></tr>
                    <tr><td style="font-family:'Georgia',serif;font-size:14px;color:#0E0E0C;padding-bottom:12px;">${topTypes}</td></tr>
                    <tr><td style="${statLabel}">Total Invested</td></tr>
                    <tr><td style="${statVal}">${cents(s.totalSpentCents)}</td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:32px 40px;">
            <div style="background:#0E0E0C;padding:20px 24px;">
              <div style="font-family:'Georgia',serif;font-size:15px;color:#F4F1EB;line-height:1.5;">
                Every verified job is a permanent record on the blockchain — protecting your investment and building buyer confidence when you're ready to sell.
              </div>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:0 40px 32px;border-top:1px solid #C8C3B8;">
            <div style="font-family:monospace;font-size:11px;color:#7A7268;text-transform:uppercase;letter-spacing:0.06em;margin-top:24px;">HomeGentic — your home's permanent maintenance record.</div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  // ── renderText ──────────────────────────────────────────────────────────────

  function renderText(ctx: YearInReviewContext): string {
    const s     = buildSummary(ctx);
    const grade = getScoreGrade(s.scoreEnd);
    const delta = scoreChangeLabel(s.scoreChange);
    const topTypes = s.topServiceTypes.slice(0, 3).join(", ") || "—";

    return [
      `HomeGentic — ${s.reviewYear} Year in Review`,
      `${ctx.address}, ${ctx.city}, ${ctx.state}`,
      "=".repeat(50),
      "",
      `Hi ${ctx.ownerName},`,
      `Here's what you accomplished for your home in ${s.reviewYear}.`,
      "",
      `YEAR SUMMARY`,
      `─`.repeat(30),
      `Jobs logged:          ${s.jobsLogged}`,
      `Verified records:     ${s.verifiedCount}`,
      `DIY jobs:             ${s.diyCount}`,
      `Warranties set:       ${s.warrantiesSet}`,
      `Total invested:       ${cents(s.totalSpentCents)}`,
      s.estimatedValueAddedCents > 0
        ? `Est. value added:     ${cents(s.estimatedValueAddedCents)}`
        : "",
      "",
      `HOMEGENTIC SCORE`,
      `─`.repeat(30),
      `End of year:  ${s.scoreEnd} (${grade})`,
      `Change:       ${delta}`,
      `Top work:     ${topTypes}`,
      "",
      "─".repeat(50),
      "HomeGentic — your home's permanent maintenance record.",
    ].filter((l) => l !== undefined).join("\n");
  }

  // ── send ────────────────────────────────────────────────────────────────────

  async function send(to: string, ctx: YearInReviewContext): Promise<SendResult> {
    if (!to || to.trim() === "") throw new Error("'to' address is required");
    const messageId = `YIR_${Date.now()}_${++msgCounter}`;
    outbox.push({ to, propertyId: ctx.propertyId, messageId, sentAt: Date.now() });
    return { ok: true, messageId };
  }

  function getOutbox(): OutboxEntry[] {
    return [...outbox];
  }

  return { buildSummary, renderHtml, renderText, send, getOutbox };
}

export const yearInReviewService = createYearInReviewService();
