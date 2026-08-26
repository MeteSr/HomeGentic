import "dotenv/config";
import express, { Request, Response } from "express";
import cors                           from "cors";
import rateLimit                      from "express-rate-limit";
import webpush                        from "web-push";
import { registerToken, removeToken } from "./store";
import { registerSubscription, removeSubscription } from "./vapidStore";
import { dispatchToUser }             from "./dispatcher";
import { startPoller }                from "./poller";
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

  // ── Auth key startup check ──────────────────────────────────────────────────
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("INTERNAL_API_KEY must be set in production");
    }
    console.warn("[notifications] INTERNAL_API_KEY not set — /api/push/send will reject all requests in non-dev");
  }

  // ── POST /api/push/register ─────────────────────────────────────────────────
  app.post("/api/push/register", (req: Request, res: Response): void => {
    // Require internal API key — prevents unauthorized token registration
    const internalKey = process.env.INTERNAL_API_KEY;
    if (!internalKey || req.headers["x-internal-key"] !== internalKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { principal, token, platform } = req.body as {
      principal?: string;
      token?:     string;
      platform?:  Platform;
    };

    if (!principal || !token || !platform) {
      res.status(400).json({ error: "principal, token, and platform are required" });
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

  // ── GET /api/push/vapid-public-key ──────────────────────────────────────────
  // Returns the VAPID public key for the frontend to use when subscribing.
  app.get("/api/push/vapid-public-key", (_req: Request, res: Response): void => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  // ── POST /api/push/vapid-subscribe ─────────────────────────────────────────
  // Registers a browser Web Push subscription for a principal.
  // Body: { principal: string, subscription: PushSubscription }
  app.post("/api/push/vapid-subscribe", (req: Request, res: Response): void => {
    const { principal, subscription } = req.body as {
      principal?:   string;
      subscription?: PushSubscription;
    };

    if (!principal) {
      res.status(400).json({ error: "principal is required" });
      return;
    }
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
    startPoller();
  });
}
