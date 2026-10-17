/**
 * Small, dependency-free hardening helpers shared by the Worker routes
 * (src/index.ts, src/bidtolist.ts). Kept separate so they can be unit-tested
 * without loading the Worker entry point.
 */

/** Thrown by route code to short-circuit with a JSON error response. */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

// ── Body size caps (F-4) ──────────────────────────────────────────────────────

/** Default cap for JSON bodies (text-only routes). */
export const MAX_JSON_BYTES = 64 * 1024;
/** Cap for routes that carry a base64 image/PDF (≈ 6 MB of base64 ≈ 4.5 MB file). */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
/** Cap for Stripe webhook payloads. */
export const MAX_WEBHOOK_BYTES = 512 * 1024;

/**
 * Read the request body as bytes, refusing anything over `maxBytes`. Checks
 * Content-Length first (cheap) and then the actual size, since the header can
 * be absent or wrong.
 */
export async function readBodyBytes(request: Request, maxBytes: number): Promise<ArrayBuffer> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "Request body too large");
  }
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new HttpError(413, "Request body too large");
  return buf;
}

/** Parse a JSON body with a size cap. Malformed JSON → 400. */
export async function readJsonBody<T = any>(request: Request, maxBytes = MAX_JSON_BYTES): Promise<T> {
  const buf = await readBodyBytes(request, maxBytes);
  if (buf.byteLength === 0) return {} as T;
  try {
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

// ── Constant-time comparison (F-6) ────────────────────────────────────────────

export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab  = enc.encode(a);
  const bb  = enc.encode(b);
  // Walk the longer input fully; no early exit on the first mismatch.
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

// ── Redirect allowlist (F-3) ──────────────────────────────────────────────────

/**
 * True when `url` is on one of the configured frontend origins. With no
 * origins configured (local dev only — production requires FRONTEND_ORIGIN)
 * only localhost is allowed.
 */
export function isAllowedRedirectUrl(url: unknown, allowedOrigins: Array<string | undefined>): boolean {
  if (typeof url !== "string" || url.length > 2048) return false;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const allowed = allowedOrigins.filter((o): o is string => !!o);
  if (allowed.length > 0) {
    return allowed.some((o) => {
      try { return new URL(o).origin === parsed.origin; } catch { return false; }
    });
  }
  return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
}

// ── Principal / Stripe id formats ─────────────────────────────────────────────

export const PRINCIPAL_RE        = /^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/;
export const CHECKOUT_SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{1,250}$/;
export const SUBSCRIPTION_ID_RE  = /^sub_[A-Za-z0-9]{1,250}$/;
export const PAYMENT_INTENT_RE   = /^pi_[A-Za-z0-9]{1,250}$/;
export const EMAIL_RE            = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,255}$/;

// ── HTML escaping (X-2 / F-5) ─────────────────────────────────────────────────

export function escapeHtml(v: unknown, maxLen = 200): string {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  return s
    .slice(0, maxLen)
    .replace(/[\r\n\t]/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain-text field for an email subject line: no CR/LF, bounded length. */
export function subjectText(v: unknown, maxLen = 100): string {
  const s = typeof v === "string" ? v : "";
  return s.replace(/[\r\n\t]/g, " ").slice(0, maxLen);
}

// ── Breadcrumb redaction (F-11 / M-03) ────────────────────────────────────────

const SENSITIVE_KEY_RE = /pass|secret|token|card|ssn|dob|cvv|pin|credential|auth|key|session|email|phone/i;

/** Drop sensitive-looking keys and non-primitive values; bound everything. */
export function redactRecord(data: unknown, maxKeys = 20): Record<string, string | number | boolean> | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  let n = 0;
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (n >= maxKeys) break;
    if (SENSITIVE_KEY_RE.test(k)) continue;
    if (typeof v === "string")       out[k.slice(0, 40)] = v.slice(0, 200);
    else if (typeof v === "number" || typeof v === "boolean") out[k.slice(0, 40)] = v;
    else continue;
    n++;
  }
  return out;
}

// ── Model-input caps (F-4) ────────────────────────────────────────────────────

export const MAX_AGENT_MESSAGES     = 24;
export const MAX_MESSAGE_TEXT_CHARS = 8_000;
export const MAX_CHAT_MESSAGE_CHARS = 2_000;

/**
 * Validate and bound the client-supplied Anthropic `messages` array for
 * /api/agent: only user/assistant roles, a bounded count, and bounded text in
 * every block. Image blocks (base64) are allowed but count toward the request
 * body cap. Returns null when the shape is invalid.
 */
export function sanitiseAgentMessages(raw: unknown): any[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_AGENT_MESSAGES) return null;
  const clampText = (t: unknown) => (typeof t === "string" ? t.slice(0, MAX_MESSAGE_TEXT_CHARS) : "");
  const out: any[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const role = (m as any).role;
    if (role !== "user" && role !== "assistant") return null;
    const content = (m as any).content;
    if (typeof content === "string") {
      out.push({ role, content: clampText(content) });
      continue;
    }
    if (!Array.isArray(content) || content.length > 20) return null;
    const blocks: any[] = [];
    for (const b of content) {
      if (!b || typeof b !== "object") return null;
      switch ((b as any).type) {
        case "text":
          blocks.push({ type: "text", text: clampText((b as any).text) });
          break;
        case "image": {
          const src = (b as any).source;
          if (!src || src.type !== "base64" || typeof src.data !== "string" || typeof src.media_type !== "string") return null;
          blocks.push({ type: "image", source: { type: "base64", media_type: src.media_type, data: src.data } });
          break;
        }
        case "tool_use":
          blocks.push({
            type: "tool_use",
            id:   String((b as any).id ?? "").slice(0, 100),
            name: String((b as any).name ?? "").slice(0, 64),
            input: (b as any).input && typeof (b as any).input === "object" ? (b as any).input : {},
          });
          break;
        case "tool_result":
          blocks.push({
            type: "tool_result",
            tool_use_id: String((b as any).tool_use_id ?? "").slice(0, 100),
            content: clampText(typeof (b as any).content === "string" ? (b as any).content : JSON.stringify((b as any).content ?? "")),
          });
          break;
        default:
          return null;
      }
    }
    out.push({ role, content: blocks });
  }
  return out;
}
