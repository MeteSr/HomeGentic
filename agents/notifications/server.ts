import "dotenv/config";
import express, { Request, Response } from "express";
import cors                           from "cors";
import rateLimit                      from "express-rate-limit";
import webpush                        from "web-push";
import { registerToken, removeToken } from "./store";
import { registerSubscription, removeSubscription } from "./vapidStore";
import { dispatchToUser }             from "./dispatcher";
import { startPoller }                from "./poller";
import { requestPrincipal }           from "./session";
import { clearPhone, publicPrefs, setPrefs, setVerifiedPhone } from "./prefs";
import { emailConfigured }            from "./email";
import { E164, allowCodeRequest, checkVerification, smsConfigured, startVerification } from "./sms";
import { relayIdentity }              from "./icp";
import type { Platform, PushPayload } from "./types";
import type { PushSubscription }      from "web-push";

// ── VAPID key initialisation ──────────────────────────────────────────────────
// Keys are generated once and stored as env vars. In dev, they're auto-generated
// if not set so the server starts cleanly without configuration.
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  ?? webpush.generateVAPIDKeys().publicKey;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? webpush.generateVAPIDKeys().privateKey;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     ?? "mailto:admin@homegentic.io";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ── App factory ───────────────────────────────────────────────────────────────
// Exported so tests can call buildApp() without side-effects (no listen, no poller).
export function buildApp() {
  const app = express();

  const allowedOrigin = process.env.FRONTEND_ORIGIN;
  if (!allowedOrigin && process.env.NODE_ENV === "production") {
    throw new Error("FRONTEND_ORIGIN must be set in production");
  }
  const origin = allowedOrigin ?? "http://localhost:3000";

  app.use(cors({ origin }));
  app.use(express.json());

  const apiLimiter = rateLimit({
    windowMs:       60_000,
    max:            60,
    standardHeaders: true,
    legacyHeaders:   false,
    message: { error: "Too many requests — please wait before retrying." },
  });
  app.use("/api/", apiLimiter);

  // ── Startup checks ──────────────────────────────────────────────────────────
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("INTERNAL_API_KEY must be set in production");
    }
    console.warn("[notifications] INTERNAL_API_KEY not set — /api/push/send will reject all requests");
  }
  if (process.env.NODE_ENV === "production") {
    // Registrations are authenticated with auth-canister session tokens, and
    // must survive a restart.
    for (const v of ["CANISTER_ID_AUTH", "NOTIFICATIONS_DATA_FILE"]) {
      if (!process.env[v]) throw new Error(`${v} must be set in production`);
    }
  }

  // ── POST /api/push/register ─────────────────────────────────────────────────
  // Registers a mobile device token for the caller identified by the
  // x-agent-session header (see session.ts). Body: { token, platform }.
  app.post("/api/push/register", async (req: Request, res: Response): Promise<void> => {
    const principal = await requestPrincipal(req);
    if (!principal) {
      res.status(401).json({ error: "session_required" });
      return;
    }

    const { token, platform } = req.body as {
      token?:     string;
      platform?:  Platform;
    };

    if (!token || !platform) {
      res.status(400).json({ error: "token and platform are required" });
      return;
    }

    if (platform !== "ios" && platform !== "android") {
      res.status(400).json({ error: "platform must be ios or android" });
      return;
    }

    registerToken(principal, token, platform);
    console.log(`[register] ${principal.slice(0, 12)}… / ${platform} / ${token.slice(0, 8)}…`);
    res.json({ ok: true });
  });

  // ── POST /api/push/unregister ───────────────────────────────────────────────
  app.post("/api/push/unregister", (req: Request, res: Response): void => {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: "token is required" });
      return;
    }
    removeToken(token);
    res.json({ ok: true });
  });

  // ── POST /api/push/send ─────────────────────────────────────────────────────
  app.post("/api/push/send", async (req: Request, res: Response): Promise<void> => {
    const internalKey = process.env.INTERNAL_API_KEY;
    // Always require the key — remove the && short-circuit that bypassed auth when key was unset
    if (!internalKey || req.headers["x-internal-key"] !== internalKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { principal, payload } = req.body as {
      principal?: string;
      payload?:   PushPayload;
    };

    if (!principal || !payload?.title || !payload?.body) {
      res.status(400).json({ error: "principal and payload (title, body) are required" });
      return;
    }

    try {
      await dispatchToUser(principal, payload);
      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  // ── GET/PUT /api/prefs ──────────────────────────────────────────────────────
  // The caller's notification preferences (see prefs.ts), identified by the
  // x-agent-session header. `channels` says which optional channels this relay
  // has configured, so the app can hide the rows for the rest.
  // PUT body: { prefs: { push?: {…}, email?: {…}, sms?: { enabled } } }.
  const channels = () => ({ email: emailConfigured(), sms: smsConfigured() });

  app.get("/api/prefs", async (req: Request, res: Response): Promise<void> => {
    const principal = await requestPrincipal(req);
    if (!principal) {
      res.status(401).json({ error: "session_required" });
      return;
    }
    res.json({ prefs: publicPrefs(principal), channels: channels() });
  });

  app.put("/api/prefs", async (req: Request, res: Response): Promise<void> => {
    const principal = await requestPrincipal(req);
    if (!principal) {
      res.status(401).json({ error: "session_required" });
      return;
    }
    const result = setPrefs(principal, (req.body as { prefs?: unknown })?.prefs);
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ prefs: publicPrefs(principal), channels: channels() });
  });

  // ── SMS phone confirmation ──────────────────────────────────────────────────
  // POST /api/sms/start   { phone }        — text a code to an E.164 number
  // POST /api/sms/confirm { phone, code }  — on a match, store it and turn SMS on
  // DELETE /api/sms                        — forget the number, turn SMS off
  app.post("/api/sms/start", async (req: Request, res: Response): Promise<void> => {
    const principal = await requestPrincipal(req);
    if (!principal) {
      res.status(401).json({ error: "session_required" });
      return;
    }
    if (!smsConfigured()) {
      res.status(503).json({ error: "sms_unavailable" });
      return;
    }
    const phone = String((req.body as { phone?: unknown })?.phone ?? "");
    if (!E164.test(phone)) {
      res.status(400).json({ error: "phone must be in international format, e.g. +15125550142" });
      return;
    }
    if (!allowCodeRequest(principal)) {
      res.status(429).json({ error: "too_many_codes" });
      return;
    }
    try {
      await startVerification(phone);
      res.json({ ok: true });
    } catch (err) {
      console.error("[sms] start failed:", err instanceof Error ? err.message : err);
      res.status(502).json({ error: "send_failed" });
    }
  });

  app.post("/api/sms/confirm", async (req: Request, res: Response): Promise<void> => {
    const principal = await requestPrincipal(req);
    if (!principal) {
      res.status(401).json({ error: "session_required" });
      return;
    }
    if (!smsConfigured()) {
      res.status(503).json({ error: "sms_unavailable" });
      return;
    }
    const { phone, code } = req.body as { phone?: unknown; code?: unknown };
    if (typeof phone !== "string" || !E164.test(phone) || typeof code !== "string" || !/^\d{4,10}$/.test(code)) {
      res.status(400).json({ error: "phone and code are required" });
      return;
    }
    try {
      if (!(await checkVerification(phone, code))) {
        res.status(400).json({ error: "wrong_code" });
        return;
      }
    } catch (err) {
      console.error("[sms] confirm failed:", err instanceof Error ? err.message : err);
      res.status(502).json({ error: "check_failed" });
      return;
    }
    setVerifiedPhone(principal, phone);
    res.json({ prefs: publicPrefs(principal), channels: channels() });
  });

  app.delete("/api/sms", async (req: Request, res: Response): Promise<void> => {
    const principal = await requestPrincipal(req);
    if (!principal) {
      res.status(401).json({ error: "session_required" });
      return;
    }
    clearPhone(principal);
    res.json({ prefs: publicPrefs(principal), channels: channels() });
  });

  // ── GET /api/push/vapid-public-key ──────────────────────────────────────────
  // Returns the VAPID public key for the frontend to use when subscribing.
  app.get("/api/push/vapid-public-key", (_req: Request, res: Response): void => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  // ── POST /api/push/vapid-subscribe ─────────────────────────────────────────
  // Registers a browser Web Push subscription for the caller identified by
  // the x-agent-session header (see session.ts).
  // Body: { subscription: PushSubscription }
  app.post("/api/push/vapid-subscribe", async (req: Request, res: Response): Promise<void> => {
    const principal = await requestPrincipal(req);
    if (!principal) {
      res.status(401).json({ error: "session_required" });
      return;
    }

    const { subscription } = req.body as {
      subscription?: PushSubscription;
    };
    if (!subscription?.endpoint) {
      res.status(400).json({ error: "subscription.endpoint is required" });
      return;
    }
    if (!subscription?.keys) {
      res.status(400).json({ error: "subscription.keys (p256dh, auth) are required" });
      return;
    }

    registerSubscription(principal, subscription);
    res.json({ ok: true });
  });

  // ── POST /api/push/vapid-unsubscribe ────────────────────────────────────────
  // Removes a browser Web Push subscription by endpoint URL.
  // Body: { endpoint: string }
  app.post("/api/push/vapid-unsubscribe", (req: Request, res: Response): void => {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) {
      res.status(400).json({ error: "endpoint is required" });
      return;
    }
    removeSubscription(endpoint);
    res.json({ ok: true });
  });

  // ── GET /health ─────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "homegentic-notifications" });
  });

  return app;
}

// ── Boot (skipped when imported by tests) ─────────────────────────────────────
if (require.main === module) {
  const port = Number(process.env.NOTIFICATIONS_PORT) || 3002;
  const app  = buildApp();
  app.listen(port, () => {
    console.log(`HomeGentic notification relay → http://localhost:${port}`);
    try {
      // Allowlist this on job and quote: addNotifier(principal), or
      // NOTIFIER_PRINCIPAL=<it> when running scripts/deploy.sh.
      console.log(`[notifications] relay principal: ${relayIdentity().getPrincipal().toText()}`);
      startPoller();
    } catch (err) {
      if (process.env.NODE_ENV === "production") throw err;
      console.warn(`[notifications] ${err instanceof Error ? err.message : err} — not polling canisters`);
    }
  });
}
