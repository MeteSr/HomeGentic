export interface Env {
  RESEND_API_KEY: string;
  // JSON array: RouteConfig[] — set via `wrangler secret put ROUTE_CONFIG`
  ROUTE_CONFIG: string;
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

    let payload: LeadPayload;
    try {
      payload = await request.json() as LeadPayload;
    } catch {
      return json({ error: "Invalid JSON" }, 400, origin);
    }

    // Honeypot: silently succeed so bots get no feedback
    if (payload.website) {
      return json({ ok: true }, 200, origin);
    }

    if (!payload.name?.trim() || !payload.email?.trim()) {
      return json({ error: "Missing required fields: name, email" }, 422, origin);
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
        <td style="padding:8px 16px;color:#111827;border-bottom:1px solid #e5e7eb;">${esc(v)}</td>
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
