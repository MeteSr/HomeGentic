/**
 * AI Proxy Service
 *
 * Canister (pure computation / stubs): getPriceBenchmark, instantForecast,
 *   checkReport, lookupYearBuilt, requestReport.
 * Voice Worker (keyed third-party APIs, moved off-chain): importPermits,
 *   lookupPropertyDetails (ATTOM), sendInviteEmail, sendBrokerLead (Resend).
 *
 * The 6 non-deterministic Claude AI endpoints remain in the Node.js relay.
 */

import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";
import { idlFactory } from "@/declarations/ai_proxy";
import { voiceAgentFetch } from "./voiceAgentHeaders";
export { idlFactory };

// M-6: the ATTOM / OpenPermit / Resend keys live only in the voice Worker
// (never in canister memory), so those calls go to the Worker with the
// caller's x-agent-session; the Worker enforces per-user quotas.
const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";

async function workerPost(path: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  const resp = await voiceAgentFetch(`${VOICE_AGENT_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await resp.json(); } catch { /* non-JSON error page */ }
  return { ok: resp.ok, data };
}

const AI_PROXY_CANISTER_ID = (process.env as any).AI_PROXY_CANISTER_ID || "";

// ─── Actor ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _actor: any | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getActor(): Promise<any | null> {
  if (_actor) return _actor;
  const ag = await getAgent();
  _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: AI_PROXY_CANISTER_ID });
  return _actor;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const aiProxyService = {

  /** Returns price benchmark JSON or empty string on error/missing canister. */
  async getPriceBenchmark(service: string, zip: string): Promise<string> {
    const actor = await getActor();
    if (!actor) return "";
    try {
      const result = await actor.getPriceBenchmark(service, zip);
      if ("ok" in result) return result.ok as string;
      return "";
    } catch {
      return "";
    }
  },

  /** Returns forecast JSON or empty string on error. */
  async instantForecast(
    address: string,
    yearBuilt: number,
    state?: string,
    overridesJson = "{}",
  ): Promise<string> {
    const actor = await getActor();
    if (!actor) return "";
    try {
      const result = await actor.instantForecast(
        address,
        BigInt(yearBuilt),
        state ? [state] : [],
        overridesJson,
      );
      if ("ok" in result) return result.ok as string;
      return "";
    } catch {
      return "";
    }
  },

  /** Returns { source, data } JSON or empty string on error. */
  async importPermits(
    address: string,
    city:    string,
    state:   string,
    zip:     string,
  ): Promise<string> {
    try {
      const { ok, data } = await workerPost("/api/permits/import", { address, city, state, zip });
      return ok && data ? JSON.stringify(data) : "";
    } catch {
      return "";
    }
  },

  /**
   * @deprecated Arbitrary-recipient email is no longer available: the
   * ai_proxy canister no longer sends email and the Worker only sends
   * templated mail to server-derived recipients. Use sendBrokerLead /
   * sendInviteEmail.
   */
  async sendEmail(
    _to: string, _subject: string, _html: string,
    _text?: string, _replyTo?: string, _from?: string,
  ): Promise<{ id?: string; error?: string }> {
    return { error: "sendEmail is no longer supported; use a templated email route" };
  },

  /** Local-broker consultation request, sent by the Worker to its fixed broker inbox. */
  async sendBrokerLead(params: {
    name: string; email: string; phone?: string; propertyAddress?: string;
  }): Promise<{ sent?: boolean; error?: string }> {
    try {
      const { ok, data } = await workerPost("/api/email/broker-lead", params);
      return ok ? { sent: true } : { error: data?.error ?? "Email failed" };
    } catch (e: any) {
      return { error: e?.message ?? "Unknown error" };
    }
  },

  /**
   * Email the co-sign link to a contractor. Only the invite token (taken from
   * verifyUrl) and recipient are sent; the Worker builds the message from the
   * job canister's invite record, so the other params are ignored.
   */
  async sendInviteEmail(params: {
    to: string;
    contractorName?: string;
    propertyAddress: string;
    serviceType: string;
    amount?: number;
    verifyUrl: string;
  }): Promise<{ sent?: boolean; error?: string }> {
    const token = params.verifyUrl.split("/verify/")[1]?.split(/[?#/]/)[0] ?? "";
    if (!token) return { error: "invalid verify link" };
    try {
      const { ok, data } = await workerPost("/api/email/contractor-invite", { token, to: params.to });
      return ok ? { sent: true } : { error: data?.error ?? "Email failed" };
    } catch (e: any) {
      return { error: e?.message ?? "Unknown error" };
    }
  },

  async checkReport(address: string): Promise<{ found: boolean; address: string }> {
    const actor = await getActor();
    if (!actor) return { found: false, address };
    try {
      const raw: string = await actor.checkReport(address);
      return JSON.parse(raw);
    } catch {
      return { found: false, address };
    }
  },

  async lookupYearBuilt(address: string): Promise<{ address: string; yearBuilt: number | null }> {
    const actor = await getActor();
    if (!actor) return { address, yearBuilt: null };
    try {
      const raw: string = await actor.lookupYearBuilt(address);
      return JSON.parse(raw);
    } catch {
      return { address, yearBuilt: null };
    }
  },

  /**
   * Fetch property details from ATTOM Data API (via the voice Worker, which
   * holds the key). Returns null fields when the lookup isn't configured, the
   * quota is used up, or the address is not found — callers should treat all fields as optional and allow user override.
   */
  async lookupPropertyDetails(
    address: string,
    city:    string,
    state:   string,
    zip:     string,
  ): Promise<{
    yearBuilt:    number | null;
    grossSqFt:    number | null;
    bedrooms:     number | null;
    bathrooms:    number | null;
    lotSizeAcres: number | null;
    propertyType: string | null;
  }> {
    const empty = { yearBuilt: null, grossSqFt: null, bedrooms: null, bathrooms: null, lotSizeAcres: null, propertyType: null };
    try {
      const { ok, data } = await workerPost("/api/property/details", { address, city, state, zip });
      if (!ok || !data) return empty;
      const prop = data?.property?.[0];
      if (!prop) return empty;

      const yearBuilt    = prop?.building?.summary?.yearbuilt   ?? prop?.summary?.yearbuilt   ?? null;
      const grossSqFt    = prop?.building?.size?.universalsize  ?? prop?.building?.size?.grosssize ?? null;
      const bedrooms     = prop?.building?.rooms?.beds          ?? null;
      const bathrooms    = prop?.building?.rooms?.bathstotal    ?? null;
      const lotSizeAcres = prop?.lot?.lotsize1                  ?? null;
      const rawType      = prop?.summary?.proptype              ?? null;

      // Map ATTOM proptype codes to our PropertyType values
      const typeMap: Record<string, string> = {
        SFR: "SingleFamily", "SINGLE FAMILY": "SingleFamily",
        CONDO: "Condo", CONDOMINIUM: "Condo",
        TOWNHOUSE: "Townhouse", TOWNHOME: "Townhouse",
        MFR: "MultiFamily", "MULTI FAMILY": "MultiFamily",
      };
      const propertyType = rawType ? (typeMap[String(rawType).toUpperCase()] ?? null) : null;

      return {
        yearBuilt:    typeof yearBuilt    === "number" ? yearBuilt    : null,
        grossSqFt:    typeof grossSqFt    === "number" ? grossSqFt    : null,
        bedrooms:     typeof bedrooms     === "number" ? bedrooms     : null,
        bathrooms:    typeof bathrooms    === "number" ? bathrooms    : null,
        lotSizeAcres: typeof lotSizeAcres === "number" ? lotSizeAcres : null,
        propertyType,
      };
    } catch {
      return empty;
    }
  },

  async requestReport(address: string, buyerEmail: string): Promise<{ queued: boolean }> {
    const actor = await getActor();
    if (!actor) return { queued: false };
    try {
      await actor.requestReport(address, buyerEmail);
      return { queued: true };
    } catch {
      return { queued: false };
    }
  },
};
