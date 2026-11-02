/**
 * Paid / keyed third-party calls that used to run as ai_proxy canister HTTPS
 * outcalls (M-6 / M11). Canister memory is readable by node operators, so the
 * ATTOM, OpenPermit and Resend keys now live only here, as Worker secrets.
 *
 *   POST /api/property/details        ATTOM basic profile  (10/day/user, global budget)
 *   POST /api/permits/import          Volusia ArcGIS / Orlando Socrata / OpenPermit
 *                                     (20/day/user, global budget)
 *   POST /api/email/contractor-invite invite email built from the job canister's
 *                                     invite preview, never from body text
 *   POST /api/email/broker-lead       lead to the fixed LOCAL_BROKER_EMAIL inbox
 *
 * Every route needs a session (index.ts resolves it); `principal` here is the
 * session's verified principal. Quotas are atomic RateLimiterDO counters
 * (hitCounter), falling back to KV only when the DO isn't bound.
 */

import { EMAIL_RE, escapeHtml, subjectText } from "./security";
import type { InvitePreview } from "./jobCanister";
import { hitCounter } from "./rateLimiter";
import { reportServiceError } from "./serviceErrors";

export interface OutcallEnv {
  RATE_LIMIT:           KVNamespace;
  RATE_LIMITER?:        DurableObjectNamespace;
  FRONTEND_ORIGIN:      string;
  ATTOM_API_KEY?:       string;
  OPENPERMIT_API_KEY?:  string;
  RESEND_API_KEY?:      string;
  RESEND_FROM?:         string;
  LOCAL_BROKER_EMAIL?:  string;
  ATTOM_DAILY_BUDGET?:  string;
  PERMIT_DAILY_BUDGET?: string;
  INVITE_EMAIL_DAILY_BUDGET?: string;
}

export interface OutcallResult { status: number; body: unknown }

export const ATTOM_PER_USER_DAY       = 10;
export const PERMITS_PER_USER_DAY     = 20;
export const INVITE_EMAILS_PER_USER_DAY = 20;
export const INVITE_EMAILS_PER_TOKEN  = 3;
export const BROKER_LEADS_PER_USER_DAY = 3;
const DEFAULT_ATTOM_BUDGET  = 300;
const DEFAULT_PERMIT_BUDGET = 1_000;
/** CD-9: invite emails across all users per day (sender reputation). */
const DEFAULT_INVITE_EMAIL_BUDGET = 500;
/**
 * CD-11 (cycle-drain audit 2026-10-31): free accounts together may use at most
 * this share of a global daily budget, so throwaway accounts can't use up the
 * day for paying users. Paid accounts draw on the whole budget.
 */
export const FREE_BUDGET_SHARE = 0.7;
const freeShare = (n: number) => Math.max(1, Math.floor(n * FREE_BUDGET_SHARE));
const isPaidTier = (tier: string) => tier === "Pro" || tier === "ContractorPro";

/** The global slots for a budget: a free-share slot first for free tiers. */
function globalSlots(key: string, limit: number, tier: string): Array<[string, number, number]> {
  const slots: Array<[string, number, number]> = [];
  if (!isPaidTier(tier)) slots.push([`${key}:free:${day()}`, freeShare(limit), 2 * 86_400]);
  slots.push([`${key}:${day()}`, limit, 2 * 86_400]);
  return slots;
}
const ATTOM_CACHE_TTL_S     = 7 * 86_400;
const MAX_FIELD             = 200;
const MAX_UPSTREAM_BYTES    = 256 * 1024;

// ── Quotas ────────────────────────────────────────────────────────────────────

/** Strip trailing "/" without a regex (CodeQL flags /\/+$/ as polynomial). */
function trimTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47) end--;
  return s.slice(0, end);
}

function day(): string { return new Date().toISOString().slice(0, 10); }

/**
 * Consume one slot from each (key, limit, ttl) in order, stopping at the
 * first full one. List the per-user slot first so a user over their own
 * quota can't spend the shared global budget. Each hit is atomic; a slot taken before a later limit
 * refuses is not returned, so a refusal can cost the caller one slot of an
 * earlier (per-user) quota. That errs on the side of the budget.
 */
async function consumeAll(env: OutcallEnv, slots: Array<[string, number, number]>): Promise<boolean> {
  for (const [key, limit, ttl] of slots) {
    if (!(await hitCounter(env, key, limit, ttl)).allowed) return false;
  }
  return true;
}

function budget(v: string | undefined, dflt: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Input ─────────────────────────────────────────────────────────────────────

type Addr = { address: string; city: string; state: string; zip: string };

function readAddress(input: unknown): Addr | string {
  const b = (input ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const name of ["address", "city", "state", "zip"]) {
    const v = b[name] ?? (name === "zip" ? b.zipCode : undefined) ?? "";
    if (typeof v !== "string" || v.length > MAX_FIELD) return `${name} must be a string of at most ${MAX_FIELD} characters`;
    // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
    out[name] = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  }
  if (!out.address) return "address is required";
  return out as Addr;
}

async function readUpstreamJson(resp: Response): Promise<unknown> {
  const text = await resp.text();
  if (text.length > MAX_UPSTREAM_BYTES) throw new Error("upstream response too large");
  return JSON.parse(text);
}

// ── ATTOM property details ────────────────────────────────────────────────────

export async function lookupPropertyDetails(
  input: unknown,
  principal: string,
  env: OutcallEnv,
  fetchImpl: typeof fetch = fetch,
  tier = "Free",
): Promise<OutcallResult> {
  if (!env.ATTOM_API_KEY) return { status: 503, body: { error: "Property lookup not configured" } };
  const a = readAddress(input);
  if (typeof a === "string") return { status: 400, body: { error: a } };

  const cacheKey = `attom:cache:${await sha256Hex([a.address, a.city, a.state, a.zip].join("|").toLowerCase())}`;
  const cached = await env.RATE_LIMIT.get(cacheKey);
  if (cached) return { status: 200, body: JSON.parse(cached) };

  const ok = await consumeAll(env, [
    [`attom:user:${principal}:${day()}`, ATTOM_PER_USER_DAY, 2 * 86_400],
    ...globalSlots("attom:global", budget(env.ATTOM_DAILY_BUDGET, DEFAULT_ATTOM_BUDGET), tier),
  ]);
  if (!ok) return { status: 429, body: { error: "daily_lookup_limit_reached" } };

  const params = new URLSearchParams({
    address1: a.address,
    address2: `${a.city}, ${a.state} ${a.zip}`.trim(),
  });
  try {
    const resp = await fetchImpl(`https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/basicprofile?${params}`, {
      headers: { Accept: "application/json", apikey: env.ATTOM_API_KEY },
    });
    if (!resp.ok) return { status: resp.status === 404 ? 404 : 502, body: { error: "Property lookup failed" } };
    const data = await readUpstreamJson(resp);
    await env.RATE_LIMIT.put(cacheKey, JSON.stringify(data), { expirationTtl: ATTOM_CACHE_TTL_S });
    return { status: 200, body: data };
  } catch {
    return { status: 502, body: { error: "Property lookup failed" } };
  }
}

// ── Permit import (Volusia ArcGIS / City of Orlando Socrata / OpenPermit) ─────

const VOLUSIA_CITIES = new Set([
  "daytona beach", "deltona", "ormond beach", "port orange", "holly hill",
  "south daytona", "new smyrna beach", "edgewater", "deland", "debary",
  "orange city", "ponce inlet", "oak hill", "lake helen", "pierson",
  "osteen", "enterprise", "volusia county",
]);

const OPENPERMIT_CITIES = new Set([
  "los angeles", "houston", "phoenix", "philadelphia", "san antonio",
  "san diego", "dallas", "san jose", "austin", "jacksonville",
  "new york", "chicago", "fort worth", "columbus", "charlotte",
  "denver", "seattle", "portland", "las vegas", "nashville",
  "miami", "atlanta", "minneapolis", "tampa",
]);

/** City of Orlando (Orange County) Socrata "Permit Applications" (ryhf-m453). */
const ORLANDO_PERMITS_URL = "https://data.cityoforlando.net/resource/ryhf-m453.json";
/** Application types that are work on a building (not fees, licences or history). */
export const ORLANDO_PERMIT_TYPES = ["Building Permit", "Electrical", "Plumbing", "Mechanical Permit", "GAS", "Demolition Permit"];

const STREET_SUFFIXES = new Set([
  "ST", "STREET", "AVE", "AVENUE", "AV", "BLVD", "BOULEVARD", "DR", "DRIVE", "RD", "ROAD", "CT", "COURT",
  "LN", "LANE", "WAY", "CIR", "CIRCLE", "PL", "PLACE", "TRL", "TRAIL", "PKWY", "PARKWAY", "TER", "TERRACE",
  "HWY", "HIGHWAY", "LOOP", "RUN", "PT", "POINT", "XING", "CV", "COVE", "SQ", "PATH", "ROW",
]);
const DIRECTIONS: Record<string, string> = { NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W" };

/**
 * "1234 East Robinson Street, Apt 2" -> "1234 E ROBINSON": the house number,
 * direction and street name as Orlando writes them, without the suffix (which
 * people spell several ways), for a prefix match. Null without a house number.
 */
export function orlandoAddressPrefix(address: string): string | null {
  const street = address.split(",")[0].toUpperCase().replace(/\s+(APT|UNIT|STE|SUITE|#).*$/, "");
  const words = street.replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean).map((w) => DIRECTIONS[w] ?? w);
  if (words.length < 2 || !/^\d+[A-Z]?$/.test(words[0])) return null;
  if (words.length > 2 && STREET_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

/** M-08 / L4: safe inside an ArcGIS SQL LIKE literal. */
export function escapeArcGISLike(s: string): string {
  // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
  return s.replace(/[%_[\]\u0000-\u001f\u007f]/g, "").replace(/'/g, "''");
}

export async function importPermits(
  input: unknown,
  principal: string,
  env: OutcallEnv,
  fetchImpl: typeof fetch = fetch,
  tier = "Free",
): Promise<OutcallResult> {
  const a = readAddress(input);
  if (typeof a === "string") return { status: 400, body: { error: a } };
  const city    = a.city.toLowerCase();
  const fl      = a.state.toLowerCase() === "fl";
  const volusia = fl && VOLUSIA_CITIES.has(city);
  const orlando = fl && city === "orlando";
  const orlandoPrefix = orlando ? orlandoAddressPrefix(a.address) : null;
  if (orlando && !orlandoPrefix) return { status: 400, body: { error: "Enter the street address with its house number" } };
  if (!volusia && !orlando && !OPENPERMIT_CITIES.has(city)) {
    return { status: 200, body: { source: "unsupported", data: [] } };
  }
  if (!volusia && !orlando && !env.OPENPERMIT_API_KEY) return { status: 503, body: { error: "Permit import not configured" } };

  const ok = await consumeAll(env, [
    [`permits:user:${principal}:${day()}`, PERMITS_PER_USER_DAY, 2 * 86_400],
    ...globalSlots("permits:global", budget(env.PERMIT_DAILY_BUDGET, DEFAULT_PERMIT_BUDGET), tier),
  ]);
  if (!ok) return { status: 429, body: { error: "daily_permit_limit_reached" } };

  try {
    if (volusia) {
      const street = a.address.split(",")[0];
      const params = new URLSearchParams({
        where:             `FOLDERDESCRIPTION LIKE '%${escapeArcGISLike(street)}%'`,
        outFields:         "FOLDERNAME,FOLDERTYPE,STATUSDESC,INDATE,FOLDERDESCRIPTION,FOLDERLINK",
        resultRecordCount: "50",
        f:                 "json",
      });
      const resp = await fetchImpl(`https://maps5.vcgov.org/arcgis/rest/services/CurrentProjects/MapServer/1/query?${params}`);
      if (!resp.ok) return { status: 502, body: { error: "Permit lookup failed" } };
      return { status: 200, body: { source: "arcgis", data: await readUpstreamJson(resp), address: a.address } };
    }
    if (orlando) {
      const types = ORLANDO_PERMIT_TYPES.map((t) => `'${t}'`).join(",");
      const params = new URLSearchParams({
        $where:  `upper(permit_address) like '${escapeArcGISLike(orlandoPrefix!)}%' ` +
                 `AND application_type in(${types}) AND issue_permit_date IS NOT NULL`,
        $select: "permit_number,application_type,worktype,permit_address,application_status,issue_permit_date,final_date,estimated_cost,contractor,project_name",
        $order:  "issue_permit_date DESC",
        $limit:  "50",
      });
      const resp = await fetchImpl(`${ORLANDO_PERMITS_URL}?${params}`);
      if (!resp.ok) return { status: 502, body: { error: "Permit lookup failed" } };
      return { status: 200, body: { source: "orlando", data: await readUpstreamJson(resp), address: a.address } };
    }
    const params = new URLSearchParams({ address: a.address, city: a.city, state: a.state, zip: a.zip, limit: "20" });
    const resp = await fetchImpl(`https://api.openpermit.org/v1/permits?${params}`, {
      headers: { Authorization: `Bearer ${env.OPENPERMIT_API_KEY}` },
    });
    if (!resp.ok) return { status: 502, body: { error: "Permit lookup failed" } };
    return { status: 200, body: { source: "openpermit", data: await readUpstreamJson(resp), address: a.address } };
  } catch {
    return { status: 502, body: { error: "Permit lookup failed" } };
  }
}

// ── Email (Resend) ────────────────────────────────────────────────────────────

const DEFAULT_FROM = "HomeGentic <noreply@homegentic.app>";

async function sendViaResend(
  env: OutcallEnv,
  msg: { to: string; subject: string; html: string; text: string; replyTo?: string; idempotencyKey: string },
  fetchImpl: typeof fetch,
): Promise<boolean> {
  let resp: Response;
  try {
    resp = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        Authorization:     `Bearer ${env.RESEND_API_KEY}`,
        "Idempotency-Key": msg.idempotencyKey,
      },
      body: JSON.stringify({
        from: env.RESEND_FROM || DEFAULT_FROM,
        to: msg.to, subject: msg.subject, html: msg.html, text: msg.text,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
    });
  } catch {
    await reportServiceError("email", "Resend unreachable");
    return false;
  }
  if (!resp.ok) await reportServiceError("email", `Resend refused: HTTP ${resp.status}`);
  return resp.ok;
}

export const INVITE_TOKEN_RE = /^INV_[0-9a-f]{16,128}$/;

function frame(inner: string): string {
  return "<!DOCTYPE html><html><body style=\"font-family:Arial,sans-serif;background:#F4F1EB;margin:0;padding:2rem;\">" +
    "<div style=\"max-width:480px;margin:0 auto;background:#fff;border:1px solid #C8C3B8;padding:2rem;\">" +
    "<p style=\"font-size:1.5rem;font-weight:900;margin:0 0 1.5rem;color:#2E2540;\">HomeGentic</p>" +
    inner +
    "<hr style=\"border:none;border-top:1px solid #C8C3B8;margin:1.5rem 0;\"/>" +
    "<p style=\"color:#7A7268;font-size:0.7rem;\">HomeGentic - Verified Home History</p></div></body></html>";
}

/**
 * Email a contractor the co-sign link for an invite token. Everything in the
 * message (address, service, amount, link) comes from the job canister's
 * invite record; the body supplies only the token and the recipient address
 * the homeowner typed. Capped per user per day and per token.
 */
export async function sendContractorInvite(
  input: unknown,
  principal: string,
  env: OutcallEnv,
  getPreview: (token: string) => Promise<InvitePreview | null>,
  fetchImpl: typeof fetch = fetch,
  tier = "Free",
): Promise<OutcallResult> {
  if (!env.RESEND_API_KEY) return { status: 503, body: { error: "Email not configured" } };
  const { token, to } = (input ?? {}) as Record<string, unknown>;
  if (typeof token !== "string" || !INVITE_TOKEN_RE.test(token)) return { status: 400, body: { error: "valid token required" } };
  if (typeof to !== "string" || to.length > 254 || !EMAIL_RE.test(to)) return { status: 400, body: { error: "valid recipient email required" } };

  let preview: InvitePreview | null;
  try {
    preview = await getPreview(token);
  } catch {
    return { status: 502, body: { error: "Could not look up invite" } };
  }
  if (!preview) return { status: 404, body: { error: "Invite not found" } };
  if (preview.alreadySigned) return { status: 409, body: { error: "Job already signed" } };
  if (Number(preview.expiresAt / 1_000_000n) < Date.now()) return { status: 410, body: { error: "Invite expired" } };

  const ok = await consumeAll(env, [
    [`email:invite:user:${principal}:${day()}`, INVITE_EMAILS_PER_USER_DAY, 2 * 86_400],
    [`email:invite:token:${token}`, INVITE_EMAILS_PER_TOKEN, 3 * 86_400],
    ...globalSlots("email:invite:global", budget(env.INVITE_EMAIL_DAILY_BUDGET, DEFAULT_INVITE_EMAIL_BUDGET), tier),
  ]);
  if (!ok) return { status: 429, body: { error: "email_limit_reached" } };

  const verifyUrl = `${trimTrailingSlashes(env.FRONTEND_ORIGIN)}/verify/${token}`;
  const addr      = subjectText(preview.propertyAddress, 200);
  const service   = subjectText(preview.serviceType, 60);
  const amount    = preview.amount > 0n ? `$${(preview.amount / 100n).toString()}` : "";
  const greeting  = preview.contractorName ? `Hi ${escapeHtml(preview.contractorName, 100)},` : "Hi,";
  const html = frame(
    `<p style="color:#2E2540;">${greeting}</p>` +
    `<p style="color:#2E2540;line-height:1.6;">A homeowner at <strong>${escapeHtml(addr)}</strong> has asked you to confirm and co-sign this job record on HomeGentic:</p>` +
    `<p style="color:#2E2540;">Service: <strong>${escapeHtml(service)}</strong>` +
    (amount ? `<br/>Amount: <strong>${amount}</strong>` : "") + `</p>` +
    `<a href="${escapeHtml(verifyUrl, 500)}" style="display:inline-block;background:#2E2540;color:#fff;text-decoration:none;padding:0.875rem 2rem;">Confirm &amp; Sign</a>` +
    `<p style="color:#7A7268;font-size:0.75rem;margin-top:1.5rem;">This link expires in 48 hours and can only be used once.</p>`,
  );
  const text =
    `${preview.contractorName ? `Hi ${subjectText(preview.contractorName)},` : "Hi,"}\n\n` +
    `A homeowner at ${addr} has asked you to confirm and co-sign a job record on HomeGentic.\n\n` +
    `Service: ${service}\n${amount ? `Amount: ${amount}\n` : ""}\n` +
    `Confirm and sign here (expires in 48 hours):\n${verifyUrl}\n`;
  try {
    const sent = await sendViaResend(env, {
      to, subject: subjectText(`Please confirm your work at ${addr}`, 150), html, text,
      idempotencyKey: `invite-${token}-${(await sha256Hex(to.toLowerCase())).slice(0, 16)}`,
    }, fetchImpl);
    return sent ? { status: 200, body: { sent: true } } : { status: 502, body: { error: "Email send failed" } };
  } catch {
    return { status: 502, body: { error: "Email send failed" } };
  }
}

/**
 * Local-broker consultation request. The recipient is the fixed
 * LOCAL_BROKER_EMAIL inbox; the submitter's fields are escaped.
 */
export async function sendBrokerLead(
  input: unknown,
  principal: string,
  env: OutcallEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<OutcallResult> {
  if (!env.RESEND_API_KEY || !env.LOCAL_BROKER_EMAIL) return { status: 503, body: { error: "Email not configured" } };
  const { name, email, phone, propertyAddress } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim() || name.length > 100) return { status: 400, body: { error: "name required" } };
  if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email)) return { status: 400, body: { error: "valid email required" } };
  if (phone != null && (typeof phone !== "string" || phone.length > 40)) return { status: 400, body: { error: "invalid phone" } };
  if (propertyAddress != null && (typeof propertyAddress !== "string" || propertyAddress.length > MAX_FIELD)) {
    return { status: 400, body: { error: "invalid propertyAddress" } };
  }
  const ok = await consumeAll(env, [[`email:broker:user:${principal}:${day()}`, BROKER_LEADS_PER_USER_DAY, 2 * 86_400]]);
  if (!ok) return { status: 429, body: { error: "email_limit_reached" } };

  const html = frame(
    "<p><strong>Local Broker Consultation Request</strong></p>" +
    `<p><strong>Name:</strong> ${escapeHtml(name, 100)}</p>` +
    `<p><strong>Email:</strong> ${escapeHtml(email, 254)}</p>` +
    `<p><strong>Phone:</strong> ${escapeHtml(phone || "-", 40)}</p>` +
    `<p><strong>Property:</strong> ${escapeHtml(propertyAddress || "-")}</p>`,
  );
  const text =
    `Local Broker Consultation Request\n\nName: ${subjectText(name)}\nEmail: ${email}\n` +
    `Phone: ${subjectText(phone || "-", 40)}\nProperty: ${subjectText(propertyAddress || "-", MAX_FIELD)}\n`;
  try {
    const sent = await sendViaResend(env, {
      to: env.LOCAL_BROKER_EMAIL, subject: "HomeGentic: Local Broker Consultation Request", html, text,
      replyTo: email, idempotencyKey: `broker-${principal}-${day()}-${(await sha256Hex(email.toLowerCase())).slice(0, 16)}`,
    }, fetchImpl);
    return sent ? { status: 200, body: { sent: true } } : { status: 502, body: { error: "Email send failed" } };
  } catch {
    return { status: 502, body: { error: "Email send failed" } };
  }
}

/**
 * Email a paid gift's redeem link to its recipient. Called once the Worker has
 * confirmed the gift checkout is paid; the Resend idempotency key keeps the
 * webhook and verify-session paths from sending it twice. Returns false (and
 * sends nothing) when email isn't configured or the address is invalid — the
 * giver still sees the gift code on the success page.
 */
export async function sendGiftEmail(
  gift: { giftToken: string; tier: string; recipientEmail: string; recipientName: string; senderName: string; giftMessage: string },
  env: OutcallEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const to = gift.recipientEmail;
  if (!to || to.length > 254 || !EMAIL_RE.test(to)) return false;
  const redeemUrl = `${trimTrailingSlashes(env.FRONTEND_ORIGIN)}/gift/redeem?token=${encodeURIComponent(gift.giftToken)}`;
  const from = gift.senderName.trim() || "Someone";
  const html = frame(
    `<p style="color:#2E2540;">Hi ${escapeHtml(gift.recipientName, 100) || "there"},</p>` +
    `<p style="color:#2E2540;"><strong>${escapeHtml(from, 100)}</strong> gave you a year of HomeGentic ${escapeHtml(gift.tier, 40)}.</p>` +
    (gift.giftMessage ? `<blockquote style="margin:1rem 0;padding-left:1rem;border-left:3px solid #C8C3B8;color:#2E2540;">${escapeHtml(gift.giftMessage, 300)}</blockquote>` : "") +
    `<p><a href="${escapeHtml(redeemUrl, 400)}" style="display:inline-block;background:#2B34FF;color:#fff;padding:0.75rem 1.25rem;text-decoration:none;">Redeem your gift</a></p>` +
    `<p style="color:#7A7268;font-size:0.8rem;">Sign in or create an account, then the year starts when you redeem. This is a one-time gift; nothing renews.</p>`,
  );
  const text =
    `${from} gave you a year of HomeGentic ${gift.tier}.\n\n` +
    (gift.giftMessage ? `"${gift.giftMessage.slice(0, 300)}"\n\n` : "") +
    `Redeem it here: ${redeemUrl}\n\nThis is a one-time gift; nothing renews.`;
  try {
    return await sendViaResend(env, {
      to, subject: subjectText(`${from} sent you a HomeGentic gift`, 120), html, text,
      idempotencyKey: `gift:${gift.giftToken}`,
    }, fetchImpl);
  } catch {
    return false;
  }
}
