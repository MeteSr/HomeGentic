/**
 * Canister-backed Score Certificate Service (4.2.1)
 *
 * Issues tamper-proof score certificates stored on the ICP report canister.
 * Each cert gets a random UUID id so a lender can independently verify
 * it by querying the canister — unlike the original client-side base64
 * token which could be forged.
 *
 * The canister builds the stored payload itself (v2): property facts,
 * verification level and verified-job facts are read on-chain; the score we
 * send is kept only as an escaped "selfReported" string. verifyCert maps the
 * v2 payload back to a CertPayload whose `address` comes from the chain and
 * whose `certified` flag also requires the on-chain meetsStructural.
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
  /** base64url-encoded JSON: { ...CertPayload, certId } */
  token:  string;
}

/** On-chain facts recorded by the report canister (v2 certificates). */
export interface CertOnChainFacts {
  propertyId:         string;
  verificationLevel:  string;
  verifiedJobCount:   number;
  verifiedKeySystems: string[];
  meetsStructural:    boolean;
}

export type VerifiedCert = CertPayload & { onChain?: CertOnChainFacts };

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map a stored payload (v2 canister-built, or legacy caller JSON) to a VerifiedCert. */
export function parseStoredCert(json: string): VerifiedCert | null {
  let outer: any;
  try { outer = JSON.parse(json); } catch { return null; }
  if (!outer || typeof outer !== "object") return null;
  if (outer.v !== 2) return outer as CertPayload;   // legacy (pre-v2) certificate
  let self: any = {};
  try { self = JSON.parse(outer.selfReported ?? "{}") ?? {}; } catch { self = {}; }
  const meetsStructural = outer.meetsStructural === true;
  return {
    address:     String(outer.address ?? ""),
    score:       Number(self.score ?? 0),
    grade:       String(self.grade ?? ""),
    certified:   self.certified === true && meetsStructural,
    generatedAt: Number(outer.issuedAt ?? 0),
    planTier:    self.planTier,
    breakdown:   self.breakdown,
    onChain: {
      propertyId:         String(outer.propertyId ?? ""),
      verificationLevel:  String(outer.verificationLevel ?? ""),
      verifiedJobCount:   Number(outer.verifiedJobCount ?? 0),
      verifiedKeySystems: Array.isArray(outer.verifiedKeySystems) ? outer.verifiedKeySystems.map(String) : [],
      meetsStructural,
    },
  };
}

function buildToken(payload: CertPayload, certId: string): string {
  return btoa(JSON.stringify({ ...payload, certId })).replace(/=/g, "");
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
     * Returns { certId, token } — token is safe to embed in a URL.
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
      return { certId, token: buildToken(payload, certId) };
    },

    /**
     * Verify a certId against the canister (or in-memory store in mock mode).
     * Returns the stored CertPayload, or null if the certId is unknown.
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
