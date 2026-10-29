/**
 * Forwarded email → draft job.
 *
 * Each homeowner can get a private forwarding address, h-<token>@<INBOX_DOMAIN>
 * (job.getMyInboxToken). Cloudflare Email Routing sends mail for that domain
 * to this Worker's email() handler, which:
 *
 *   1. reads the token from the recipient address, asks the job canister
 *      whether that inbox exists and has room, and counts the message against
 *      per-inbox and Worker-wide daily caps (H-2: nothing reaches the model
 *      for a made-up address or past a cap),
 *   2. parses the message (postal-mime) and picks the invoice: the first PDF
 *      or image attachment, else the message text,
 *   3. asks the model whether it's a record of work on the home and, if so,
 *      for the job fields,
 *   4. files a draft with job.relayAddEmailDraft (the Worker's identity must
 *      be registered with job.addInboxRelay).
 *
 * Nothing becomes a job until the homeowner reviews the draft in the app. Mail
 * that isn't a home-service record, or for an unknown address, is dropped
 * without a reply (no backscatter to forged senders).
 */
import PostalMime from "postal-mime";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "../../../packages/shared/src/declarations/job";
import { getAgent } from "../paymentCanister";
import { logger } from "../../../packages/shared/src/logger";
import { SERVICE_TYPE_LABELS } from "../../../packages/shared/src/serviceTypes";
import type { AIProvider } from "../provider";

/** Attachments the model can read, and the largest one we send. */
const READABLE = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;
/** Raw messages larger than this are dropped before parsing. */
export const MAX_RAW_BYTES = 10 * 1024 * 1024;
/** Model calls per inbox per day (above the canister's 30 drafts/day, for non-records). */
export const MODEL_CALLS_PER_INBOX_DAY = 40;
/** Model calls per day across every inbox, so a flood of valid tokens is still bounded. */
export const MODEL_CALLS_PER_DAY = 2_000;

/** The token in h-<token>@<domain>, or null when the address isn't an inbox address. */
export function inboxToken(address: string, domain: string): string | null {
  const m = /^h-([0-9a-f]{20})@(.+)$/i.exec(address.trim());
  if (!m || m[2].toLowerCase() !== domain.toLowerCase()) return null;
  return m[1].toLowerCase();
}

export interface InvoiceDraft {
  title:          string;
  serviceType:    string;   // a HomeGentic service type label, "" when unclear
  contractorName: string;
  amountCents:    number;
  completedDate:  string;   // YYYY-MM-DD or ""
  warrantyMonths: number;
  description:    string;
}

const SERVICE_TYPES = SERVICE_TYPE_LABELS;

export function invoiceSystemPrompt(): string {
  return `You read emails and attachments a homeowner forwarded to their home-maintenance record.
Decide whether this is a record of work done on (or a product installed in) their home: an invoice, receipt, work order, or completion notice from a contractor or store. Marketing, quotes for work not yet done, newsletters, and personal mail are NOT records.
Respond ONLY with JSON, no prose:
{
  "isRecord": true|false,
  "title": "<short job title, e.g. 'AC tune-up' or 'Water heater replacement'>",
  "serviceType": "<one of: ${SERVICE_TYPES.join("|")}>",
  "contractorName": "<business that did the work, or ''>",
  "amountCents": <total paid in US cents as an integer, 0 if not shown>,
  "completedDate": "<YYYY-MM-DD the work was done (else the invoice date), or ''>",
  "warrantyMonths": <warranty length in months if stated, else 0>,
  "description": "<one or two sentences on what was done>"
}`;
}

const clampInt = (v: unknown, max: number) => {
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : 0;
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The model's JSON → a draft, or null when it isn't a home-service record. */
export function parseInvoice(text: string): InvoiceDraft | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(m[0]); } catch { return null; }
  if (raw.isRecord !== true) return null;
  const title = str(raw.title, 120);
  if (!title) return null;
  const serviceType = SERVICE_TYPES.includes(str(raw.serviceType, 40)) ? str(raw.serviceType, 40) : "";
  const date = str(raw.completedDate, 10);
  return {
    title,
    serviceType,
    contractorName: str(raw.contractorName, 120),
    amountCents:    clampInt(raw.amountCents, 100_000_000),
    completedDate:  /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    warrantyMonths: clampInt(raw.warrantyMonths, 600),
    description:    str(raw.description, 1000),
  };
}

export interface ParsedMail {
  from:    string;
  subject: string;
  text:    string;
  attachment: { mimeType: string; base64: string } | null;
}

/** Parse a raw message and pick what the model should read. */
export async function parseMail(raw: ArrayBuffer | Uint8Array): Promise<ParsedMail> {
  const email = await PostalMime.parse(raw, { attachmentEncoding: "base64" });
  const att = email.attachments.find((a) =>
    READABLE.includes(a.mimeType) &&
    typeof a.content === "string" &&
    (a.content.length * 3) / 4 <= MAX_ATTACHMENT_BYTES);
  return {
    from:    email.from?.address ?? "",
    subject: email.subject ?? "",
    text:    (email.text ?? email.html?.replace(/<[^>]+>/g, " ") ?? "").slice(0, MAX_TEXT_CHARS),
    attachment: att ? { mimeType: att.mimeType, base64: att.content as string } : null,
  };
}

/** Ask the model for the job fields. Null when the mail isn't a home-service record. */
export async function extractInvoice(mail: ParsedMail, provider: AIProvider): Promise<InvoiceDraft | null> {
  const content: unknown[] = [];
  if (mail.attachment) {
    content.push(mail.attachment.mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: mail.attachment.base64 } }
      : { type: "image",    source: { type: "base64", media_type: mail.attachment.mimeType, data: mail.attachment.base64 } });
  }
  content.push({ type: "text", text: `Subject: ${mail.subject}\n\n${mail.text}` });
  const out = await provider.complete({ system: invoiceSystemPrompt(), messages: [{ role: "user", content }], maxTokens: 600 });
  return parseInvoice(out);
}

export type InboxCheck = "accepting" | "unknown" | "full";

export interface InboxDeps {
  provider: AIProvider;
  /** job.relayCheckInboxToken: does the inbox exist and have room? */
  checkToken: (token: string) => Promise<InboxCheck>;
  /** Count one hit against `key`; false once `limit` is reached (rateLimiter.hitCounter). */
  allow: (key: string, limit: number, ttlSeconds: number) => Promise<boolean>;
  addDraft: (token: string, from: string, subject: string, draft: InvoiceDraft) => Promise<"ok" | "unknown" | "rejected">;
}

async function jobActor(): Promise<any> {
  const canisterId = process.env.CANISTER_ID_JOB;
  if (!canisterId) throw new Error("CANISTER_ID_JOB is not set");
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId });
}

/** Ask the job canister whether `token` names an inbox that takes mail now. */
export async function checkTokenInCanister(token: string): Promise<InboxCheck> {
  const res = await (await jobActor()).relayCheckInboxToken(token);
  if ("accepting" in res) return "accepting";
  if ("full" in res) return "full";
  return "unknown";
}

/** Add a draft through the job canister with the Worker's identity. */
export async function addDraftInCanister(token: string, from: string, subject: string, d: InvoiceDraft): Promise<"ok" | "unknown" | "rejected"> {
  const res = await (await jobActor()).relayAddEmailDraft(token, {
    fromAddress:    from.slice(0, 200),
    subject:        subject.slice(0, 200),
    title:          d.title,
    serviceType:    d.serviceType,
    contractorName: d.contractorName,
    amountCents:    BigInt(d.amountCents),
    completedDate:  d.completedDate,
    warrantyMonths: BigInt(d.warrantyMonths),
    description:    d.description,
  });
  if ("ok" in res) return "ok";
  const tag = Object.keys(res.err)[0];
  if (tag === "NotFound") return "unknown";
  if (tag === "NotAuthorized") throw new Error("Worker is not registered with job.addInboxRelay");
  return "rejected";
}

export type InboxOutcome =
  "drafted" | "not-inbox" | "too-large" | "not-a-record" | "unknown-address" | "inbox-full" | "over-quota" | "rejected";

/**
 * Handle one inbound message. `to` is the envelope recipient; `raw` the full
 * message. Returns what happened (for logs and tests); never throws for
 * expected cases.
 */
export async function handleInbound(
  to: string, raw: ArrayBuffer | Uint8Array, size: number, domain: string, deps: InboxDeps,
): Promise<InboxOutcome> {
  const token = inboxToken(to, domain);
  if (!token) return "not-inbox";
  if (size > MAX_RAW_BYTES) return "too-large";
  // H-2: every check that can turn the message away runs before the model call.
  const check = await deps.checkToken(token);
  if (check === "unknown") return "unknown-address";
  if (check === "full") return "inbox-full";
  const day = new Date().toISOString().slice(0, 10);
  if (!(await deps.allow(`inbox:all:${day}`, MODEL_CALLS_PER_DAY, 2 * 86_400)) ||
      !(await deps.allow(`inbox:${token}:${day}`, MODEL_CALLS_PER_INBOX_DAY, 2 * 86_400))) {
    return "over-quota";
  }
  const mail = await parseMail(raw);
  const draft = await extractInvoice(mail, deps.provider);
  if (!draft) return "not-a-record";
  const res = await deps.addDraft(token, mail.from, mail.subject, draft);
  if (res === "unknown") return "unknown-address";
  if (res === "rejected") return "rejected";
  logger.info("inbox", "draft filed", { token: token.slice(0, 4) });
  return "drafted";
}
