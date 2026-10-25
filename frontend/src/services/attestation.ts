/**
 * Signed records — checking the report canister's signatures in the browser.
 *
 * When a report link or a score certificate is created, the report canister
 * signs a JSON statement of exactly what it shows with an Ed25519 key held by
 * the Internet Computer's threshold signing service (backend/report/main.mo,
 * "Signed attestations"). This module fetches those statements, checks the
 * signature with WebCrypto, and packages them as a "signed copy" file anyone
 * can check later on /verify-record (or with any Ed25519 tool), without
 * trusting this web app's rendering of the report.
 *
 * A valid signature proves the statement came from HomeGentic's report
 * canister and hasn't changed since. It doesn't prove the facts are true
 * (jobs are confirmed by the homeowner and contractor, not inspected).
 *
 * E2E: window.__e2e_attestation (an Attestation, or null) and
 * window.__e2e_attestation_key ({ keyName, publicKey }, or null) replace the
 * canister calls.
 */

import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/report";

const REPORT_CANISTER_ID = (process.env as any).REPORT_CANISTER_ID || "";
const getActor = lazyActor(idlFactory, REPORT_CANISTER_ID);

export interface Attestation {
  message:   string;       // the exact JSON that was signed
  signature: Uint8Array;   // 64 bytes
  publicKey: Uint8Array;   // 32 bytes
  keyName:   string;
  signedAt:  number;       // ms
}

export interface AttestationKey {
  keyName:   string;
  publicKey: Uint8Array;
}

/** The downloadable signed copy. Self-contained: message + signature + key. */
export interface SignedCopy {
  format:    "homegentic.signed-record";
  v:         1;
  algorithm: "ed25519";
  keyName:   string;
  publicKey: string;   // hex
  signature: string;   // hex
  message:   string;   // the signed JSON, verbatim
}

// ─── Encoding ─────────────────────────────────────────────────────────────────

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) throw new Error("not hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function fromRaw(raw: any): Attestation {
  return {
    message:   raw.message,
    signature: Uint8Array.from(raw.signature),
    publicKey: Uint8Array.from(raw.publicKey),
    keyName:   raw.keyName,
    signedAt:  Number(BigInt(raw.signedAt) / 1_000_000n),
  };
}

// ─── Verification ─────────────────────────────────────────────────────────────

/** True when `signature` is a valid Ed25519 signature by `publicKey` over `message`'s UTF-8 bytes. */
export async function verifySignature(message: string, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
  if (signature.length !== 64 || publicKey.length !== 32) return false;
  try {
    const key = await crypto.subtle.importKey("raw", publicKey as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, signature as BufferSource, new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

export function toSignedCopy(a: Attestation): SignedCopy {
  return {
    format: "homegentic.signed-record", v: 1, algorithm: "ed25519",
    keyName: a.keyName, publicKey: toHex(a.publicKey), signature: toHex(a.signature), message: a.message,
  };
}

/** Parse a signed-copy file. Throws with a readable reason when it isn't one. */
export function parseSignedCopy(text: string): SignedCopy {
  let obj: any;
  try { obj = JSON.parse(text); } catch { throw new Error("This file isn't valid JSON."); }
  if (obj?.format !== "homegentic.signed-record" || obj?.algorithm !== "ed25519"
      || typeof obj.message !== "string" || typeof obj.signature !== "string" || typeof obj.publicKey !== "string") {
    throw new Error("This isn't a HomeGentic signed copy.");
  }
  return obj as SignedCopy;
}

export type CopyCheck =
  | { status: "valid"; publishedKey: boolean; statement: any }
  | { status: "invalid" };

/**
 * Check a signed copy: the signature against the key inside it, and that key
 * against the one the report canister publishes (`published`, when known).
 */
export async function checkSignedCopy(copy: SignedCopy, published: AttestationKey | null): Promise<CopyCheck> {
  let sig: Uint8Array, pk: Uint8Array;
  try { sig = fromHex(copy.signature); pk = fromHex(copy.publicKey); } catch { return { status: "invalid" }; }
  if (!(await verifySignature(copy.message, sig, pk))) return { status: "invalid" };
  let statement: any = null;
  try { statement = JSON.parse(copy.message); } catch { return { status: "invalid" }; }
  return { status: "valid", publishedKey: !!published && toHex(published.publicKey) === copy.publicKey.toLowerCase(), statement };
}

// ─── Canister reads ───────────────────────────────────────────────────────────

function e2e<T>(key: string): { hit: true; value: T } | { hit: false } {
  if (typeof window !== "undefined" && key in window) return { hit: true, value: (window as any)[key] as T };
  return { hit: false };
}

export const attestationService = {
  /** The signed statement behind a report share link, or null (unsigned, or the link can't be viewed). */
  async getForReport(token: string): Promise<Attestation | null> {
    const m = e2e<Attestation | null>("__e2e_attestation");
    if (m.hit) return m.value;
    if (!REPORT_CANISTER_ID) return null;
    const a = await getActor();
    const res = await a.getReportAttestation(token) as any[];
    return res.length ? fromRaw(res[0]) : null;
  },

  async getForCert(certId: string): Promise<Attestation | null> {
    const m = e2e<Attestation | null>("__e2e_attestation");
    if (m.hit) return m.value;
    if (!REPORT_CANISTER_ID) return null;
    const a = await getActor();
    const res = await a.getCertAttestation(certId) as any[];
    return res.length ? fromRaw(res[0]) : null;
  },

  /** The on-chain score stored with a report, or null. */
  async getReportScore(token: string): Promise<number | null> {
    const m = e2e<number | null>("__e2e_report_score");
    if (m.hit) return m.value;
    if (!REPORT_CANISTER_ID) return null;
    const a = await getActor();
    const res = await a.getReportScore(token) as any[];
    return res.length ? Number(res[0]) : null;
  },

  /** The key the report canister signs with now, or null if it hasn't been fetched yet. */
  async getPublishedKey(): Promise<AttestationKey | null> {
    const m = e2e<AttestationKey | null>("__e2e_attestation_key");
    if (m.hit) return m.value;
    if (!REPORT_CANISTER_ID) return null;
    const a = await getActor();
    const res = await a.getAttestationKey() as any[];
    return res.length ? { keyName: res[0].keyName, publicKey: Uint8Array.from(res[0].publicKey) } : null;
  },
};
