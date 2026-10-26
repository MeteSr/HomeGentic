/**
 * Shared helpers for the integration suites.
 *
 * The canisters check who is calling: jobs, quotes, listings, reports,
 * maintenance and recurring services need a property the caller really owns,
 * a homeowner can't bid on or countersign their own work, and so on. These
 * helpers register real records and run calls as other identities so the
 * suites exercise those rules instead of working around them.
 */

import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import type { Identity } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { setAgentForTesting } from "@/services/actor";
import { propertyService } from "@/services/property";
import { contractorService } from "@/services/contractor";
import { testIdentity } from "./setup";
import { idlFactory as feeIdl } from "@homegentic/shared/declarations/fee";

export const REPLICA_HOST = "http://localhost:4943";

/** dfx's PocketIC replica serves /api/v2 only (see setup.ts). */
export const v2Fetch: typeof globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input
    : input instanceof URL ? input.toString()
    : (input as Request).url;
  return globalThis.fetch(url.replace(/\/api\/v[34]\//, "/api/v2/"), init);
};

export function agentFor(identity: Identity): Promise<HttpAgent> {
  return HttpAgent.create({ identity, host: REPLICA_HOST, shouldFetchRootKey: true, fetch: v2Fetch });
}

/** A new random identity, so per-principal limits never carry over between runs. */
export function freshIdentity(): Ed25519KeyIdentity {
  return Ed25519KeyIdentity.generate();
}

/** Identity for a fixed seed (seed[0] = n), as test-integration.sh derives them. */
export function seededIdentity(seed: number): Ed25519KeyIdentity {
  const buf = new Uint8Array(32);
  buf[0] = seed;
  return Ed25519KeyIdentity.generate(buf);
}

/**
 * Admin on the property and contractor canisters (granted by
 * scripts/test-integration.sh), for steps a real admin performs: verifying a
 * property or a contractor profile. The default test identity stays a plain
 * user, so the suites still see the user-facing checks.
 */
export const ADMIN_SEED = 160;

type Resettable = { reset(): void };

/**
 * Runs `fn` with the service layer signed in as `identity`, then switches
 * back to the default test identity. `services` are the singletons `fn` uses;
 * they cache an actor bound to the agent, so they are reset both ways.
 */
export async function asIdentity<T>(identity: Identity, services: Resettable[], fn: () => Promise<T>): Promise<T> {
  setAgentForTesting(await agentFor(identity));
  services.forEach((s) => s.reset());
  try {
    return await fn();
  } finally {
    setAgentForTesting(await agentFor(testIdentity));
    services.forEach((s) => s.reset());
  }
}

let propertyCount = 0;

/** Registers a property owned by the current service identity; returns its id. */
export async function registerTestProperty(label: string): Promise<string> {
  propertyCount += 1;
  const prop = await propertyService.registerProperty({
    address:      `${Date.now()}-${propertyCount} ${label} St`,
    city:         "Austin",
    state:        "TX",
    zipCode:      "78701",
    propertyType: "SingleFamily",
    yearBuilt:    2000,
    squareFeet:   1800,
    tier:         "Free",
  });
  return prop.id;
}

/** Registers a contractor profile for `identity` (HVAC and Plumbing) and
 *  saves a test card for the referral fee, so it can bid without ContractorPro. */
export async function registerContractor(identity: Identity, name = "Integration Test Contractor"): Promise<void> {
  await asIdentity(identity, [contractorService], async () => {
    await contractorService.register({
      name,
      specialties: ["HVAC", "Plumbing"],
      email:       "integration-contractor@example.com",
      phone:       "+15125550100",
    });
  });
  await saveTestReferralCard(identity);
}

const FEE_CANISTER_ID = (process.env as any).FEE_CANISTER_ID || "";

/** Saves a referral-fee card for `identity`, as the voice Worker does after
 *  Stripe Checkout. CI makes the test identity a referral relay on `fee`. */
export async function saveTestReferralCard(identity: Identity): Promise<void> {
  if (!FEE_CANISTER_ID) return;
  const fee: any = Actor.createActor(feeIdl, { agent: await agentFor(testIdentity), canisterId: FEE_CANISTER_ID });
  const r = await fee.relaySetReferralCard(identity.getPrincipal(), {
    customerId: "cus_integration", paymentMethodId: "pm_integration", brand: "visa", last4: "4242",
    agreedAt: BigInt(Date.now()) * 1_000_000n, termsVersion: "2026-10-26",
  });
  if ("err" in r) throw new Error(`fee.relaySetReferralCard: ${JSON.stringify(r.err)}`);
}
