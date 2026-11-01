/**
 * Abuse protection for the Worker's paid AI routes (cycle-drain audit CD-1,
 * 2026-10-31). Per-account quotas alone don't hold: anyone can mint a new
 * principal and register it in two canister calls. So, on top of them:
 *
 *  1. Human check. A free account must pass Cloudflare Turnstile once
 *     (POST /api/human/verify) before any Claude call. Paid accounts already
 *     put a card down, so they skip it.
 *  2. A global daily budget for free accounts, counted in weighted tokens
 *     (input + 5 × output, roughly Sonnet's price ratio), not in calls. When it
 *     is spent, free accounts get 429 until midnight UTC; paid accounts are
 *     never cut off by it.
 *  3. A smaller document allowance for accounts verified in the last 7 days.
 *  4. Exponential backoff. Every 429 (and every failed human check) is a
 *     strike against the caller's IP and principal. After FREE_STRIKES in a
 *     day, each further strike blocks for 30 s, 1 min, 2 min, … up to 1 hour,
 *     and requests made while blocked count as strikes too, so a client that
 *     keeps hammering backs itself off.
 *
 * Counters live in RateLimiterDO (atomic), like the other limiters.
 */

import { hitCounter, peekCounter, peekWindow, addToCounter, extendWindow, type KVEnv } from "./rateLimiter";
import type { TokenUsage } from "../anthropicProvider";

export interface AiGuardEnv extends KVEnv {
  NODE_ENV?: string;
  /** Turnstile secret (Worker secret). Required in production. */
  TURNSTILE_SECRET_KEY?: string;
  /** Turnstile site key (public var), sent to clients that must pass the check. */
  TURNSTILE_SITE_KEY?: string;
  /** Weighted tokens per UTC day for all free accounts together. */
  FREE_AI_DAILY_TOKEN_BUDGET?: string;
  /** Aux AI calls per day for a free account in its first week. */
  NEW_ACCOUNT_AUX_DAILY_LIMIT?: string;
}

// ── Tiers ────────────────────────────────────────────────────────────────────

export function isFreeTier(tier: string): boolean {
  return tier !== "Pro" && tier !== "ContractorPro";
}

// ── Human check ──────────────────────────────────────────────────────────────

export const HUMAN_TTL_S = 365 * 86_400;
export const NEW_ACCOUNT_TTL_S = 7 * 86_400;
export const DEFAULT_NEW_ACCOUNT_AUX_LIMIT = 3;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** On in production even without a secret (fails closed), and wherever a secret is set. */
export function humanCheckRequired(env: AiGuardEnv): boolean {
  return !!env.TURNSTILE_SECRET_KEY || env.NODE_ENV === "production";
}

export async function isHuman(env: AiGuardEnv, principal: string): Promise<boolean> {
  return (await peekCounter(env, `human:${principal}`)) > 0;
}

export async function isNewAccount(env: AiGuardEnv, principal: string): Promise<boolean> {
  return (await peekCounter(env, `human-new:${principal}`)) > 0;
}

export function newAccountAuxLimit(env: AiGuardEnv): number {
  const n = Number(env.NEW_ACCOUNT_AUX_DAILY_LIMIT);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_NEW_ACCOUNT_AUX_LIMIT;
}

export type VerifyOutcome = { status: 200; body: { verified: true } } | { status: 400 | 503; body: { error: string } };

/**
 * Check a Turnstile token with Cloudflare and, on success, mark `principal` as
 * human for a year. The first success also starts the 7-day new-account window.
 */
export async function verifyHuman(
  env: AiGuardEnv,
  principal: string,
  token: unknown,
  ip: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyOutcome> {
  if (!env.TURNSTILE_SECRET_KEY) return { status: 503, body: { error: "human_check_unavailable" } };
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { status: 400, body: { error: "token_required" } };
  }
  let success = false;
  try {
    const res = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }).toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean };
    success = res.ok && data.success === true;
  } catch {
    return { status: 503, body: { error: "human_check_unavailable" } };
  }
  if (!success) return { status: 400, body: { error: "human_check_failed" } };

  const already = await isHuman(env, principal);
  await hitCounter(env, `human:${principal}`, 1, HUMAN_TTL_S);
  if (!already) await hitCounter(env, `human-new:${principal}`, 1, NEW_ACCOUNT_TTL_S);
  return { status: 200, body: { verified: true } };
}

// ── Free-tier daily token budget ─────────────────────────────────────────────

/** ≈ $30/day at Sonnet list prices ($3 in / $15 out per million tokens). */
export const DEFAULT_FREE_DAILY_TOKEN_BUDGET = 10_000_000;
export const OUTPUT_TOKEN_WEIGHT = 5;

export function freeDailyBudget(env: AiGuardEnv): number {
  const n = Number(env.FREE_AI_DAILY_TOKEN_BUDGET);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_FREE_DAILY_TOKEN_BUDGET;
}

export function weightedTokens(u: TokenUsage): number {
  return Math.max(0, u.inputTokens) + OUTPUT_TOKEN_WEIGHT * Math.max(0, u.outputTokens);
}

const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const budgetKey = (now = Date.now()) => `ai-free-tokens:${utcDay(now)}`;

export function nextUtcMidnight(now = Date.now()): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

export async function freeBudgetSpent(env: AiGuardEnv): Promise<boolean> {
  return (await peekCounter(env, budgetKey())) >= freeDailyBudget(env);
}

/** Count one model call against the free budget. */
export async function recordFreeUsage(env: AiGuardEnv, usage: TokenUsage): Promise<void> {
  const n = weightedTokens(usage);
  if (n > 0) await addToCounter(env, budgetKey(), n, 2 * 86_400);
}

// ── Exponential backoff ──────────────────────────────────────────────────────

export const STRIKE_WINDOW_S = 86_400;
export const FREE_STRIKES = 3;
export const BASE_BLOCK_S = 30;
export const MAX_BLOCK_S = 3_600;

/** Block length for the n-th strike in the window (0 = no block yet). */
export function blockSecondsFor(strikes: number): number {
  if (strikes <= FREE_STRIKES) return 0;
  return Math.min(MAX_BLOCK_S, BASE_BLOCK_S * 2 ** (strikes - FREE_STRIKES - 1));
}

/** Record a strike against each key ("ip:…", "p:…") and start or lengthen its block. */
export async function strike(env: AiGuardEnv, keys: string[]): Promise<void> {
  await Promise.all(
    keys.map(async (k) => {
      const { count } = await hitCounter(env, `strikes:${k}`, Number.MAX_SAFE_INTEGER, STRIKE_WINDOW_S);
      const secs = blockSecondsFor(count);
      if (secs > 0) await extendWindow(env, `block:${k}`, secs);
    }),
  );
}

/** Seconds until the longest of these keys' blocks ends (0 = not blocked). */
export async function blockedSeconds(env: AiGuardEnv, keys: string[], now = Date.now()): Promise<number> {
  const windows = await Promise.all(keys.map((k) => peekWindow(env, `block:${k}`)));
  const until = Math.max(0, ...windows.map((w) => (w.count > 0 ? w.expiresAt : 0)));
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}

export function slowDownBody(retryAfterSeconds: number) {
  return { error: "slow_down", retryAfterSeconds };
}

// ── The gate in front of every Claude call ───────────────────────────────────

export type AiGate =
  | { ok: true; newAccount: boolean }
  | { ok: false; status: 403 | 429; body: Record<string, unknown>; retryAfterSeconds?: number };

export async function gateAiCall(env: AiGuardEnv, principal: string, tier: string): Promise<AiGate> {
  const wait = await blockedSeconds(env, [`p:${principal}`]);
  if (wait > 0) return { ok: false, status: 429, body: slowDownBody(wait), retryAfterSeconds: wait };
  if (!isFreeTier(tier)) return { ok: true, newAccount: false };

  if (humanCheckRequired(env) && !(await isHuman(env, principal))) {
    return {
      ok: false,
      status: 403,
      body: { error: "human_verification_required", siteKey: env.TURNSTILE_SITE_KEY ?? null },
    };
  }
  if (await freeBudgetSpent(env)) {
    return { ok: false, status: 429, body: { error: "free_ai_budget_reached", resetsAt: nextUtcMidnight() } };
  }
  return { ok: true, newAccount: await isNewAccount(env, principal) };
}

// ── Mobile human-check page ──────────────────────────────────────────────────

/** Where the page may send the token back to (the mobile app's scheme only). */
export function allowedHumanCheckRedirect(raw: string | null): string | null {
  if (!raw || raw.length > 200) return null;
  return /^homegentic:\/\/[A-Za-z0-9/_-]*$/.test(raw) ? raw : null;
}

/**
 * GET /human-check?redirect=homegentic://human-check — a page the mobile app
 * opens in an auth browser session. It shows the Turnstile widget and, once
 * solved, redirects back to the app with ?token=…, which the app posts to
 * /api/human/verify with its session. The token alone grants nothing.
 */
export function humanCheckPage(siteKey: string, redirect: string, nonce: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quick check · HomeGentic</title>
<script nonce="${esc(nonce)}" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:90vh;margin:0;color:#0B0D1A}p{max-width:22rem;text-align:center;line-height:1.5}</style>
</head><body>
<p>Before using the AI assistant, please confirm you're a person.</p>
<div class="cf-turnstile" data-sitekey="${esc(siteKey)}" data-callback="done"></div>
<script nonce="${esc(nonce)}">
function done(t){location.href=${JSON.stringify(redirect)}+"?token="+encodeURIComponent(t);}
</script>
</body></html>`;
}

/** Headers for humanCheckPage: only Turnstile and this page's own inline script may run. */
export function humanCheckPageHeaders(nonce: string): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      `default-src 'none'; script-src 'nonce-${nonce}' https://challenges.cloudflare.com; ` +
      "frame-src https://challenges.cloudflare.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}
