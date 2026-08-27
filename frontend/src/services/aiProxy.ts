/**
 * AI Proxy Canister Service
 *
 * Replaces relay fetch calls for deterministic endpoints that moved on-chain:
 *   getPriceBenchmark, instantForecast, importPermits,
 *   sendEmail, sendInviteEmail, emailUsage,
 *   checkReport, lookupYearBuilt, requestReport, health
 *
 * The 6 non-deterministic Claude AI endpoints remain in the Node.js relay.
 */

import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";
import { idlFactory } from "@/declarations/ai_proxy";
export { idlFactory };

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

  /** Returns { source, data } JSON or empty string on error/missing canister. */
  async importPermits(
    address: string,
    city:    string,
    state:   string,
    zip:     string,
  ): Promise<string> {
    const actor = await getActor();
    if (!actor) return "";
    try {
      const result = await actor.importPermits(address, city, state, zip);
      if ("ok" in result) return result.ok as string;
      return "";
    } catch {
      return "";
    }
  },

  async sendEmail(
    to: string, subject: string, html: string,
    text?: string, replyTo?: string, from?: string,
  ): Promise<{ id?: string; error?: string }> {
    const actor = await getActor();
    if (!actor) return { error: "ai_proxy canister not configured" };
    try {
      const result = await actor.sendEmail(
        to, subject, html,
        text     ? [text]    : [],
        replyTo  ? [replyTo] : [],
        from     ? [from]    : [],
      );
      if ("ok" in result) {
        try { return JSON.parse(result.ok); } catch { return { id: "sent" }; }
      }
      return { error: String(result.err) };
    } catch (e: any) {
      return { error: e?.message ?? "Unknown error" };
    }
  },

  async sendInviteEmail(params: {
    to: string;
    contractorName?: string;
    propertyAddress: string;
    serviceType: string;
    amount?: number;
    verifyUrl: string;
  }): Promise<{ sent?: boolean; error?: string }> {
    const actor = await getActor();
    if (!actor) return { error: "ai_proxy canister not configured" };
    try {
      const result = await actor.sendInviteEmail(
        params.to,
        params.contractorName ? [params.contractorName] : [],
        params.propertyAddress,
        params.serviceType,
        params.amount != null ? [BigInt(Math.round(params.amount))] : [],
        params.verifyUrl,
      );
      if ("ok" in result) return { sent: true };
      return { error: String(result.err) };
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
   * Fetch property details from ATTOM Data API (via ai_proxy canister HTTP outcall).
   * Returns null fields when the canister key is not configured or the address is
   * not found — callers should treat all fields as optional and allow user override.
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
    const actor = await getActor();
    if (!actor) return empty;
    try {
      const result = await actor.lookupPropertyDetails(address, city, state, zip);
      if (!("ok" in result)) return empty;
      const data = JSON.parse(result.ok as string);
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
