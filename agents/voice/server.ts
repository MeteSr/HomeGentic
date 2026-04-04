import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./prompts";
import { buildMaintenanceSystemPrompt } from "../maintenance/prompts";
import { HOMEFAX_TOOLS } from "./tools";
import type { ChatRequest } from "./types";
import type { MaintenanceContext } from "../maintenance/prompts";

const app = express();
const port = Number(process.env.VOICE_AGENT_PORT) || 3001;

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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 200, // ~150 words — right for voice
      system: buildSystemPrompt(context ?? { properties: [], recentJobs: [] }),
      messages: [{ role: "user", content: message.trim() }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
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
// Agentic endpoint: runs one turn of the Claude tool-use loop.
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
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: buildSystemPrompt(context ?? { properties: [], recentJobs: [] }),
      tools: HOMEFAX_TOOLS,
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length > 0) {
      // Return tool calls to the frontend for execution under the user's identity
      res.json({
        type: "tool_calls",
        assistantMessage: { role: "assistant", content: response.content },
        toolCalls: toolUseBlocks.map((b) => ({
          id: b.id,
          name: b.name,
          input: b.input,
        })),
      });
      return;
    }

    // Final answer — extract text
    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    );
    res.json({ type: "answer", text: textBlock?.text ?? "" });
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
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: buildMaintenanceSystemPrompt(context ?? { yearBuilt: 2000 }),
      messages: [{ role: "user", content: message.trim() }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
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

  const systemPrompt = `You are a home document classifier for the HomeFax platform.
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
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 512,
      system:     systemPrompt,
      messages: [{
        role: "user",
        content: [{
          type:   "image",
          source: { type: "base64", media_type: mediaType, data: base64Data },
        }, {
          type: "text",
          text: `File name: ${fileName}\nClassify this home document.`,
        }],
      }],
    });

    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Claude did not return valid JSON" });
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
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      messages:   [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Extract JSON from response (Claude may add brief preamble despite instructions)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Claude did not return valid JSON" });
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
// HomeFax never contacts contractors on the homeowner's behalf.
app.post("/api/negotiate", async (req: Request, res: Response): Promise<void> => {
  const { quote, request: qrequest, zip, benchmark } = req.body;

  if (!quote?.id || !qrequest?.serviceType || !benchmark?.median) {
    res.status(400).json({ error: "quote, request.serviceType, and benchmark are required" });
    return;
  }

  const fmtK = (c: number) => `$${(c / 100).toFixed(0)}`;

  const systemPrompt = `You are a real estate negotiation analyst for HomeFax.
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
- HomeFax never contacts contractors — only provide analysis for the homeowner`;

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
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 512,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userMsg }],
    });

    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Claude did not return valid JSON" });
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

// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, model: "claude-sonnet-4-6" });
});

app.listen(port, () => {
  console.log(`HomeFax voice agent proxy → http://localhost:${port}`);
  console.log(`Accepting requests from ${origin}`);
});
