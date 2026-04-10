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
  console.warn("[voice-agent] FRONTEND_ORIGIN not set — defaulting to http://localhost:3000 (dev only)");
}
const origin = allowedOrigin ?? "http://localhost:3000";

app.use(cors({ origin }));
// 50 kb default — sufficient for all text payloads; prevents DoS on every route.
// /api/classify gets its own 5 mb parser (base64 image payloads) registered below.
app.use((req, res, next) => {
  if (req.path === "/api/classify") {
    express.json({ limit: "5mb" })(req, res, next);
  } else {
    express.json({ limit: "50kb" })(req, res, next);
  }
});

// 14.3.2 — rate limiting: 30 req/min/IP on all /api/ routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait before retrying." },
});
app.use("/api/", apiLimiter);

// §49 — API key auth middleware for all /api/ routes.
// Skipped in dev when VOICE_AGENT_API_KEY is not set.
app.use("/api/", (req: Request, res: Response, next: express.NextFunction): void => {
  if (!VOICE_API_KEY) { next(); return; }
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



// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, model: MODEL });
});

const httpServer = app.listen(port, () => {
  console.log(`HomeGentic voice agent proxy → http://localhost:${port}`);
  console.log(`Accepting requests from ${origin}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Stop accepting new connections, then let in-flight SSE streams drain before
// exiting.  Without this a SIGTERM (deploy, container restart) kills open SSE
// connections mid-stream, causing the frontend to show a hard error.
function shutdown(signal: string): void {
  console.log(`[voice-agent] ${signal} received — shutting down gracefully`);
  httpServer.close(() => {
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
