/**
 * ResendEmailProvider — implements EmailProvider using the Resend SDK.
 *
 * All Resend-specific types are confined to this file.
 * Callers interact only with the EmailProvider interface.
 * Mirrors the AnthropicProvider pattern in anthropicProvider.ts.
 *
 * Rate limiting
 * ─────────────
 * Free tier: 3,000 emails/month, 100/day.
 * RateLimitedEmailProvider wraps any EmailProvider and enforces both caps
 * using in-memory counters that reset automatically at day/month boundaries.
 * Counters survive for the lifetime of the process; a server restart resets
 * them (acceptable for low-traffic transactional mail — worst case a restart
 * mid-day allows a second window of 100 that day).
 */

import { Resend } from "resend";
import {
  type EmailProvider,
  type SendEmailParams,
  type EmailResult,
  EmailRateLimitError,
} from "./emailProvider";

// ── Concrete Resend implementation ────────────────────────────────────────────

export class ResendEmailProvider implements EmailProvider {
  private client:   Resend;
  private fromEmail: string;

  constructor(apiKey: string, fromEmail: string) {
    this.client    = new Resend(apiKey);
    this.fromEmail = fromEmail;
  }

  async send(params: SendEmailParams): Promise<EmailResult> {
    const { data, error } = await this.client.emails.send({
      from:     params.from    ?? this.fromEmail,
      to:       Array.isArray(params.to) ? params.to : [params.to],
      subject:  params.subject,
      html:     params.html,
      ...(params.text    ? { text:    params.text    } : {}),
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    });

    if (error || !data) {
      throw new Error(`Resend error: ${error?.message ?? "unknown"}`);
    }

    return { id: data.id };
  }
}

// ── Rate-limiting wrapper ─────────────────────────────────────────────────────

const DAILY_LIMIT   = 100;
const MONTHLY_LIMIT = 3_000;

function dayKey(d: Date):   string { return d.toISOString().slice(0, 10); }   // YYYY-MM-DD
function monthKey(d: Date): string { return d.toISOString().slice(0, 7);  }   // YYYY-MM

export class RateLimitedEmailProvider implements EmailProvider {
  private inner: EmailProvider;

  private dailyCount   = 0;
  private monthlyCount = 0;
  private currentDay:   string;
  private currentMonth: string;

  constructor(inner: EmailProvider) {
    this.inner        = inner;
    const now         = new Date();
    this.currentDay   = dayKey(now);
    this.currentMonth = monthKey(now);
  }

  /** Reset counters when the calendar day or month has rolled over. */
  private tick(): void {
    const now = new Date();
    const d   = dayKey(now);
    const m   = monthKey(now);

    if (d !== this.currentDay) {
      this.dailyCount  = 0;
      this.currentDay  = d;
    }
    if (m !== this.currentMonth) {
      this.monthlyCount = 0;
      this.currentMonth = m;
    }
  }

  /** Current usage snapshot — useful for health/monitoring endpoints. */
  usage(): { daily: number; monthly: number; dailyLimit: number; monthlyLimit: number } {
    this.tick();
    return {
      daily:        this.dailyCount,
      monthly:      this.monthlyCount,
      dailyLimit:   DAILY_LIMIT,
      monthlyLimit: MONTHLY_LIMIT,
    };
  }

  async send(params: SendEmailParams): Promise<EmailResult> {
    this.tick();

    if (this.dailyCount >= DAILY_LIMIT) {
      console.warn(
        `[email] Daily limit reached (${DAILY_LIMIT}/day). ` +
        `Monthly usage: ${this.monthlyCount}/${MONTHLY_LIMIT}. ` +
        `Consider upgrading to Resend's paid plan ($20/mo for 50k emails).`
      );
      throw new EmailRateLimitError(
        `Daily email limit reached (${DAILY_LIMIT}/day). Resets at midnight UTC.`
      );
    }
    if (this.monthlyCount >= MONTHLY_LIMIT) {
      console.warn(
        `[email] Monthly limit reached (3,000/month). ` +
        `Upgrade to Resend's paid plan ($20/mo for 50k emails).`
      );
      throw new EmailRateLimitError(
        `Monthly email limit reached (3,000/month). Resets ${this.currentMonth}-01 UTC.`
      );
    }

    const result = await this.inner.send(params);

    // Only increment after a confirmed successful send.
    this.dailyCount++;
    this.monthlyCount++;

    return result;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/** Instantiate the rate-limited Resend provider from env vars. */
export function createEmailProvider(): RateLimitedEmailProvider {
  return new RateLimitedEmailProvider(
    new ResendEmailProvider(
      process.env.RESEND_API_KEY  ?? "",
      process.env.RESEND_FROM_EMAIL ?? "noreply@homegentic.app",
    )
  );
}
