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
  consumeAgentCredit,
  grantAgentCredits,
} from "../paymentCanister";
import { getCriticalCycleAlerts, checkCycleLevels as getCanisterCycleLevels } from "../monitoringCanister";
import {
  buildDocumentSystemPrompt,
  normalizeExtraction,
  SUPPORTED_MIME_TYPES,
} from "../extractDocumentHelpers";
import { lookupPermits, generateKit, geocodeAddress } from "../buyersTruthKit";
import type { BuyerTruthKitRequest } from "../buyersTruthKit";
import type { ChatRequest } from "../types";
import { TIER_LIMITS, type SubscriptionTier } from "../agentLimiter";
import { logger } from "../logger";
import { checkGlobalRateLimit, checkAgentRateLimit } from "./rateLimiter";
import { handleBidtolist } from "./bidtolist";

// ── Environment bindings ──────────────────────────────────────────────────────

export interface Env {
  // AI
  ANTHROPIC_API_KEY:   string;
  AI_MODEL?:           string;
  // Auth / routing
  VOICE_AGENT_API_KEY: string;
  FRONTEND_ORIGIN:     string;
  BIDTOLIST_FRONTEND_ORIGIN?: string;
  NODE_ENV?: string;
  // Stripe — HomeGentic
  STRIPE_SECRET_KEY:              string;
  STRIPE_WEBHOOK_SECRET:          string;
  STRIPE_PRICE_BASIC_MONTHLY?:         string;
  STRIPE_PRICE_BASIC_YEARLY?:          string;
  STRIPE_PRICE_PRO_MONTHLY?:           string;
  STRIPE_PRICE_PRO_YEARLY?:            string;
  STRIPE_PRICE_PREMIUM_MONTHLY?:       string;
  STRIPE_PRICE_PREMIUM_YEARLY?:        string;
  STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY?: string;
  STRIPE_PRICE_CONTRACTOR_PRO_YEARLY?:  string;
  STRIPE_PRICE_CREDITS_25?:  string;
  STRIPE_PRICE_CREDITS_100?: string;
  // ICP
  DFX_IDENTITY_PEM?:     string;
  DFX_NETWORK?:          string;
  CANISTER_ID_PAYMENT?:  string;
  CANISTER_ID_MONITORING?: string;
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
}

// ── Credit pack config (mirrors server.ts CREDIT_PACKS) ──────────────────────

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
  if (!env.FRONTEND_ORIGIN && /^http:\/\/localhost:/.test(origin)) return true;
  return false;
}

function buildCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin || !isAllowedOrigin(origin, env)) return {};
  return {
    "Access-Control-Allow-Origin":   origin,
    "Access-Control-Allow-Methods":  "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, x-api-key, x-icp-principal, x-subscription-tier, " +
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
  if (!ctx || typeof ctx !== "object") return { properties: [], recentJobs: [], principal };

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

  return { ...ctx, properties, recentJobs, principal };
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
    principal: request.headers.get("x-icp-principal") ?? "anon",
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

async function flushErrorAggregations(): Promise<void> {
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
}

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
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
    (process.env as any).CANISTER_ID_PAYMENT     = env.CANISTER_ID_PAYMENT ?? "";
    (process.env as any).CANISTER_ID_MONITORING  = env.CANISTER_ID_MONITORING ?? "";
    (process.env as any).AI_MODEL                = env.AI_MODEL ?? "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Global 30 req/min rate limit on /api/ routes
    if (path.startsWith("/api/")) {
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const allowed = await checkGlobalRateLimit(ip, env);
      if (!allowed) {
        const resp = json({ error: "Too many requests — please wait before retrying." }, 429, cors);
        logRequest(request, 429, startMs, reqId, traceId);
        return resp;
      }
    }

    // API key auth on /api/ routes (except Stripe webhooks)
    if (path.startsWith("/api/")) {
      const key = env.VOICE_AGENT_API_KEY;
      if (key &&
          !path.startsWith("/api/stripe/webhook") &&
          !path.startsWith("/api/bidtolist/stripe/webhook")) {
        if (request.headers.get("x-api-key") !== key) {
          const resp = json({ error: "Unauthorized" }, 401, cors);
          logRequest(request, 401, startMs, reqId, traceId);
          return resp;
        }
      }
    }

    // Build helpers used across routes
    const provider = new AnthropicProvider(
      env.ANTHROPIC_API_KEY,
      resolveModel(env.AI_MODEL),
    );

    let response: Response;

    try {
      response = await route(request, path, env, ctx, provider, cors);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal error";
      response = json({ error: msg }, 500, cors);
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
    return handleBidtolist(request, subpath, env);
  }

  // ── POST /api/chat ────────────────────────────────────────────────────────
  if (path === "/api/chat" && method === "POST") {
    const body = await request.json() as any;
    const verified = await verifyContext(request, body, path, env);
    if (!verified) return json({ error: "Context integrity check failed." }, 403, cors);

    const { message, context } = body as ChatRequest;
    if (!message?.trim()) return json({ error: "message is required" }, 400, cors);

    return sseResponse(async (write) => {
      for await (const chunk of provider.stream({
        system:    buildSystemPrompt(context ?? { properties: [], recentJobs: [] }),
        messages:  [{ role: "user", content: message.trim() }],
        maxTokens: 200,
      })) {
        await write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
      await write("data: [DONE]\n\n");
    }, cors);
  }

  // ── POST /api/agent ───────────────────────────────────────────────────────
  if (path === "/api/agent" && method === "POST") {
    const body = await request.json() as any;
    const verified = await verifyContext(request, body, path, env);
    if (!verified) return json({ error: "Context integrity check failed." }, 403, cors);

    const { messages, context } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400, cors);
    }

    const principal = request.headers.get("x-icp-principal") ?? "anon";
    const rawTier   = request.headers.get("x-subscription-tier") ?? "Free";
    const tier      = (rawTier in TIER_LIMITS ? rawTier : "Free") as SubscriptionTier;

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
      system:    buildSystemPrompt(context ?? { properties: [], recentJobs: [] }),
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
    const { message, context } = await request.json() as { message: string; context: MaintenanceContext };
    if (!message?.trim()) return json({ error: "message is required" }, 400, cors);

    return sseResponse(async (write) => {
      for await (const chunk of provider.stream({
        system:    buildMaintenanceSystemPrompt(context ?? { yearBuilt: 2000 }),
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
    const { fileName, mimeType, base64Data } = await request.json() as any;
    if (!fileName || !mimeType || !base64Data) {
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
      return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500, cors);
    }
  }

  // ── POST /api/extract-bill ────────────────────────────────────────────────
  if (path === "/api/extract-bill" && method === "POST") {
    const { fileName, mimeType, base64Data } = await request.json() as any;
    if (!fileName || !mimeType || !base64Data) {
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
      return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500, cors);
    }
  }

  // ── POST /api/efficiency-alert ────────────────────────────────────────────
  if (path === "/api/efficiency-alert" && method === "POST") {
    const { usageTrend } = await request.json() as any;
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

  // ── POST /api/rebate-finder ───────────────────────────────────────────────
  if (path === "/api/rebate-finder" && method === "POST") {
    const { state, zipCode, utilityProvider, billType } = await request.json() as any;
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
      return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500, cors);
    }
  }

  // ── POST /api/telecom-negotiate ───────────────────────────────────────────
  if (path === "/api/telecom-negotiate" && method === "POST") {
    const { provider: prov, amountCents, mbps, zipCode } = await request.json() as any;
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
      return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500, cors);
    }
  }

  // ── POST /api/extract-document ────────────────────────────────────────────
  if (path === "/api/extract-document" && method === "POST") {
    const { fileName, mimeType, base64Data } = await request.json() as any;
    if (!fileName || !mimeType || !base64Data) {
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
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
          { type: "text", text: `File name: ${fileName}\nExtract the home document data from this file.` },
        ]}],
        maxTokens: 512,
      });
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: PROVIDER_JSON_ERROR }, 500, cors);
      return json(normalizeExtraction(JSON.parse(m[0])), 200, cors);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500, cors);
    }
  }

  // ── POST /api/pulse ───────────────────────────────────────────────────────
  if (path === "/api/pulse" && method === "POST") {
    const ctx = await request.json() as any;
    if (!ctx?.propertyId || !ctx?.zipCode) {
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
      return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500, cors);
    }
  }

  // ── POST /api/negotiate ───────────────────────────────────────────────────
  if (path === "/api/negotiate" && method === "POST") {
    const { quote, request: qrequest, zip, benchmark } = await request.json() as any;
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
      return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500, cors);
    }
  }

  // ── POST /api/insurer-discount ────────────────────────────────────────────
  if (path === "/api/insurer-discount" && method === "POST") {
    const {
      state, zipCode,
      properties = [], devices = [],
      criticalEventCount = 0, verifiedJobTypes = [], totalVerifiedJobs = 0,
    } = await request.json() as any ?? {};
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
      return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500, cors);
    }
  }

  // ── POST /api/buyers-truth-kit ────────────────────────────────────────────
  if (path === "/api/buyers-truth-kit" && method === "POST") {
    const body = await request.json() as Partial<BuyerTruthKitRequest>;
    if (!body.address?.trim()) return json({ error: "address is required" }, 400, cors);
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
      return json({ error: err instanceof Error ? err.message : "Analysis failed" }, 500, cors);
    }
  }

  // ── POST /api/errors ──────────────────────────────────────────────────────
  if (path === "/api/errors" && method === "POST") {
    const b = await request.json() as any ?? {};
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
    const tags           = b.tags && typeof b.tags === "object" && !Array.isArray(b.tags)
      ? b.tags as Record<string, string> : undefined;

    type RawCrumb = { type?: unknown; message?: unknown; data?: unknown; ts?: unknown };
    const breadcrumbs = Array.isArray(b.breadcrumbs)
      ? (b.breadcrumbs as RawCrumb[]).slice(0, 25).map((c) => ({
          type:    typeof c?.type    === "string" ? c.type.slice(0, 20) : "custom",
          message: typeof c?.message === "string" ? c.message.slice(0, 200) : "",
          data:    c?.data && typeof c.data === "object" && !Array.isArray(c.data) ? c.data : undefined,
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
      principal: request.headers.get("x-icp-principal") ?? "anon",
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
    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      if (tier) existing.tierCounts.set(tier, (existing.tierCounts.get(tier) ?? 0) + 1);
      existing.dirty = true;
    } else {
      const tierCounts = new Map<string, number>();
      if (tier) tierCounts.set(tier, 1);
      errorAggMap.set(fingerprint, {
        fingerprint, message: message.slice(0, 120),
        errorType: (errorType ?? "Error").slice(0, 80),
        count: 1, firstSeen: now, lastSeen: now, tierCounts, release, dirty: true,
      });
    }
    ctx.waitUntil(flushErrorAggregations());

    return new Response(null, { status: 204, headers: cors });
  }

  // ── POST /api/stripe/create-checkout ─────────────────────────────────────
  if (path === "/api/stripe/create-checkout" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500, cors);
    const { tier, billing, successUrl, cancelUrl, gift, principal } = await request.json() as any;
    const PRICE_MAP: Record<string, string | undefined> = {
      ProMonthly:           env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
      ProYearly:            env.STRIPE_PRICE_PRO_YEARLY?.trim(),
      PremiumMonthly:       env.STRIPE_PRICE_PREMIUM_MONTHLY?.trim(),
      PremiumYearly:        env.STRIPE_PRICE_PREMIUM_YEARLY?.trim(),
      ContractorProMonthly: env.STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY?.trim(),
      ContractorProYearly:  env.STRIPE_PRICE_CONTRACTOR_PRO_YEARLY?.trim(),
    };
    const priceId = PRICE_MAP[`${tier}${billing}`];
    if (!priceId) return json({ error: `No price configured for ${tier} ${billing}` }, 400, cors);
    try {
      const Stripe  = (await import("stripe")).default;
      const stripe  = new Stripe(sk);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl, cancel_url: cancelUrl,
        metadata: {
          principal, tier, billing, is_gift: gift ? "true" : "false",
          ...(gift && {
            recipient_email: gift.recipientEmail, recipient_name: gift.recipientName,
            sender_name: gift.senderName, delivery_date: gift.deliveryDate, gift_message: gift.giftMessage,
          }),
        },
      });
      return json({ url: session.url }, 200, cors);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Stripe error" }, 500, cors);
    }
  }

  // ── POST /api/stripe/create-subscription-intent ───────────────────────────
  if (path === "/api/stripe/create-subscription-intent" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500, cors);
    const { tier, billing, principal, email } = await request.json() as any;
    if (!tier || !billing) return json({ error: "tier and billing are required" }, 400, cors);
    const priceEnvMap: Record<string, string | undefined> = {
      "Basic-Monthly":          env.STRIPE_PRICE_BASIC_MONTHLY?.trim(),
      "Basic-Yearly":           env.STRIPE_PRICE_BASIC_YEARLY?.trim(),
      "Pro-Monthly":            env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
      "Pro-Yearly":             env.STRIPE_PRICE_PRO_YEARLY?.trim(),
      "Premium-Monthly":        env.STRIPE_PRICE_PREMIUM_MONTHLY?.trim(),
      "Premium-Yearly":         env.STRIPE_PRICE_PREMIUM_YEARLY?.trim(),
      "ContractorPro-Monthly":  env.STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY?.trim(),
      "ContractorPro-Yearly":   env.STRIPE_PRICE_CONTRACTOR_PRO_YEARLY?.trim(),
    };
    const priceId = priceEnvMap[`${tier}-${billing}`];
    if (!priceId) return json({ error: `No price configured for ${tier}/${billing}` }, 400, cors);
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(sk);
      const customer = await stripe.customers.create({
        ...(email ? { email } : {}),
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
      if (!invoiceId) return json({ error: "Subscription has no latest invoice" }, 500, cors);
      const invoicePayments = await (stripe as any).invoicePayments.list({ invoice: invoiceId });
      const paymentIntentId = invoicePayments?.data?.[0]?.payment?.payment_intent as string | undefined;
      if (!paymentIntentId) return json({ error: "No payment intent found on invoice" }, 500, cors);
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const clientSecret  = paymentIntent.client_secret ?? undefined;
      if (!clientSecret) return json({ error: "Could not get client secret from payment intent" }, 500, cors);
      return json({ clientSecret, subscriptionId: subscription.id }, 200, cors);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Stripe error" }, 500, cors);
    }
  }

  // ── POST /api/stripe/verify-session ──────────────────────────────────────
  if (path === "/api/stripe/verify-session" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500, cors);
    const { sessionId } = await request.json() as { sessionId?: string };
    if (!sessionId) return json({ error: "sessionId required" }, 400, cors);
    try {
      const Stripe   = (await import("stripe")).default;
      const stripe   = new Stripe(sk);
      const session  = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid" || session.status !== "complete") {
        return json({ error: `Payment not complete — status: ${session.status}, payment_status: ${session.payment_status}` }, 400, cors);
      }
      const isGift    = session.metadata?.is_gift === "true";
      const tier      = session.metadata?.tier    ?? "Pro";
      const billing   = session.metadata?.billing ?? "Monthly";
      const principal = session.metadata?.icp_principal ?? session.metadata?.principal ?? "";
      const months    = billing === "Yearly" ? 12 : 1;
      if (isGift) return json({ type: "gift", giftToken: sessionId }, 200, cors);
      if (principal) {
        try { await activateInCanister(principal, tier, months); }
        catch (e) { logger.warn("stripe", "canister activation skipped", { error: (e as Error).message }); }
      }
      return json({ type: "subscription", tier, billing }, 200, cors);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Stripe error" }, 500, cors);
    }
  }

  // ── POST /api/stripe/verify-subscription ─────────────────────────────────
  if (path === "/api/stripe/verify-subscription" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500, cors);
    const { subscriptionId, paymentIntentId, principal: bodyPrincipal } = await request.json() as any;
    if (!subscriptionId) return json({ error: "subscriptionId required" }, 400, cors);
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(sk);
      if (paymentIntentId) {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.status !== "succeeded") {
          return json({ error: `Payment not confirmed — status: ${pi.status}` }, 400, cors);
        }
      }
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const paymentConfirmed = !!paymentIntentId;
      if (
        subscription.status !== "active" &&
        subscription.status !== "trialing" &&
        !(paymentConfirmed && subscription.status === "incomplete")
      ) {
        return json({ error: `Subscription not active — status: ${subscription.status}` }, 400, cors);
      }
      const tier      = subscription.metadata?.tier    ?? "Pro";
      const billing   = subscription.metadata?.billing ?? "Monthly";
      const principal = bodyPrincipal || subscription.metadata?.icp_principal || "";
      const months    = billing === "Yearly" ? 12 : 1;
      if (principal) {
        try { await activateInCanister(principal, tier, months); }
        catch (e) { logger.warn("stripe", "canister activation skipped", { error: (e as Error).message }); }
      }
      return json({ type: "subscription", tier, billing }, 200, cors);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Stripe error" }, 500, cors);
    }
  }

  // ── POST /api/stripe/create-credit-checkout ───────────────────────────────
  if (path === "/api/stripe/create-credit-checkout" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500, cors);
    const { packSize, principal, successUrl, cancelUrl } = await request.json() as any;
    const pack = CREDIT_PACKS[packSize as number];
    if (!pack) {
      return json({ error: `Unknown pack size: ${packSize}. Valid sizes: ${Object.keys(CREDIT_PACKS).join(", ")}` }, 400, cors);
    }
    const priceId = (env[pack.envVar] as string | undefined)?.trim();
    if (!priceId) return json({ error: `${pack.envVar} is not configured` }, 500, cors);
    if (!/^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/.test(principal ?? "")) {
      return json({ error: "Invalid principal" }, 400, cors);
    }
    try {
      const Stripe  = (await import("stripe")).default;
      const stripe  = new Stripe(sk);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl, cancel_url: cancelUrl,
        metadata: { principal, pack_size: String(packSize), type: "agent_credits" },
      });
      return json({ url: session.url }, 200, cors);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Stripe error" }, 500, cors);
    }
  }

  // ── POST /api/stripe/verify-credit-purchase ───────────────────────────────
  if (path === "/api/stripe/verify-credit-purchase" && method === "POST") {
    const sk = env.STRIPE_SECRET_KEY;
    if (!sk) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500, cors);
    const { sessionId } = await request.json() as { sessionId?: string };
    if (!sessionId) return json({ error: "sessionId required" }, 400, cors);
    try {
      const Stripe  = (await import("stripe")).default;
      const stripe  = new Stripe(sk);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid") {
        return json({ error: `Payment not confirmed — status: ${session.payment_status}` }, 400, cors);
      }
      if (session.metadata?.type !== "agent_credits") {
        return json({ error: "Session is not a credit pack purchase" }, 400, cors);
      }
      const principal = session.metadata?.principal ?? "";
      const packSize  = Number(session.metadata?.pack_size ?? 0);
      if (!principal || !CREDIT_PACKS[packSize]) {
        return json({ error: "Missing or invalid metadata in session" }, 400, cors);
      }
      try { await grantAgentCredits(principal, packSize); }
      catch (e) { logger.warn("stripe", "credit grant skipped", { error: (e as Error).message }); }
      return json({ type: "agent_credits", packSize, principal }, 200, cors);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Stripe error" }, 500, cors);
    }
  }

  // ── POST /api/stripe/webhook ──────────────────────────────────────────────
  if (path === "/api/stripe/webhook" && method === "POST") {
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return json({ error: "STRIPE_WEBHOOK_SECRET not configured" }, 500, cors);
    const sig = request.headers.get("stripe-signature");
    if (!sig) return json({ error: "Missing stripe-signature header" }, 400, cors);

    const rawBody = Buffer.from(await request.arrayBuffer());
    let event: any;
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(env.STRIPE_SECRET_KEY ?? "placeholder_webhook_key");
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      return json({ error: `Webhook signature verification failed: ${(err as Error).message}` }, 400, cors);
    }

    try {
      switch (event.type) {
        case "customer.subscription.deleted": {
          const sub = event.data.object;
          const p   = (sub.metadata?.icp_principal ?? "") as string;
          if (p) {
            try { await activateInCanister(p, "Free", 0); }
            catch (e) { logger.warn("stripe-webhook", "revert failed", { event: "subscription.deleted", error: (e as Error).message }); }
          }
          break;
        }
        case "customer.subscription.updated": {
          const sub       = event.data.object;
          const cancelled = sub.status === "canceled" || sub.cancel_at_period_end === true;
          if (cancelled) {
            const p = (sub.metadata?.icp_principal ?? "") as string;
            if (p) {
              try { await activateInCanister(p, "Free", 0); }
              catch (e) { logger.warn("stripe-webhook", "revert failed", { event: "subscription.updated", error: (e as Error).message }); }
            }
          }
          break;
        }
        case "invoice.payment_failed": {
          const inv = event.data.object;
          const p   = (inv.subscription_details?.metadata?.icp_principal ?? inv.metadata?.icp_principal ?? "") as string;
          if (p) {
            try { await activateInCanister(p, "Free", 0); }
            catch (e) { logger.warn("stripe-webhook", "payment_failed revert failed", { error: (e as Error).message }); }
          }
          break;
        }
        case "invoice.payment_succeeded": {
          const inv     = event.data.object;
          const p       = (inv.subscription_details?.metadata?.icp_principal ?? inv.metadata?.icp_principal ?? "") as string;
          const tier    = (inv.subscription_details?.metadata?.tier ?? inv.metadata?.tier ?? "") as string;
          const billing = (inv.subscription_details?.metadata?.billing ?? inv.metadata?.billing ?? "Monthly") as string;
          const months  = billing === "Yearly" ? 12 : 1;
          if (p && tier) {
            try { await activateInCanister(p, tier, months); }
            catch (e) { logger.warn("stripe-webhook", "activate failed", { error: (e as Error).message }); }
          }
          break;
        }
        default:
          logger.info("stripe-webhook", "unhandled event", { type: event.type });
      }
    } catch (err) {
      logger.error("stripe-webhook", "handler error", { error: (err as Error).message });
      return json({ error: "Internal webhook handler error" }, 500, cors);
    }
    return json({ received: true }, 200, cors);
  }

  // ── GET /admin/cycle-status ───────────────────────────────────────────────
  if (path === "/admin/cycle-status" && method === "GET") {
    const apiKey = request.headers.get("x-api-key") ?? "";
    if (env.VOICE_AGENT_API_KEY && apiKey !== env.VOICE_AGENT_API_KEY) {
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
  if (path === "/health" && method === "GET") {
    const checks: Record<string, boolean> = {
      anthropic_key:   !!env.ANTHROPIC_API_KEY,
      api_key:         !!env.VOICE_AGENT_API_KEY,
      frontend_origin: !!env.FRONTEND_ORIGIN,
      stripe_key:      !!env.STRIPE_SECRET_KEY,
      stripe_webhook:  !!env.STRIPE_WEBHOOK_SECRET,
    };
    const allOk = Object.values(checks).every(Boolean);
    return json({ ok: allOk, model: resolveModel(env.AI_MODEL), env: env.NODE_ENV ?? "production", checks },
      allOk ? 200 : 503, cors);
  }

  return json({ error: "Not found" }, 404, cors);
}

// ── Context verification helper ───────────────────────────────────────────────

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
