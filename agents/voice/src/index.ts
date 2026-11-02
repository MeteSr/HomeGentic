/**
 * Cloudflare Workers entry point — replaces agents/voice/server.ts.
 *
 * All endpoints are identical to the Express server; the only structural
 * changes are:
 *   - Express middleware → manual routing on URL path
 *   - res.write() SSE   → ReadableStream / TransformStream
 *   - express-rate-limit / agentLimiter in-memory Map → Workers KV (rateLimiter.ts)
 *   - process.env.*     → env.* bindings (Workers) or process.env via nodejs_compat
 *   - setInterval flush → ctx.waitUntil (fire-and-forget per request)
 *   - createHmac / timingSafeEqual from node:crypto (works via nodejs_compat)
 */

import { createHmac, timingSafeEqual } from "crypto";
import { buildSystemPrompt } from "../prompts";
import { buildMaintenanceSystemPrompt } from "../../maintenance/prompts";
import type { MaintenanceContext } from "../../maintenance/prompts";
import { HOMEGENTIC_TOOLS } from "../tools";
import { resolveModel, PROVIDER_JSON_ERROR } from "../provider";
import { AnthropicProvider } from "../anthropicProvider";
import {
  activateInCanister,
  activateSubscriptionUntil,
  consumeAgentCredit,
  grantAgentCreditsOnce,
  recordGift,
  AlreadyConsumedError,
  PAID_TIERS,
} from "../paymentCanister";
import { getCriticalCycleAlerts, checkCycleLevels as getCanisterCycleLevels } from "../monitoringCanister";
import {
  buildDocumentSystemPrompt,
  normalizeExtraction,
  SUPPORTED_MIME_TYPES,
} from "../extractDocumentHelpers";
import { lookupPermits, generateKit, geocodeAddress } from "../buyersTruthKit";
import {
  parseInsightsPayload, describeFacts, parseNarrative, ruleBasedNarrative, NARRATIVE_SYSTEM_PROMPT,
} from "../billsInsights";
import type { BuyerTruthKitRequest } from "../buyersTruthKit";
import type { ChatRequest } from "../types";
import { logger } from "../../../packages/shared/src/logger";
import { checkGlobalRateLimit, checkAgentRateLimit, checkChatRateLimit, checkAuxAiRateLimit, getAgentUsage, beginOnce, finishOnce, abortOnce, hitCounter } from "./rateLimiter";
import { resolveSessionPrincipal, SESSION_HEADER } from "./session";
import { resolveTier } from "./tier";
import { lookupRentcast } from "./rentcast";
import { handleBidtolist, scheduledBidtolist } from "./bidtolist";
import { canisterLedger, startCardSetup, saveCardFromSession, markInvoicePaid, markPaymentIntentPaid, chargeDueFees } from "./referralFees";
import { handleInbound, addDraftInCanister, checkTokenInCanister, MAX_RAW_BYTES } from "./inbox";
import { checkLicense } from "./dbpr";
import { findRecalls } from "./recalls";
import { suggestAddresses, placeAddress } from "./addressSuggest";
import { lookupPropertyDetails, importPermits, sendContractorInvite, sendBrokerLead, sendGiftEmail } from "./offchainOutcalls";
import { getInvitePreview } from "./jobCanister";
import { handlePhotos } from "./photos";
import { handleShowingRequest, fileShowingInCanister } from "./showings";
import { r2PhotoStore } from "./photoStore";
import { fetchPhotoAccess } from "../photoCanister";
import { markIdentityCleared } from "./propertyCanister";
import { reportServiceError, routeKey } from "./serviceErrors";
import {
  gateAiCall, gatePaidCall, verifyHuman, strike, blockedSeconds, slowDownBody, isFreeTier, recordFreeUsage,
  newAccountAuxLimit, allowedHumanCheckRedirect, humanCheckPage, humanCheckPageHeaders,
} from "./aiGuard";
export { RateLimiterDO } from "./rateLimiterDO";
import {
  HttpError,
  readJsonBody,
  readBodyBytes,
  MAX_JSON_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_WEBHOOK_BYTES,
  MAX_CHAT_MESSAGE_CHARS,
  MAX_AI_PDF_BYTES,
  pdfTooLarge,
  timingSafeEqualStr,
  isAllowedRedirectUrl,
  sanitiseAgentMessages,
  redactRecord,
  PRINCIPAL_RE,
  CHECKOUT_SESSION_RE,
  SUBSCRIPTION_ID_RE,
  PAYMENT_INTENT_RE,
  EMAIL_RE,
} from "./security";

// ── Environment bindings ──────────────────────────────────────────────────────

export interface Env {
  // AI
  ANTHROPIC_API_KEY:   string;
  AI_MODEL?:           string;
  ANTHROPIC_BASE_URL?: string;   // load tests only: a mock Anthropic API (tests/k6/mock-anthropic.mjs)
  // Auth / routing
  VOICE_AGENT_API_KEY: string;   // public client identifier (ships in the bundle), not a secret
  /** Secret for /admin/* routes (never shipped to the browser). Unset → /admin/* disabled. */
  ADMIN_API_KEY?:      string;
  FRONTEND_ORIGIN:     string;
  BIDTOLIST_FRONTEND_ORIGIN?: string;
  NODE_ENV?: string;
  // Stripe — HomeGentic
  STRIPE_SECRET_KEY:              string;
  STRIPE_WEBHOOK_SECRET:          string;
  STRIPE_PRICE_PRO_MONTHLY?:           string;
  STRIPE_PRICE_PRO_YEARLY?:            string;
  STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY?: string;
  STRIPE_PRICE_CONTRACTOR_PRO_YEARLY?:  string;
  STRIPE_PRICE_CREDITS_25?:  string;
  STRIPE_PRICE_CREDITS_100?: string;
  // ICP
  DFX_IDENTITY_PEM?:     string;
  DFX_NETWORK?:          string;
  IC_HOST?:              string;   // overrides the IC host (tests point it at PocketIC)
  CANISTER_ID_PAYMENT?:  string;
  CANISTER_ID_AUTH?:     string;   // resolves x-agent-session tokens
  CANISTER_ID_MONITORING?: string;
  CANISTER_ID_JOB?:      string;   // invite-token previews for contractor-invite emails
  CANISTER_ID_PHOTO?:    string;   // photoAccess checks for /photos/*
  CANISTER_ID_CONTRACTOR?: string; // records DBPR licence lookups (/api/license/check)
  DBPR_LICENSE_FILE_URL?:  string; // override for DBPR's construction licensee file (src/dbpr.ts)
  CANISTER_ID_PROPERTY?: string;   // records Stripe Identity results (relayMarkIdentityCleared)
  CANISTER_ID_FEE?:      string;   // Contractor Free referral fees (src/referralFees.ts)
  CANISTER_ID_LISTING?:  string;   // files FSBO showing requests (src/showings.ts)
  /** Domain whose mail Email Routing sends to email() (h-<token>@INBOX_DOMAIN). Unset → inbound mail ignored. */
  INBOX_DOMAIN?:         string;

  // M-6: keys that used to sit in the ai_proxy canister (now Worker secrets only)
  ATTOM_API_KEY?:        string;
  OPENPERMIT_API_KEY?:   string;
  RESEND_API_KEY?:       string;
  RESEND_FROM?:          string;   // e.g. "HomeGentic <noreply@homegentic.app>"
  LOCAL_BROKER_EMAIL?:   string;   // fixed inbox for /api/email/broker-lead
  ATTOM_DAILY_BUDGET?:   string;   // global ATTOM lookups/day (default 300)
  GOOGLE_PLACES_API_KEY?: string;  // Places API (New), Add Property address suggestions
  ADDRESS_DAILY_BUDGET?: string;   // global address suggest+place calls/day (default 5000)
  PERMIT_DAILY_BUDGET?:  string;   // global permit imports/day (default 1000)
  // Property lookups
  RENTCAST_API_KEY?: string;
  // BidtoList
  BIDTOLIST_RESEND_API_KEY?:           string;
  BIDTOLIST_RESEND_FROM?:              string;
  BIDTOLIST_STRIPE_SECRET_KEY?:        string;
  BIDTOLIST_STRIPE_WEBHOOK_SECRET?:    string;
  BIDTOLIST_STRIPE_PRICE_PLATFORM_FEE?: string;
  BIDTOLIST_LISTING_CANISTER_ID?:      string;
  BIDTOLIST_AGENT_CANISTER_ID?:        string;
  BIDTOLIST_FEE_CANISTER_ID?:          string;
  BIDTOLIST_IDENTITY_SEED?:            string;
  BIDTOLIST_ICP_HOST?:                 string;
  HOMEGENTIC_CANISTER_ID?:             string;
  HOMEGENTIC_ICP_HOST?:                string;
  // KV
  RATE_LIMIT: KVNamespace;
  /** RateLimiterDO namespace (atomic counters); KV is the fallback when unbound. */
  RATE_LIMITER?: DurableObjectNamespace;
  // R2: off-chain photo bytes (/photos/*), wrapped by r2PhotoStore. Unbound → 503.
  PHOTOS?: R2Bucket;
  // AI abuse protection (src/aiGuard.ts, CD-1)
  /** Cloudflare Turnstile secret (Worker secret). Free accounts need a pass before AI calls. */
  TURNSTILE_SECRET_KEY?: string;
  /** Turnstile site key (public var), returned to clients that must pass the check. */
  TURNSTILE_SITE_KEY?: string;
  /** Weighted tokens (input + 5 × output) per UTC day for all free accounts together. */
  FREE_AI_DAILY_TOKEN_BUDGET?: string;
  /** Aux AI calls per day for a free account in its first week (default 3). */
  NEW_ACCOUNT_AUX_DAILY_LIMIT?: string;
}

// ── Credit pack config (mirrors server.ts CREDIT_PACKS) ──────────────────────

/** Property ids: UUIDs for new properties, older numeric/prefixed ids. */
const PROPERTY_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const IDENTITY_SESSIONS_PER_DAY = 3;

/** Subscriptions Stripe may still charge. */
const LIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "incomplete", "unpaid"]);

/** One-time gift prices (cents). Pro is annual-only; gifts are sold as one year. */
const GIFT_PRICE_CENTS: Record<string, number> = { ProYearly: 5_900 };

const CREDIT_PACKS: Record<number, { envVar: keyof Env; label: string }> = {
  25:  { envVar: "STRIPE_PRICE_CREDITS_25",  label: "25 credits" },
  100: { envVar: "STRIPE_PRICE_CREDITS_100", label: "100 credits" },
};

// ── CORS ──────────────────────────────────────────────────────────────────────

function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  if (env.FRONTEND_ORIGIN && origin === env.FRONTEND_ORIGIN) return true;
  if (env.BIDTOLIST_FRONTEND_ORIGIN && origin === env.BIDTOLIST_FRONTEND_ORIGIN) return true;
  // Dev: allow any localhost port when FRONTEND_ORIGIN is not set
  if (!env.FRONTEND_ORIGIN && origin.startsWith("http://localhost:")) return true;
  return false;
}

function buildCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin || !isAllowedOrigin(origin, env)) return {};
  return {
    "Access-Control-Allow-Origin":   origin,
    "Access-Control-Allow-Methods":  "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, x-api-key, x-icp-principal, x-subscription-tier, x-agent-session, " +
      "x-context-hmac, x-request-id, x-trace-id",
    "Access-Control-Expose-Headers":
      "x-request-id, x-trace-id, X-Agent-Calls-Used, X-Agent-Calls-Limit",
  };
}

// ── Response helpers ──────────────────────────────────────────────────────────

function json(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

// ── SSE streaming ─────────────────────────────────────────────────────────────

function sseResponse(
  run: (write: (event: string) => Promise<void>) => Promise<void>,
  cors: Record<string, string>,
): Response {
  const enc                    = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer                 = writable.getWriter();

  (async () => {
    try {
      await run(async (event) => {
        await writer.write(enc.encode(event));
      });
    } catch (err) {
      // The 200 is already sent; log so a failed stream isn't a silent empty reply.
      logger.error("sse", "stream failed", { error: (err as Error)?.message });
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      ...cors,
    },
  });
}

// ── Context integrity helpers (mirrors server.ts) ─────────────────────────────

function verifyHmac(key: string, body: object, provided: string): boolean {
  const expected = createHmac("sha256", key).update(JSON.stringify(body)).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

function sanitiseContext(ctx: any, principal: string): any {
  if (!ctx || typeof ctx !== "object") {
    return { properties: [], recentJobs: [], expiringWarranties: [], pendingSignatureJobIds: [], openQuoteCount: 0, principal };
  }

  const clampStr = (v: unknown, max = 200) => typeof v === "string" ? v.slice(0, max) : "";
  const clampNum = (v: unknown, max = 1e9) => typeof v === "number" ? Math.min(Math.abs(v), max) : 0;
  const clampArr = (v: unknown, max: number) => Array.isArray(v) ? v.slice(0, max) : [];

  const properties = clampArr(ctx.properties, 20).map((p: any) => ({
    id:                clampStr(p.id, 64),
    address:           clampStr(p.address),
    city:              clampStr(p.city, 100),
    state:             clampStr(p.state, 50),
    zipCode:           clampStr(p.zipCode, 20),
    propertyType:      clampStr(p.propertyType, 50),
    yearBuilt:         clampNum(p.yearBuilt, 2100),
    squareFeet:        clampNum(p.squareFeet, 100_000),
    verificationLevel: clampStr(p.verificationLevel, 50),
  }));

  const recentJobs = clampArr(ctx.recentJobs, 50).map((j: any) => ({
    id:             clampStr(j.id, 64),
    serviceType:    clampStr(j.serviceType, 100),
    description:    clampStr(j.description, 500),
    contractorName: clampStr(j.contractorName, 100) || undefined,
    amount:         clampNum(j.amount, 100_000_00),
    status:         clampStr(j.status, 50),
    date:           clampStr(j.date, 20),
    warrantyMonths: typeof j.warrantyMonths === "number"
      ? clampNum(j.warrantyMonths, 600) : undefined,
  }));

  // buildSystemPrompt reads these unguarded, so a client that omits one must
  // not crash the stream.
  return {
    ...ctx, properties, recentJobs,
    expiringWarranties:     clampArr(ctx.expiringWarranties, 50),
    pendingSignatureJobIds: clampArr(ctx.pendingSignatureJobIds, 100),
    openQuoteCount:         clampNum(ctx.openQuoteCount, 10_000),
    principal,
  };
}

// ── Structured request logging ────────────────────────────────────────────────

function logRequest(
  request: Request,
  status: number,
  startMs: number,
  reqId: string,
  traceId?: string,
): void {
  const entry: Record<string, unknown> = {
    ts:        new Date().toISOString(),
    method:    request.method,
    path:      new URL(request.url).pathname,
    status,
    latencyMs: Date.now() - startMs,
    ip:
      (request.headers.get("CF-Connecting-IP") ??
       request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
       "unknown"),
    reqId,
  };
  if (traceId) entry.traceId = traceId;
  console.log(JSON.stringify(entry));
}

// ── Error aggregation (in-memory per isolate, flushed via ctx.waitUntil) ──────

interface ErrorAgg {
  fingerprint: string;
  message:     string;
  errorType:   string;
  count:       number;
  firstSeen:   number;
  lastSeen:    number;
  tierCounts:  Map<string, number>;
  release?:    string;
  dirty:       boolean;
}

const errorAggMap = new Map<string, ErrorAgg>();
/** F-11: bound per-isolate memory and canister update calls from /api/errors. */
const MAX_ERROR_FINGERPRINTS = 200;
const ERROR_FLUSH_INTERVAL_MS = 60_000;
let lastErrorFlushMs = 0;

/** `force` flushes now: the first report of a fingerprint is sent at once, so
 *  an isolate that is evicted before the next flush loses only repeat counts. */
async function flushErrorAggregations(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastErrorFlushMs < ERROR_FLUSH_INTERVAL_MS) return;
  lastErrorFlushMs = now;
  const { recordFrontendError } = await import("../monitoringCanister");
  for (const [fingerprint, agg] of errorAggMap) {
    if (!agg.dirty) continue;
    try {
      await recordFrontendError({
        fingerprint,
        message:   agg.message,
        errorType: agg.errorType,
        count:     agg.count,
        firstSeen: BigInt(Math.floor(agg.firstSeen * 1_000_000)),
        lastSeen:  BigInt(Math.floor(agg.lastSeen  * 1_000_000)),
        tierCounts: [...agg.tierCounts.entries()],
        release:    agg.release,
      });
    } catch { /* best-effort */ }
    agg.dirty = false;
    agg.count = 0;
  }
  // Drop entries that have been flushed so the map can't grow without bound.
  for (const [fp, agg] of errorAggMap) if (!agg.dirty) errorAggMap.delete(fp);
}

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(scheduledBidtolist(env));
    ctx.waitUntil(scheduledReferralFees(env));
  },

  /** Forwarded invoices → draft jobs (src/inbox.ts). Never replies or rejects, so forged senders get no backscatter. */
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.INBOX_DOMAIN) return;
    (process.env as any).DFX_IDENTITY_PEM = env.DFX_IDENTITY_PEM ?? "";
    (process.env as any).DFX_NETWORK      = env.DFX_NETWORK ?? "ic";
    (process.env as any).IC_HOST          = env.IC_HOST ?? "";
    (process.env as any).CANISTER_ID_JOB  = env.CANISTER_ID_JOB ?? "";
    const provider = new AnthropicProvider(env.ANTHROPIC_API_KEY, resolveModel(env.AI_MODEL), env.ANTHROPIC_BASE_URL);
    try {
      if (message.rawSize > MAX_RAW_BYTES) { logger.info("inbox", "inbound mail", { outcome: "too-large" }); return; }
      const raw = await new Response(message.raw).arrayBuffer();
      const outcome = await handleInbound(message.to, raw, message.rawSize, env.INBOX_DOMAIN, {
        provider, addDraft: addDraftInCanister, checkToken: checkTokenInCanister,
        allow: async (key, limit, ttl) => (await hitCounter(env, key, limit, ttl)).allowed,
      });
      logger.info("inbox", "inbound mail", { outcome });
    } catch (err) {
      logger.error("inbox", "inbound mail failed", { error: (err as Error)?.message });
      await reportServiceError("inbox", "inbound mail failed");
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startMs  = Date.now();
    const reqId    = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const traceId  = request.headers.get("x-trace-id") ?? undefined;
    const url      = new URL(request.url);
    const path     = url.pathname;
    const cors     = buildCorsHeaders(request, env);

    // Mirror env bindings into process.env so imported modules that read
    // process.env at call-time (paymentCanister, monitoringCanister, etc.)
    // see the correct runtime values.
    (process.env as any).ANTHROPIC_API_KEY       = env.ANTHROPIC_API_KEY;
    (process.env as any).VOICE_AGENT_API_KEY     = env.VOICE_AGENT_API_KEY;
    (process.env as any).FRONTEND_ORIGIN         = env.FRONTEND_ORIGIN;
    (process.env as any).STRIPE_SECRET_KEY       = env.STRIPE_SECRET_KEY;
    (process.env as any).STRIPE_WEBHOOK_SECRET   = env.STRIPE_WEBHOOK_SECRET;
    (process.env as any).DFX_IDENTITY_PEM        = env.DFX_IDENTITY_PEM ?? "";
    (process.env as any).DFX_NETWORK             = env.DFX_NETWORK ?? "ic";
    (process.env as any).IC_HOST                 = env.IC_HOST ?? "";
    (process.env as any).CANISTER_ID_PAYMENT     = env.CANISTER_ID_PAYMENT ?? "";
    (process.env as any).CANISTER_ID_AUTH        = env.CANISTER_ID_AUTH ?? "";
    (process.env as any).CANISTER_ID_MONITORING  = env.CANISTER_ID_MONITORING ?? "";
    (process.env as any).CANISTER_ID_JOB         = env.CANISTER_ID_JOB ?? "";
    (process.env as any).CANISTER_ID_PHOTO       = env.CANISTER_ID_PHOTO ?? "";
    (process.env as any).CANISTER_ID_PROPERTY    = env.CANISTER_ID_PROPERTY ?? "";
    (process.env as any).CANISTER_ID_CONTRACTOR  = env.CANISTER_ID_CONTRACTOR ?? "";
    (process.env as any).CANISTER_ID_FEE         = env.CANISTER_ID_FEE ?? "";
    (process.env as any).CANISTER_ID_LISTING     = env.CANISTER_ID_LISTING ?? "";
    (process.env as any).AI_MODEL                = env.AI_MODEL ?? "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Exponential backoff (aiGuard.ts): an IP that keeps collecting 429s is
    // blocked for doubling periods. Requests made while blocked are strikes too.
    const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (path.startsWith("/api/") && backoffApplies(path)) {
      const wait = await blockedSeconds(env, [`ip:${clientIp}`]);
      if (wait > 0) {
        ctx.waitUntil(strike(env, [`ip:${clientIp}`]).catch(() => {}));
        logRequest(request, 429, startMs, reqId, traceId);
        return json(slowDownBody(wait), 429, { ...cors, "Retry-After": String(wait) });
      }
    }

    // Global 30 req/min rate limit on /api/ routes
    if (path.startsWith("/api/")) {
      const ip = clientIp;
      const allowed = await checkGlobalRateLimit(ip, env);
      if (!allowed) {
        if (backoffApplies(path)) ctx.waitUntil(strike(env, [`ip:${ip}`]).catch(() => {}));
        const resp = json({ error: "Too many requests — please wait before retrying." }, 429, { ...cors, "Retry-After": "60" });
        logRequest(request, 429, startMs, reqId, traceId);
        return resp;
      }
    }

    // API key check on /api/ routes (except Stripe webhooks). The key ships
    // in the browser bundle, so it is only a client identifier — real
    // authentication is the x-agent-session check inside route(). F-6: fail
    // closed in production when it (or the auth canister) isn't configured,
    // and compare in constant time.
    // Bid to List is a separate app with no copy of this key; its routes are
    // bound to on-chain state and rate-limited per IP in bidtolist.ts.
    if (path.startsWith("/api/") &&
        !path.startsWith("/api/stripe/webhook") &&
        !path.startsWith("/api/bidtolist/")) {
      const key = env.VOICE_AGENT_API_KEY;
      if (env.NODE_ENV === "production" && (!key || !env.CANISTER_ID_AUTH)) {
        logRequest(request, 500, startMs, reqId, traceId);
        return json({ error: "Service misconfigured" }, 500, cors);
      }
      if (key && !timingSafeEqualStr(request.headers.get("x-api-key") ?? "", key)) {
        const resp = json({ error: "Unauthorized" }, 401, cors);
        logRequest(request, 401, startMs, reqId, traceId);
        return resp;
      }
    }

    // Build helpers used across routes
    const provider = new AnthropicProvider(
      env.ANTHROPIC_API_KEY,
      resolveModel(env.AI_MODEL),
      env.ANTHROPIC_BASE_URL,
    );

    let response: Response;

    try {
      response = await route(request, path, env, ctx, provider, cors);
    } catch (err) {
      if (err instanceof HttpError) {
        response = json({ error: err.message }, err.status, cors);
      } else {
        // F-11: never echo internal / upstream error text to the client.
        logger.error("worker", "unhandled route error", { path, error: (err as Error)?.message });
        response = json({ error: "Internal error" }, 500, cors);
      }
    }

    // Every other 429 (daily limits, budgets) is a strike against the IP and,
    // when the request carried a valid session, the principal.
    if (response.status === 429 && path.startsWith("/api/") && backoffApplies(path)) {
      const p = resolvedPrincipals.get(request);
      const keys = [`ip:${clientIp}`, ...(p && p !== "anon" ? [`p:${p}`] : [])];
      ctx.waitUntil(strike(env, keys).catch(() => {}));
    }

    // 5xx = our failure, not the caller's: count it for the ops watchdog.
    if (response.status >= 500) {
      ctx.waitUntil(reportServiceError("worker-5xx", `${response.status} ${request.method} ${routeKey(path)}`));
    }

    // Attach request-id / trace-id to every response
    const headers = new Headers(response.headers);
    headers.set("x-request-id", reqId);
    if (traceId) headers.set("x-trace-id", traceId);
    Object.entries(cors).forEach(([k, v]) => { if (!headers.has(k)) headers.set(k, v); });

    logRequest(request, response.status, startMs, reqId, traceId);

    return new Response(response.body, { status: response.status, headers });
  },
};

// ── Router ────────────────────────────────────────────────────────────────────

async function route(
  request: Request,
  path: string,
  env: Env,
  ctx: ExecutionContext,
  provider: AnthropicProvider,
  cors: Record<string, string>,
): Promise<Response> {
  const method = request.method;

  // ── BidtoList sub-router ──────────────────────────────────────────────────
  if (path.startsWith("/api/bidtolist/")) {
    const subpath = path.slice("/api/bidtolist".length);
    return withCors(await handleBidtolist(request, subpath, env, () => callerPrincipal(request, env)), cors);
  }

  // ── Off-chain photo bytes (R2) ────────────────────────────────────────────
  // Clients ask before choosing beginUpload + PUT over on-chain uploadPhoto.
  if (path === "/photos-config" && method === "GET") {
    return json({ offChain: photoStorageReady(env) }, 200, { ...cors, "Cache-Control": "public, max-age=300" });
  }
  if (path.startsWith("/photos/")) {
    return withCors(await handlePhotos(request, path, env, {
      store:     env.PHOTOS && photoStorageReady(env) ? r2PhotoStore(env.PHOTOS) : null,
      principal: () => callerPrincipal(request, env),
      access:    fetchPhotoAccess,
    }), cors);
  }

  // ── Human check (aiGuard.ts, CD-1) ─────────────────────────────────────────
  // GET /human-check: the Turnstile page the mobile app opens in a browser
  // session; it hands the token back through the app's URL scheme.
  if (path === "/human-check" && method === "GET") {
    const redirect = allowedHumanCheckRedirect(new URL(request.url).searchParams.get("redirect"));
    if (!redirect || !env.TURNSTILE_SITE_KEY) return json({ error: "unavailable" }, 400, cors);
    const nonce = crypto.randomUUID().replace(/-/g, "");
    return new Response(humanCheckPage(env.TURNSTILE_SITE_KEY, redirect, nonce), { status: 200, headers: humanCheckPageHeaders(nonce) });
  }
  // POST /api/human/verify { token } — marks the session's principal as human.
  if (path === "/api/human/verify" && method === "POST") {
    const principal = await callerPrincipal(request, env);
    if (!principal || principal === "anon") return json({ error: "session_required" }, 401, cors);
    const body = await readJsonBody(request, MAX_JSON_BYTES);
    const ip   = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const r = await verifyHuman(env, principal, (body as { token?: unknown })?.token, ip);
    if (r.status === 400) ctx.waitUntil(strike(env, [`ip:${ip}`, `p:${principal}`]).catch(() => {}));
    return json(r.body, r.status, cors);
  }

  // ── POST /api/fsbo/showing-request ─────────────────────────────────────────
  // A buyer asks to see a live FSBO listing (src/showings.ts). Signed-in or
  // not; per-IP limits run before the listing canister is called (M-2).
  if (path === "/api/fsbo/showing-request" && method === "POST") {
    const body = await readJsonBody(request, MAX_JSON_BYTES);
    const ip   = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const r = await handleShowingRequest(body, ip, env, {
      principal: () => callerPrincipal(request, env),
      file: fileShowingInCanister,
    });
    return json(r.body as object, r.status, cors);
  }

  // X-1 / F-4: every route that costs money (Anthropic, Rentcast) or touches
  // Stripe needs a verified caller. The x-api-key is public, so it doesn't
  // count; the canister-issued x-agent-session token does.
  let sessionPrincipal: string | null = null;
  let sessionTier = "Free";
  if (method === "POST" && (AUX_AI_ROUTES.has(path) || STRIPE_SESSION_ROUTES.has(path) || OFFCHAIN_OUTCALL_ROUTES.has(path) || ADDRESS_ROUTES.has(path))) {
    sessionPrincipal = await callerPrincipal(request, env);
    if (!sessionPrincipal || sessionPrincipal === "anon") {
      return json({ error: "session_required" }, 401, cors);
    }
    if (AUX_AI_ROUTES.has(path)) {
      const tier = await resolveTier(sessionPrincipal, env);
      const gate = await aiGate(sessionPrincipal, tier, env, ctx, provider, cors);
      if ("deny" in gate) return gate.deny;
      const quota = await checkAuxAiRateLimit(
        sessionPrincipal, tier, env, gate.newAccount ? newAccountAuxLimit(env) : undefined,
      );
      if (!quota.allowed) {
        return json({ error: "daily_ai_limit_reached", limit: quota.limit, resetsAt: quota.resetsAt }, 429, cors);
      }
    }
    if (ADDRESS_ROUTES.has(path) || OFFCHAIN_OUTCALL_ROUTES.has(path)) {
      // Paid Google / ATTOM / permit / email calls: the AI routes' backoff
      // block and human check, but not the free-tier Claude budget; quotas
      // live in addressSuggest.ts and offchainOutcalls.ts. CD-9/CD-11: a
      // throwaway account must pass the human check before it can spend the
      // shared ATTOM, permit and email budgets.
      sessionTier = await resolveTier(sessionPrincipal, env);
      const gate = await gatePaidCall(env, sessionPrincipal, sessionTier);
      if (!gate.ok) {
        const headers = gate.retryAfterSeconds ? { ...cors, "Retry-After": String(gate.retryAfterSeconds) } : cors;
        return json(gate.body, gate.status, headers);
      }
    }
  }

  // ── POST /api/chat ────────────────────────────────────────────────────────
  if (path === "/api/chat" && method === "POST") {
    const body = await readJsonBody(request, MAX_JSON_BYTES);
    const verified = await verifyContext(request, body, path, env);
    if (!verified) return json({ error: "Context integrity check failed." }, 403, cors);

    const { message, context } = body as ChatRequest;
    if (typeof message !== "string" || !message.trim()) return json({ error: "message is required" }, 400, cors);
    if (message.length > MAX_CHAT_MESSAGE_CHARS) return json({ error: "message too long" }, 400, cors);

    const principal = await callerPrincipal(request, env);
    if (!principal) return json({ error: "session_required" }, 401, cors);
    const chatTier = await resolveTier(principal, env);
    const chatGate = await aiGate(principal, chatTier, env, ctx, provider, cors);
    if ("deny" in chatGate) return chatGate.deny;
    const chat = await checkChatRateLimit(principal, chatTier, env);
    if (!chat.allowed) {
      return json({ error: "daily_chat_limit_reached", limit: chat.limit, resetsAt: chat.resetsAt }, 429, cors);
    }

    return sseResponse(async (write) => {
      for await (const chunk of provider.stream({
        system:    buildSystemPrompt(sanitiseContext(context, principal)),
        messages:  [{ role: "user", content: message.trim() }],
        maxTokens: 200,
      })) {
        await write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
      await write("data: [DONE]\n\n");
    }, cors);
  }

  // ── GET /api/agent/usage ──────────────────────────────────────────────────
  // The caller's agent-call count for the current period (no side effects).
  if (path === "/api/agent/usage" && method === "GET") {
    const principal = await callerPrincipal(request, env);
    if (!principal) return json({ error: "session_required" }, 401, cors);
    const tier = await resolveTier(principal, env);
    return json({ tier, ...(await getAgentUsage(principal, tier, env)) }, 200, cors);
  }

  // ── POST /api/agent ───────────────────────────────────────────────────────
  if (path === "/api/agent" && method === "POST") {
    // Image turns carry base64, so this route gets the upload cap.
    const body = await readJsonBody(request, MAX_UPLOAD_BYTES);
    const verified = await verifyContext(request, body, path, env);
    if (!verified) return json({ error: "Context integrity check failed." }, 403, cors);

    const { context } = body;
    const messages = sanitiseAgentMessages(body?.messages);
    if (!messages) {
      return json({ error: "messages array is required (max 24 user/assistant messages, 64,000 characters and 4 images in total)" }, 400, cors);
    }

    // Principal comes from the canister-issued session token and the tier
    // from the payment canister — never from client headers, which anyone
    // can set (to "Pro", or to another user's principal).
    const principal = await callerPrincipal(request, env);
    if (!principal) return json({ error: "session_required" }, 401, cors);
    const tier      = await resolveTier(principal, env);
    const agentGate = await aiGate(principal, tier, env, ctx, provider, cors);
    if ("deny" in agentGate) return agentGate.deny;

    const limit = await checkAgentRateLimit(principal, tier, env);

    if (!limit.allowed) {
      let creditFallback = false;
      if (principal !== "anon") {
        try {
          await consumeAgentCredit(principal);
          creditFallback = true;
          console.log(JSON.stringify({ ts: new Date().toISOString(), event: "agent_credit_used", principal, tier }));
        } catch { /* no credits — fall through */ }
      }
      if (!creditFallback) {
        return json({
          error: "daily_agent_limit_reached",
          limit: limit.limit,
          count: limit.count,
          resetsAt: limit.resetsAt,
          creditsAvailable: false,
        }, 429, {
          ...cors,
          "X-Agent-Calls-Used":  String(limit.count),
          "X-Agent-Calls-Limit": String(limit.limit),
        });
      }
    }

    console.log(JSON.stringify({
      ts: new Date().toISOString(), event: "agent_call",
      principal, tier, count: limit.count, limit: limit.limit, allowed: limit.allowed,
    }));

    const result = await provider.completeWithTools({
      system:    buildSystemPrompt(sanitiseContext(context, principal)),
      tools:     HOMEGENTIC_TOOLS,
      messages,
      maxTokens: 1024,
    });

    return json(result, 200, {
      ...cors,
      "X-Agent-Calls-Used":  String(limit.count),
      "X-Agent-Calls-Limit": String(limit.limit),
    });
  }

  // ── POST /api/maintenance/chat ────────────────────────────────────────────
  if (path === "/api/maintenance/chat" && method === "POST") {
    const { message, context } = await readJsonBody<{ message: string; context: MaintenanceContext }>(request);
    if (typeof message !== "string" || !message.trim()) return json({ error: "message is required" }, 400, cors);
    if (message.length > MAX_CHAT_MESSAGE_CHARS) return json({ error: "message too long" }, 400, cors);

    return sseResponse(async (write) => {
      for await (const chunk of provider.stream({
        system:    buildMaintenanceSystemPrompt(sanitiseMaintenanceContext(context)),
        messages:  [{ role: "user", content: message.trim() }],
        maxTokens: 512,
      })) {
        await write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
      await write("data: [DONE]\n\n");
    }, cors);
  }

  // ── POST /api/classify ────────────────────────────────────────────────────
  if (path === "/api/classify" && method === "POST") {
    const { fileName: rawFileName, mimeType, base64Data } = await readJsonBody(request, MAX_UPLOAD_BYTES);
    if (pdfTooLarge(mimeType, base64Data)) return json({ error: "pdf_too_large", maxBytes: MAX_AI_PDF_BYTES }, 413, cors);
    const fileName = typeof rawFileName === "string" ? rawFileName.slice(0, 200) : "";
    if (!fileName || !mimeType || typeof base64Data !== "string" || !base64Data) {
      return json({ error: "fileName, mimeType, and base64Data are required" }, 400, cors);
    }
    const supportedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (!supportedTypes.includes(mimeType)) {
      return json({ documentType: "unknown", confidence: "low",
        description: "Unsupported file type for vision classification", rawFileName: fileName }, 200, cors);
    }
    const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "application/pdf";
    const systemPrompt = `You are a home document classifier for the HomeGentic platform.
Classify the document and extract metadata. Respond ONLY with valid JSON — no markdown, no prose.

JSON shape:
{
  "documentType": "<one of: receipt|inspection_report|permit|warranty|invoice|insurance|contract|photo|unknown>",
  "confidence": "<high|medium|low>",
  "suggestedServiceType": "<HVAC|Roofing|Plumbing|Electrical|Painting|Flooring|Windows|Landscaping or omit if unclear>",
  "extractedDate": "<YYYY-MM-DD or omit>",
  "extractedAmountCents": <integer cents or omit>,
  "extractedContractor": "<contractor or company name or omit>",
  "description": "<one sentence describing the document>"
}`;
    try {
      const text = await provider.complete({
        system:   systemPrompt,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
          { type: "text", text: `File name: ${fileName}\nClassify this home document.` },
        ]}],
        maxTokens: 512,
      });
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: PROVIDER_JSON_ERROR }, 500, cors);
      const result = JSON.parse(m[0]);
      result.rawFileName = fileName;
      return json(result, 200, cors);
    } catch (err) {
      logger.error("ai", "provider call failed", { path, error: (err as Error)?.message });
      return json({ error: "AI request failed" }, 500, cors);
    }
  }

  // ── POST /api/extract-bill ────────────────────────────────────────────────
  if (path === "/api/extract-bill" && method === "POST") {
    const { fileName: rawFileName, mimeType, base64Data } = await readJsonBody(request, MAX_UPLOAD_BYTES);
    if (pdfTooLarge(mimeType, base64Data)) return json({ error: "pdf_too_large", maxBytes: MAX_AI_PDF_BYTES }, 413, cors);
    const fileName = typeof rawFileName === "string" ? rawFileName.slice(0, 200) : "";
    if (!fileName || !mimeType || typeof base64Data !== "string" || !base64Data) {
      return json({ error: "fileName, mimeType, and base64Data are required" }, 400, cors);
    }
    const supportedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (!supportedTypes.includes(mimeType)) {
      return json({ error: "Unsupported file type. Upload an image or PDF." }, 400, cors);
    }
    const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "application/pdf";
    const systemPrompt = `You are a utility bill extractor for the HomeGentic home management platform.
Extract structured data from the uploaded utility bill. Respond ONLY with valid JSON — no markdown, no prose.

JSON shape:
{
  "billType": "<one of: Electric|Gas|Water|Internet|Telecom|Other>",
  "provider": "<utility company name, e.g. FPL, TECO, Duke Energy>",
  "periodStart": "<YYYY-MM-DD or omit if unclear>",
  "periodEnd": "<YYYY-MM-DD or omit if unclear>",
  "amountCents": <integer total amount due in US cents, or omit if unclear>,
  "usageAmount": <numeric usage quantity, e.g. 842 for 842 kWh, or omit>,
  "usageUnit": "<kWh|gallons|therms|Mbps or omit>",
  "confidence": "<high|medium|low>",
  "description": "<one sentence describing what you see>"
}`;
    try {
      const text = await provider.complete({
        system:   systemPrompt,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
          { type: "text", text: `File name: ${fileName}\nExtract the utility bill data from this document.` },
        ]}],
        maxTokens: 512,
      });
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: PROVIDER_JSON_ERROR }, 500, cors);
      const result = JSON.parse(m[0]);
      result.rawFileName = fileName;
      return json(result, 200, cors);
    } catch (err) {
      logger.error("ai", "provider call failed", { path, error: (err as Error)?.message });
      return json({ error: "AI request failed" }, 500, cors);
    }
  }

  // ── POST /api/efficiency-alert ────────────────────────────────────────────
  if (path === "/api/efficiency-alert" && method === "POST") {
    const { usageTrend } = await readJsonBody(request);
    if (!Array.isArray(usageTrend) || usageTrend.length === 0) {
      return json({ error: "usageTrend must be a non-empty array" }, 400, cors);
    }
    if (usageTrend.length < 3) return json({ degradationDetected: false }, 200, cors);

    const half     = Math.floor(usageTrend.length / 2);
    const early    = usageTrend.slice(0, half);
    const late     = usageTrend.slice(usageTrend.length - half);
    const earlyAvg = early.reduce((s: number, p: any) => s + Number(p.usageAmount), 0) / early.length;
    const lateAvg  = late.reduce((s: number, p: any)  => s + Number(p.usageAmount), 0) / late.length;
    const trendPct = earlyAvg > 0 ? ((lateAvg - earlyAvg) / earlyAvg) * 100 : 0;
    if (trendPct <= 15) return json({ degradationDetected: false }, 200, cors);

    const unit               = usageTrend[0]?.usageUnit ?? "usage units";
    const estimatedAnnualWaste = (lateAvg - earlyAvg) * 12;
    const systemPrompt = `You are a home efficiency expert for HomeGentic.
The homeowner's utility usage has risen ${trendPct.toFixed(1)}% over recent months (${earlyAvg.toFixed(0)} → ${lateAvg.toFixed(0)} ${unit}/month).
Write a 2-sentence recommendation for the most likely cause and the single most impactful action.
Respond ONLY with plain text — no markdown, no JSON.`;
    try {
      const recommendation = await provider.complete({
        system:   systemPrompt,
        messages: [{ role: "user", content: `Usage unit: ${unit}. Trend: ${trendPct.toFixed(1)}% increase.` }],
        maxTokens: 150,
      });
      return json({ degradationDetected: true, estimatedAnnualWaste, recommendation: recommendation.trim() }, 200, cors);
    } catch {
      return json({
        degradationDetected: true, estimatedAnnualWaste,
        recommendation: `Your ${unit} has increased ${trendPct.toFixed(1)}% over this period. This may indicate system inefficiency — consider scheduling an HVAC inspection or checking for leaks.`,
      }, 200, cors);
    }
  }

  // ── POST /api/bills-insights ──────────────────────────────────────────────
  // Plain-language narrative over the client's deterministic bills forecast.
  // Request:  InsightsPayload (see billsInsights.ts) — keys, numbers and dates only
  // Response: { summary, tips[], source: "ai" | "rules" }
  if (path === "/api/bills-insights" && method === "POST") {
    const parsed = parseInsightsPayload(await readJsonBody(request));
    if (!parsed.ok) return json({ error: parsed.error }, 400, cors);
    try {
      const text = await provider.complete({
        system:    NARRATIVE_SYSTEM_PROMPT,
        messages:  [{ role: "user", content: describeFacts(parsed.value) }],
        maxTokens: 400,
      });
      return json(parseNarrative(text) ?? ruleBasedNarrative(parsed.value), 200, cors);
    } catch {
      return json(ruleBasedNarrative(parsed.value), 200, cors);
    }
  }

  // ── POST /api/rebate-finder ───────────────────────────────────────────────
  if (path === "/api/rebate-finder" && method === "POST") {
    const { state, zipCode, utilityProvider, billType } = await readJsonBody(request);
    if (!state || !zipCode || !utilityProvider || !billType) {
      return json({ error: "state, zipCode, utilityProvider, and billType are required" }, 400, cors);
    }
    if (billType !== "Electric") {
      return json({ error: "Rebate finder is only available for Electric bills." }, 400, cors);
    }
    const systemPrompt = `You are a utility rebate expert for HomeGentic.
List available electric utility rebates and incentive programs for a homeowner in the given state/zip with the given utility provider.
Include federal programs (IRA tax credits), state programs, and utility-specific rebates.
Respond ONLY with valid JSON — no markdown, no prose.

JSON shape:
{
  "rebates": [
    {
      "name": "<program name>",
      "description": "<1–2 sentence description>",
      "estimatedAmount": "<e.g. Up to $2,000 or $75 rebate>",
      "provider": "<Federal|State|<utility name>>",
      "url": "<program URL or omit>"
    }
  ]
}

Rules:
- Include 3–6 programs most relevant to this homeowner
- Prioritise programs with the highest dollar value
- Only include programs that are currently active (as of your knowledge cutoff)`;
    try {
      const text = await provider.complete({
        system:   systemPrompt,
        messages: [{ role: "user", content: `State: ${state} | Zip: ${zipCode} | Utility: ${utilityProvider} | Bill type: ${billType}` }],
        maxTokens: 1024,
      });
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: PROVIDER_JSON_ERROR }, 500, cors);
      return json(JSON.parse(m[0]), 200, cors);
    } catch (err) {
      logger.error("ai", "provider call failed", { path, error: (err as Error)?.message });
      return json({ error: "AI request failed" }, 500, cors);
    }
  }

  // ── POST /api/telecom-negotiate ───────────────────────────────────────────
  if (path === "/api/telecom-negotiate" && method === "POST") {
    const { provider: prov, amountCents, mbps, zipCode } = await readJsonBody(request);
    if (!prov) return json({ error: "provider is required" }, 400, cors);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return json({ error: "amountCents must be a positive integer" }, 400, cors);
    }
    const systemPrompt = `You are a telecom bill negotiation expert for HomeGentic.
Analyse the homeowner's internet/telecom bill against median broadband prices for their area.
Respond ONLY with valid JSON — no markdown, no prose.

JSON shape:
{
  "verdict": "<one of: overpaying|fair|good_deal>",
  "medianCents": <integer — median monthly broadband cost in cents for the zip code>,
  "savingsOpportunityCents": <integer — estimated monthly savings if they negotiate, 0 if fair/good_deal>,
  "negotiationScript": "<A short script the homeowner can read to their provider's retention department>"
}

Rules:
- medianCents should reflect realistic median broadband prices for the US zip code
- negotiationScript should be 3–5 sentences, conversational, and specific to the provider
- If verdict is "fair" or "good_deal", savingsOpportunityCents should be 0
- The script should mention loyalty, competing offers, and a specific discount amount to request`;
    try {
      const text = await provider.complete({
        system:   systemPrompt,
        messages: [{ role: "user", content: `Provider: ${prov} | Monthly bill: $${(amountCents / 100).toFixed(2)} | Speed: ${mbps} Mbps | Zip: ${zipCode}` }],
        maxTokens: 512,
      });
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: PROVIDER_JSON_ERROR }, 500, cors);
      return json(JSON.parse(m[0]), 200, cors);
    } catch (err) {
      logger.error("ai", "provider call failed", { path, error: (err as Error)?.message });
      return json({ error: "AI request failed" }, 500, cors);
    }
  }

  // ── POST /api/extract-document ────────────────────────────────────────────
  if (path === "/api/extract-document" && method === "POST") {
    const { fileName: rawFileName, mimeType, base64Data } = await readJsonBody(request, MAX_UPLOAD_BYTES);
    if (pdfTooLarge(mimeType, base64Data)) return json({ error: "pdf_too_large", maxBytes: MAX_AI_PDF_BYTES }, 413, cors);
    const fileName = typeof rawFileName === "string" ? rawFileName.slice(0, 200) : "";
    if (!fileName || !mimeType || typeof base64Data !== "string" || !base64Data) {
      return json({ error: "fileName, mimeType, and base64Data are required" }, 400, cors);
    }
    if (!(SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      return json({ error: "Unsupported file type. Upload an image or PDF." }, 400, cors);
    }
    const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "application/pdf";
    try {
      const text = await provider.complete({
        system:   buildDocumentSystemPrompt(),
        messages: [{ role: "user", content: [
          mediaType === "application/pdf"
            ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64Data } }
            : { type: "image",    source: { type: "base64", media_type: mediaType, data: base64Data } },
          { type: "text", text: `File name: ${fileName}\nExtract the home document data from this file.` },
        ]}],
        maxTokens: 512,
      });
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: PROVIDER_JSON_ERROR }, 500, cors);
      return json(normalizeExtraction(JSON.parse(m[0])), 200, cors);
    } catch (err) {
      logger.error("ai", "provider call failed", { path, error: (err as Error)?.message });
      return json({ error: "AI request failed" }, 500, cors);
    }
  }

  // ── POST /api/pulse ───────────────────────────────────────────────────────
  if (path === "/api/pulse" && method === "POST") {
    const ctx = await readJsonBody(request);
    if (typeof ctx?.propertyId !== "string" || typeof ctx?.zipCode !== "string" ||
        ctx.propertyId.length > 64 || ctx.zipCode.length > 10) {
      return json({ error: "propertyId and zipCode are required" }, 400, cors);
    }
    const m2 = new Date().getMonth();
    const season =
      m2 === 11 || m2 <= 1 ? "winter" :
      m2 <= 4               ? "spring" :
      m2 <= 7               ? "summer" : "fall";

    const systemAgeLines = Object.entries(ctx.systemAges ?? {})
      .filter(([, age]) => (age as number) > 0)
      .map(([sys, age]) => `  - ${sys}: ${age} years since last service`).join("\n");
    const weightLines = Object.entries(ctx.userTopicWeights ?? {})
      .map(([topic, w]) => `  - ${topic}: weight ${w}`).join("\n");

    const prompt = [
      `Generate a Monday-morning Home Pulse digest for a homeowner.`,
      `Property: ${ctx.address ?? ""}, ${ctx.city ?? ""}, ${ctx.state ?? ""} ${ctx.zipCode}`,
      `Year built: ${ctx.yearBuilt ?? "unknown"}. Current season: ${season}.`,
      systemAgeLines ? `System ages:\n${systemAgeLines}` : "",
      weightLines ? `User topic interests (higher = more relevant to them):\n${weightLines}` : "",
      ``,
      `Return ONLY valid JSON in this exact shape (no markdown, no prose):`,
      `{`,
      `  "propertyId": "${ctx.propertyId}",`,
      `  "headline": "<one engaging sentence tailored to this property>",`,
      `  "items": [`,
      `    { "id": "1", "title": "<short title>", "body": "<2-3 sentence detail>", "category": "<one of: HVAC|Roofing|Plumbing|Electrical|Structural|Seasonal|Safety|Efficiency|General>", "priority": "<high|medium|low>" }`,
      `  ],`,
      `  "climateZone": <1-8>,`,
      `  "season": "${season}",`,
      `  "generatedAt": ${Date.now()}`,
      `}`,
      `Include 3–5 items. Sort by priority (high first). Be specific to this home — mention system ages and local climate where relevant.`,
    ].filter(Boolean).join("\n");

    try {
      const text = await provider.complete({ messages: [{ role: "user", content: prompt }], maxTokens: 1024 });
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: PROVIDER_JSON_ERROR }, 500, cors);
      return json(JSON.parse(m[0]), 200, cors);
    } catch (err) {
      logger.error("ai", "provider call failed", { path, error: (err as Error)?.message });
      return json({ error: "AI request failed" }, 500, cors);
    }
  }

  // ── POST /api/negotiate ───────────────────────────────────────────────────
  if (path === "/api/negotiate" && method === "POST") {
    const { quote, request: qrequest, zip, benchmark } = await readJsonBody(request);
    if (!quote?.id || !qrequest?.serviceType || !benchmark?.median) {
      return json({ error: "quote, request.serviceType, and benchmark are required" }, 400, cors);
    }
    const fmtK = (c: number) => `$${(c / 100).toFixed(0)}`;
    const systemPrompt = `You are a real estate negotiation analyst for HomeGentic.
Analyze a contractor quote against market pricing benchmarks and return ONLY valid JSON — no markdown, no prose.

JSON shape:
{
  "quoteId": "<quote id>",
  "verdict": "<fair|high|low>",
  "percentile": <0-100>,
  "suggestedCounterCents": <integer cents — only include if verdict is high>,
  "rationale": "<2-3 sentences explaining the verdict with specific dollar figures>",
  "generatedAt": <ms timestamp>
}

Rules:
- verdict "high" if amount > p75, "low" if amount < p25, "fair" otherwise
- percentile = where this quote sits in the 0–100 distribution
- suggestedCounterCents = only when verdict is "high"; suggest 3-7% above median
- rationale must cite the specific p25/median/p75 figures
- HomeGentic never contacts contractors — only provide analysis for the homeowner`;
    const userMsg = [
      `Service type: ${qrequest.serviceType}`,
      `Job description: ${qrequest.description}`,
      `Urgency: ${qrequest.urgency}`,
      `Zip code: ${zip}`,
      `Quote amount: ${fmtK(quote.amount)} (${quote.amount} cents)`,
      `Quote timeline: ${quote.timeline} days`,
      `Market benchmark — p25: ${fmtK(benchmark.p25)}, median: ${fmtK(benchmark.median)}, p75: ${fmtK(benchmark.p75)}`,
      `Quote ID: ${quote.id}`,
    ].join("\n");
    try {
      const text = await provider.complete({ system: systemPrompt, messages: [{ role: "user", content: userMsg }], maxTokens: 512 });
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: PROVIDER_JSON_ERROR }, 500, cors);
      const result = JSON.parse(m[0]);
      result.generatedAt = result.generatedAt ?? Date.now();
      return json(result, 200, cors);
    } catch (err) {
      logger.error("ai", "provider call failed", { path, error: (err as Error)?.message });
      return json({ error: "AI request failed" }, 500, cors);
    }
  }

  // ── POST /api/insurer-discount ────────────────────────────────────────────
  if (path === "/api/insurer-discount" && method === "POST") {
    const {
      state, zipCode,
      properties = [], devices = [],
      criticalEventCount = 0, verifiedJobTypes = [], totalVerifiedJobs = 0,
    } = await readJsonBody(request) ?? {};
    if (!state || !zipCode) return json({ error: "state and zipCode are required" }, 400, cors);

    const deviceLines = (devices as Array<{ source: string; name: string }>)
      .map((d) => `  - ${d.name} (${d.source})`).join("\n") || "  None registered";
    const jobLines = verifiedJobTypes.length
      ? (verifiedJobTypes as string[]).map((t) => `  - ${t}`).join("\n") : "  None on record";
    const propLines = (properties as Array<{ address: string; yearBuilt: number; verificationLevel: string }>)
      .map((p) => `  - ${p.address} (built ${p.yearBuilt}, ${p.verificationLevel} verification)`)
      .join("\n") || "  None";

    const systemPrompt = `You are a home insurance discount analyst for the HomeGentic platform.
Analyse the homeowner's smart devices and verified maintenance records, then estimate their insurance discount eligibility.
Focus on US residential property insurance, especially Florida (Citizens, UPC, Hippo, Neptune) but apply general knowledge for other states.
Respond ONLY with valid JSON — no markdown, no prose.

JSON shape:
{
  "discountRangeMin": <integer percent, e.g. 5>,
  "discountRangeMax": <integer percent, e.g. 20>,
  "qualifyingCategories": [
    { "name": "<discount category name>", "discountRange": "<e.g. 5–10%>", "basis": "<device or record that qualifies them>", "status": "<qualifying|potential|missing>" }
  ],
  "programs": [
    { "insurer": "<insurer name>", "programName": "<program name>", "estimatedDiscount": "<e.g. up to 15%>", "notes": "<1 sentence on how to apply or what's required>" }
  ],
  "recommendations": ["<actionable step to unlock more savings>"],
  "generatedAt": <ms timestamp>
}

Rules:
- qualifyingCategories must cover ALL discount types the homeowner could access (qualifying, potential, or missing)
- programs should list 2–4 real insurer programs relevant to their state
- recommendations should be 3–5 specific, actionable steps ordered by impact
- discountRangeMin/Max should be conservative and evidence-based`;

    const userMsg = [
      `State: ${state} | Zip: ${zipCode}`,
      `Properties:\n${propLines}`,
      `Connected smart devices:\n${deviceLines}`,
      `Critical sensor alerts in last 90 days: ${criticalEventCount}`,
      `Verified maintenance job types:\n${jobLines}`,
      `Total verified jobs on ICP blockchain: ${totalVerifiedJobs}`,
      ``, `Estimate insurance discount eligibility for this homeowner.`,
    ].join("\n");

    try {
      const text = await provider.complete({ system: systemPrompt, messages: [{ role: "user", content: userMsg }], maxTokens: 1024 });
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: PROVIDER_JSON_ERROR }, 500, cors);
      const result = JSON.parse(m[0]);
      result.generatedAt = result.generatedAt ?? Date.now();
      return json(result, 200, cors);
    } catch (err) {
      logger.error("ai", "provider call failed", { path, error: (err as Error)?.message });
      return json({ error: "AI request failed" }, 500, cors);
    }
  }

  // ── POST /api/buyers-truth-kit ────────────────────────────────────────────
  // ── POST /api/rentcast/properties ─────────────────────────────────────────
  if (path === "/api/rentcast/properties" && method === "POST") {
    const body = await readJsonBody(request).catch((e) => { if (e instanceof HttpError && e.status === 413) throw e; return null; });
    const { status, body: out } = await lookupRentcast(body, env.RENTCAST_API_KEY);
    return json(out, status, cors);
  }

  if (path === "/api/buyers-truth-kit" && method === "POST") {
    const body = await readJsonBody<Partial<BuyerTruthKitRequest>>(request);
    if (typeof body.address !== "string" || !body.address.trim() || body.address.length > 300) {
      return json({ error: "address is required" }, 400, cors);
    }
    if (!body.yearBuilt || body.yearBuilt < 1800 || body.yearBuilt > new Date().getFullYear()) {
      return json({ error: "yearBuilt must be a valid year" }, 400, cors);
    }
    if (!body.claims) return json({ error: "claims are required" }, 400, cors);
    try {
      const geo     = await geocodeAddress(body.address);
      const permits = await lookupPermits(body.address, geo);
      const kit     = await generateKit(body as BuyerTruthKitRequest, permits, provider);
      return json({
        property: {
          address: body.address, yearBuilt: body.yearBuilt,
          geocoded: !!geo, city: geo?.city, state: geo?.state, county: geo?.county,
        },
        permits, kit,
      }, 200, cors);
    } catch (err) {
      logger.error("ai", "truth kit failed", { error: (err as Error)?.message });
      return json({ error: "Analysis failed" }, 500, cors);
    }
  }

  // ── POST /api/errors ──────────────────────────────────────────────────────
  if (path === "/api/errors" && method === "POST") {
    const b = await readJsonBody(request) ?? {};
    const level          = typeof b.level          === "string" ? b.level.slice(0, 20)          : "error";
    const message        = typeof b.message        === "string" ? b.message.slice(0, 500)        : "(no message)";
    const errorType      = typeof b.errorType      === "string" ? b.errorType.slice(0, 80)       : undefined;
    const stack          = typeof b.stack          === "string" ? b.stack.slice(0, 3000)         : undefined;
    const componentStack = typeof b.componentStack === "string" ? b.componentStack.slice(0, 2000): undefined;
    const url            = typeof b.url            === "string" ? b.url.slice(0, 500)            : undefined;
    const ts             = typeof b.ts             === "string" ? b.ts                           : new Date().toISOString();
    const tier           = typeof b.tier           === "string" ? b.tier.slice(0, 40)            : undefined;
    const release        = typeof b.release        === "string" ? b.release.slice(0, 50)         : undefined;
    const userAgent      = typeof b.userAgent      === "string" ? b.userAgent.slice(0, 200)      : undefined;
    const tags           = redactRecord(b.tags);

    type RawCrumb = { type?: unknown; message?: unknown; data?: unknown; ts?: unknown };
    const breadcrumbs = Array.isArray(b.breadcrumbs)
      ? (b.breadcrumbs as RawCrumb[]).slice(0, 25).map((c) => ({
          type:    typeof c?.type    === "string" ? c.type.slice(0, 20) : "custom",
          message: typeof c?.message === "string" ? c.message.slice(0, 200) : "",
          data:    redactRecord(c?.data),
          ts:      typeof c?.ts === "number" ? c.ts : undefined,
        }))
      : undefined;

    const traceId = request.headers.get("x-trace-id")
      ?? (typeof b.traceId === "string" ? b.traceId.slice(0, 36) : undefined);

    console.log(JSON.stringify({
      event: "frontend_error", level, message,
      ...(errorType       && { errorType }),
      ...(stack           && { stack }),
      ...(componentStack  && { componentStack }),
      ...(url             && { url }),
      ts,
      ...(tier        && { tier }),
      ...(release     && { release }),
      ...(userAgent   && { userAgent }),
      ...(breadcrumbs && { breadcrumbs }),
      ...(tags        && { tags }),
      ...(traceId     && { traceId }),
    }));

    // Update in-memory aggregation; flush is deferred via ctx.waitUntil
    const fingerprint = `${message.slice(0, 100)}::${(stack ?? "").split("\n").find((l: string) => l.includes("/src/"))?.trim().slice(0, 100) ?? ""}`;
    const now = Date.now();
    const existing = errorAggMap.get(fingerprint);
    const isNew = !existing;
    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      if (tier) existing.tierCounts.set(tier, (existing.tierCounts.get(tier) ?? 0) + 1);
      existing.dirty = true;
    } else if (errorAggMap.size < MAX_ERROR_FINGERPRINTS) {
      const tierCounts = new Map<string, number>();
      if (tier) tierCounts.set(tier, 1);
      errorAggMap.set(fingerprint, {
        fingerprint, message: message.slice(0, 120),
        errorType: (errorType ?? "Error").slice(0, 80),
        count: 1, firstSeen: now, lastSeen: now, tierCounts, release, dirty: true,
      });
    }
    ctx.waitUntil(flushErrorAggregations(isNew));

    return new Response(null, { status: 204, headers: cors });
  }

  // ── Off-chain replacements for the ai_proxy canister's outcalls (M-6/M11) ─
  // Session required (above); quotas and recipients are enforced in
  // src/offchainOutcalls.ts.
  if (OFFCHAIN_OUTCALL_ROUTES.has(path) && method === "POST") {
    const body = await readJsonBody(request, MAX_JSON_BYTES);
    const p    = sessionPrincipal!;
    const r =
      path === "/api/recalls"                 ? await findRecalls(body, env) :
      path === "/api/license/check"           ? await checkLicense(p, env) :
      path === "/api/property/details"        ? await lookupPropertyDetails(body, p, env, fetch, sessionTier) :
      path === "/api/permits/import"          ? await importPermits(body, p, env, fetch, sessionTier) :
      path === "/api/email/contractor-invite" ? await sendContractorInvite(body, p, env, getInvitePreview, fetch, sessionTier) :
                                                await sendBrokerLead(body, p, env);
    return json(r.body as object, r.status, cors);
  }

  // ── Address suggestions (Google Places, src/addressSuggest.ts) ──────────────
  // Session required (above); per-user, per-minute (with backoff) and global
  // daily limits are enforced in the module.
  if (ADDRESS_ROUTES.has(path) && method === "POST") {
    const body = await readJsonBody(request, MAX_JSON_BYTES);
    const p    = sessionPrincipal!;
    const r = path === "/api/address/suggest" ? await suggestAddresses(body, p, env) : await placeAddress(body, p, env);
    const headers = r.retryAfter ? { ...cors, "Retry-After": String(r.retryAfter) } : cors;
    return json(r.body as object, r.status, headers);
  }

  // ── POST /api/stripe/create-checkout ─────────────────────────────────────
  // Stripe-hosted checkout (dev / non-IC frontends). The principal is the
  // session's, never the body's (F-3), and redirect URLs must be on the
  // frontend origin.
  if (path === "/api/stripe/create-checkout" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "Payments are not configured" }, 500, cors);
    const principal = sessionPrincipal!;
    const { tier, billing, successUrl, cancelUrl, gift } = await readJsonBody(request);
    if (!isAllowedRedirectUrl(successUrl, allowedOrigins(env)) || !isAllowedRedirectUrl(cancelUrl, allowedOrigins(env))) {
      return json({ error: "successUrl/cancelUrl must be on the frontend origin" }, 400, cors);
    }
    const PRICE_MAP: Record<string, string | undefined> = {
      ProMonthly:           env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
      ProYearly:            env.STRIPE_PRICE_PRO_YEARLY?.trim(),
      ContractorProMonthly: env.STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY?.trim(),
      ContractorProYearly:  env.STRIPE_PRICE_CONTRACTOR_PRO_YEARLY?.trim(),
    };
    const meta = (v: unknown) => (typeof v === "string" ? v.slice(0, 450) : "");
    // A gift is a one-time payment for one period: it must never renew on the
    // giver's card (the renewals would benefit nobody).
    const giftCents = gift ? GIFT_PRICE_CENTS[`${tier}${billing}`] : undefined;
    const priceId = typeof tier === "string" && typeof billing === "string" ? PRICE_MAP[`${tier}${billing}`] : undefined;
    if (gift ? !giftCents : !priceId) return json({ error: "No price configured for that plan" }, 400, cors);
    try {
      const stripe  = await stripeClient(sk);
      const session = await stripe.checkout.sessions.create({
        ...(gift
          ? {
              mode: "payment",
              line_items: [{
                quantity: 1,
                price_data: { currency: "usd", unit_amount: giftCents, product_data: { name: `HomeGentic ${tier} gift (1 year)` } },
              }],
            }
          : {
              mode: "subscription",
              line_items: [{ price: priceId, quantity: 1 }],
              // Subscription metadata is what verify-subscription / the webhook read.
              subscription_data: { metadata: { icp_principal: principal, tier, billing } },
            }),
        success_url: successUrl, cancel_url: cancelUrl,
        metadata: {
          principal, icp_principal: principal, tier, billing, is_gift: gift ? "true" : "false",
          ...(gift && typeof gift === "object" && {
            recipient_email: meta(gift.recipientEmail), recipient_name: meta(gift.recipientName),
            sender_name: meta(gift.senderName), gift_message: meta(gift.giftMessage),
          }),
        },
      });
      return json({ url: session.url }, 200, cors);
    } catch (err) {
      return stripeFailure("create-checkout", err, cors);
    }
  }

  // ── POST /api/stripe/create-subscription-intent ───────────────────────────
  if (path === "/api/stripe/create-subscription-intent" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "Payments are not configured" }, 500, cors);
    const principal = sessionPrincipal!;   // never the body's principal (F-1/F-11)
    const { tier, billing, email } = await readJsonBody(request);
    if (!tier || !billing) return json({ error: "tier and billing are required" }, 400, cors);
    const priceEnvMap: Record<string, string | undefined> = {
      "Pro-Monthly":            env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
      "Pro-Yearly":             env.STRIPE_PRICE_PRO_YEARLY?.trim(),
      "ContractorPro-Monthly":  env.STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY?.trim(),
      "ContractorPro-Yearly":   env.STRIPE_PRICE_CONTRACTOR_PRO_YEARLY?.trim(),
    };
    const priceId = priceEnvMap[`${tier}-${billing}`];
    if (!priceId) return json({ error: "No price configured for that plan" }, 400, cors);
    const safeEmail = typeof email === "string" && email.length <= 320 && EMAIL_RE.test(email) ? email : undefined;
    try {
      const stripe = await stripeClient(sk);
      const customer = await stripe.customers.create({
        ...(safeEmail ? { email: safeEmail } : {}),
        metadata: { icp_principal: principal, tier, billing },
      });
      const subscription = await stripe.subscriptions.create({
        customer: customer.id, items: [{ price: priceId }],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        metadata: { icp_principal: principal, tier, billing },
      });
      const invoiceId = typeof subscription.latest_invoice === "string"
        ? subscription.latest_invoice : (subscription.latest_invoice as any)?.id;
      if (!invoiceId) return json({ error: "Could not initialise payment" }, 502, cors);
      const invoicePayments = await (stripe as any).invoicePayments.list({ invoice: invoiceId });
      const paymentIntentId = invoicePayments?.data?.[0]?.payment?.payment_intent as string | undefined;
      if (!paymentIntentId) return json({ error: "Could not initialise payment" }, 502, cors);
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const clientSecret  = paymentIntent.client_secret ?? undefined;
      if (!clientSecret) return json({ error: "Could not initialise payment" }, 502, cors);
      return json({ clientSecret, subscriptionId: subscription.id }, 200, cors);
    } catch (err) {
      return stripeFailure("create-subscription-intent", err, cors);
    }
  }

  // ── POST /api/stripe/cancel-subscription ─────────────────────────────────
  // Settings → Cancel. Sets cancel_at_period_end on every live Stripe
  // subscription the session principal owns, so Stripe stops renewing it; the
  // user keeps access until the paid period ends (customer.subscription.deleted
  // downgrades then). A principal with no Stripe subscription (ICP payment,
  // gift, admin grant) has nothing to stop: { cancelled: 0 }.
  if (path === "/api/stripe/cancel-subscription" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "Payments are not configured" }, 500, cors);
    const principal = sessionPrincipal!;
    if (!PRINCIPAL_RE.test(principal)) return json({ error: "Invalid principal" }, 400, cors);
    try {
      const stripe = await stripeClient(sk);
      const found  = await stripe.subscriptions.search({
        query: `metadata['icp_principal']:'${principal}'`, limit: 20,
      });
      let cancelled = 0;
      let periodEnd: number | null = null;
      for (const sub of found?.data ?? []) {
        if ((sub.metadata?.icp_principal ?? "") !== principal) continue;
        if (!LIVE_SUBSCRIPTION_STATUSES.has(sub.status)) continue;
        const updated = sub.cancel_at_period_end
          ? sub
          : await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
        cancelled++;
        const end = periodEndSeconds(updated);
        if (end && (!periodEnd || end > periodEnd)) periodEnd = end;
      }
      return json({ cancelled, periodEnd }, 200, cors);
    } catch (err) {
      return stripeFailure("cancel-subscription", err, cors);
    }
  }

  // ── POST /api/stripe/identity-session ────────────────────────────────────
  // Property claim step 1: start a Stripe Identity check (ID document + live
  // selfie) for the session principal. The webhook records a verified result
  // on the property through property.relayMarkIdentityCleared, which only
  // accepts it if this principal owns the property. Each check costs money,
  // so a principal may start IDENTITY_SESSIONS_PER_DAY per day.
  if (path === "/api/stripe/identity-session" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "Identity checks are not configured" }, 500, cors);
    const principal = sessionPrincipal!;
    const { propertyId, returnUrl } = await readJsonBody<{ propertyId?: string; returnUrl?: string }>(request);
    if (typeof propertyId !== "string" || !PROPERTY_ID_RE.test(propertyId)) {
      return json({ error: "valid propertyId required" }, 400, cors);
    }
    if (!isAllowedRedirectUrl(returnUrl, allowedOrigins(env))) {
      return json({ error: "returnUrl must be on the frontend origin" }, 400, cors);
    }
    const quota = await hitCounter(env, `idv:${principal}:${new Date().toISOString().slice(0, 10)}`, IDENTITY_SESSIONS_PER_DAY, 86_400);
    if (!quota.allowed) return json({ error: "Too many identity checks today. Try again tomorrow." }, 429, cors);
    try {
      const stripe = await stripeClient(sk);
      const vs = await stripe.identity.verificationSessions.create({
        type: "document",
        options: { document: { require_matching_selfie: true, require_live_capture: true } },
        metadata: { icp_principal: principal, property_id: propertyId },
        return_url: returnUrl,
      });
      return json({ url: vs.url }, 200, cors);
    } catch (err) {
      return stripeFailure("identity-session", err, cors);
    }
  }

  // ── POST /api/stripe/referral-card ───────────────────────────────────────
  // Contractor Free: save a card for the 3% referral fee (Checkout in setup
  // mode). The webhook stores it on the fee canister; the quote canister
  // refuses a non-ContractorPro bid until one is saved.
  if (path === "/api/stripe/referral-card" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "Payments are not configured" }, 500, cors);
    const { returnUrl } = await readJsonBody<{ returnUrl?: string }>(request);
    if (!isAllowedRedirectUrl(returnUrl, allowedOrigins(env))) {
      return json({ error: "returnUrl must be on the frontend origin" }, 400, cors);
    }
    try {
      const out = await startCardSetup(sessionPrincipal!, returnUrl as string, await stripeClient(sk), canisterLedger());
      return json(out.body, out.status, cors);
    } catch (err) {
      return stripeFailure("referral-card", err, cors);
    }
  }

  // ── POST /api/stripe/verify-session ──────────────────────────────────────
  // Legacy Stripe-hosted checkout. Only the session's own principal can
  // verify it, and activation is idempotent with Stripe's period end (F-3).
  if (path === "/api/stripe/verify-session" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "Payments are not configured" }, 500, cors);
    const { sessionId } = await readJsonBody<{ sessionId?: string }>(request);
    if (typeof sessionId !== "string" || !CHECKOUT_SESSION_RE.test(sessionId)) {
      return json({ error: "valid sessionId required" }, 400, cors);
    }
    try {
      const stripe   = await stripeClient(sk);
      const session  = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid" || session.status !== "complete") {
        return json({ error: "Payment not complete" }, 400, cors);
      }
      const owner = session.metadata?.icp_principal ?? session.metadata?.principal ?? "";
      if (!owner || owner !== sessionPrincipal) return json({ error: "Not your checkout session" }, 403, cors);
      const isGift  = session.metadata?.is_gift === "true";
      const tier    = session.metadata?.tier    ?? "Pro";
      const billing = session.metadata?.billing ?? "Monthly";
      // Gifts: register the paid gift in the payment canister (relay-only,
      // idempotent); the recipient redeems it on-chain with redeemGift.
      // Nothing is granted to the purchaser.
      if (isGift) {
        await registerGift(session, env);
        return json({ type: "gift", giftToken: sessionId }, 200, cors);
      }
      const subId = typeof session.subscription === "string" ? session.subscription : (session.subscription as any)?.id;
      if (!subId) return json({ error: "Session has no subscription" }, 400, cors);
      const sub = await stripe.subscriptions.retrieve(subId);
      if (sub.status !== "active" && sub.status !== "trialing") {
        return json({ error: "Subscription not active" }, 400, cors);
      }
      await activateFromSubscription(sub, owner);
      return json({ type: "subscription", tier, billing }, 200, cors);
    } catch (err) {
      return stripeFailure("verify-session", err, cors);
    }
  }

  // ── POST /api/stripe/verify-subscription ─────────────────────────────────
  // P-1 / F-1: the principal comes only from the subscription's metadata and
  // must equal the session-verified caller; an `incomplete` subscription is
  // accepted only when its own latest invoice is paid (and, if a
  // PaymentIntent is supplied, that PI belongs to that invoice).
  if (path === "/api/stripe/verify-subscription" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "Payments are not configured" }, 500, cors);
    const { subscriptionId, paymentIntentId } = await readJsonBody(request);
    if (typeof subscriptionId !== "string" || !SUBSCRIPTION_ID_RE.test(subscriptionId)) {
      return json({ error: "valid subscriptionId required" }, 400, cors);
    }
    if (paymentIntentId != null && (typeof paymentIntentId !== "string" || !PAYMENT_INTENT_RE.test(paymentIntentId))) {
      return json({ error: "invalid paymentIntentId" }, 400, cors);
    }
    try {
      const stripe       = await stripeClient(sk);
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const owner        = (subscription.metadata?.icp_principal ?? "") as string;
      if (!owner || owner !== sessionPrincipal) {
        return json({ error: "Not your subscription" }, 403, cors);
      }

      if (subscription.status !== "active" && subscription.status !== "trialing") {
        if (subscription.status !== "incomplete") {
          return json({ error: "Subscription not active" }, 400, cors);
        }
        // Payment just succeeded but Stripe hasn't flipped the subscription
        // yet: accept only if this subscription's own invoice is paid.
        const invoiceId = typeof subscription.latest_invoice === "string"
          ? subscription.latest_invoice : (subscription.latest_invoice as any)?.id;
        if (!invoiceId) return json({ error: "Subscription not active" }, 400, cors);
        const invoice: any = await stripe.invoices.retrieve(invoiceId);
        if (invoice.status !== "paid") return json({ error: "Payment not confirmed" }, 400, cors);
        if (paymentIntentId) {
          const pi: any = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (pi.status !== "succeeded") return json({ error: "Payment not confirmed" }, 400, cors);
          const piInvoice = typeof pi.invoice === "string" ? pi.invoice : pi.invoice?.id;
          let tied = piInvoice ? piInvoice === invoiceId : false;
          if (!piInvoice) {
            const payments = await (stripe as any).invoicePayments.list({ invoice: invoiceId });
            tied = !!payments?.data?.some((p: any) => p?.payment?.payment_intent === paymentIntentId);
          }
          if (!tied) return json({ error: "Payment does not belong to this subscription" }, 400, cors);
        }
      }

      const tier    = subscription.metadata?.tier    ?? "Pro";
      const billing = subscription.metadata?.billing ?? "Monthly";
      await activateFromSubscription(subscription, owner);
      return json({ type: "subscription", tier, billing }, 200, cors);
    } catch (err) {
      return stripeFailure("verify-subscription", err, cors);
    }
  }

  // ── POST /api/stripe/create-credit-checkout ───────────────────────────────
  if (path === "/api/stripe/create-credit-checkout" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "Payments are not configured" }, 500, cors);
    const principal = sessionPrincipal!;   // credits go to the verified caller only
    const { packSize, successUrl, cancelUrl } = await readJsonBody(request);
    const pack = CREDIT_PACKS[packSize as number];
    if (!pack) {
      return json({ error: `Unknown pack size. Valid sizes: ${Object.keys(CREDIT_PACKS).join(", ")}` }, 400, cors);
    }
    const priceId = (env[pack.envVar] as string | undefined)?.trim();
    if (!priceId) return json({ error: "Credit packs are not configured" }, 500, cors);
    if (!PRINCIPAL_RE.test(principal)) return json({ error: "Invalid principal" }, 400, cors);
    if (!isAllowedRedirectUrl(successUrl, allowedOrigins(env)) || !isAllowedRedirectUrl(cancelUrl, allowedOrigins(env))) {
      return json({ error: "successUrl/cancelUrl must be on the frontend origin" }, 400, cors);
    }
    try {
      const stripe  = await stripeClient(sk);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl, cancel_url: cancelUrl,
        metadata: { principal, pack_size: String(packSize), type: "agent_credits" },
      });
      return json({ url: session.url }, 200, cors);
    } catch (err) {
      return stripeFailure("create-credit-checkout", err, cors);
    }
  }

  // ── POST /api/stripe/verify-credit-purchase ───────────────────────────────
  // F-2: the grant is idempotent per checkout session in the payment canister.
  if (path === "/api/stripe/verify-credit-purchase" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "Payments are not configured" }, 500, cors);
    const { sessionId } = await readJsonBody<{ sessionId?: string }>(request);
    if (typeof sessionId !== "string" || !CHECKOUT_SESSION_RE.test(sessionId)) {
      return json({ error: "valid sessionId required" }, 400, cors);
    }
    try {
      const stripe  = await stripeClient(sk);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid") {
        return json({ error: "Payment not confirmed" }, 400, cors);
      }
      if (session.metadata?.type !== "agent_credits") {
        return json({ error: "Session is not a credit pack purchase" }, 400, cors);
      }
      const principal = session.metadata?.principal ?? "";
      const packSize  = Number(session.metadata?.pack_size ?? 0);
      if (!principal || !CREDIT_PACKS[packSize]) {
        return json({ error: "Missing or invalid metadata in session" }, 400, cors);
      }
      if (principal !== sessionPrincipal) return json({ error: "Not your checkout session" }, 403, cors);
      const granted = await grantCreditPack(session.id, principal, packSize);
      return json({ type: "agent_credits", packSize, principal, alreadyRedeemed: !granted }, 200, cors);
    } catch (err) {
      return stripeFailure("verify-credit-purchase", err, cors);
    }
  }

  // ── POST /api/stripe/webhook ──────────────────────────────────────────────
  if (path === "/api/stripe/webhook" && method === "POST") {
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return json({ error: "Webhook not configured" }, 500, cors);
    if (!env.STRIPE_SECRET_KEY) return json({ error: "Payments are not configured" }, 500, cors);
    const sig = request.headers.get("stripe-signature");
    if (!sig) return json({ error: "Missing stripe-signature header" }, 400, cors);

    const rawBody = new Uint8Array(await readBodyBytes(request, MAX_WEBHOOK_BYTES));
    let event: any;
    let stripe: any;
    try {
      const Stripe = (await import("stripe")).default;
      stripe = new Stripe(env.STRIPE_SECRET_KEY);
      // F-7: the synchronous constructEvent can't use SubtleCrypto on workerd.
      event = await stripe.webhooks.constructEventAsync(
        rawBody, sig, webhookSecret, undefined, Stripe.createSubtleCryptoProvider(),
      );
    } catch {
      return json({ error: "Webhook signature verification failed" }, 400, cors);
    }

    // Skip redeliveries of an event we've already processed (activations are
    // idempotent in the canister anyway; this just saves the calls).
    const seenKey = `whevt:${event.id}`;
    const once = await beginOnce(env, seenKey);
    if (once === "done") return json({ received: true, duplicate: true }, 200, cors);
    if (once === "busy") return json({ error: "Event is being processed" }, 409, cors);   // Stripe retries

    try {
      switch (event.type) {
        case "customer.subscription.deleted": {
          const sub = event.data.object;
          const p   = (sub.metadata?.icp_principal ?? "") as string;
          if (p) await activateInCanister(p, "Free", 0);
          break;
        }
        case "customer.subscription.updated": {
          const sub = event.data.object;
          const p   = (sub.metadata?.icp_principal ?? "") as string;
          if (!p) break;
          if (sub.status === "canceled" || sub.status === "unpaid" || sub.status === "incomplete_expired") {
            await activateInCanister(p, "Free", 0);
          } else if (sub.status === "active" || sub.status === "trialing") {
            // cancel_at_period_end: the user keeps what they paid for — the
            // canister expiry is already Stripe's period end, and
            // customer.subscription.deleted downgrades when it actually ends.
            await activateFromSubscription(sub, p);
          }
          break;
        }
        case "invoice.payment_failed": {
          const inv = event.data.object;
          const p   = (inv.subscription_details?.metadata?.icp_principal
                       ?? inv.parent?.subscription_details?.metadata?.icp_principal
                       ?? inv.metadata?.icp_principal ?? "") as string;
          if (p) await activateInCanister(p, "Free", 0);
          break;
        }
        case "invoice.payment_succeeded":
        case "invoice.paid": {
          // Renewal: re-read the subscription so expiry is Stripe's new period end.
          const inv   = event.data.object;
          if (inv.metadata?.type === "referral_fee") {
            await markInvoicePaid(inv, canisterLedger());
            break;
          }
          const subId = (typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id)
                        ?? inv.parent?.subscription_details?.subscription;
          if (typeof subId === "string" && subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            const p   = (sub.metadata?.icp_principal ?? "") as string;
            if (p && (sub.status === "active" || sub.status === "trialing")) await activateFromSubscription(sub, p);
          }
          break;
        }
        case "payment_intent.succeeded": {
          // A referral-fee charge (M-4: a second path besides the hourly run).
          await markPaymentIntentPaid(event.data.object, canisterLedger());
          break;
        }
        case "identity.verification_session.verified": {
          const vs    = event.data.object;
          const owner = (vs.metadata?.icp_principal ?? "") as string;
          const propertyId = (vs.metadata?.property_id ?? "") as string;
          if (!owner || !PROPERTY_ID_RE.test(propertyId)) break;
          // verified_outputs is only returned when expanded.
          const full: any = await stripe.identity.verificationSessions.retrieve(vs.id, { expand: ["verified_outputs"] });
          const out  = full?.verified_outputs ?? {};
          const name = [out.first_name, out.last_name].filter((v: unknown) => typeof v === "string" && v).join(" ").slice(0, 200);
          await markIdentityCleared(propertyId, owner, vs.id, name);
          break;
        }
        case "checkout.session.completed": {
          const session = event.data.object;
          if (session.metadata?.type === "agent_credits" && session.payment_status === "paid") {
            const p    = (session.metadata?.principal ?? "") as string;
            const size = Number(session.metadata?.pack_size ?? 0);
            if (p && CREDIT_PACKS[size]) await grantCreditPack(session.id, p, size);
          } else if (session.metadata?.is_gift === "true" && session.payment_status === "paid" && session.status === "complete") {
            await registerGift(session, env);
          } else if (session.metadata?.type === "referral_card") {
            await saveCardFromSession(session, stripe, canisterLedger());
          }
          break;
        }
        default:
          logger.info("stripe-webhook", "unhandled event", { type: event.type });
      }
    } catch (err) {
      logger.error("stripe-webhook", "handler error", { type: event.type, error: (err as Error).message });
      // A webhook that keeps failing leaves a payer on the wrong plan; Stripe
      // retries for 3 days, the watchdog makes sure someone looks sooner.
      await reportServiceError("stripe-webhook", `handler error on ${event.type}`);
      await abortOnce(env, seenKey);
      return json({ error: "Internal webhook handler error" }, 500, cors);   // Stripe retries
    }
    await finishOnce(env, seenKey, 7 * 86_400);
    return json({ received: true }, 200, cors);
  }

  // ── GET /admin/cycle-status ───────────────────────────────────────────────
  // Requires ADMIN_API_KEY (a real secret, unlike the public x-api-key).
  // Disabled when it isn't configured.
  if (path === "/admin/cycle-status" && method === "GET") {
    const adminKey = env.ADMIN_API_KEY;
    if (!adminKey) return json({ error: "Not found" }, 404, cors);
    if (!timingSafeEqualStr(request.headers.get("x-admin-key") ?? "", adminKey)) {
      return json({ error: "Unauthorized" }, 401, cors);
    }
    try {
      const [alerts, levels] = await Promise.all([
        getCriticalCycleAlerts(),
        getCanisterCycleLevels(),
      ]);
      const critical = alerts.filter((a: any) => a.severity === "Critical");
      const warning  = alerts.filter((a: any) => a.severity === "Warning");
      return json({
        ok: critical.length === 0, critical: critical.length,
        warning: warning.length, alerts, levels, ts: new Date().toISOString(),
      }, 200, cors);
    } catch (err) {
      return json({ error: "Failed to query monitoring canister" }, 502, cors);
    }
  }

  // ── GET /health ───────────────────────────────────────────────────────────
  // F-11: report overall readiness only, not which secrets are configured.
  if (path === "/health" && method === "GET") {
    // Everything a signed-in request needs: without CANISTER_ID_AUTH every
    // session route returns 401, and without the PEM / payment ID no
    // subscription can be activated, so /health must not report OK.
    const required = {
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, VOICE_AGENT_API_KEY: env.VOICE_AGENT_API_KEY,
      FRONTEND_ORIGIN: env.FRONTEND_ORIGIN, STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET, DFX_IDENTITY_PEM: env.DFX_IDENTITY_PEM,
      CANISTER_ID_AUTH: env.CANISTER_ID_AUTH, CANISTER_ID_PAYMENT: env.CANISTER_ID_PAYMENT,
    };
    const allOk = Object.values(required).every(Boolean);
    return json({ ok: allOk }, allOk ? 200 : 503, cors);
  }

  return json({ error: "Not found" }, 404, cors);
}

// ── Route groups ──────────────────────────────────────────────────────────────

/** Anthropic- or paid-API-backed routes: session + per-principal daily quota. */
const AUX_AI_ROUTES = new Set([
  "/api/maintenance/chat", "/api/classify", "/api/extract-bill", "/api/extract-document",
  "/api/efficiency-alert", "/api/bills-insights", "/api/rebate-finder", "/api/telecom-negotiate", "/api/pulse",
  "/api/negotiate", "/api/insurer-discount", "/api/buyers-truth-kit", "/api/rentcast/properties",
]);

/** Former ai_proxy outcalls, now served here with the keys off-chain. */
const OFFCHAIN_OUTCALL_ROUTES = new Set([
  "/api/property/details", "/api/permits/import",
  "/api/email/contractor-invite", "/api/email/broker-lead",
  "/api/recalls",   // CPSC recall check (src/recalls.ts); free API, cached per brand
  "/api/license/check",   // Florida DBPR licence lookup (src/dbpr.ts); public file, throttled per caller
]);

/** Paid Google Places calls behind the Add Property address field. */
const ADDRESS_ROUTES = new Set(["/api/address/suggest", "/api/address/place"]);

/** Stripe routes that act for a user: the user is the session principal. */
const STRIPE_SESSION_ROUTES = new Set([
  "/api/stripe/create-checkout", "/api/stripe/create-subscription-intent", "/api/stripe/cancel-subscription",
  "/api/stripe/identity-session", "/api/stripe/referral-card",
  "/api/stripe/verify-session", "/api/stripe/verify-subscription",
  "/api/stripe/create-credit-checkout", "/api/stripe/verify-credit-purchase",
]);

function allowedOrigins(env: Env): Array<string | undefined> {
  return [env.FRONTEND_ORIGIN, env.BIDTOLIST_FRONTEND_ORIGIN];
}

function withCors(resp: Response, cors: Record<string, string>): Response {
  const headers = new Headers(resp.headers);
  Object.entries(cors).forEach(([k, v]) => { if (!headers.has(k)) headers.set(k, v); });
  return new Response(resp.body, { status: resp.status, headers });
}

async function stripeClient(sk: string): Promise<any> {
  const Stripe = (await import("stripe")).default;
  return new Stripe(sk);
}

/** Hourly: charge Contractor Free referral fees that are due (src/referralFees.ts). */
async function scheduledReferralFees(env: Env): Promise<void> {
  if (!env.CANISTER_ID_FEE || !env.STRIPE_SECRET_KEY || !env.DFX_IDENTITY_PEM) return;
  (process.env as any).DFX_IDENTITY_PEM       = env.DFX_IDENTITY_PEM;
  (process.env as any).DFX_NETWORK            = env.DFX_NETWORK ?? "ic";
  (process.env as any).IC_HOST                = env.IC_HOST ?? "";
  (process.env as any).CANISTER_ID_FEE        = env.CANISTER_ID_FEE;
  (process.env as any).CANISTER_ID_CONTRACTOR = env.CANISTER_ID_CONTRACTOR ?? "";
  try {
    const summary = await chargeDueFees(await stripeClient(env.STRIPE_SECRET_KEY), canisterLedger());
    logger.info("referral-fees", "charge run", { ...summary });
  } catch (err) {
    logger.error("referral-fees", "charge run failed", { error: (err as Error)?.message });
  }
}

/** F-11: log the Stripe error, return a generic message. */
function stripeFailure(route: string, err: unknown, cors: Record<string, string>): Response {
  if (err instanceof HttpError) return json({ error: err.message }, err.status, cors);
  logger.error("stripe", `${route} failed`, { error: (err as Error)?.message });
  return json({ error: "Payment provider error" }, 502, cors);
}

/** Stripe's current period end (seconds), across API versions. */
function periodEndSeconds(sub: any): number | null {
  const v = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return typeof v === "number" && v > 0 ? v : null;
}

/**
 * P-2 / F-3: activate `principal` until the subscription's current period
 * end. The canister records "sub:<id>:<period end>", so re-verifying the same
 * period is a no-op and can never extend access beyond what Stripe says.
 */
async function activateFromSubscription(sub: any, principal: string): Promise<void> {
  const tier = (sub?.metadata?.tier ?? "") as string;
  if (!PAID_TIERS.has(tier)) throw new HttpError(400, "Subscription has no valid tier");
  if (sub?.metadata?.icp_principal && sub.metadata.icp_principal !== principal) {
    throw new HttpError(403, "Subscription belongs to another account");
  }
  const end = periodEndSeconds(sub);
  if (!end) throw new HttpError(502, "Subscription has no billing period");
  await activateSubscriptionUntil(principal, tier, end, `sub:${sub.id}:${end}`);
}

/**
 * Register a paid, complete gift checkout session in the payment canister.
 * The gift token is the checkout session id; metadata comes from Stripe (set
 * by create-checkout), not from the caller.
 */
async function registerGift(session: any, env: Env): Promise<void> {
  if (typeof session?.id !== "string" || !CHECKOUT_SESSION_RE.test(session.id)) {
    throw new HttpError(400, "Invalid gift session");
  }
  const m    = session.metadata ?? {};
  const tier = (m.tier ?? "") as string;
  if (!PAID_TIERS.has(tier)) throw new HttpError(400, "Gift has no valid tier");
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 450) : "");
  await recordGift(session.id, tier, str(m.billing), {
    recipientEmail: str(m.recipient_email), recipientName: str(m.recipient_name),
    senderName: str(m.sender_name), giftMessage: str(m.gift_message), deliveryDate: str(m.delivery_date),
  });
  // Email the recipient their redeem link. Resend's idempotency key makes the
  // webhook and verify-session paths send it once between them.
  await sendGiftEmail({
    giftToken: session.id, tier,
    recipientEmail: str(m.recipient_email), recipientName: str(m.recipient_name),
    senderName: str(m.sender_name), giftMessage: str(m.gift_message),
  }, env);
}

/** Grant a credit pack once per checkout session. Returns false on a replay. */
async function grantCreditPack(sessionId: string, principal: string, packSize: number): Promise<boolean> {
  try {
    await grantAgentCreditsOnce(principal, packSize, `credits:${sessionId}`);
    return true;
  } catch (e) {
    if (e instanceof AlreadyConsumedError) return false;
    throw e;
  }
}

/**
 * Bound the client-supplied maintenance context (F-4). The whole body is
 * already capped at MAX_JSON_BYTES; this fixes the field types and trims the
 * free-text fields.
 */
function sanitiseMaintenanceContext(ctx: any): MaintenanceContext {
  if (!ctx || typeof ctx !== "object") return { yearBuilt: 2000 };
  const yearBuilt = typeof ctx.yearBuilt === "number" && ctx.yearBuilt > 1700 && ctx.yearBuilt < 2200 ? ctx.yearBuilt : 2000;
  const propertyAddress = typeof ctx.propertyAddress === "string" ? ctx.propertyAddress.slice(0, 200) : undefined;
  const report = ctx.report && typeof ctx.report === "object" && !Array.isArray(ctx.report) ? ctx.report : undefined;
  if (report && Array.isArray(report.systemPredictions)) {
    report.systemPredictions = report.systemPredictions.slice(0, 30).map((p: any) => ({
      ...p, systemName: typeof p?.systemName === "string" ? p.systemName.slice(0, 80) : "",
    }));
  }
  return { yearBuilt, propertyAddress, report };
}

// ── Context verification helper ───────────────────────────────────────────────

/**
 * The caller's verified principal, from the canister-issued session token
 * (see src/session.ts), or null if there's no valid session. Local dev
 * without an auth canister (CANISTER_ID_AUTH unset and NODE_ENV not
 * "production") falls back to the unverified x-icp-principal header.
 */
/** Off-chain photos need the bucket plus what photoAccess needs (canister ID and signing identity). */
function photoStorageReady(env: Env): boolean {
  return Boolean(env.PHOTOS && env.CANISTER_ID_PHOTO && env.DFX_IDENTITY_PEM);
}

/** Principal each request's session resolved to, for the backoff strike in fetch(). */
const resolvedPrincipals = new WeakMap<Request, string | null>();

async function callerPrincipal(request: Request, env: Env): Promise<string | null> {
  if (resolvedPrincipals.has(request)) return resolvedPrincipals.get(request) ?? null;
  const p = (!env.CANISTER_ID_AUTH && env.NODE_ENV !== "production")
    ? request.headers.get("x-icp-principal") ?? "anon"
    : await resolveSessionPrincipal(request.headers.get(SESSION_HEADER), env);
  resolvedPrincipals.set(request, p);
  return p;
}

/** Backoff covers HomeGentic's own /api routes, not Stripe's webhooks or Bid to List (own limits). */
function backoffApplies(path: string): boolean {
  return !path.startsWith("/api/stripe/webhook") && !path.startsWith("/api/bidtolist/");
}

/**
 * The CD-1 gate in front of a Claude call: backoff block, human check and the
 * free-tier daily budget. On success, free-tier token usage is counted against
 * that budget. Returns a Response to send instead, or the new-account flag.
 */
async function aiGate(
  principal: string, tier: string, env: Env, ctx: ExecutionContext,
  provider: AnthropicProvider, cors: Record<string, string>,
): Promise<{ deny: Response } | { newAccount: boolean }> {
  const gate = await gateAiCall(env, principal, tier);
  if (!gate.ok) {
    const headers = gate.retryAfterSeconds ? { ...cors, "Retry-After": String(gate.retryAfterSeconds) } : cors;
    return { deny: json(gate.body, gate.status, headers) };
  }
  provider.onUsage = isFreeTier(tier)
    ? (u) => ctx.waitUntil(recordFreeUsage(env, u).catch(() => {}))
    : null;
  return { newAccount: gate.newAccount };
}

async function verifyContext(
  request: Request,
  body: any,
  path: string,
  env: Env,
): Promise<boolean> {
  const apiKey = env.VOICE_AGENT_API_KEY;
  if (!apiKey) return true; // dev: skip when key not set

  const provided = request.headers.get("x-context-hmac") ?? "";
  const context  = body?.context ?? (body?.message != null ? (body?.context ?? {}) : null);
  if (context === null) return true;

  return verifyHmac(apiKey, context, provided);
}
