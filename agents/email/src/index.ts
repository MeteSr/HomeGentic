export interface Env {
  RESEND_API_KEY: string;
  // JSON array: RouteConfig[] — set via `wrangler secret put ROUTE_CONFIG`
  ROUTE_CONFIG: string;
  // Optional Cloudflare Turnstile secret. When set, every /send must carry a
  // valid `turnstileToken` (or `cf-turnstile-response`) field.
  TURNSTILE_SECRET_KEY?: string;
  // Optional KV namespace for a cross-isolate per-IP rate limit. Without it
  // the limit is kept in memory per isolate (weaker, but never absent).
  RATE_LIMIT_KV?: KVNamespace;
}

// ── Abuse controls (security audit F-12) ─────────────────────────────────────
const MAX_BODY_BYTES     = 16 * 1024;
const RATE_LIMIT_MAX     = 5;            // sends per IP per window
const RATE_LIMIT_WINDOW  = 10 * 60;      // seconds
const MEMORY_RL_MAX_KEYS = 10_000;
const FIELD_LIMITS: Record<string, number> = {
  name: 200, email: 254, phone: 40, address: 500, message: 5000,
  source: 200, utmSource: 200, utmMedium: 200, utmCampaign: 200, timeline: 200,
};

const memoryHits = new Map<string, { count: number; resetAt: number }>();

async function rateLimited(env: Env, ip: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  if (env.RATE_LIMIT_KV) {
    const key = `email-rl:${ip}`;
    const raw = await env.RATE_LIMIT_KV.get(key);
    const entry = raw ? (JSON.parse(raw) as { count: number; resetAt: number }) : null;
    const cur = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    if (cur.count >= RATE_LIMIT_MAX) return true;
    cur.count += 1;
    await env.RATE_LIMIT_KV.put(key, JSON.stringify(cur), {
      expirationTtl: Math.max(60, cur.resetAt - now),
    });
    return false;
  }
  const entry = memoryHits.get(ip);
  if (entry && entry.resetAt > now) {
    if (entry.count >= RATE_LIMIT_MAX) return true;
    entry.count += 1;
    return false;
  }
  if (memoryHits.size >= MEMORY_RL_MAX_KEYS) {
    for (const [k, v] of memoryHits) if (v.resetAt <= now) memoryHits.delete(k);
    if (memoryHits.size >= MEMORY_RL_MAX_KEYS) memoryHits.clear();
  }
  memoryHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
  return false;
}

async function verifyTurnstile(secret: string, token: string, ip: string): Promise<boolean> {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

function fieldError(p: LeadPayload): string | null {
  for (const [field, max] of Object.entries(FIELD_LIMITS)) {
    const v = (p as Record<string, unknown>)[field];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") return `Invalid field: ${field}`;
    if (v.length > max) return `Field too long: ${field}`;
  }
  if (p.estimatedPrice !== undefined && p.estimatedPrice !== null &&
      (typeof p.estimatedPrice !== "number" || !Number.isFinite(p.estimatedPrice))) {
    return "Invalid field: estimatedPrice";
  }
  if (/[\r\n]/.test(p.name ?? "") || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(p.email ?? "")) {
    return "Invalid name or email";
  }
  return null;
}

interface RouteConfig {
  origin:   string;
  toEmail:  string;
  fromEmail: string;
  fromName:  string;
}

interface LeadPayload {
  name?:           string;
  email?:          string;
  phone?:          string;
  address?:        string;
  message?:        string;
  source?:         string;
  utmSource?:      string;
  utmMedium?:      string;
  utmCampaign?:    string;
  estimatedPrice?: number;
  timeline?:       string;
  website?:        string; // honeypot — must be absent or empty
  turnstileToken?: string;
  "cf-turnstile-response"?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";

    let routes: RouteConfig[] = [];
    try {
      routes = JSON.parse(env.ROUTE_CONFIG || "[]");
    } catch {
      return json({ error: "Server misconfiguration" }, 500);
    }

    const route = routes.find(r => r.origin === origin);

    // CORS preflight
    if (request.method === "OPTIONS") {
      if (!route) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/send") {
      return json({ error: "Not found" }, 404);
    }

    if (!route) return json({ error: "Forbidden" }, 403, origin);

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (await rateLimited(env, ip)) {
      return json({ error: "Too many requests" }, 429, origin);
    }

    const declaredLen = Number(request.headers.get("Content-Length") ?? "0");
    if (declaredLen > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413, origin);
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES) {
      return json({ error: "Payload too large" }, 413, origin);
    }

    let payload: LeadPayload;
    try {
      payload = JSON.parse(bodyText) as LeadPayload;
      if (!payload || typeof payload !== "object") throw new Error("not an object");
    } catch {
      return json({ error: "Invalid JSON" }, 400, origin);
    }

    // Honeypot: silently succeed so bots get no feedback
    if (payload.website) {
      return json({ ok: true }, 200, origin);
    }

    if (typeof payload.name !== "string" || typeof payload.email !== "string" ||
        !payload.name.trim() || !payload.email.trim()) {
      return json({ error: "Missing required fields: name, email" }, 422, origin);
    }
    const invalid = fieldError(payload);
    if (invalid) return json({ error: invalid }, 422, origin);

    if (env.TURNSTILE_SECRET_KEY) {
      const token = payload.turnstileToken ?? payload["cf-turnstile-response"] ?? "";
      if (typeof token !== "string" || !token ||
          !(await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, ip))) {
        return json({ error: "Verification failed" }, 403, origin);
      }
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:     `${route.fromName} <${route.fromEmail}>`,
        to:       [route.toEmail],
        reply_to: payload.email,
        subject:  `New Lead — ${payload.name}`,
        html:     buildHtml(payload, origin),
        text:     buildText(payload),
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text().catch(() => "unknown");
      console.error("Resend error:", resendRes.status, err);
      return json({ error: "Email delivery failed" }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin":  origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age":       "86400",
  };
}

function json(body: unknown, status: number, origin?: string): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) Object.assign(headers, cors(origin));
  return new Response(JSON.stringify(body), { status, headers });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(p: LeadPayload, origin: string): string {
  const rows: [string, string | undefined][] = [
    ["Name",           p.name],
    ["Email",          p.email],
    ["Phone",          p.phone],
    ["Address",        p.address],
    ["Estimated Price", p.estimatedPrice ? `$${Number(p.estimatedPrice).toLocaleString()}` : undefined],
    ["Timeline",       p.timeline],
    ["Message",        p.message],
    ["Source",         p.source],
    ["UTM Source",     p.utmSource],
    ["UTM Medium",     p.utmMedium],
    ["UTM Campaign",   p.utmCampaign],
  ].filter(([, v]) => v) as [string, string][];

  const tableRows = rows
    .map(([k, v]) =>
      `<tr>
        <td style="padding:8px 16px;font-weight:600;white-space:nowrap;color:#374151;background:#f9fafb;border-bottom:1px solid #e5e7eb;">${k}</td>
        <td style="padding:8px 16px;color:#111827;border-bottom:1px solid #e5e7eb;">${esc(String(v))}</td>
      </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#1e3a5f;padding:20px 24px;">
      <p style="margin:0;color:#fff;font-size:1.125rem;font-weight:600;">New Lead — ${esc(p.name!)}</p>
      <p style="margin:4px 0 0;color:#93c5fd;font-size:0.8rem;">via ${esc(origin || "direct")}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${tableRows}
    </table>
  </div>
</body>
</html>`;
}

function buildText(p: LeadPayload): string {
  return [
    ["Name",           p.name],
    ["Email",          p.email],
    ["Phone",          p.phone],
    ["Address",        p.address],
    ["Estimated Price", p.estimatedPrice ? `$${Number(p.estimatedPrice).toLocaleString()}` : undefined],
    ["Timeline",       p.timeline],
    ["Message",        p.message],
    ["Source",         p.source],
    ["UTM Source",     p.utmSource],
    ["UTM Medium",     p.utmMedium],
    ["UTM Campaign",   p.utmCampaign],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}
