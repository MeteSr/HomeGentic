/**
 * Canister-backed Score Certificate Service (4.2.1)
 *
 * Issues tamper-proof score certificates stored on the ICP report canister.
 * Each cert gets a unique CERT-N id so a lender can independently verify
 * the score by querying the canister — unlike the original client-side
 * base64 token which could be forged.
 *
 * Mock path (no REPORT_CANISTER_ID): in-memory store; works in dev + tests.
 * Canister path: calls issueCert / verifyCert on the report canister.
 */

import type { CertPayload } from "@/services/scoreService";

const REPORT_CANISTER_ID = (import.meta as any).env?.VITE_CANISTER_ID_REPORT as string | undefined;

// ─── IDL (subset — only the cert methods) ────────────────────────────────────

const certIdlFactory = ({ IDL }: any) =>
  IDL.Service({
    issueCert:  IDL.Func([IDL.Text, IDL.Text], [IDL.Text], []),
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildToken(payload: CertPayload, certId: string): string {
  return btoa(JSON.stringify({ ...payload, certId })).replace(/=/g, "");
}

// ─── Service factory ─────────────────────────────────────────────────────────

function createCertService() {
  let counter = 0;
  const store = new Map<string, CertPayload>();

  return {
    /** Reset mock store — used in tests and dev hot-reload. */
    reset() {
      counter = 0;
      store.clear();
    },

    /**
     * Issue a canister-backed certificate for a property's current score.
     * Returns { certId, token } — token is safe to embed in a URL.
     */
    async issueCert(propertyId: string, payload: CertPayload): Promise<IssuedCert> {
      if (import.meta.env.DEV && !REPORT_CANISTER_ID) {
        counter++;
        const certId = `CERT-${counter}`;
        store.set(certId, payload);
        return { certId, token: buildToken(payload, certId) };
      }
      const a      = await getActor();
      const certId = await (a as any).issueCert(propertyId, JSON.stringify(payload)) as string;
      return { certId, token: buildToken(payload, certId) };
    },

    /**
     * Verify a certId against the canister (or in-memory store in mock mode).
     * Returns the stored CertPayload, or null if the certId is unknown.
     */
    async verifyCert(certId: string): Promise<CertPayload | null> {
      if (!certId) return null;

      if (import.meta.env.DEV && !REPORT_CANISTER_ID) {
        return store.get(certId) ?? null;
      }
      const a      = await getActor();
      const result = await (a as any).verifyCert(certId) as [string] | [];
      if (result.length === 0) return null;
      try {
        return JSON.parse(result[0]) as CertPayload;
      } catch {
        return null;
      }
    },
  };
}

export const certService = createCertService();
