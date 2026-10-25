/**
 * Canister-backed Score Certificate Service (4.2.1)
 *
 * Issues score certificates stored on, and signed by, the ICP report canister.
 * Each cert gets a random UUID id so a lender can independently verify
 * it by querying the canister — unlike the original client-side base64
 * token which could be forged.
 *
 * The canister builds the stored payload itself (v3, R2): property facts,
 * verification level, verified-job facts AND the score are read on-chain (the
 * score from market.computePropertyScore). Nothing the browser sends is
 * stored. verifyCert parses v3, and still reads v2 (score only under an
 * escaped "selfReported" string) and legacy certificates, flagging their
 * score as self-reported.
 *
 * Mock path (no REPORT_CANISTER_ID): in-memory store; works in dev + tests.
 * Canister path: calls issueCert / verifyCert on the report canister.
 */

import type { CertPayload } from "@/services/scoreService";

const REPORT_CANISTER_ID = (import.meta as any).env?.VITE_CANISTER_ID_REPORT as string | undefined;

// ─── IDL (subset — only the cert methods) ────────────────────────────────────

const certIdlFactory = ({ IDL }: any) =>
  IDL.Service({
    issueCert:  IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({
        ok:  IDL.Text,
        err: IDL.Variant({
          NotFound: IDL.Null, Expired: IDL.Null, Revoked: IDL.Null, NotAuthorized: IDL.Null,
          InvalidInput: IDL.Text, UnverifiedProperty: IDL.Null,
        }),
      })],
      [],
    ),
    verifyCert: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
  });

async function getActor() {
  const { getAgent } = await import("@/services/actor");
  const { Actor }    = await import("@icp-sdk/core/agent");
  const agent        = await getAgent();
  return Actor.createActor(certIdlFactory, { agent, canisterId: REPORT_CANISTER_ID! });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IssuedCert {
  certId: string;
  /** Goes in the share URL (/cert/:token). Since R2 it is the certId itself:
   *  the page reads everything it shows from verifyCert, not from the link. */
  token:  string;
}

/** On-chain facts recorded by the report canister (v2+ certificates). */
export interface CertOnChainFacts {
  propertyId:         string;
  city:               string;
  state:              string;
  zipCode:            string;
  verificationLevel:  string;
  verifiedJobCount:   number;
  verifiedKeySystems: string[];
  meetsStructural:    boolean;
}

/**
 * What verifyCert returns.
 *  - scoreSource "onChain":      v3 — the score was computed by the market
 *    canister from on-chain job data when the certificate was issued.
 *  - scoreSource "selfReported": v2 and legacy certificates — the score was
 *    sent by the homeowner's browser. Show it as secondary / unverified.
 * score is null when no on-chain score could be computed (no job history).
 */
export interface VerifiedCert {
  address:     string;
  score:       number | null;
  scoreSource: "onChain" | "selfReported";
  certified:   boolean;
  generatedAt: number;   // ms
  onChain?:    CertOnChainFacts;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The certificate id carried by a /cert/:token link: the token itself (R2
 * links), or the certId inside a legacy base64 JSON token. Nothing else in a
 * legacy token is used. Returns null when the link names no certificate.
 */
export function certIdFromToken(token: string | undefined): string | null {
  if (!token) return null;
  if (UUID_RE.test(token)) return token;
  try {
    const padded = token + "=".repeat((4 - token.length % 4) % 4);
    const decoded = JSON.parse(atob(padded));
    const id = decoded && typeof decoded === "object" ? decoded.certId : undefined;
    return typeof id === "string" && id.length > 0 && id.length <= 100 ? id : null;
  } catch {
    return null;
  }
}

function onChainFacts(outer: any): CertOnChainFacts {
  return {
    propertyId:         String(outer.propertyId ?? ""),
    city:               String(outer.city ?? ""),
    state:              String(outer.state ?? ""),
    zipCode:            String(outer.zipCode ?? ""),
    verificationLevel:  String(outer.verificationLevel ?? ""),
    verifiedJobCount:   Number(outer.verifiedJobCount ?? 0),
    verifiedKeySystems: Array.isArray(outer.verifiedKeySystems) ? outer.verifiedKeySystems.map(String) : [],
    meetsStructural:    outer.meetsStructural === true,
  };
}

/** Map a stored payload (v3 / v2 canister-built, or legacy caller JSON) to a VerifiedCert. */
export function parseStoredCert(json: string): VerifiedCert | null {
  let outer: any;
  try { outer = JSON.parse(json); } catch { return null; }
  if (!outer || typeof outer !== "object") return null;

  if (outer.v === 3) {
    const facts = onChainFacts(outer);
    const score = typeof outer.score === "number" ? outer.score : null;
    return {
      address:     String(outer.address ?? ""),
      score,
      scoreSource: "onChain",
      // Recomputed from the on-chain fields; the stored flag is the same rule.
      certified:   outer.certified === true && score !== null && score >= 88 && facts.meetsStructural,
      generatedAt: Number(outer.issuedAt ?? 0),
      onChain:     facts,
    };
  }

  if (outer.v === 2) {
    let self: any = {};
    try { self = JSON.parse(outer.selfReported ?? "{}") ?? {}; } catch { self = {}; }
    const facts = onChainFacts(outer);
    const selfScore = Number(self.score);
    return {
      address:     String(outer.address ?? ""),
      score:       Number.isFinite(selfScore) ? selfScore : null,
      scoreSource: "selfReported",
      certified:   self.certified === true && facts.meetsStructural,
      generatedAt: Number(outer.issuedAt ?? 0),
      onChain:     facts,
    };
  }

  // Legacy (pre-v2) certificate: the whole payload came from the caller.
  const legacyScore = Number(outer.score);
  return {
    address:     String(outer.address ?? ""),
    score:       Number.isFinite(legacyScore) ? legacyScore : null,
    scoreSource: "selfReported",
    certified:   outer.certified === true,
    generatedAt: Number(outer.generatedAt ?? 0),
  };
}

// ─── Service factory ─────────────────────────────────────────────────────────

function createCertService() {
  const store = new Map<string, CertPayload>();

  return {
    /** Reset mock store — used in tests and dev hot-reload. */
    reset() {
      store.clear();
    },

    /**
     * Issue a canister-backed certificate for a property's current score.
     * The canister computes the score itself (market.computePropertyScore);
     * `payload` is still sent for Candid compatibility but is not stored.
     * Returns { certId, token } — token (= certId) is safe to embed in a URL.
     */
    async issueCert(propertyId: string, payload: CertPayload): Promise<IssuedCert> {
      const a      = await getActor();
      const result = await (a as any).issueCert(propertyId, JSON.stringify(payload)) as
        { ok: string } | { err: Record<string, unknown> };
      if ("err" in result) {
        const key = Object.keys(result.err)[0];
        const val = result.err[key];
        throw new Error(typeof val === "string" ? val : key);
      }
      const certId = result.ok;
      return { certId, token: certId };
    },

    /**
     * Verify a certId against the canister (or in-memory store in mock mode).
     * Returns the stored certificate, or null if the certId is unknown.
     */
    async verifyCert(certId: string): Promise<VerifiedCert | null> {
      if (!certId) return null;

      const a      = await getActor();
      const result = await (a as any).verifyCert(certId) as [string] | [];
      if (result.length === 0) return null;
      return parseStoredCert(result[0]);
    },
  };
}

export const certService = createCertService();
