import "dotenv/config";
import express, { Request, Response } from "express";
import cors                           from "cors";
import rateLimit                      from "express-rate-limit";
import { registerToken, removeToken } from "./store";
import { dispatchToUser }             from "./dispatcher";
import { startPoller }                from "./poller";
import type { Platform, PushPayload } from "./types";

const app  = express();
const port = Number(process.env.NOTIFICATIONS_PORT) || 3002;

// Same CORS + rate-limit pattern as voice agent
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

// ── POST /api/push/register ───────────────────────────────────────────────────
// Registers a device push token for a principal.
// Body: { principal: string, token: string, platform: "ios" | "android" }
app.post("/api/push/register", (req: Request, res: Response): void => {
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

// ── POST /api/push/unregister ─────────────────────────────────────────────────
// Removes a stale or logged-out device token.
// Body: { token: string }
app.post("/api/push/unregister", (req: Request, res: Response): void => {
  const { token } = req.body as { token?: string };
  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }
  removeToken(token);
  res.json({ ok: true });
});

// ── POST /api/push/send ───────────────────────────────────────────────────────
// Internal endpoint — dispatches a push to all devices for a principal.
// Body: { principal: string, payload: PushPayload }
// Protected by INTERNAL_API_KEY header in production.
app.post("/api/push/send", async (req: Request, res: Response): Promise<void> => {
  const internalKey = process.env.INTERNAL_API_KEY;
  if (internalKey && req.headers["x-internal-key"] !== internalKey) {
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

// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "homegentic-notifications" });
});

app.listen(port, () => {
  console.log(`HomeGentic notification relay → http://localhost:${port}`);
  startPoller();
});
