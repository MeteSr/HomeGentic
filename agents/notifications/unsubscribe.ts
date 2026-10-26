/**
 * Unsubscribe tokens: an HMAC over what is being unsubscribed, so a link or a
 * client can drop exactly that and nothing else, without a session.
 *
 *   device:<token>               a mobile push registration (/api/push/unregister)
 *   web:<endpoint>               a browser push subscription (/api/push/vapid-unsubscribe)
 *   email:<prefKey>:<principal>  one email preference (/api/email/unsubscribe)
 *
 * The secret is UNSUBSCRIBE_SECRET, else INTERNAL_API_KEY (required in
 * production). A random fallback in dev means links stop working on restart.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const UNSUB_SECRET = process.env.UNSUBSCRIBE_SECRET || process.env.INTERNAL_API_KEY || randomBytes(32).toString("hex");

export type UnsubscribeKind = "device" | "web" | "email";

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function unsubscribeTokenFor(kind: UnsubscribeKind, id: string): string {
  return createHmac("sha256", UNSUB_SECRET).update(`unsub:${kind}:${id}`).digest("hex");
}

export function validUnsubscribeToken(kind: UnsubscribeKind, id: string, supplied: unknown): boolean {
  return typeof supplied === "string" && safeEqual(supplied, unsubscribeTokenFor(kind, id));
}

/** The id an email unsubscribe token covers. */
export const emailUnsubscribeId = (prefKey: string, principal: string) => `${prefKey}:${principal}`;
