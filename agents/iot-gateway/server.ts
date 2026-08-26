/**
 * HomeGentic IoT Gateway
 *
 * Node.js/Express bridge that receives webhooks from smart-home platforms and
 * forwards normalized sensor readings to the HomeGentic Sensor canister on ICP.
 *
 * Supported platforms:
 *   POST /webhooks/nest            — Google Nest (SDM API Pub/Sub push)
 *   POST /webhooks/ecobee          — Ecobee thermostat alerts
 *   POST /webhooks/moen-flo        — Moen Flo water-leak detection
 *   POST /webhooks/smartthings     — SmartThings capability events (+ CONFIRMATION lifecycle)
 *   POST /webhooks/lgthinq         — LG ThinQ PCC fault/maintenance callbacks
 *   GET  /oauth/callback/honeywell  — Honeywell Home OAuth 2.0 callback (initial setup)
 *   GET  /oauth/callback/ge         — GE SmartHQ OAuth 2.0 callback (initial setup)
 *   POST /admin/smartthings/confirm — Admin-only: fires SmartThings confirmation GET
 *                                     from SMARTTHINGS_CONFIRMATION_URL env var
 *                                     (requires X-Admin-Token: $ADMIN_TOKEN header)
 *
 * Webhook authenticity:
 *   - Nest:     Validates the Google-Cloud-Token header against NEST_WEBHOOK_SECRET
 *   - Ecobee:   Validates X-Ecobee-Signature HMAC-SHA256 against ECOBEE_WEBHOOK_SECRET
 *   - Moen Flo: Validates X-Moen-Signature HMAC-SHA256 against MOEN_FLO_WEBHOOK_SECRET
 *   - LG ThinQ: Validates Authorization Bearer against LG_THINQ_PAT
 *
 * GET /health — returns gateway status and the service identity principal
 */

import "dotenv/config";
import crypto from "crypto";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { logger } from "./logger";
import { handleNestEvent, handleEcobeeEvent, handleMoenFloEvent, handleHoneywellHomeEvent, handleSmartThingsEvent, handleLGThinQEvent } from "./handlers";
import { recordSensorEvent, getGatewayPrincipal } from "./icp";
import { startEcobeePoller } from "./pollers/ecobee";
import { startHoneywellPoller, persistTokenState as persistHoneywellTokens } from "./pollers/honeywellHome";
import { startEnphasePoller } from "./pollers/enphase";
import { startTeslaPoller } from "./pollers/teslaGateway";
import { startGEPoller, persistTokenState as persistGETokens } from "./pollers/geSmartHQ";
import { startSolarEdgePoller } from "./pollers/solarEdge";
import * as ecobeeOAuth      from "./oauth/ecobee";
import * as honeywellOAuth   from "./oauth/honeywellHome";
import * as lgThinQOAuth     from "./oauth/lgThinQ";
import * as geSmartHQOAuth   from "./oauth/geSmartHQ";
import type {
  NestWebhookEvent,
  EcobeeWebhookEvent,
  MoenFloWebhookEvent,
  HoneywellDevice,
  SmartThingsWebhookBody,
  LGThinQPCCEvent,
} from "./types";

const app = express();
const port = Number(process.env.IOT_GATEWAY_PORT) || 3002;

// OAuth CSRF state store — maps state token → { platform, expiresAt }
const oauthStateStore = new Map<string, { platform: string; expiresAt: number }>();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

function storeOAuthState(state: string, platform: string): void {
  // Clean expired entries
  const now = Date.now();
  for (const [k, v] of oauthStateStore) {
    if (v.expiresAt < now) oauthStateStore.delete(k);
  }
  oauthStateStore.set(state, { platform, expiresAt: now + OAUTH_STATE_TTL_MS });
}

function consumeOAuthState(state: string, platform: string): boolean {
  const entry = oauthStateStore.get(state);
  if (!entry) return false;
  oauthStateStore.delete(state);
  return entry.platform === platform && entry.expiresAt > Date.now();
}

// Rate limiting for webhook endpoints
const moenFloLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

const ecobeeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // max 60 requests per minute per IP for Ecobee webhook
  standardHeaders: true,
  legacyHeaders: false,
});

const nestLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const smartThingsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // SmartThings hubs can send many device events in bursts
  standardHeaders: true,
  legacyHeaders: false,
});

const lgThinQLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS — only the configured frontend origin may call browser-initiated routes.
// Webhook routes are called server-to-server (no browser origin header) so they
// pass through regardless; the HMAC checks on those routes are the real auth gate.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // server-to-server or same-origin
    if (origin === FRONTEND_ORIGIN) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: false,
}));

// Store raw body for HMAC verification before JSON parsing
app.use(
  express.json({
    limit: "256kb",
    verify: (req: Request, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// ── Signature helpers ────────────────────────────────────────────────────────

function hmacSha256(secret: string, payload: Buffer): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function verifyHmac(
  req: Request,
  headerName: string,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  const sig = req.headers[headerName.toLowerCase()] as string | undefined;
  if (!sig) return false;
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw) return false;
  const expected = hmacSha256(secret, raw);
  // Header may be "sha256=<hex>" or just "<hex>"
  const receivedHash = sig.startsWith("sha256=") ? sig.slice(7) : sig;
  return timingSafeEqual(expected, receivedHash);
}

// SmartThings signs requests with base64-encoded HMAC-SHA256 (not hex).
function verifySmartThingsHmac(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const sig = req.headers["x-st-hmac-sha256"] as string | undefined;
  if (!sig) return false;
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("base64");
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

// ── Request ID + structured logging middleware ────────────────────────────────

type RequestWithId = Request & { reqId: string };

app.use((req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  res.setHeader("x-request-id", reqId);
  (req as RequestWithId).reqId = reqId;
  logger.info("gateway", `${req.method} ${req.path}`, { reqId });
  next();
});

// ── Payload validators ───────────────────────────────────────────────────────
// Runtime schema checks applied after HMAC verification. Return an error string
// on the first failed constraint, or null when the payload is acceptable.

function isStr(v: unknown, max: number): boolean {
  return typeof v === "string" && v.length > 0 && v.length <= max;
}
function isOptStr(v: unknown, max: number): boolean {
  return v == null || (typeof v === "string" && v.length <= max);
}
function isFiniteNum(v: unknown, min: number, max: number): boolean {
  return typeof v === "number" && isFinite(v) && v >= min && v <= max;
}
function isOptFiniteNum(v: unknown, min: number, max: number): boolean {
  return v == null || isFiniteNum(v, min, max);
}

function validateNestPayload(body: unknown): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (!isStr(b.eventId, 128)) return "eventId missing or too long";
  if (!isStr(b.timestamp, 64)) return "timestamp missing or too long";
  const ru = b.resourceUpdate as Record<string, unknown> | undefined;
  if (!ru || typeof ru !== "object") return "resourceUpdate missing";
  if (!isStr(ru.name, 256)) return "resourceUpdate.name missing or too long";
  const traits = ru.traits as Record<string, unknown> | undefined;
  if (traits) {
    const t = traits["sdm.devices.traits.Temperature"] as Record<string, unknown> | undefined;
    if (t && !isOptFiniteNum(t.ambientTemperatureCelsius, -100, 100))
      return "ambientTemperatureCelsius out of range";
    const h = traits["sdm.devices.traits.Humidity"] as Record<string, unknown> | undefined;
    if (h && !isOptFiniteNum(h.ambientHumidityPercent, 0, 100))
      return "ambientHumidityPercent out of range";
  }
  return null;
}

function validateEcobeePayload(body: unknown): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (!isStr(b.thermostatId, 64)) return "thermostatId missing or too long";
  const alerts = b.alerts as unknown[] | undefined;
  if (alerts != null) {
    if (!Array.isArray(alerts) || alerts.length > 100) return "alerts must be an array of at most 100 entries";
    for (const a of alerts) {
      if (!a || typeof a !== "object") return "each alert must be an object";
      const al = a as Record<string, unknown>;
      if (!isOptStr(al.message, 500)) return "alert.message too long";
      if (!isOptFiniteNum(al.value, -200, 200)) return "alert.value out of range";
    }
  }
  const rt = b.runtime as Record<string, unknown> | undefined;
  if (rt) {
    if (!isOptFiniteNum(rt.actualTemperature, -2000, 2000)) return "runtime.actualTemperature out of range";
    if (!isOptFiniteNum(rt.actualHumidity, 0, 100)) return "runtime.actualHumidity out of range";
  }
  return null;
}

function validateMoenFloPayload(body: unknown): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (!isStr(b.deviceId, 128)) return "deviceId missing or too long";
  if (!isStr(b.alertType, 64)) return "alertType missing or too long";
  if (!isStr(b.timestamp, 64)) return "timestamp missing or too long";
  const sev = b.severity;
  if (sev !== "critical" && sev !== "warning" && sev !== "info") return "severity must be critical|warning|info";
  if (!isOptFiniteNum(b.flowRateLpm, 0, 10_000)) return "flowRateLpm out of range";
  if (!isOptFiniteNum(b.pressurePsi, 0, 1_000)) return "pressurePsi out of range";
  if (!isOptStr(b.message, 500)) return "message too long";
  return null;
}

function validateSmartThingsEvent(e: unknown): string | null {
  if (!e || typeof e !== "object") return "event must be an object";
  const ev = e as Record<string, unknown>;
  if (!isStr(ev.deviceId, 128)) return "deviceEvent.deviceId missing or too long";
  if (!isStr(ev.capability, 128)) return "deviceEvent.capability missing or too long";
  if (!isStr(ev.attribute, 128)) return "deviceEvent.attribute missing or too long";
  if (typeof ev.value === "string" && ev.value.length > 256) return "deviceEvent.value string too long";
  if (typeof ev.value === "number" && !isFinite(ev.value)) return "deviceEvent.value is non-finite";
  return null;
}

function validateLGThinQPayload(body: unknown): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (!isStr(b.deviceId, 128)) return "deviceId missing or too long";
  if (!isStr(b.type, 64)) return "type missing or too long";
  if (!isStr(b.code, 64)) return "code missing or too long";
  if (!isOptStr(b.severity, 16)) return "severity too long";
  if (!isOptStr(b.message, 500)) return "message too long";
  return null;
}

// ── POST /webhooks/nest ───────────────────────────────────────────────────────
// Google SDM API sends Pub/Sub push messages here.
// Validates the Google-Cloud-Token bearer token.
app.post("/webhooks/nest", nestLimiter, async (req: Request, res: Response): Promise<void> => {
  const token = (req.headers["google-cloud-token"] ??
    req.headers["authorization"]?.replace("Bearer ", "")) as string | undefined;
  const expected = process.env.NEST_WEBHOOK_SECRET;

  const reqId = (req as RequestWithId).reqId;
  if (!expected || token !== expected) {
    logger.warn("nest", "rejected — invalid token", { reqId });
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const nestErr = validateNestPayload(req.body);
  if (nestErr) {
    logger.warn("nest", `rejected — invalid payload: ${nestErr}`, { reqId });
    res.status(400).json({ error: nestErr });
    return;
  }
  const body = req.body as NestWebhookEvent;
  const raw = JSON.stringify(body);

  const reading = handleNestEvent(body, raw);
  if (!reading) {
    res.json({ status: "ignored", reason: "no actionable reading" });
    return;
  }

  const eventName = Object.keys(reading.eventType)[0];
  logger.info("nest", `event: ${eventName}`, { reqId, device: reading.externalDeviceId });
  const result = await recordSensorEvent(reading);

  if (result.success) {
    logger.info("nest", "recorded", { reqId, eventId: result.eventId, jobId: result.jobId });
    res.json({ status: "recorded", eventId: result.eventId, jobId: result.jobId });
  } else {
    logger.error("nest", "canister error", { reqId, error: result.error });
    res.status(500).json({ status: "error", error: result.error });
  }
});

// ── POST /webhooks/ecobee ─────────────────────────────────────────────────────
// Ecobee sends alert notifications here.
// Validates X-Ecobee-Signature HMAC-SHA256.
app.post("/webhooks/ecobee", ecobeeLimiter, async (req: Request, res: Response): Promise<void> => {
  const reqId = (req as RequestWithId).reqId;
  if (!verifyHmac(req, "x-ecobee-signature", process.env.ECOBEE_WEBHOOK_SECRET)) {
    logger.warn("ecobee", "rejected — invalid signature", { reqId });
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const ecobeeErr = validateEcobeePayload(req.body);
  if (ecobeeErr) {
    logger.warn("ecobee", `rejected — invalid payload: ${ecobeeErr}`, { reqId });
    res.status(400).json({ error: ecobeeErr });
    return;
  }
  const body = req.body as EcobeeWebhookEvent;
  const raw = JSON.stringify(body);

  const reading = handleEcobeeEvent(body, raw);
  if (!reading) {
    res.json({ status: "ignored", reason: "no actionable reading" });
    return;
  }

  const eventName = Object.keys(reading.eventType)[0];
  logger.info("ecobee", `event: ${eventName}`, { reqId, device: reading.externalDeviceId });
  const result = await recordSensorEvent(reading);

  if (result.success) {
    logger.info("ecobee", "recorded", { reqId, eventId: result.eventId, jobId: result.jobId });
    res.json({ status: "recorded", eventId: result.eventId, jobId: result.jobId });
  } else {
    logger.error("ecobee", "canister error", { reqId, error: result.error });
    res.status(500).json({ status: "error", error: result.error });
  }
});

// ── POST /webhooks/moen-flo ───────────────────────────────────────────────────
// Moen Flo cloud sends leak/flow alerts here.
// Validates X-Moen-Signature HMAC-SHA256.
app.post("/webhooks/moen-flo", moenFloLimiter, async (req: Request, res: Response): Promise<void> => {
  const reqId = (req as RequestWithId).reqId;
  if (!verifyHmac(req, "x-moen-signature", process.env.MOEN_FLO_WEBHOOK_SECRET)) {
    logger.warn("moen-flo", "rejected — invalid signature", { reqId });
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const moenErr = validateMoenFloPayload(req.body);
  if (moenErr) {
    logger.warn("moen-flo", `rejected — invalid payload: ${moenErr}`, { reqId });
    res.status(400).json({ error: moenErr });
    return;
  }
  const body = req.body as MoenFloWebhookEvent;
  const raw = JSON.stringify(body);

  const reading = handleMoenFloEvent(body, raw);
  if (!reading) {
    res.json({ status: "ignored", reason: "no actionable reading" });
    return;
  }

  const eventName = Object.keys(reading.eventType)[0];
  logger.info("moen-flo", `event: ${eventName}`, { reqId, device: reading.externalDeviceId });
  const result = await recordSensorEvent(reading);

  if (result.success) {
    logger.info("moen-flo", "recorded", { reqId, eventId: result.eventId, jobId: result.jobId });
    res.json({ status: "recorded", eventId: result.eventId, jobId: result.jobId });
  } else {
    logger.error("moen-flo", "canister error", { reqId, error: result.error });
    res.status(500).json({ status: "error", error: result.error });
  }
});

// ── POST /admin/smartthings/confirm ───────────────────────────────────────────
// Admin-only endpoint: fires the SmartThings confirmation GET request.
// The URL is read entirely from SMARTTHINGS_CONFIRMATION_URL env var — no
// user-provided data ever flows into a server-side fetch call.
app.post("/admin/smartthings/confirm", async (req: Request, res: Response): Promise<void> => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || req.headers["x-admin-token"] !== adminToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const confirmationUrl = process.env.SMARTTHINGS_CONFIRMATION_URL;
  if (!confirmationUrl) {
    res.status(503).json({ error: "SMARTTHINGS_CONFIRMATION_URL not set" });
    return;
  }
  try {
    await fetch(confirmationUrl);
    logger.info("smartthings", "webhook confirmed", { confirmationUrl });
    res.json({ ok: true });
  } catch (err) {
    logger.error("smartthings", "confirmation fetch failed", { error: String(err) });
    res.status(502).json({ error: "confirmation fetch failed" });
  }
});

// ── POST /webhooks/smartthings ────────────────────────────────────────────────
// Handles SmartThings Webhook SmartApp lifecycle events.
// CONFIRMATION and PING are handled without signature verification; all other
// lifecycles require X-ST-HMAC-SHA256 to match SMARTTHINGS_WEBHOOK_SECRET.
app.post("/webhooks/smartthings", smartThingsLimiter, async (req: Request, res: Response): Promise<void> => {
  const reqId = (req as RequestWithId).reqId;
  const body = req.body as SmartThingsWebhookBody;

  // CONFIRMATION — SmartThings verifies endpoint ownership on first registration.
  // Acknowledge receipt; the actual confirmation GET is fired by the admin via
  // POST /admin/smartthings/confirm using SMARTTHINGS_CONFIRMATION_URL env var.
  if (body.lifecycle === "CONFIRMATION") {
    logger.info("smartthings", "CONFIRMATION received — run POST /admin/smartthings/confirm to complete", { reqId });
    res.json({});
    return;
  }

  // PING — periodic liveness check from SmartThings.
  if (body.lifecycle === "PING") {
    res.json({});
    return;
  }

  // All other lifecycles must have a valid signature.
  if (!verifySmartThingsHmac(req, process.env.SMARTTHINGS_WEBHOOK_SECRET)) {
    logger.warn("smartthings", "rejected — invalid signature", { reqId });
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // INSTALL / UPDATE / UNINSTALL — acknowledge without processing device events.
  if (body.lifecycle !== "EVENT") {
    res.json({});
    return;
  }

  // EVENT — process each capability state-change event.
  const events = body.eventData?.events ?? [];
  let processed = 0;

  for (const e of events) {
    if (!e.deviceEvent) continue;
    const stErr = validateSmartThingsEvent(e.deviceEvent);
    if (stErr) {
      logger.warn("smartthings", `skipped event — invalid payload: ${stErr}`, { reqId });
      continue;
    }
    const raw     = JSON.stringify(e.deviceEvent);
    const reading = handleSmartThingsEvent(e.deviceEvent, raw);
    if (!reading) continue;

    const eventName = Object.keys(reading.eventType)[0];
    logger.info("smartthings", `event: ${eventName}`, { reqId, device: reading.externalDeviceId });

    const result = await recordSensorEvent(reading);
    if (result.success) {
      logger.info("smartthings", "recorded", { reqId, eventId: result.eventId, jobId: result.jobId });
      processed++;
    } else {
      logger.error("smartthings", "canister error", { reqId, error: result.error });
    }
  }

  res.json({ status: "processed", count: processed });
});

// ── GET /oauth/start/honeywell ────────────────────────────────────────────────
// Initiates the Honeywell OAuth flow with a CSRF state parameter.
// Requires x-admin-token header.
app.get("/oauth/start/honeywell", (req: Request, res: Response): void => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || req.headers["x-admin-token"] !== adminToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clientId = process.env.HONEYWELL_CLIENT_ID;
  if (!clientId) { res.status(500).send("HONEYWELL_CLIENT_ID not set"); return; }
  const state = generateOAuthState();
  storeOAuthState(state, "honeywell");
  const redirectUri = `http://localhost:${port}/oauth/callback/honeywell`;
  const url = honeywellOAuth.authUrl(clientId, redirectUri);
  const sep = url.includes("?") ? "&" : "?";
  res.redirect(`${url}${sep}state=${encodeURIComponent(state)}`);
});

// ── GET /oauth/start/ge ───────────────────────────────────────────────────────
// Initiates the GE SmartHQ OAuth flow with a CSRF state parameter.
// Requires x-admin-token header.
app.get("/oauth/start/ge", (req: Request, res: Response): void => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || req.headers["x-admin-token"] !== adminToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clientId = process.env.GE_CLIENT_ID;
  if (!clientId) { res.status(500).send("GE_CLIENT_ID not set"); return; }
  const state = generateOAuthState();
  storeOAuthState(state, "ge");
  const redirectUri = `http://localhost:${port}/oauth/callback/ge`;
  const url = geSmartHQOAuth.authUrl(clientId, redirectUri);
  const sep = url.includes("?") ? "&" : "?";
  res.redirect(`${url}${sep}state=${encodeURIComponent(state)}`);
});

// ── GET /oauth/callback/honeywell ─────────────────────────────────────────────
// One-time setup endpoint: exchanges the OAuth authorization code for tokens
// and persists them so the polling loop can start on the next gateway restart.
app.get("/oauth/callback/honeywell", async (req: Request, res: Response): Promise<void> => {
  const reqId = (req as RequestWithId).reqId;
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send("Missing code parameter");
    return;
  }

  const state = req.query.state as string | undefined;
  if (!state || !consumeOAuthState(state, "honeywell")) {
    logger.warn("honeywell", "OAuth callback rejected — invalid or missing state (CSRF protection)", { reqId });
    res.status(400).send("Invalid or expired OAuth state. Please restart the authorization flow via /oauth/start/honeywell");
    return;
  }

  const clientId     = process.env.HONEYWELL_CLIENT_ID;
  const clientSecret = process.env.HONEYWELL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).send("HONEYWELL_CLIENT_ID and HONEYWELL_CLIENT_SECRET must be set in .env");
    return;
  }

  const redirectUri = `http://localhost:${port}/oauth/callback/honeywell`;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type:   "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  try {
    const tokenResp = await fetch("https://api.honeywell.com/oauth2/token", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
      body: body.toString(),
    });

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      res.status(502).send(`Honeywell token exchange failed (${tokenResp.status}): ${text}`);
      return;
    }

    const data = await tokenResp.json() as {
      access_token:  string;
      refresh_token: string;
      expires_in:    number;
    };

    persistHoneywellTokens({
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:    Date.now() + data.expires_in * 1000,
    });

    logger.info("honeywell", "OAuth callback — tokens saved; restart gateway to begin polling", { reqId });
    res.send(
      "<h2>Honeywell Home connected!</h2>" +
      "<p>Tokens saved. Restart the IoT gateway to begin polling.</p>"
    );
  } catch (err) {
    logger.error("honeywell", "OAuth callback error", { reqId, error: String(err) });
    res.status(500).send("Internal error during token exchange");
  }
});

// ── POST /webhooks/lgthinq ────────────────────────────────────────────────────
// LG ThinQ PCC (Proactive Customer Care) fault and maintenance callbacks.
// Validates the Authorization Bearer header against LG_THINQ_PAT.
app.post("/webhooks/lgthinq", lgThinQLimiter, async (req: Request, res: Response): Promise<void> => {
  const reqId = (req as RequestWithId).reqId;
  const bearerToken = (req.headers["authorization"] ?? "").replace(/^Bearer\s+/i, "");
  const expectedPat = process.env.LG_THINQ_PAT;

  if (!expectedPat || bearerToken !== expectedPat) {
    logger.warn("lgthinq", "rejected — invalid PAT", { reqId });
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const lgErr = validateLGThinQPayload(req.body);
  if (lgErr) {
    logger.warn("lgthinq", `rejected — invalid payload: ${lgErr}`, { reqId });
    res.status(400).json({ error: lgErr });
    return;
  }
  const body = req.body as LGThinQPCCEvent;
  const raw  = JSON.stringify(body);

  const reading = handleLGThinQEvent(body, raw);
  if (!reading) {
    res.json({ status: "ignored", reason: "no actionable reading" });
    return;
  }

  const eventName = Object.keys(reading.eventType)[0];
  logger.info("lgthinq", `event: ${eventName}`, { reqId, device: reading.externalDeviceId });
  const result = await recordSensorEvent(reading);

  if (result.success) {
    logger.info("lgthinq", "recorded", { reqId, eventId: result.eventId, jobId: result.jobId });
    res.json({ status: "recorded", eventId: result.eventId, jobId: result.jobId });
  } else {
    logger.error("lgthinq", "canister error", { reqId, error: result.error });
    res.status(500).json({ status: "error", error: result.error });
  }
});

// ── GET /oauth/callback/ge ────────────────────────────────────────────────────
// One-time setup: exchanges the GE SmartHQ OAuth authorization code for tokens.
app.get("/oauth/callback/ge", async (req: Request, res: Response): Promise<void> => {
  const reqId = (req as RequestWithId).reqId;
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send("Missing code parameter");
    return;
  }

  const state = req.query.state as string | undefined;
  if (!state || !consumeOAuthState(state, "ge")) {
    logger.warn("ge", "OAuth callback rejected — invalid or missing state (CSRF protection)", { reqId });
    res.status(400).send("Invalid or expired OAuth state. Please restart the authorization flow via /oauth/start/ge");
    return;
  }

  const clientId     = process.env.GE_CLIENT_ID;
  const clientSecret = process.env.GE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).send("GE_CLIENT_ID and GE_CLIENT_SECRET must be set in .env");
    return;
  }

  const redirectUri  = `http://localhost:${port}/oauth/callback/ge`;
  const credentials  = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type:   "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  try {
    const tokenResp = await fetch("https://api.whrcloud.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
      body: body.toString(),
    });

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      res.status(502).send(`GE SmartHQ token exchange failed (${tokenResp.status}): ${text}`);
      return;
    }

    const data = await tokenResp.json() as {
      access_token:  string;
      refresh_token: string;
      expires_in:    number;
    };

    persistGETokens({
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:    Date.now() + data.expires_in * 1000,
    });

    logger.info("ge", "OAuth callback — tokens saved; restart gateway to begin polling", { reqId });
    res.send(
      "<h2>GE SmartHQ connected!</h2>" +
      "<p>Tokens saved. Restart the IoT gateway to begin polling.</p>"
    );
  } catch (err) {
    logger.error("ge", "OAuth callback error", { reqId, error: String(err) });
    res.status(500).send("Internal error during token exchange");
  }
});

// ── GET /oauth/device/start/:platform ────────────────────────────────────────
// Tier B device picker: redirect to platform's authorization URL.
// The `redirect_uri` points back to /oauth/device/callback/:platform.
app.get("/oauth/device/start/:platform", (req: Request, res: Response): void => {
  const { platform } = req.params;
  const redirectUri  = `http://localhost:${port}/oauth/device/callback/${platform}`;
  const state = generateOAuthState();
  storeOAuthState(state, platform);

  try {
    let url: string;
    switch (platform) {
      case "ecobee":
        url = ecobeeOAuth.authUrl(process.env.ECOBEE_CLIENT_ID ?? "", redirectUri);
        break;
      case "honeywell":
        url = honeywellOAuth.authUrl(process.env.HONEYWELL_CLIENT_ID ?? "", redirectUri);
        break;
      case "lgthinq":
        url = lgThinQOAuth.authUrl(process.env.LG_THINQ_CLIENT_ID ?? "", redirectUri);
        break;
      case "ge":
        url = geSmartHQOAuth.authUrl(process.env.GE_CLIENT_ID ?? "", redirectUri);
        break;
      default:
        res.status(400).send("Unknown platform");
        return;
    }
    // Append state to authorization URL for CSRF protection
    const sep = url.includes("?") ? "&" : "?";
    res.redirect(`${url}${sep}state=${encodeURIComponent(state)}`);
  } catch (err) {
    logger.error("oauth-device", `start error (${platform})`, { error: String(err) });
    res.status(500).send("OAuth start error");
  }
});

// ── GET /oauth/device/callback/:platform ──────────────────────────────────────
// Tier B device picker: exchanges the auth code, fetches device list, sends
// postMessage to the opener popup, then closes itself.
app.get("/oauth/device/callback/:platform", async (req: Request, res: Response): Promise<void> => {
  const { platform } = req.params;
  const code         = req.query.code  as string | undefined;
  const state        = req.query.state as string | undefined;

  if (!code) {
    res.status(400).send("Missing code parameter");
    return;
  }

  if (!state || !consumeOAuthState(state, platform)) {
    const errMsg      = JSON.stringify({ type: "oauth-devices", error: "Invalid or expired OAuth state — CSRF protection rejected this callback" });
    const targetOrigin = JSON.stringify(FRONTEND_ORIGIN);
    res.send(`<!doctype html><html><body><script>
      window.opener && window.opener.postMessage(${errMsg}, ${targetOrigin});
      window.close();
    </script><p>Authorization failed: invalid state.</p></body></html>`);
    return;
  }

  const redirectUri = `http://localhost:${port}/oauth/device/callback/${platform}`;

  try {
    let accessToken: string;
    let devices: Array<{ id: string; name: string; type: string }>;

    switch (platform) {
      case "ecobee":
        accessToken = await ecobeeOAuth.exchangeCode(code, process.env.ECOBEE_CLIENT_ID ?? "", redirectUri);
        devices     = await ecobeeOAuth.fetchDevices(accessToken);
        break;
      case "honeywell":
        accessToken = await honeywellOAuth.exchangeCode(
          code, process.env.HONEYWELL_CLIENT_ID ?? "",
          process.env.HONEYWELL_CLIENT_SECRET ?? "", redirectUri
        );
        devices = await honeywellOAuth.fetchDevices(accessToken, process.env.HONEYWELL_CLIENT_ID ?? "");
        break;
      case "lgthinq":
        accessToken = await lgThinQOAuth.exchangeCode(
          code, process.env.LG_THINQ_CLIENT_ID ?? "",
          process.env.LG_THINQ_CLIENT_SECRET ?? "", redirectUri
        );
        devices = await lgThinQOAuth.fetchDevices(accessToken);
        break;
      case "ge":
        accessToken = await geSmartHQOAuth.exchangeCode(
          code, process.env.GE_CLIENT_ID ?? "",
          process.env.GE_CLIENT_SECRET ?? "", redirectUri
        );
        devices = await geSmartHQOAuth.fetchDevices(accessToken);
        break;
      default:
        res.status(400).send("Unknown platform");
        return;
    }

    const payload     = JSON.stringify({ type: "oauth-devices", devices });
    // Use a specific target origin so only the configured frontend can receive
    // the device list — prevents interception by other pages in the opener.
    const targetOrigin = JSON.stringify(FRONTEND_ORIGIN);
    res.send(`<!doctype html>
<html><body>
<script>
  window.opener && window.opener.postMessage(${payload}, ${targetOrigin});
  window.close();
</script>
<p>Connected! This window will close automatically.</p>
</body></html>`);
  } catch (err: any) {
    const errMsg      = JSON.stringify({ type: "oauth-devices", error: String((err as any)?.message ?? err) });
    const targetOrigin = JSON.stringify(FRONTEND_ORIGIN);
    res.send(`<!doctype html>
<html><body>
<script>
  window.opener && window.opener.postMessage(${errMsg}, ${targetOrigin});
  window.close();
</script>
<p>Authorization failed. This window will close automatically.</p>
</body></html>`);
  }
});

// ── POST /accounts/:platform ──────────────────────────────────────────────────
// Tier D credential validation: accepts email + password for credential-based
// platforms (Rheem EcoNet, Sense, Emporia Vue), stores credentials in the
// gateway process env, and returns the user's device list.
// Credentials are NEVER forwarded to the ICP canister.
app.post("/accounts/:platform", async (req: Request, res: Response): Promise<void> => {
  const reqId = (req as RequestWithId).reqId;

  // Require admin token — this endpoint handles raw credentials
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    logger.warn("accounts", "rejected — ADMIN_TOKEN not set, endpoint is disabled", { reqId });
    res.status(503).json({ error: "Service unavailable — ADMIN_TOKEN not configured" });
    return;
  }
  if (req.headers["x-admin-token"] !== adminToken) {
    logger.warn("accounts", "rejected — missing or invalid admin token", { reqId });
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { platform } = req.params;
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  try {
    let devices: Array<{ id: string; name: string; type: string }> = [];

    if (platform === "rheem") {
      const loginResp = await fetch("https://rheem.clearblade.com/api/v/4/user/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "ClearBlade-SystemKey": process.env.RHEEM_SYSTEM_KEY ?? "" },
        body:    JSON.stringify({ email, password }),
        signal:  AbortSignal.timeout(10_000),
      });
      if (!loginResp.ok) throw new Error(`Rheem EcoNet login failed (${loginResp.status})`);
      const loginData = await loginResp.json() as { user_token: string };
      process.env.RHEEM_ACCESS_TOKEN = loginData.user_token;

      const devResp = await fetch("https://rheem.clearblade.com/api/v/4/data/devices_data", {
        headers: { "ClearBlade-UserToken": loginData.user_token, "ClearBlade-SystemKey": process.env.RHEEM_SYSTEM_KEY ?? "" },
        signal:  AbortSignal.timeout(10_000),
      });
      if (devResp.ok) {
        const devData = await devResp.json() as { DATA: Array<{ serial_number: string; location_name?: string; product_type?: string }> };
        devices = (devData.DATA ?? []).map((d) => ({ id: d.serial_number, name: d.location_name ?? d.serial_number, type: d.product_type ?? "Water Heater" }));
      }

    } else if (platform === "sense") {
      const loginResp = await fetch("https://api.sense.com/apiservice/api/v1/authenticate", {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    new URLSearchParams({ email, password }).toString(),
        signal:  AbortSignal.timeout(10_000),
      });
      if (!loginResp.ok) throw new Error(`Sense login failed (${loginResp.status})`);
      const loginData = await loginResp.json() as { access_token: string; monitors?: Array<{ id: number; serial_number: string }> };
      process.env.SENSE_ACCESS_TOKEN = loginData.access_token;
      devices = (loginData.monitors ?? []).map((m) => ({ id: String(m.id), name: `Sense Monitor ${m.serial_number}`, type: "Energy Monitor" }));

    } else if (platform === "emporia") {
      const loginResp = await fetch("https://auth.emporiaenergy.com/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userName: email, password, rememberMe: false }),
        signal:  AbortSignal.timeout(10_000),
      });
      if (!loginResp.ok) throw new Error(`Emporia Vue login failed (${loginResp.status})`);
      const loginData = await loginResp.json() as { authToken: string; customerGid?: number };
      process.env.EMPORIA_ACCESS_TOKEN = loginData.authToken;
      if (loginData.customerGid) {
        const devResp = await fetch(`https://api.emporiaenergy.com/customers/${loginData.customerGid}/devices?detailed=true&hierarchy=true`, {
          headers: { authToken: loginData.authToken },
          signal:  AbortSignal.timeout(10_000),
        });
        if (devResp.ok) {
          const devData = await devResp.json() as { devices: Array<{ deviceGid: number; locationProperties?: { deviceName?: string } }> };
          devices = (devData.devices ?? []).map((d) => ({ id: String(d.deviceGid), name: d.locationProperties?.deviceName ?? `Emporia Vue ${d.deviceGid}`, type: "Energy Monitor" }));
        }
      }
    } else {
      res.status(400).json({ error: "Unknown platform" });
      return;
    }

    res.json({ devices });
  } catch (err: any) {
    logger.error("accounts", `${platform} error`, { reqId, error: err?.message ?? String(err) });
    res.status(502).json({ error: err?.message ?? "Login failed" });
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    gatewayPrincipal: getGatewayPrincipal(),
    sensorCanisterId: process.env.SENSOR_CANISTER_ID ?? "(not set)",
    platforms: ["nest", "ecobee", "moen-flo", "smartthings", "honeywell-home", "enphase", "tesla-powerwall", "lgthinq", "ge-smarthq", "solaredge"],
    pollers: {
      ecobee:    !!process.env.ECOBEE_CLIENT_ID,
      honeywell: !!process.env.HONEYWELL_CLIENT_ID,
      enphase:   !!process.env.ENPHASE_ENVOY_IP,
      tesla:     !!(process.env.TESLA_EMAIL && process.env.TESLA_POWERWALL_SERIAL),
      ge:        !!process.env.GE_CLIENT_ID,
      solaredge: !!process.env.SOLAREDGE_API_KEY,
    },
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  if (!process.env.ADMIN_TOKEN) {
    logger.warn("gateway", "ADMIN_TOKEN not set — POST /accounts/:platform is disabled");
  }

  logger.info("gateway", `listening on :${port}`, {
    gatewayPrincipal: getGatewayPrincipal(),
    sensorCanisterId: process.env.SENSOR_CANISTER_ID ?? "(set SENSOR_CANISTER_ID)",
  });

  // Start polling integrations — each is a no-op when env vars are absent.
  if (process.env.ECOBEE_CLIENT_ID) {
    startEcobeePoller();
  }
  if (process.env.HONEYWELL_CLIENT_ID) {
    startHoneywellPoller();
  }
  if (process.env.ENPHASE_ENVOY_IP) {
    startEnphasePoller();
  }
  if (process.env.TESLA_EMAIL && process.env.TESLA_POWERWALL_SERIAL) {
    startTeslaPoller();
  }
  if (process.env.GE_CLIENT_ID) {
    startGEPoller();
  }
  if (process.env.SOLAREDGE_API_KEY) {
    startSolarEdgePoller();
  }
});
