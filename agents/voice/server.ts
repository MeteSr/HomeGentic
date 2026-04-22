import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { buildSystemPrompt } from "./prompts";
import { buildMaintenanceSystemPrompt } from "../maintenance/prompts";
import { HOMEGENTIC_TOOLS } from "./tools";
import { resolveModel, PROVIDER_JSON_ERROR } from "./provider";
import { createAnthropicProvider } from "./anthropicProvider";
import {
  buildDocumentSystemPrompt,
  normalizeExtraction,
  SUPPORTED_MIME_TYPES,
} from "./extractDocumentHelpers";
import type { ChatRequest } from "./types";
import type { MaintenanceContext } from "../maintenance/prompts";
import { checkAndRecord, TIER_LIMITS } from "./agentLimiter";
import type { SubscriptionTier } from "./agentLimiter";
// NOTE: Email (Resend), permits, price-benchmark, forecast, check, report-request
// and lookup-year-built are handled by the ai_proxy Motoko canister.
// This relay handles only the 6 Claude AI endpoints.

const app = express();
const port = Number(process.env.VOICE_AGENT_PORT) || 3001;

// 14.4.6 — fail-secure: ANTHROPIC_API_KEY must never be a VITE_ var or hardcoded literal.
// It is read server-side only, here and in anthropicProvider.ts.
if (!process.env.ANTHROPIC_API_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("ANTHROPIC_API_KEY env var must be set in production");
  }
  console.warn("[voice-agent] ANTHROPIC_API_KEY not set — Claude API calls will fail");
}

console.log(`[voice-agent] STRIPE_SECRET_KEY ${process.env.STRIPE_SECRET_KEY ? "✓" : "✗ not set"}`)

// §49 — fail-secure: require VOICE_AGENT_API_KEY in production.
// All /api/ routes check the x-api-key header against this secret.
// In dev, if unset, a warning is printed and requests are allowed through.
const VOICE_API_KEY = process.env.VOICE_AGENT_API_KEY ?? "";
if (!VOICE_API_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("VOICE_AGENT_API_KEY env var must be set in production");
  }
  console.warn("[voice-agent] VOICE_AGENT_API_KEY not set — API endpoints are unprotected (dev only)");
}

// 14.3.3 — fail-secure: require FRONTEND_ORIGIN in production
const allowedOrigin = process.env.FRONTEND_ORIGIN;
if (!allowedOrigin) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("FRONTEND_ORIGIN env var must be set in production");
  }
  console.warn("[voice-agent] FRONTEND_ORIGIN not set — accepting any localhost origin (dev only)");
}
// In production: exact match against FRONTEND_ORIGIN.
// In dev: accept any localhost port so Vite (:5173), CRA (:3000), etc. all work.
const origin: string | RegExp =
  process.env.NODE_ENV === "production"
    ? (allowedOrigin as string)
    : (allowedOrigin ?? /^http:\/\/localhost:/);

app.use(cors({ origin }));
// 50 kb default — sufficient for all text payloads; prevents DoS on every route.
// /api/classify gets its own 5 mb parser (base64 image payloads) registered below.
app.use((req, res, next) => {
  if (req.path === "/api/stripe/webhook") {
    // Stripe signature verification requires the raw request body — do NOT parse as JSON.
    // Use type:"*/*" so the raw parser captures any Content-Type (Stripe sends application/json).
    express.raw({ type: "*/*" })(req, res, next);
  } else if (req.path === "/api/classify") {
    express.json({ limit: "5mb" })(req, res, next);
  } else {
    express.json({ limit: "50kb" })(req, res, next);
  }
});

// 14.3.2 — rate limiting: 30 req/min/IP on all /api/ routes
// Disabled in test mode so integration tests can make many requests without
// hitting the limiter.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait before retrying." },
  skip: () => process.env.NODE_ENV === "test",
});
app.use("/api/", apiLimiter);

// §49 — API key auth middleware for all /api/ routes.
// Skipped in dev when VOICE_AGENT_API_KEY is not set.
app.use("/api/", (req: Request, res: Response, next: express.NextFunction): void => {
  if (!VOICE_API_KEY) { next(); return; }
  // Stripe webhooks are authenticated via HMAC signature, not the API key header.
  if (req.originalUrl.startsWith("/api/stripe/webhook")) { next(); return; }
  const provided = req.headers["x-api-key"];
  if (provided !== VOICE_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

// ── Structured request logging ────────────────────────────────────────────────
// Emits one JSON line per /api/ request on completion.
// Format is stable so any log aggregator (Datadog, Loki, CloudWatch) can parse it.
// Fields: ts (ISO), method, path, status, latencyMs, ip, principal.
// "principal" is the ICP principal from x-icp-principal header if sent by the
// frontend, otherwise "anon". Never logs request bodies (no PII leakage).
app.use("/api/", (req: Request, res: Response, next: express.NextFunction): void => {
  const start = Date.now();
  res.on("finish", () => {
    const entry = {
      ts:        new Date().toISOString(),
      method:    req.method,
      path:      req.path,
      status:    res.statusCode,
      latencyMs: Date.now() - start,
      ip:        (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim()
                   ?? req.socket.remoteAddress ?? "unknown",
      principal: (req.headers["x-icp-principal"] as string | undefined) ?? "anon",
    };
    // Use process.stdout.write for JSON-lines — avoids console.log's extra newline handling
    // and keeps lines machine-parseable even when piped.
    process.stdout.write(JSON.stringify(entry) + "\n");
  });
  next();
});

const provider = createAnthropicProvider();
const MODEL    = resolveModel();

// ── POST /api/chat ────────────────────────────────────────────────────────────
// Accepts { message, context }, streams Claude's response as SSE.
// Each event: data: {"text":"..."}\n\n
// Terminator: data: [DONE]\n\n
app.post("/api/chat", async (req: Request, res: Response): Promise<void> => {
  const { message, context }: ChatRequest = req.body;

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    for await (const chunk of provider.stream({
      system:    buildSystemPrompt(context ?? { properties: [], recentJobs: [] }),
      messages:  [{ role: "user", content: message.trim() }],
      maxTokens: 200, // ~150 words — right for voice
    })) {
      res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

// ── POST /api/agent ───────────────────────────────────────────────────────────
// Agentic endpoint: runs one turn of the AI agent tool-use loop.
// Caller maintains conversation history and executes tool calls in the browser.
//
// Request:  { messages: MessageParam[], context: AgentContext }
// Headers:  x-icp-principal   — ICP principal (required for rate limiting)
//           x-subscription-tier — user's plan tier (Free/Basic/Pro/Premium/…)
//
// Response: { type: "answer",     text: string }
//         | { type: "tool_calls", assistantMessage, toolCalls: [...] }
//
// 429 when daily agent limit reached:
//   { error: "daily_agent_limit_reached", limit: N, resetsAt: "<ISO>" }
app.post("/api/agent", async (req: Request, res: Response): Promise<void> => {
  const { messages, context } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  // ── rate limit check ──────────────────────────────────────────────────────
  const principal = (req.headers["x-icp-principal"] as string | undefined) ?? "anon";
  const rawTier   = (req.headers["x-subscription-tier"] as string | undefined) ?? "Free";
  const tier      = (rawTier in TIER_LIMITS ? rawTier : "Free") as SubscriptionTier;

  const { allowed, count, limit, resetsAt } = checkAndRecord(principal, tier);

  if (!allowed) {
    // Tier quota exhausted — try to draw from one-time credit balance (#89).
    let creditFallback = false;
    if (principal !== "anon") {
      try {
        await consumeAgentCredit(principal);
        creditFallback = true;
        process.stdout.write(JSON.stringify({
          ts: new Date().toISOString(), event: "agent_credit_used", principal, tier,
        }) + "\n");
      } catch {
        // No credits, expired, or canister unreachable — fall through to 429.
      }
    }
    if (!creditFallback) {
      res.status(429).json({ error: "daily_agent_limit_reached", limit, count, resetsAt, creditsAvailable: false });
      return;
    }
  }

  // ── respond with remaining quota header so the UI can update the counter ──
  res.setHeader("X-Agent-Calls-Used",  String(count));
  res.setHeader("X-Agent-Calls-Limit", String(limit));

  try {
    const result = await provider.completeWithTools({
      system:    buildSystemPrompt(context ?? { properties: [], recentJobs: [] }),
      tools:     HOMEGENTIC_TOOLS,
      messages,
      maxTokens: 1024,
    });

    if (result.type === "tool_calls") {
      // Return tool calls to the frontend for execution under the user's identity
      res.json(result);
      return;
    }

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/maintenance/chat ────────────────────────────────────────────────
// Streaming chat with the Maintenance Advisor.
// Request:  { message: string, context: MaintenanceContext }
// Response: SSE stream of { text } events, terminated by [DONE]
app.post("/api/maintenance/chat", async (req: Request, res: Response): Promise<void> => {
  const { message, context }: { message: string; context: MaintenanceContext } = req.body;

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    for await (const chunk of provider.stream({
      system:    buildMaintenanceSystemPrompt(context ?? { yearBuilt: 2000 }),
      messages:  [{ role: "user", content: message.trim() }],
      maxTokens: 512,
    })) {
      res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

// ── POST /api/classify ────────────────────────────────────────────────────────
// 1.2.2 — Claude Vision document classification.
// Request:  { fileName: string, mimeType: string, base64Data: string }
// Response: ClassificationResult
//   { documentType, confidence, suggestedServiceType?, extractedDate?,
//     extractedAmountCents?, extractedContractor?, description, rawFileName }
app.post("/api/classify", async (req: Request, res: Response): Promise<void> => {
  const { fileName, mimeType, base64Data } = req.body;

  if (!fileName || !mimeType || !base64Data) {
    res.status(400).json({ error: "fileName, mimeType, and base64Data are required" });
    return;
  }

  // Only image and PDF types are supported by Claude Vision
  const supportedTypes = [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
  ];
  if (!supportedTypes.includes(mimeType)) {
    res.json({
      documentType: "unknown",
      confidence: "low",
      description: "Unsupported file type for vision classification",
      rawFileName: fileName,
    });
    return;
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
      system:    systemPrompt,
      messages:  [{
        role: "user",
        content: [{
          type:   "image",
          source: { type: "base64", media_type: mediaType, data: base64Data },
        }, {
          type: "text",
          text: `File name: ${fileName}\nClassify this home document.`,
        }],
      }],
      maxTokens: 512,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: PROVIDER_JSON_ERROR });
      return;
    }
    const result = JSON.parse(jsonMatch[0]);
    result.rawFileName = fileName;
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/extract-bill ────────────────────────────────────────────────────
// Epic #49 Story 1 — Bill-specific extraction from uploaded utility bill images/PDFs.
// Request:  { fileName, mimeType, base64Data }
// Response: BillExtraction
//   { billType, provider, periodStart, periodEnd, amountCents,
//     usageAmount?, usageUnit?, confidence, description }
app.post("/api/extract-bill", async (req: Request, res: Response): Promise<void> => {
  const { fileName, mimeType, base64Data } = req.body;

  if (!fileName || !mimeType || !base64Data) {
    res.status(400).json({ error: "fileName, mimeType, and base64Data are required" });
    return;
  }

  const supportedTypes = [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
  ];
  if (!supportedTypes.includes(mimeType)) {
    res.status(400).json({ error: "Unsupported file type. Upload an image or PDF." });
    return;
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
      system:    systemPrompt,
      messages:  [{
        role: "user",
        content: [{
          type:   "image",
          source: { type: "base64", media_type: mediaType, data: base64Data },
        }, {
          type: "text",
          text: `File name: ${fileName}\nExtract the utility bill data from this document.`,
        }],
      }],
      maxTokens: 512,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: PROVIDER_JSON_ERROR });
      return;
    }
    const result = JSON.parse(jsonMatch[0]);
    result.rawFileName = fileName;
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/efficiency-alert ───────────────────────────────────────────────
// Epic #49 Story 3 — System Efficiency Degradation Alerts
// Request:  { usageTrend: Array<{ periodStart, usageAmount, usageUnit }> }
// Response: { degradationDetected, estimatedAnnualWaste?, recommendation? }
app.post("/api/efficiency-alert", async (req: Request, res: Response): Promise<void> => {
  const { usageTrend } = req.body;

  if (!Array.isArray(usageTrend) || usageTrend.length === 0) {
    res.status(400).json({ error: "usageTrend must be a non-empty array" });
    return;
  }

  if (usageTrend.length < 3) {
    res.json({ degradationDetected: false });
    return;
  }

  const half     = Math.floor(usageTrend.length / 2);
  const early    = usageTrend.slice(0, half);
  const late     = usageTrend.slice(usageTrend.length - half);
  const earlyAvg = early.reduce((s: number, p: any) => s + Number(p.usageAmount), 0) / early.length;
  const lateAvg  = late.reduce((s: number, p: any)  => s + Number(p.usageAmount), 0) / late.length;
  const trendPct = earlyAvg > 0 ? ((lateAvg - earlyAvg) / earlyAvg) * 100 : 0;

  if (trendPct <= 15) {
    res.json({ degradationDetected: false });
    return;
  }

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

    res.json({
      degradationDetected:  true,
      estimatedAnnualWaste,
      recommendation:       recommendation.trim(),
    });
  } catch (err) {
    // Fallback to rule-based recommendation if Claude is unavailable
    res.json({
      degradationDetected:  true,
      estimatedAnnualWaste,
      recommendation: `Your ${unit} has increased ${trendPct.toFixed(1)}% over this period. This may indicate system inefficiency — consider scheduling an HVAC inspection or checking for leaks.`,
    });
  }
});

// ── POST /api/rebate-finder ───────────────────────────────────────────────────
// Epic #49 Story 4 — Rebate & Incentive Finder
// Request:  { state, zipCode, utilityProvider, billType }
// Response: { rebates: Array<{ name, description, estimatedAmount, provider, url? }> }
app.post("/api/rebate-finder", async (req: Request, res: Response): Promise<void> => {
  const { state, zipCode, utilityProvider, billType } = req.body;

  if (!state || !zipCode || !utilityProvider || !billType) {
    res.status(400).json({ error: "state, zipCode, utilityProvider, and billType are required" });
    return;
  }
  if (billType !== "Electric") {
    res.status(400).json({ error: "Rebate finder is only available for Electric bills." });
    return;
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
      system:    systemPrompt,
      messages:  [{ role: "user", content: `State: ${state} | Zip: ${zipCode} | Utility: ${utilityProvider} | Bill type: ${billType}` }],
      maxTokens: 1024,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: PROVIDER_JSON_ERROR });
      return;
    }
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/telecom-negotiate ───────────────────────────────────────────────
// Epic #49 Story 6 — Telecom Negotiation Assistant
// Request:  { provider, amountCents, mbps, zipCode }
// Response: { verdict, medianCents, savingsOpportunityCents, negotiationScript }
app.post("/api/telecom-negotiate", async (req: Request, res: Response): Promise<void> => {
  const { provider, amountCents, mbps, zipCode } = req.body;

  if (!provider) {
    res.status(400).json({ error: "provider is required" });
    return;
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    res.status(400).json({ error: "amountCents must be a positive integer" });
    return;
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
      system:    systemPrompt,
      messages:  [{
        role: "user",
        content: `Provider: ${provider} | Monthly bill: $${(amountCents / 100).toFixed(2)} | Speed: ${mbps} Mbps | Zip: ${zipCode}`,
      }],
      maxTokens: 512,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: PROVIDER_JSON_ERROR });
      return;
    }
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/extract-document ───────────────────────────────────────────────
// Issue #51 — General document OCR: appliance manuals, warranty cards, receipts,
// inspection reports, permits.
// Request:  { fileName, mimeType, base64Data }
// Response: DocumentExtraction
//   { documentType, brand?, modelNumber?, serialNumber?, purchaseDate?,
//     warrantyMonths?, serviceType?, confidence, description }
app.post("/api/extract-document", async (req: Request, res: Response): Promise<void> => {
  const { fileName, mimeType, base64Data } = req.body;

  if (!fileName || !mimeType || !base64Data) {
    res.status(400).json({ error: "fileName, mimeType, and base64Data are required" });
    return;
  }

  if (!(SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    res.status(400).json({ error: "Unsupported file type. Upload an image or PDF." });
    return;
  }

  const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "application/pdf";

  try {
    const text = await provider.complete({
      system:   buildDocumentSystemPrompt(),
      messages: [{
        role: "user",
        content: [{
          type:   "image",
          source: { type: "base64", media_type: mediaType, data: base64Data },
        }, {
          type: "text",
          text: `File name: ${fileName}\nExtract the home document data from this file.`,
        }],
      }],
      maxTokens: 512,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: PROVIDER_JSON_ERROR });
      return;
    }
    const raw = JSON.parse(jsonMatch[0]);
    res.json(normalizeExtraction(raw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/pulse ───────────────────────────────────────────────────────────
// 8.1.1 — Home Pulse digest generation.
// Request:  PulseContext (propertyId, address, zipCode, yearBuilt, systemAges, …)
// Response: PulseDigest  (headline, items[], climateZone, season, generatedAt)
//
// Claude generates a hyper-local, hyper-specific Monday-morning digest by
// combining: climate zone, current season, system ages, and topic weights.
app.post("/api/pulse", async (req: Request, res: Response): Promise<void> => {
  const ctx = req.body;

  if (!ctx?.propertyId || !ctx?.zipCode) {
    res.status(400).json({ error: "propertyId and zipCode are required" });
    return;
  }

  const season = (() => {
    const m = new Date().getMonth();
    if (m === 11 || m <= 1) return "winter";
    if (m <= 4)             return "spring";
    if (m <= 7)             return "summer";
    return "fall";
  })();

  const systemAgeLines = Object.entries(ctx.systemAges ?? {})
    .filter(([, age]) => (age as number) > 0)
    .map(([sys, age]) => `  - ${sys}: ${age} years since last service`)
    .join("\n");

  const weightLines = Object.entries(ctx.userTopicWeights ?? {})
    .map(([topic, w]) => `  - ${topic}: weight ${w}`)
    .join("\n");

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
    const text = await provider.complete({
      messages:  [{ role: "user", content: prompt }],
      maxTokens: 1024,
    });

    // Extract JSON (provider may add brief preamble despite instructions)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: PROVIDER_JSON_ERROR });
      return;
    }
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/negotiate ───────────────────────────────────────────────────────
// 5.2.2 — Claude negotiation analysis.
// Request:  { quote: { id, amount, timeline }, request: { serviceType, description, urgency },
//             zip: string, benchmark: { p25, median, p75 } }
// Response: NegotiationAnalysis
//   { quoteId, verdict, percentile, suggestedCounterCents?, rationale, generatedAt }
//
// NOTE: This endpoint only returns analysis for the homeowner.
// HomeGentic never contacts contractors on the homeowner's behalf.
app.post("/api/negotiate", async (req: Request, res: Response): Promise<void> => {
  const { quote, request: qrequest, zip, benchmark } = req.body;

  if (!quote?.id || !qrequest?.serviceType || !benchmark?.median) {
    res.status(400).json({ error: "quote, request.serviceType, and benchmark are required" });
    return;
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
    const text = await provider.complete({
      system:    systemPrompt,
      messages:  [{ role: "user", content: userMsg }],
      maxTokens: 512,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: PROVIDER_JSON_ERROR });
      return;
    }
    const result = JSON.parse(jsonMatch[0]);
    result.generatedAt = result.generatedAt ?? Date.now();
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/errors ─────────────────────────────────────────────────────────
// Frontend ErrorBoundary reports caught render errors here (production only).
// The structured logging middleware above records them as JSON lines — no extra
// storage needed. Endpoint always returns 204 so the fire-and-forget client
// doesn't need to parse a response body.
app.post("/api/errors", (req: Request, res: Response): void => {
  // Body is already captured by the logging middleware on "finish".
  // Log it immediately at warn level so it stands out from regular request logs.
  const { message, componentStack, url, ts } = req.body ?? {};
  process.stdout.write(JSON.stringify({
    level:          "warn",
    event:          "frontend_error",
    message:        typeof message === "string"        ? message.slice(0, 500)  : "(no message)",
    componentStack: typeof componentStack === "string" ? componentStack.slice(0, 2000) : null,
    url:            typeof url === "string"            ? url.slice(0, 500)      : null,
    ts:             typeof ts === "string"             ? ts                     : new Date().toISOString(),
    principal:      (req.headers["x-icp-principal"] as string | undefined) ?? "anon",
  }) + "\n");
  res.sendStatus(204);
});

// ── NOTE: The following endpoints moved to the ai_proxy Motoko canister ───────
// Removed: /api/permits/import, /api/check, /api/report-request,
//          /api/price-benchmark, /api/instant-forecast, /api/lookup-year-built,
//          /api/email/send, /api/email/usage, /api/invite/send-email
// Frontend calls the ai_proxy canister directly for all of these.
// This relay now handles only the 6 Claude AI endpoints below.
// ─────────────────────────────────────────────────────────────────────────────

// (Volusia ArcGIS, OpenPermit, email, price-benchmark, forecast, check, report-request
//  and lookup-year-built are all handled by the ai_proxy canister)



// ── POST /api/insurer-discount ────────────────────────────────────────────────
// Epic #50 — Sensor × Insurer Discount Estimator.
// Analyses a homeowner's connected devices and verified maintenance records
// against common insurer discount programs and returns an estimated savings
// range with qualifying categories and program recommendations.
//
// Request:  InsurerDiscountRequest (see type below)
// Response: InsurerDiscountResult
//   { discountRangeMin, discountRangeMax, qualifyingCategories,
//     programs, recommendations, generatedAt }
//
// 5 mb body limit is inherited from the JSON middleware above (all non-classify
// routes are capped at 50 kb — this payload is text-only so that's fine).
app.post("/api/insurer-discount", async (req: Request, res: Response): Promise<void> => {
  const {
    state,
    zipCode,
    properties = [],
    devices    = [],
    criticalEventCount = 0,
    verifiedJobTypes   = [],
    totalVerifiedJobs  = 0,
  } = req.body ?? {};

  if (!state || !zipCode) {
    res.status(400).json({ error: "state and zipCode are required" });
    return;
  }

  const deviceLines = (devices as Array<{ source: string; name: string }>)
    .map((d) => `  - ${d.name} (${d.source})`)
    .join("\n") || "  None registered";

  const jobLines = verifiedJobTypes.length
    ? (verifiedJobTypes as string[]).map((t) => `  - ${t}`).join("\n")
    : "  None on record";

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
    {
      "name": "<discount category name>",
      "discountRange": "<e.g. 5–10%>",
      "basis": "<device or record that qualifies them>",
      "status": "<qualifying|potential|missing>"
    }
  ],
  "programs": [
    {
      "insurer": "<insurer name>",
      "programName": "<program name>",
      "estimatedDiscount": "<e.g. up to 15%>",
      "notes": "<1 sentence on how to apply or what's required>"
    }
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
    ``,
    `Estimate insurance discount eligibility for this homeowner.`,
  ].join("\n");

  try {
    const text = await provider.complete({
      system:    systemPrompt,
      messages:  [{ role: "user", content: userMsg }],
      maxTokens: 1024,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: PROVIDER_JSON_ERROR });
      return;
    }
    const result = JSON.parse(jsonMatch[0]);
    result.generatedAt = result.generatedAt ?? Date.now();
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/stripe/create-checkout (dev only) ───────────────────────────────
// Local dfx replica doesn't forward custom HTTP headers in outcalls correctly.
// This endpoint proxies Stripe checkout creation for local development.
// In production the ICP canister makes the Stripe outcall directly.
app.post("/api/stripe/create-checkout", async (req: Request, res: Response) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) { res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" }); return; }

  const { tier, billing, successUrl, cancelUrl, gift, principal } = req.body as {
    tier: string; billing: string; successUrl: string; cancelUrl: string;
    gift?: { recipientEmail: string; recipientName: string; senderName: string; giftMessage: string; deliveryDate: string };
    principal: string;
  };

  const PRICE_MAP: Record<string, string | undefined> = {
    ProMonthly:           process.env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
    ProYearly:            process.env.STRIPE_PRICE_PRO_YEARLY?.trim(),
    PremiumMonthly:       process.env.STRIPE_PRICE_PREMIUM_MONTHLY?.trim(),
    PremiumYearly:        process.env.STRIPE_PRICE_PREMIUM_YEARLY?.trim(),
    ContractorProMonthly: process.env.STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY?.trim(),
    ContractorProYearly:  process.env.STRIPE_PRICE_CONTRACTOR_PRO_YEARLY?.trim(),
  };

  const priceId = PRICE_MAP[`${tier}${billing}`];
  if (!priceId) { res.status(400).json({ error: `No price configured for ${tier} ${billing}` }); return; }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        principal, tier, billing,
        is_gift: gift ? "true" : "false",
        ...(gift && {
          recipient_email: gift.recipientEmail, recipient_name: gift.recipientName,
          sender_name: gift.senderName, delivery_date: gift.deliveryDate, gift_message: gift.giftMessage,
        }),
      },
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Stripe error" });
  }
});

// ── POST /api/stripe/create-subscription-intent ───────────────────────────────
// Creates an incomplete Subscription and returns its PaymentIntent client_secret
// (pi_xxx) for use with PaymentElement. Stripe SDK v22 dropped the type for
// Invoice.payment_intent so we use `as any` to expand it.
app.post("/api/stripe/create-subscription-intent", async (req: Request, res: Response) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) { res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" }); return; }

  const { tier, billing, principal, email } = req.body as {
    tier: string; billing: string; principal: string; email?: string;
  };
  if (!tier || !billing) {
    res.status(400).json({ error: "tier and billing are required" }); return;
  }

  const priceEnvMap: Record<string, string | undefined> = {
    "Basic-Monthly":          process.env.STRIPE_PRICE_BASIC_MONTHLY?.trim(),
    "Basic-Yearly":           process.env.STRIPE_PRICE_BASIC_YEARLY?.trim(),
    "Pro-Monthly":            process.env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
    "Pro-Yearly":             process.env.STRIPE_PRICE_PRO_YEARLY?.trim(),
    "Premium-Monthly":        process.env.STRIPE_PRICE_PREMIUM_MONTHLY?.trim(),
    "Premium-Yearly":         process.env.STRIPE_PRICE_PREMIUM_YEARLY?.trim(),
    "ContractorPro-Monthly":  process.env.STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY?.trim(),
    "ContractorPro-Yearly":   process.env.STRIPE_PRICE_CONTRACTOR_PRO_YEARLY?.trim(),
  };
  const priceId = priceEnvMap[`${tier}-${billing}`];
  if (!priceId) { res.status(400).json({ error: `No price configured for ${tier}/${billing}` }); return; }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey);

    // Create a customer so tier/billing/principal metadata travels with the subscription
    const customer = await stripe.customers.create({
      ...(email ? { email } : {}),
      metadata: { icp_principal: principal, tier, billing },
    });

    // default_incomplete: subscription stays incomplete until PaymentElement confirms.
    // Elements() only accepts pi_ (PaymentIntent) secrets — not cs_ Checkout Session secrets.
    const subscription = await stripe.subscriptions.create({
      customer:         customer.id,
      items:            [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      metadata:         { icp_principal: principal, tier, billing },
    });

    // latest_invoice may be a string ID or an object depending on SDK version.
    const invoiceId = typeof subscription.latest_invoice === "string"
      ? subscription.latest_invoice
      : (subscription.latest_invoice as any)?.id;

    if (!invoiceId) {
      res.status(500).json({ error: "Subscription has no latest invoice" }); return;
    }

    // Stripe API 2024+: payment_intent was removed from Invoice.
    // Use invoicePayments to get the associated PaymentIntent ID, then retrieve it.
    const invoicePayments = await (stripe as any).invoicePayments.list({ invoice: invoiceId });
    const paymentIntentId = invoicePayments?.data?.[0]?.payment?.payment_intent as string | undefined;

    if (!paymentIntentId) {
      res.status(500).json({ error: "No payment intent found on invoice" }); return;
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const clientSecret  = paymentIntent.client_secret ?? undefined;

    if (!clientSecret) {
      res.status(500).json({ error: "Could not get client secret from payment intent" }); return;
    }

    res.json({ clientSecret, subscriptionId: subscription.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Stripe error" });
  }
});

// ── POST /api/stripe/verify-session (dev only) ────────────────────────────────
// Verifies Stripe payment then activates the subscription tier in the ICP canister
// by calling adminActivateStripeSubscription via dfx CLI (local dev only).
// Returns { type, tier?, billing? } so the frontend can refresh the subscription state.

const VALID_TIERS = new Set(["Free", "Pro", "Premium", "ContractorFree", "ContractorPro"]);

async function activateInCanister(principal: string, tier: string, months: number): Promise<void> {
  // Validate inputs before passing to shell
  if (!VALID_TIERS.has(tier)) throw new Error(`Invalid tier: ${tier}`);
  // ICP principals: base32 segments separated by hyphens, or short text form
  if (!/^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/.test(principal)) {
    throw new Error(`Invalid principal format`);
  }
  const { exec }     = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const cmd = `dfx canister call payment adminActivateStripeSubscription '(principal "${principal}", variant { ${tier} }, ${months})'`;
  const { stderr } = await execAsync(cmd);
  if (stderr && /error/i.test(stderr)) {
    throw new Error(`Canister activation failed: ${stderr.trim()}`);
  }
}

/**
 * Revert a user's subscription tier to Free in the payment canister.
 * Called by the webhook handler on subscription cancellation or payment failure.
 */
async function revertPrincipalToFree(principal: string): Promise<void> {
  await activateInCanister(principal, "Free", 0);
}

// ── Credit top-up helpers (#89) ───────────────────────────────────────────────

/** Valid top-up pack sizes and their Stripe price-ID env vars. */
export const CREDIT_PACKS: Record<number, { envVar: string; label: string }> = {
  25:  { envVar: "STRIPE_PRICE_CREDITS_25",  label: "25 credits" },
  100: { envVar: "STRIPE_PRICE_CREDITS_100", label: "100 credits" },
};

/**
 * Atomically decrement 1 agent credit for `principal` in the payment canister.
 * Throws if the canister returns an error (no credits, expired, or unavailable).
 */
async function consumeAgentCredit(principal: string): Promise<void> {
  if (!/^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/.test(principal)) {
    throw new Error("Invalid principal format");
  }
  const { exec }      = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const cmd = `dfx canister call payment consumeAgentCredit '(principal "${principal}")'`;
  const { stdout, stderr } = await execAsync(cmd);
  if (stderr && /error/i.test(stderr)) throw new Error(`Credit consume failed: ${stderr.trim()}`);
  if (/\berr\b/i.test(stdout))         throw new Error("No agent credits available");
}

/**
 * Grant agent credits to `principal` in the payment canister.
 * Called by the voice server after Stripe confirms a one-time credit pack purchase.
 */
async function grantAgentCredits(principal: string, amount: number): Promise<void> {
  if (!/^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/.test(principal)) {
    throw new Error("Invalid principal format");
  }
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid credit amount");
  const { exec }      = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const cmd = `dfx canister call payment adminGrantAgentCredits '(principal "${principal}", ${amount} : nat)'`;
  const { stderr } = await execAsync(cmd);
  if (stderr && /error/i.test(stderr)) throw new Error(`Credit grant failed: ${stderr.trim()}`);
}

app.post("/api/stripe/verify-session", async (req: Request, res: Response) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) { res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" }); return; }

  const { sessionId } = req.body as { sessionId: string };
  if (!sessionId) { res.status(400).json({ error: "sessionId required" }); return; }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe  = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid" || session.status !== "complete") {
      res.status(400).json({ error: `Payment not complete — status: ${session.status}, payment_status: ${session.payment_status}` });
      return;
    }

    const isGift    = session.metadata?.is_gift === "true";
    const tier      = session.metadata?.tier    ?? "Pro";
    const billing   = session.metadata?.billing ?? "Monthly";
    // new sessions use icp_principal; legacy hosted-checkout sessions used principal
    const principal = session.metadata?.icp_principal ?? session.metadata?.principal ?? "";
    const months    = billing === "Yearly" ? 12 : 1;

    if (isGift) {
      res.json({ type: "gift", giftToken: sessionId });
      return;
    }

    // Activate in the ICP canister (best-effort — don't fail the response if dfx unavailable)
    if (principal) {
      try {
        await activateInCanister(principal, tier, months);
        console.log(`[stripe] activated ${tier}/${billing} for ${principal}`);
      } catch (e) {
        console.warn(`[stripe] canister activation skipped: ${(e as Error).message}`);
      }
    }

    res.json({ type: "subscription", tier, billing });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Stripe error" });
  }
});

// ── POST /api/stripe/verify-subscription ─────────────────────────────────────
// Called by the success page after PaymentElement confirms. Accepts the
// subscriptionId and the paymentIntentId from the Stripe redirect URL params.
//
// Stripe redirects immediately after payment confirmation — before the webhook
// transitions the subscription from 'incomplete' to 'active'. So we verify via
// the PaymentIntent status (which IS 'succeeded' right away) rather than waiting
// for the subscription to become active.
app.post("/api/stripe/verify-subscription", async (req: Request, res: Response) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) { res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" }); return; }

  const { subscriptionId, paymentIntentId, principal: bodyPrincipal } = req.body as {
    subscriptionId: string;
    paymentIntentId?: string;
    principal?: string;       // passed when user paid before logging in
  };
  if (!subscriptionId) { res.status(400).json({ error: "subscriptionId required" }); return; }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe  = new Stripe(stripeSecretKey);

    // Verify payment via PaymentIntent if provided (redirect happens before subscription
    // transitions from 'incomplete' → 'active', so PI status is the reliable signal).
    if (paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status !== "succeeded") {
        res.status(400).json({ error: `Payment not confirmed — status: ${pi.status}` }); return;
      }
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Accept incomplete if payment was confirmed above; active/trialing always pass.
    const paymentConfirmed = !!paymentIntentId;
    if (
      subscription.status !== "active" &&
      subscription.status !== "trialing" &&
      !(paymentConfirmed && subscription.status === "incomplete")
    ) {
      res.status(400).json({ error: `Subscription not active — status: ${subscription.status}` }); return;
    }

    const tier      = subscription.metadata?.tier    ?? "Pro";
    const billing   = subscription.metadata?.billing ?? "Monthly";
    // Use principal from request body when user paid before logging in (no principal
    // in subscription metadata at payment time); fall back to metadata if present.
    const principal = bodyPrincipal || subscription.metadata?.icp_principal || "";
    const months    = billing === "Yearly" ? 12 : 1;

    if (principal) {
      try {
        await activateInCanister(principal, tier, months);
        console.log(`[stripe] subscription activated ${tier}/${billing} for ${principal}`);
      } catch (e) {
        console.warn(`[stripe] canister activation skipped: ${(e as Error).message}`);
      }
    }

    res.json({ type: "subscription", tier, billing });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Stripe error" });
  }
});

// ── POST /api/stripe/create-credit-checkout ──────────────────────────────────
// Creates a Stripe Checkout Session in one-time payment mode for an agent credit
// pack (25 or 100 credits).  On success the browser is redirected to Stripe;
// the verify-credit-purchase route tops up the balance after payment.
app.post("/api/stripe/create-credit-checkout", async (req: Request, res: Response) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) { res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" }); return; }

  const { packSize, principal, successUrl, cancelUrl } = req.body as {
    packSize: number; principal: string; successUrl: string; cancelUrl: string;
  };

  const pack = CREDIT_PACKS[packSize];
  if (!pack) {
    res.status(400).json({ error: `Unknown pack size: ${packSize}. Valid sizes: ${Object.keys(CREDIT_PACKS).join(", ")}` });
    return;
  }

  const priceId = process.env[pack.envVar]?.trim();
  if (!priceId) {
    res.status(500).json({ error: `${pack.envVar} is not configured` });
    return;
  }

  if (!/^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/.test(principal ?? "")) {
    res.status(400).json({ error: "Invalid principal" }); return;
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url:  cancelUrl,
      metadata: { principal, pack_size: String(packSize), type: "agent_credits" },
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Stripe error" });
  }
});

// ── POST /api/stripe/verify-credit-purchase ───────────────────────────────────
// Called from the payment success page after a credit pack checkout completes.
// Verifies the Stripe session, then calls adminGrantAgentCredits on the canister.
app.post("/api/stripe/verify-credit-purchase", async (req: Request, res: Response) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) { res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" }); return; }

  const { sessionId } = req.body as { sessionId: string };
  if (!sessionId) { res.status(400).json({ error: "sessionId required" }); return; }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe  = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      res.status(400).json({ error: `Payment not confirmed — status: ${session.payment_status}` }); return;
    }
    if (session.metadata?.type !== "agent_credits") {
      res.status(400).json({ error: "Session is not a credit pack purchase" }); return;
    }

    const principal = session.metadata?.principal ?? "";
    const packSize  = Number(session.metadata?.pack_size ?? 0);

    if (!principal || !CREDIT_PACKS[packSize]) {
      res.status(400).json({ error: "Missing or invalid metadata in session" }); return;
    }

    try {
      await grantAgentCredits(principal, packSize);
      console.log(`[stripe] granted ${packSize} agent credits to ${principal}`);
    } catch (e) {
      console.warn(`[stripe] credit grant skipped: ${(e as Error).message}`);
    }

    res.json({ type: "agent_credits", packSize, principal });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Stripe error" });
  }
});

// ── POST /api/buyers-truth-kit ────────────────────────────────────────────────
// Geocodes address, queries permit portals, calls Claude for structured analysis.
// Public-facing free tool — no ICP principal required.
// Body: BuyerTruthKitRequest  Response: BuyerTruthKitResponse
import { lookupPermits, generateKit, geocodeAddress } from "./buyersTruthKit";
import type { BuyerTruthKitRequest } from "./buyersTruthKit";

app.post("/api/buyers-truth-kit", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Partial<BuyerTruthKitRequest>;

  if (!body.address?.trim()) { res.status(400).json({ error: "address is required" }); return; }
  if (!body.yearBuilt || body.yearBuilt < 1800 || body.yearBuilt > new Date().getFullYear()) {
    res.status(400).json({ error: "yearBuilt must be a valid year" }); return;
  }
  if (!body.claims) { res.status(400).json({ error: "claims are required" }); return; }

  try {
    const geo = await geocodeAddress(body.address);

    const permits = await lookupPermits(body.address, geo);
    const kit     = await generateKit(body as BuyerTruthKitRequest, permits, provider);

    res.json({
      property: {
        address:   body.address,
        yearBuilt: body.yearBuilt,
        geocoded:  !!geo,
        city:      geo?.city,
        state:     geo?.state,
        county:    geo?.county,
      },
      permits,
      kit,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Analysis failed" });
  }
});

// ── POST /api/stripe/webhook ──────────────────────────────────────────────────
// Handles Stripe subscription lifecycle events (#143).
// Raw body required for HMAC signature verification — see body-parser middleware above.
// Signature verified via STRIPE_WEBHOOK_SECRET (fail-closed: returns 500 if not set).
//
// Handled events:
//   customer.subscription.deleted  → revert principal to Free
//   customer.subscription.updated  → revert if cancelled (cancel_at_period_end) or status=canceled
//   invoice.payment_failed         → revert principal to Free
//   invoice.payment_succeeded      → activate tier in canister
app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET not configured" });
    return;
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    const Stripe = (await import("stripe")).default;
    // constructEvent is synchronous and doesn't call the Stripe API —
    // the secret key is only needed to instantiate the SDK.
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "placeholder_webhook_key");
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig as string, webhookSecret);
  } catch (err) {
    res.status(400).json({ error: `Webhook signature verification failed: ${(err as Error).message}` });
    return;
  }

  try {
    switch (event.type) {
      case "customer.subscription.deleted": {
        const sub       = event.data.object;
        const principal = (sub.metadata?.icp_principal ?? "") as string;
        if (principal) {
          try { await revertPrincipalToFree(principal); }
          catch (e) { console.warn(`[stripe-webhook] revert failed: ${(e as Error).message}`); }
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub       = event.data.object;
        const status    = (sub.status ?? "") as string;
        const cancelled = status === "canceled" || sub.cancel_at_period_end === true;
        if (cancelled) {
          const principal = (sub.metadata?.icp_principal ?? "") as string;
          if (principal) {
            try { await revertPrincipalToFree(principal); }
            catch (e) { console.warn(`[stripe-webhook] revert failed: ${(e as Error).message}`); }
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice   = event.data.object;
        // Try subscription_details.metadata (newer Stripe API) then invoice.metadata
        const principal = (
          invoice.subscription_details?.metadata?.icp_principal ??
          invoice.metadata?.icp_principal ??
          ""
        ) as string;
        if (principal) {
          try { await revertPrincipalToFree(principal); }
          catch (e) { console.warn(`[stripe-webhook] payment_failed revert: ${(e as Error).message}`); }
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice   = event.data.object;
        const principal = (
          invoice.subscription_details?.metadata?.icp_principal ??
          invoice.metadata?.icp_principal ??
          ""
        ) as string;
        const tier    = (
          invoice.subscription_details?.metadata?.tier ??
          invoice.metadata?.tier ??
          ""
        ) as string;
        const billing = (
          invoice.subscription_details?.metadata?.billing ??
          invoice.metadata?.billing ??
          "Monthly"
        ) as string;
        const months  = billing === "Yearly" ? 12 : 1;
        if (principal && tier) {
          try { await activateInCanister(principal, tier, months); }
          catch (e) { console.warn(`[stripe-webhook] activate failed: ${(e as Error).message}`); }
        }
        break;
      }
      default:
        process.stdout.write(JSON.stringify({
          ts: new Date().toISOString(), event: "stripe_webhook_unhandled", type: event.type,
        }) + "\n");
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler error: ${(err as Error).message}`);
    res.status(500).json({ error: "Internal webhook handler error" });
    return;
  }

  res.json({ received: true });
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, model: MODEL });
});

// Export app for testing; only bind the port when running as the main entry point.
export { app };

const httpServer = process.env.NODE_ENV !== "test"
  ? app.listen(port, () => {
      console.log(`HomeGentic voice agent proxy → http://localhost:${port}`);
      console.log(`Accepting requests from ${origin}`);
    })
  : null;

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Stop accepting new connections, then let in-flight SSE streams drain before
// exiting.  Without this a SIGTERM (deploy, container restart) kills open SSE
// connections mid-stream, causing the frontend to show a hard error.
function shutdown(signal: string): void {
  console.log(`[voice-agent] ${signal} received — shutting down gracefully`);
  httpServer?.close(() => {
    console.log("[voice-agent] all connections closed — exiting");
    process.exit(0);
  });
  // Force-exit after 10 s so a hung stream never blocks a deploy indefinitely.
  setTimeout(() => {
    console.error("[voice-agent] forced exit after 10 s");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
