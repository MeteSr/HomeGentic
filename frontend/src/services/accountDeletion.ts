/**
 * Account deletion — removes the signed-in user's data from every canister.
 *
 * Order matters:
 *   1. Stop Stripe renewals first (the Worker authenticates the call with an
 *      agent session that the auth canister issues, so it must run while the
 *      profile still exists).
 *   2. Records that hang off a property (jobs, photos, bills, …), then the
 *      properties themselves, then the auth profile last.
 * Each canister's `deleteMyData()` is idempotent, so a failed run can simply be
 * retried; we stop at the first failure so the profile (and the retry path)
 * survives until everything else is gone.
 *
 * Kept on purpose: payment, fee, referral and audit records (billing, tax and
 * fraud records), and jobs a contractor logged on someone else's home.
 */
import { lazyActor } from "./lazyActor";
import { voiceAgentFetch } from "./voiceAgentHeaders";
import { idlFactory as jobIdl }         from "@homegentic/shared/declarations/job";
import { idlFactory as photoIdl }       from "@homegentic/shared/declarations/photo";
import { idlFactory as billsIdl }       from "@homegentic/shared/declarations/bills";
import { idlFactory as recurringIdl }   from "@homegentic/shared/declarations/recurring";
import { idlFactory as maintenanceIdl } from "@homegentic/shared/declarations/maintenance";
import { idlFactory as sensorIdl }      from "@homegentic/shared/declarations/sensor";
import { idlFactory as reportIdl }      from "@homegentic/shared/declarations/report";
import { idlFactory as quoteIdl }       from "@homegentic/shared/declarations/quote";
import { idlFactory as listingIdl }     from "@homegentic/shared/declarations/listing";
import { idlFactory as contractorIdl }  from "@homegentic/shared/declarations/contractor";
import { idlFactory as agentIdl }       from "@homegentic/shared/declarations/agent";
import { idlFactory as propertyIdl }    from "@homegentic/shared/declarations/property";
import { idlFactory as authIdl }        from "@homegentic/shared/declarations/auth";
import { neighbourhoodIdlFactory as marketIdl } from "./market";

const env = process.env as any;
const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";

/** Deletion order: dependents first, property next to last, auth last. */
const STEPS = [
  { label: "jobs",                 idl: jobIdl,         id: env.JOB_CANISTER_ID },
  { label: "photos",               idl: photoIdl,       id: env.PHOTO_CANISTER_ID },
  { label: "bills",                idl: billsIdl,       id: env.BILLS_CANISTER_ID },
  { label: "recurring services",   idl: recurringIdl,   id: env.RECURRING_CANISTER_ID },
  { label: "maintenance schedule", idl: maintenanceIdl, id: env.MAINTENANCE_CANISTER_ID },
  { label: "smart-home devices",   idl: sensorIdl,      id: env.SENSOR_CANISTER_ID },
  { label: "reports",              idl: reportIdl,      id: env.REPORT_CANISTER_ID },
  { label: "quote requests",       idl: quoteIdl,       id: env.QUOTE_CANISTER_ID },
  { label: "listings",             idl: listingIdl,     id: env.LISTING_CANISTER_ID },
  { label: "contractor profile",   idl: contractorIdl,  id: env.CONTRACTOR_CANISTER_ID },
  { label: "agent profile",        idl: agentIdl,       id: env.AGENT_CANISTER_ID },
  { label: "neighborhood score",   idl: marketIdl,      id: env.MARKET_CANISTER_ID },
  { label: "properties",           idl: propertyIdl,    id: env.PROPERTY_CANISTER_ID },
  { label: "profile",              idl: authIdl,        id: env.AUTH_CANISTER_ID },
].map((s) => ({ ...s, actor: lazyActor(s.idl, s.id || "") }));

export type DeletionStep = (typeof STEPS)[number]["label"] | "subscription";

function errText(err: any): string {
  const key = Object.keys(err ?? {})[0] ?? "error";
  const detail = err?.[key];
  return typeof detail === "string" ? detail : key;
}

export const accountDeletionService = {
  /**
   * Deletes the caller's account. Throws (naming the step) on the first
   * failure; nothing after it has run, so calling again resumes safely.
   */
  async deleteMyAccount(onStep?: (step: DeletionStep) => void): Promise<void> {
    if (env.PAYMENT_CANISTER_ID) {
      onStep?.("subscription");
      const resp = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/stripe/cancel-subscription`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(`Couldn't stop your subscription: ${data.error ?? resp.status}`);
      }
    }
    for (const step of STEPS) {
      if (!step.id) continue;                 // canister not deployed (mock/dev)
      onStep?.(step.label);
      const a = await step.actor();
      const result = await a.deleteMyData();
      if ("err" in result) throw new Error(`Couldn't delete your ${step.label}: ${errText(result.err)}`);
    }
  },
};
