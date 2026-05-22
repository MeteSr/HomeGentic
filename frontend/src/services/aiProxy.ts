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
