import "dotenv/config";
import express, { Request, Response } from "express";
import cors                           from "cors";
import rateLimit                      from "express-rate-limit";
import webpush                        from "web-push";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getTokensForPrincipal, registerToken, removeToken } from "./store";
import { findSubscription, getSubscriptionsForPrincipal, registerSubscription, removeSubscription } from "./vapidStore";
import { dispatchToUser }             from "./dispatcher";
import { startPoller }                from "./poller";
import { requestPrincipal }           from "./session";
import { clearPhone, publicPrefs, setPrefs, setVerifiedPhone } from "./prefs";
import { emailConfigured }            from "./email";
import { E164, allowCodeRequest, allowCodeToPhone, checkVerification, smsConfigured, startVerification } from "./sms";
import { relayIdentity }              from "./icp";
import type { Platform, PushPayload } from "./types";
import type { PushSubscription }      from "web-push";

// ── VAPID key initialisation ──────────────────────────────────────────────────
// Keys are generated once and stored as env vars. Production refuses to start
// without both (buildApp's startup checks): ephemeral keys change on every
// restart and silently break every existing browser subscription. In dev a
// single matching pair is generated so the server starts without config.
const VAPID_CONFIGURED  = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
const devVapidPair      = VAPID_CONFIGURED ? null : webpush.generateVAPIDKeys();
const VAPID_PUBLIC_KEY  = VAPID_CONFIGURED ? (process.env.VAPID_PUBLIC_KEY as string)  : devVapidPair!.publicKey;
const VAPID_PRIVATE_KEY = VAPID_CONFIGURED ? (process.env.VAPID_PRIVATE_KEY as string) : devVapidPair!.privateKey;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     ?? "mailto:admin@homegentic.io";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Unsubscribe tokens: HMAC over the device token / endpoint, returned on
// registration so a client can drop its own registration later (e.g. after
// its session has ended) without anyone else being able to.
const UNSUB_SECRET = process.env.UNSUBSCRIBE_SECRET || process.env.INTERNAL_API_KEY || randomBytes(32).toString("hex");
export function unsubscribeTokenFor(kind: "device" | "web", id: string): string {
  return createHmac("sha256", UNSUB_SECRET).update(`unsub:${kind}:${id}`).digest("hex");
}
function validUnsubscribeToken(kind: "device" | "web", id: string, supplied: unknown): boolean {
  return typeof supplied === "string" && safeEqual(supplied, unsubscribeTokenFor(kind, id));
}

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
    for (const v of ["CANISTER_ID_AUTH", "NOTIFICATIONS_DATA_FILE", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]) {
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
    res.json({ ok: true, unsubscribeToken: unsubscribeTokenFor("device", token) });
  });

  // ── POST /api/push/unregister ───────────────────────────────────────────────
  // Body: { token, unsubscribeToken? }. Allowed for the session whose
  // principal owns the token, or with the unsubscribeToken returned by
  // /register. Knowing a device token alone is not enough.
  app.post("/api/push/unregister", async (req: Request, res: Response): Promise<void> => {
    const { token, unsubscribeToken } = req.body as { token?: unknown; unsubscribeToken?: unknown };
    if (typeof token !== "string" || !token) {
      res.status(400).json({ error: "token is required" });
      return;
    }
    let allowed = validUnsubscribeToken("device", token, unsubscribeToken);
    if (!allowed) {
      const principal = await requestPrincipal(req);
      if (!principal) {
        res.status(401).json({ error: "session_required" });
        return;
      }
      allowed = getTokensForPrincipal(principal).some((r) => r.token === token);
    }
    // Same answer whether or not the token exists, so it can't be probed.
    if (allowed) removeToken(token);
    res.json({ ok: true });
  });

  // ── POST /api/push/send ─────────────────────────────────────────────────────
  app.post("/api/push/send", async (req: Request, res: Response): Promise<void> => {
    const internalKey = process.env.INTERNAL_API_KEY;
    // Always require the key — remove the && short-circuit that bypassed auth when key was unset
    const suppliedKey = req.headers["x-internal-key"];
    if (!internalKey || typeof suppliedKey !== "string" || !safeEqual(suppliedKey, internalKey)) {
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
    // Per-principal, per-number and global caps (SMS pumping / harassing a
    // third-party number from many cheap principals).
    if (!allowCodeRequest(principal) || !allowCodeToPhone(phone)) {
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
    res.json({ ok: true, unsubscribeToken: unsubscribeTokenFor("web", subscription.endpoint) });
  });

  // ── POST /api/push/vapid-unsubscribe ────────────────────────────────────────
  // Removes a browser Web Push subscription by endpoint URL.
  // Body: { endpoint, auth?, unsubscribeToken? }. Allowed with any of:
  //   - `auth`: the subscription's keys.auth secret (only the browser has it),
  //   - `unsubscribeToken`: returned by /vapid-subscribe,
  //   - a session whose principal owns the subscription.
  // Knowing the endpoint URL alone is not enough.
  app.post("/api/push/vapid-unsubscribe", async (req: Request, res: Response): Promise<void> => {
    const { endpoint, auth, unsubscribeToken } = req.body as {
      endpoint?: unknown; auth?: unknown; unsubscribeToken?: unknown;
    };
    if (typeof endpoint !== "string" || !endpoint) {
      res.status(400).json({ error: "endpoint is required" });
      return;
    }
    const stored = findSubscription(endpoint);
    let allowed =
      validUnsubscribeToken("web", endpoint, unsubscribeToken) ||
      (typeof auth === "string" && !!stored?.keys?.auth && safeEqual(auth, stored.keys.auth));
    if (!allowed) {
      const principal = await requestPrincipal(req);
      if (!principal) {
        res.status(401).json({ error: "session_required" });
        return;
      }
      allowed = getSubscriptionsForPrincipal(principal).some((s) => s.endpoint === endpoint);
    }
    if (allowed) removeSubscription(endpoint);
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
