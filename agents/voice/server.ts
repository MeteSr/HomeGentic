import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { buildSystemPrompt } from "./prompts";
import { buildMaintenanceSystemPrompt } from "../maintenance/prompts";
import { HOMEGENTIC_TOOLS } from "./tools";
import { resolveModel, PROVIDER_JSON_ERROR } from "./provider";
import { createAnthropicProvider } from "./anthropicProvider";
import { parseForecastQueryParams, estimateSystems, computeTenYearBudget } from "./forecast";
import { createEmailProvider } from "./resendEmailProvider";
import { EmailRateLimitError } from "./emailProvider";
import type { ChatRequest } from "./types";
import type { MaintenanceContext } from "../maintenance/prompts";

const app = express();
const port = Number(process.env.VOICE_AGENT_PORT) || 3001;

// Email provider — fail-secure: warn in dev, throw in production if key is absent.
if (!process.env.RESEND_API_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("RESEND_API_KEY env var must be set in production");
  }
  console.warn("[voice-agent] RESEND_API_KEY not set — email sending will fail");
}
const emailProvider = createEmailProvider();

// 14.4.6 — fail-secure: ANTHROPIC_API_KEY must never be a VITE_ var or hardcoded literal.
// It is read server-side only, here and in anthropicProvider.ts.
if (!process.env.ANTHROPIC_API_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("ANTHROPIC_API_KEY env var must be set in production");
  }
  console.warn("[voice-agent] ANTHROPIC_API_KEY not set — Claude API calls will fail");
}

// 14.3.3 — fail-secure: require FRONTEND_ORIGIN in production
const allowedOrigin = process.env.FRONTEND_ORIGIN;
if (!allowedOrigin) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("FRONTEND_ORIGIN env var must be set in production");
  }
  console.warn("[voice-agent] FRONTEND_ORIGIN not set — defaulting to http://localhost:3000 (dev only)");
}
const origin = allowedOrigin ?? "http://localhost:3000";

app.use(cors({ origin }));
app.use(express.json({ limit: "5mb" }));  // raised for base64 image payloads (16.6)

// 14.3.2 — rate limiting: 30 req/min/IP on all /api/ routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait before retrying." },
});
app.use("/api/", apiLimiter);

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
// Response: { type: "answer",     text: string }
//         | { type: "tool_calls", assistantMessage, toolCalls: [...] }
app.post("/api/agent", async (req: Request, res: Response): Promise<void> => {
  const { messages, context } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

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

// ── Volusia County ArcGIS permit fetch (§17.5.1) ─────────────────────────────

const VOLUSIA_CITIES = new Set([
  "daytona beach", "deltona", "ormond beach", "port orange", "holly hill",
  "south daytona", "new smyrna beach", "edgewater", "deland", "debary",
  "orange city", "ponce inlet", "oak hill", "lake helen", "pierson",
  "osteen", "enterprise", "volusia county",
]);

function isVolusiaCounty(city: string, state: string): boolean {
  return state.trim().toLowerCase() === "fl" &&
    VOLUSIA_CITIES.has(city.trim().toLowerCase());
}

const AMANDA_FOLDER_TYPE_MAP: Record<string, string> = {
  elec: "Electrical Permit", mech: "Mechanical Permit",
  plmb: "Plumbing Permit",   roof: "Roofing Permit",
  wind: "Window Permit",     wtrh: "Water Heater Permit",
  solr: "Solar Permit",      insul: "Insulation Permit",
  floor: "Flooring Permit",
};

function mapAmandaStatus(s: string): "Open" | "Finaled" | "Expired" | "Cancelled" {
  const l = s.toLowerCase();
  if (/final|certificate|closed|complet/.test(l)) return "Finaled";
  if (/expir/.test(l))                            return "Expired";
  if (/void|cancel|withdraw/.test(l))             return "Cancelled";
  return "Open";
}

async function fetchVolusiaPermits(address: string): Promise<any[]> {
  const street = address.split(",")[0].trim();
  const params = new URLSearchParams({
    where:             `FOLDERDESCRIPTION LIKE '%${street}%'`,
    outFields:         "FOLDERNAME,FOLDERTYPE,STATUSDESC,INDATE,FOLDERDESCRIPTION,FOLDERLINK",
    resultRecordCount: "50",
    f:                 "json",
  });
  const url = `https://maps5.vcgov.org/arcgis/rest/services/CurrentProjects/MapServer/1/query?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Volusia ArcGIS error: ${res.status}`);
  const data = await res.json();
  return (data.features ?? []).map((f: any) => {
    const a = f.attributes;
    const folderType = (a.FOLDERTYPE ?? "").toLowerCase();
    return {
      permitNumber:  a.FOLDERNAME ?? "",
      permitType:    AMANDA_FOLDER_TYPE_MAP[folderType] ?? "Building Permit",
      description:   a.FOLDERDESCRIPTION ?? "",
      issuedDate:    a.INDATE ? new Date(a.INDATE).toISOString().slice(0, 10) : "",
      status:        mapAmandaStatus(a.STATUSDESC ?? ""),
      estimatedValueCents: undefined,
      contractorName:      undefined,
    };
  });
}

// ── POST /api/permits/import (§17.5.1) ───────────────────────────────────────
// Accepts { propertyId, address, city, state, zip }
// Routes to Volusia County ArcGIS (no key) or OpenPermit.org (requires OPEN_PERMIT_API_KEY).
// Returns { permits: OpenPermitRecord[] }
app.post("/api/permits/import", async (req: Request, res: Response): Promise<void> => {
  const { address, city, state, zip } = req.body;
  if (!address || !city || !state || !zip) {
    res.status(400).json({ error: "address, city, state, and zip are required" });
    return;
  }

  try {
    // Volusia County pilot — direct ArcGIS, no API key needed
    if (isVolusiaCounty(city, state)) {
      const permits = await fetchVolusiaPermits(address);
      res.json({ permits });
      return;
    }

    // All other cities — OpenPermit.org (requires key)
    const apiKey = process.env.OPEN_PERMIT_API_KEY;
    if (!apiKey) {
      res.json({ permits: [] });
      return;
    }

    const query = new URLSearchParams({ address, city, state, zip, limit: "20" });
    const upstream = await fetch(
      `https://api.openpermit.org/v1/permits?${query.toString()}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!upstream.ok) {
      res.status(502).json({ error: `OpenPermit upstream error: ${upstream.status}` });
      return;
    }
    const data = await upstream.json();
    const raw: any[] = data.results ?? [];
    const permits = raw.map((p: any) => ({
      permitNumber:        p.permit_number ?? p.id ?? "",
      permitType:          p.permit_type ?? p.type ?? "Building Permit",
      description:         p.description ?? p.work_description ?? "",
      issuedDate:          (p.issued_date ?? p.issue_date ?? "").slice(0, 10),
      status:              normalizePermitStatus(p.status ?? ""),
      estimatedValueCents: p.estimated_value ? Math.round(p.estimated_value * 100) : undefined,
      contractorLicense:   p.contractor_license ?? undefined,
      contractorName:      p.contractor_name   ?? undefined,
    }));
    res.json({ permits });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

function normalizePermitStatus(raw: string): "Open" | "Finaled" | "Expired" | "Cancelled" {
  const s = raw.toLowerCase();
  if (s.includes("final") || s.includes("closed") || s.includes("complete")) return "Finaled";
  if (s.includes("expir"))    return "Expired";
  if (s.includes("cancel") || s.includes("void")) return "Cancelled";
  return "Open";
}

// ── GET /api/check (§17.4.1) ─────────────────────────────────────────────────
// Public buyer lookup: ?address=123+main+st+daytona+beach+fl
// Searches for any active Public share link for the given address.
// Returns { found, token?, address, verificationLevel?, propertyType?, yearBuilt? }
app.get("/api/check", async (req: Request, res: Response): Promise<void> => {
  const address = (req.query.address as string ?? "").trim();
  if (!address) {
    res.status(400).json({ error: "address query param is required" });
    return;
  }
  // Without a deployed canister we cannot do a real lookup — return not-found.
  // In production this would query the report canister's findPublicByAddress method.
  res.json({ found: false, address });
});

// ── POST /api/report-request (§17.4.2) ───────────────────────────────────────
// Buyer leaves a notification request for when a report is created.
// Accepts { address, buyerEmail }
// In production: stores in a `report_requests` table and emails the homeowner.
app.post("/api/report-request", async (req: Request, res: Response): Promise<void> => {
  const { address, buyerEmail } = req.body;
  if (!address || !buyerEmail) {
    res.status(400).json({ error: "address and buyerEmail are required" });
    return;
  }
  // Stub: log and acknowledge — full email integration deferred
  console.log(`[report-request] ${buyerEmail} requested report for: ${address}`);
  res.json({ queued: true });
});

// ── GET /api/price-benchmark (§17.1.2) ───────────────────────────────────────
// Returns price benchmark for a service type + zip code.
// ?service=Roofing&zip=32114
// Seed data sourced from Homewyse/RSMeans baselines + closed HomeGentic bids.
// Production: query closed bids from the `quote` canister, grouped by service+zip.
const PRICE_SEED: Record<string, { low: number; median: number; high: number; sampleSize: number }> = {
  "Roofing":     { low: 800000,  median: 1400000, high: 2200000, sampleSize: 47 },
  "HVAC":        { low: 350000,  median: 650000,  high: 1200000, sampleSize: 61 },
  "Plumbing":    { low: 15000,   median: 45000,   high: 180000,  sampleSize: 83 },
  "Electrical":  { low: 20000,   median: 55000,   high: 250000,  sampleSize: 54 },
  "Flooring":    { low: 200000,  median: 450000,  high: 900000,  sampleSize: 38 },
  "Painting":    { low: 60000,   median: 150000,  high: 400000,  sampleSize: 72 },
  "Landscaping": { low: 30000,   median: 90000,   high: 350000,  sampleSize: 29 },
  "Windows":     { low: 45000,   median: 120000,  high: 350000,  sampleSize: 22 },
  "Foundation":  { low: 400000,  median: 900000,  high: 2500000, sampleSize: 11 },
  "Other":       { low: 10000,   median: 40000,   high: 200000,  sampleSize: 15 },
};

// ── GET /api/instant-forecast (§17.2.1) ──────────────────────────────────────
// Public, stateless endpoint — no canister write, no auth required.
// Accepts: address, yearBuilt, state?, + per-system override params
//   (hvac=YYYY, roofing=YYYY, water_heater=YYYY, plumbing=YYYY, electrical=YYYY,
//    windows=YYYY, flooring=YYYY, insulation=YYYY, solar_panels=YYYY)
// Returns: full system-by-system forecast + 10-year replacement budget.
app.get("/api/instant-forecast", (req: Request, res: Response): void => {
  const result = parseForecastQueryParams(req.query as Record<string, string | undefined>);

  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  const { address, yearBuilt, state, overrides } = result.input;
  const systems      = estimateSystems(yearBuilt, state, overrides);
  const tenYearBudget = computeTenYearBudget(systems);

  res.json({
    address,
    yearBuilt,
    state:          state ?? null,
    systems,
    tenYearBudget,
    generatedAt:    Date.now(),
  });
});

// ── GET /api/lookup-year-built (§17.2.4) ─────────────────────────────────────
// Relay stub — ATTOM Data integration deferred. Always returns yearBuilt: null.

app.get("/api/lookup-year-built", (req: Request, res: Response): void => {
  const address = (req.query.address as string ?? "").trim();
  if (!address) {
    res.status(400).json({ error: "address is required" });
    return;
  }
  // TODO: integrate ATTOM Data public records lookup
  res.json({ address, yearBuilt: null });
});

// ── GET /api/price-benchmark (§17.1.2) ───────────────────────────────────────

app.get("/api/price-benchmark", (req: Request, res: Response): void => {
  const service = (req.query.service as string ?? "").trim();
  const zip     = (req.query.zip as string ?? "").trim();

  if (!service || !zip) {
    res.status(400).json({ error: "service and zip are required" });
    return;
  }

  const seed = PRICE_SEED[service];
  if (!seed) {
    res.status(404).json({ error: `No benchmark data for service: ${service}` });
    return;
  }

  // TODO: augment with real closed-bid data from quote canister, filtered by zip
  const now = new Date();
  const lastUpdated = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  res.json({
    serviceType:  service,
    zipCode:      zip,
    low:          seed.low,
    median:       seed.median,
    high:         seed.high,
    sampleSize:   seed.sampleSize,
    lastUpdated,
  });
});

// ── POST /api/email/send ──────────────────────────────────────────────────────
// Internal endpoint for sending transactional email via Resend.
// Rate-limited to 100/day and 3,000/month (free tier cap).
// Request:  { to, subject, html, text?, replyTo?, from? }
// Response: { id } | { error, retryAfter? }
app.post("/api/email/send", async (req: Request, res: Response): Promise<void> => {
  const { to, subject, html, text, replyTo, from } = req.body;

  if (!to || !subject || !html) {
    res.status(400).json({ error: "to, subject, and html are required" });
    return;
  }

  try {
    const result = await emailProvider.send({ to, subject, html, text, replyTo, from });
    res.json({ id: result.id });
  } catch (err) {
    if (err instanceof EmailRateLimitError) {
      res.status(429).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/email/usage ──────────────────────────────────────────────────────
// Returns current rate-limit counters. Useful for monitoring dashboards.
app.get("/api/email/usage", (_req: Request, res: Response): void => {
  res.json(emailProvider.usage());
});

// ── POST /api/invite/send-email ───────────────────────────────────────────────
// Sends a contractor invite email with job details and the single-use verify URL.
// Request:  { to, contractorName?, propertyAddress, serviceType, amount, verifyUrl }
// Response: { sent: true } | { error }
app.post("/api/invite/send-email", async (req: Request, res: Response): Promise<void> => {
  const { to, contractorName, propertyAddress, serviceType, amount, verifyUrl } = req.body;

  if (!to || !propertyAddress || !serviceType || !verifyUrl) {
    res.status(400).json({ error: "to, propertyAddress, serviceType, and verifyUrl are required" });
    return;
  }

  const greeting = contractorName ? `Hi ${contractorName},` : "Hi,";
  const amountStr = typeof amount === "number" ? `$${(amount / 100).toLocaleString()}` : "";

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: 'IBM Plex Sans', Arial, sans-serif; background: #F4F1EB; margin: 0; padding: 2rem;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border: 1px solid #C8C3B8; padding: 2rem;">
    <p style="font-family: Georgia, serif; font-size: 1.5rem; font-weight: 900; margin: 0 0 1.5rem; color: #2E2540;">
      Home<span style="color: #5A7A5A;">Gentic</span>
    </p>
    <p style="color: #2E2540; margin-bottom: 1rem;">${greeting}</p>
    <p style="color: #2E2540; line-height: 1.6; margin-bottom: 1.5rem;">
      A homeowner at <strong>${propertyAddress}</strong> has asked you to confirm and co-sign the following job record on the HomeGentic verified home history platform:
    </p>
    <div style="background: #F0F4F0; border: 1px solid #C8C3B8; padding: 1rem; margin-bottom: 1.5rem;">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem; color: #2E2540;">
        <tr><td style="padding: 0.375rem 0; color: #7A7268; width: 40%;">Service</td><td><strong>${serviceType}</strong></td></tr>
        ${amountStr ? `<tr><td style="padding: 0.375rem 0; color: #7A7268;">Amount</td><td><strong>${amountStr}</strong></td></tr>` : ""}
        <tr><td style="padding: 0.375rem 0; color: #7A7268;">Property</td><td>${propertyAddress}</td></tr>
      </table>
    </div>
    <p style="color: #2E2540; line-height: 1.6; margin-bottom: 1.5rem;">
      Tap the button below to review the job details and add your digital signature. No account required — it takes less than 30 seconds.
    </p>
    <a href="${verifyUrl}" style="display: inline-block; background: #2E2540; color: #fff; text-decoration: none; padding: 0.875rem 2rem; font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase;">
      Confirm &amp; Sign →
    </a>
    <p style="color: #7A7268; font-size: 0.75rem; margin-top: 1.5rem; line-height: 1.6;">
      This link expires in 48 hours and can only be used once. If you have questions, contact the homeowner directly.
    </p>
    <hr style="border: none; border-top: 1px solid #C8C3B8; margin: 1.5rem 0;" />
    <p style="color: #7A7268; font-size: 0.7rem;">
      HomeGentic · Verified Home History · Internet Computer blockchain
    </p>
  </div>
</body>
</html>`.trim();

  const text = [
    greeting,
    "",
    `A homeowner at ${propertyAddress} has asked you to confirm and co-sign a job record on HomeGentic.`,
    "",
    `Service: ${serviceType}`,
    amountStr ? `Amount: ${amountStr}` : "",
    `Property: ${propertyAddress}`,
    "",
    `Confirm and sign here (link expires in 48 hours):`,
    verifyUrl,
    "",
    "HomeGentic · Verified Home History",
  ].filter((l) => l !== undefined).join("\n");

  try {
    await emailProvider.send({
      to,
      subject: `Please confirm your work at ${propertyAddress}`,
      html,
      text,
    });
    res.json({ sent: true });
  } catch (err) {
    if (err instanceof EmailRateLimitError) {
      res.status(429).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, model: MODEL });
});

app.listen(port, () => {
  console.log(`HomeGentic voice agent proxy → http://localhost:${port}`);
  console.log(`Accepting requests from ${origin}`);
});
