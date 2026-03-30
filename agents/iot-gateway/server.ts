/**
 * HomeFax IoT Gateway
 *
 * Node.js/Express bridge that receives webhooks from smart-home platforms and
 * forwards normalized sensor readings to the HomeFax Sensor canister on ICP.
 *
 * Supported platforms:
 *   POST /webhooks/nest      — Google Nest (SDM API Pub/Sub push)
 *   POST /webhooks/ecobee    — Ecobee thermostat alerts
 *   POST /webhooks/moen-flo  — Moen Flo water-leak detection
 *
 * Webhook authenticity:
 *   - Nest:     Validates the Google-Cloud-Token header against NEST_WEBHOOK_SECRET
 *   - Ecobee:   Validates X-Ecobee-Signature HMAC-SHA256 against ECOBEE_WEBHOOK_SECRET
 *   - Moen Flo: Validates X-Moen-Signature HMAC-SHA256 against MOEN_FLO_WEBHOOK_SECRET
 *
 * GET /health — returns gateway status and the service identity principal
 */

import "dotenv/config";
import crypto from "crypto";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { handleNestEvent, handleEcobeeEvent, handleMoenFloEvent } from "./handlers";
import { recordSensorEvent, getGatewayPrincipal } from "./icp";
import type {
  NestWebhookEvent,
  EcobeeWebhookEvent,
  MoenFloWebhookEvent,
} from "./types";

const app = express();
const port = Number(process.env.IOT_GATEWAY_PORT) || 3002;

const ecobeeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // max 60 requests per minute per IP for Ecobee webhook
  standardHeaders: true,
  legacyHeaders: false,
});

// Store raw body for HMAC verification before JSON parsing
app.use(
  express.json({
    limit: "256kb",
    verify: (req: Request, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
app.use(cors());

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
  if (!secret) return true; // secret not configured — skip in dev
  const sig = req.headers[headerName.toLowerCase()] as string | undefined;
  if (!sig) return false;
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw) return false;
  const expected = hmacSha256(secret, raw);
  // Header may be "sha256=<hex>" or just "<hex>"
  const receivedHash = sig.startsWith("sha256=") ? sig.slice(7) : sig;
  return timingSafeEqual(expected, receivedHash);
}

// ── Logging middleware ────────────────────────────────────────────────────────

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── POST /webhooks/nest ───────────────────────────────────────────────────────
// Google SDM API sends Pub/Sub push messages here.
// Validates the Google-Cloud-Token bearer token.
app.post("/webhooks/nest", async (req: Request, res: Response): Promise<void> => {
  const token = (req.headers["google-cloud-token"] ??
    req.headers["authorization"]?.replace("Bearer ", "")) as string | undefined;
  const expected = process.env.NEST_WEBHOOK_SECRET;

  if (expected && token !== expected) {
    console.warn("[nest] rejected — invalid token");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as NestWebhookEvent;
  const raw = JSON.stringify(body);

  const reading = handleNestEvent(body, raw);
  if (!reading) {
    res.json({ status: "ignored", reason: "no actionable reading" });
    return;
  }

  console.log(`[nest] event: ${Object.keys(reading.eventType)[0]} device=${reading.externalDeviceId}`);
  const result = await recordSensorEvent(reading);

  if (result.success) {
    console.log(`[nest] recorded eventId=${result.eventId}${result.jobId ? ` jobId=${result.jobId}` : ""}`);
    res.json({ status: "recorded", eventId: result.eventId, jobId: result.jobId });
  } else {
    console.error(`[nest] canister error: ${result.error}`);
    res.status(500).json({ status: "error", error: result.error });
  }
});

// ── POST /webhooks/ecobee ─────────────────────────────────────────────────────
// Ecobee sends alert notifications here.
// Validates X-Ecobee-Signature HMAC-SHA256.
app.post("/webhooks/ecobee", ecobeeLimiter, async (req: Request, res: Response): Promise<void> => {
  if (!verifyHmac(req, "x-ecobee-signature", process.env.ECOBEE_WEBHOOK_SECRET)) {
    console.warn("[ecobee] rejected — invalid signature");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as EcobeeWebhookEvent;
  const raw = JSON.stringify(body);

  const reading = handleEcobeeEvent(body, raw);
  if (!reading) {
    res.json({ status: "ignored", reason: "no actionable reading" });
    return;
  }

  console.log(`[ecobee] event: ${Object.keys(reading.eventType)[0]} device=${reading.externalDeviceId}`);
  const result = await recordSensorEvent(reading);

  if (result.success) {
    console.log(`[ecobee] recorded eventId=${result.eventId}${result.jobId ? ` jobId=${result.jobId}` : ""}`);
    res.json({ status: "recorded", eventId: result.eventId, jobId: result.jobId });
  } else {
    console.error(`[ecobee] canister error: ${result.error}`);
    res.status(500).json({ status: "error", error: result.error });
  }
});

// ── POST /webhooks/moen-flo ───────────────────────────────────────────────────
// Moen Flo cloud sends leak/flow alerts here.
// Validates X-Moen-Signature HMAC-SHA256.
app.post("/webhooks/moen-flo", async (req: Request, res: Response): Promise<void> => {
  if (!verifyHmac(req, "x-moen-signature", process.env.MOEN_FLO_WEBHOOK_SECRET)) {
    console.warn("[moen-flo] rejected — invalid signature");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as MoenFloWebhookEvent;
  const raw = JSON.stringify(body);

  const reading = handleMoenFloEvent(body, raw);
  if (!reading) {
    res.json({ status: "ignored", reason: "no actionable reading" });
    return;
  }

  console.log(`[moen-flo] event: ${Object.keys(reading.eventType)[0]} device=${reading.externalDeviceId}`);
  const result = await recordSensorEvent(reading);

  if (result.success) {
    console.log(`[moen-flo] recorded eventId=${result.eventId}${result.jobId ? ` jobId=${result.jobId}` : ""}`);
    res.json({ status: "recorded", eventId: result.eventId, jobId: result.jobId });
  } else {
    console.error(`[moen-flo] canister error: ${result.error}`);
    res.status(500).json({ status: "error", error: result.error });
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    gatewayPrincipal: getGatewayPrincipal(),
    sensorCanisterId: process.env.SENSOR_CANISTER_ID ?? "(not set)",
    platforms: ["nest", "ecobee", "moen-flo"],
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`HomeFax IoT Gateway → http://localhost:${port}`);
  console.log(`Gateway principal: ${getGatewayPrincipal()}`);
  console.log(`Sensor canister:   ${process.env.SENSOR_CANISTER_ID ?? "(set SENSOR_CANISTER_ID)"}`);
});
