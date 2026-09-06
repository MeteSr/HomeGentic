/**
 * Cross-canister integration tests — Issue #422
 *
 * Covers flows that touch multiple canisters in a single interaction.
 * Per-canister integration tests (job.integration.test.ts, etc.) verify Candid
 * serialization and individual endpoints; these tests verify that the
 * inter-canister wiring is correct end-to-end.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * ── Identities ────────────────────────────────────────────────────────────────
 * All flows use dedicated identities via direct Actor.createActor() — never the shared
 * seed=42 service-layer agent — so no properties accumulate on the shared homeowner
 * across runs (which would eventually hit the Premium 20-property cap).
 *
 * WORKFLOW_USER seed[0]=55  principal zcku7-... — Premium granted by test-integration.sh
 *                           Flows 1 & 2: owns properties and signs jobs as "homeowner"
 * CONTRACTOR    seed[0]=99  ContractorFree — no subscription; acts as contractor signer
 * TIER_USER     seed[0]=77  principal lodek-... — Basic granted by test-integration.sh (1-property cap)
 * QUOTA_USER    seed[0]=88  principal fz27l-... — Basic granted by test-integration.sh (3-open-quote cap)
 *
 * Why direct actors everywhere:
 *   Service files cache `_actor` on first call. Creating actors directly with
 *   per-identity agents avoids the cache and keeps each flow fully isolated.
 *
 * ── Flows covered ─────────────────────────────────────────────────────────────
 * 1. DIY full workflow: WORKFLOW_USER property → job → verifyJob → getCertificationData
 * 2. Contractor dual-signature: WORKFLOW_USER property → job → invite token →
 *    CONTRACTOR signs → WORKFLOW_USER countersigns → both confirmed, job verified
 * 3. Basic-tier property registration limit: enforces 1-property cap via property → payment cross-call
 * 4. Quote open-request limit: enforces cap via quote → payment cross-call
 * 5. Property verification state machine: Unverified → PendingReview (admin promotion documented)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Actor, HttpAgent }                            from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity }                          from "@icp-sdk/core/identity";
import { idlFactory as jobIdl }      from "@/services/job";
import { idlFactory as propertyIdl } from "@/services/property";
import { idlFactory as quoteIdl }    from "@/services/quote";

// ─── Canister IDs ─────────────────────────────────────────────────────────────

const JOB_CANISTER_ID      = (process.env as any).JOB_CANISTER_ID      || "";
const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const QUOTE_CANISTER_ID    = (process.env as any).QUOTE_CANISTER_ID    || "";

const deployed = !!(JOB_CANISTER_ID && PROPERTY_CANISTER_ID && QUOTE_CANISTER_ID);

// Only run when explicitly enabled by the integration test harness.
const integrationReady = deployed && !!(process.env as any).INTEGRATION_READY;

// Seed → principal mapping (computed offline, used in test-integration.sh grants):
//   seed=55  zcku7-...  WORKFLOW_USER  Premium
//   seed=77  lodek-...  TIER_USER      Basic
//   seed=88  fz27l-...  QUOTA_USER     Basic
//   seed=99  (ContractorFree, no grant needed)

// ─── Test identity helpers ────────────────────────────────────────────────────

const REPLICA_HOST = "http://localhost:4943";

/** Rewrite v3/v4 API paths to v2 for dfx pocket-ic compatibility (see setup.ts). */
const v2Fetch: typeof globalThis.fetch = (input, init) => {
  const url =
    typeof input === "string" ? input
    : input instanceof URL    ? input.toString()
    : (input as Request).url;
  return globalThis.fetch(url.replace(/\/api\/v[34]\//, "/api/v2/"), init);
};

async function makeAgent(seed: number): Promise<HttpAgent> {
  const buf = new Uint8Array(32);
  buf[0] = seed;
  return HttpAgent.create({
    identity:           Ed25519KeyIdentity.generate(buf),
    host:               REPLICA_HOST,
    shouldFetchRootKey: true,
    fetch:              v2Fetch,
  });
}

/** Typed shorthand for canister Result unwrapping on raw actor calls. */
function unwrap<T>(result: { ok: T } | { err: any }, context = ""): T {
  if ("err" in result) {
    const key = Object.keys(result.err)[0];
    const val = (result.err as any)[key];
    throw new Error(`${context ? context + ": " : ""}${typeof val === "string" ? val : key}`);
  }
  return result.ok;
}

// ─── Shared test run prefix ───────────────────────────────────────────────────

const RUN_ID = Date.now();
function addr(label: string) { return `${RUN_ID} ${label} St, Orlando FL 32801`; }

// ─── Common Candid argument shapes (for direct actor calls) ───────────────────

// PROP_ARGS is used for direct-actor registerProperty calls (Flows 3 & 4).
// `tier` is a required Candid field in RegisterArgs — it is the canister-side
// SubscriptionTier enum, not a billing plan. `Free` is the default for an
// identity that has no subscription granted yet.
const PROP_ARGS = {
  city:         "Orlando",
  state:        "FL",
  zipCode:      "32801",
  propertyType: { SingleFamily: null },
  yearBuilt:    BigInt(1995),
  squareFeet:   BigInt(1800),
  tier:         { Basic: null },   // QUOTA/TIER_USER have Basic granted by test-integration.sh
};

// ─────────────────────────────────────────────────────────────────────────────
// Flow 1 — DIY full workflow
// WORKFLOW_USER (seed=55, Premium) registers property → creates DIY job →
// verifyJob → getCertificationData confirms the verified HVAC job.
// Uses direct actors (not the service layer) so no properties accumulate on
// the shared seed=42 homeowner identity across runs.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!integrationReady)("Flow 1: DIY full workflow", () => {
  let propId: string;
  let jobId: string;
  let workflowPropertyActor: any;
  let workflowJobActor: any;

  beforeAll(async () => {
    // zcku7-... : Premium subscription granted by test-integration.sh
    const workflowAgent = await makeAgent(55);
    workflowPropertyActor = Actor.createActor(propertyIdl as any, {
      agent: workflowAgent, canisterId: PROPERTY_CANISTER_ID,
    });
    workflowJobActor = Actor.createActor(jobIdl as any, {
      agent: workflowAgent, canisterId: JOB_CANISTER_ID,
    });

    // job.verifyJob cross-calls property.isAuthorized, so we need a real property
    const propResult = await workflowPropertyActor.registerProperty({
      ...PROP_ARGS,
      tier:    { Premium: null },
      address: addr("diy-flow"),
    });
    propId = unwrap<{ id: string }>(propResult as any, "diy-flow property").id;
  });

  it("step 1 — creates a DIY job with contractorSigned pre-set true", async () => {
    const result = await workflowJobActor.createJob(
      propId,
      "Annual HVAC filter replacement",           // title
      { HVAC: null },                             // serviceType
      "Annual HVAC filter replacement (DIY)",     // description
      [],                                          // contractorName: Opt(Text) — none for DIY
      BigInt(0),                                  // amount (cents)
      BigInt(Date.now()) * BigInt(1_000_000),     // completedDate (ns)
      [],                                          // permitNumber
      [],                                          // warrantyMonths
      true,                                        // isDiy
      [],                                          // sourceQuoteId
    );
    const job = unwrap<{
      id: string; isDiy: boolean;
      homeownerSigned: boolean; contractorSigned: boolean;
      verified: boolean;
    }>(result as any, "createJob DIY");
    jobId = job.id;
    expect(job.isDiy).toBe(true);
    expect(job.homeownerSigned).toBe(false);
    // DIY jobs auto-set contractorSigned=true on creation (main.mo:335: contractorSigned = isDiy)
    expect(job.contractorSigned).toBe(true);
    expect(job.verified).toBe(false);
  });

  it("step 2 — verifyJob sets homeownerSigned and verified in one call (DIY single-sig path)", async () => {
    const result = await workflowJobActor.verifyJob(jobId);
    const verified = unwrap<{
      homeownerSigned: boolean; verified: boolean;
    }>(result as any, "verifyJob DIY");
    expect(verified.homeownerSigned).toBe(true);
    expect(verified.verified).toBe(true);
  });

  it("step 3 — getCertificationData reflects the verified job (cross-canister state)", async () => {
    // getCertificationData returns a plain Record, not a Result
    const data: { verifiedJobCount: bigint; verifiedKeySystems: string[] } =
      await workflowJobActor.getCertificationData(propId);
    expect(Number(data.verifiedJobCount)).toBeGreaterThanOrEqual(1);
    expect(data.verifiedKeySystems).toContain("HVAC");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 2 — Contractor dual-signature workflow
// WORKFLOW_USER (seed=55) registers property → creates contractor job →
// createInviteToken → CONTRACTOR (seed=99) redeems → WORKFLOW_USER verifyJob →
// both signatures confirmed, job fully verified.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!integrationReady)("Flow 2: Contractor dual-signature workflow", () => {
  let propId: string;
  let jobId: string;
  let inviteToken: string;
  let workflowJobActor: any;
  let contractorJobActor: any;

  beforeAll(async () => {
    const workflowAgent    = await makeAgent(55);  // zcku7-... Premium
    const contractorAgent  = await makeAgent(99);  // ContractorFree

    workflowJobActor = Actor.createActor(jobIdl as any, {
      agent: workflowAgent, canisterId: JOB_CANISTER_ID,
    });
    contractorJobActor = Actor.createActor(jobIdl as any, {
      agent: contractorAgent, canisterId: JOB_CANISTER_ID,
    });

    // Register property under WORKFLOW_USER (Premium — no 20-property cap concern)
    const workflowPropertyActor = Actor.createActor(propertyIdl as any, {
      agent: workflowAgent, canisterId: PROPERTY_CANISTER_ID,
    });
    const propResult = await workflowPropertyActor.registerProperty({
      ...PROP_ARGS,
      tier:    { Premium: null },
      address: addr("dual-sig"),
    });
    propId = unwrap<{ id: string }>(propResult as any, "dual-sig property").id;
  });

  it("step 1 — WORKFLOW_USER creates a contractor job (both signatures false)", async () => {
    const result = await workflowJobActor.createJob(
      propId,
      "Pipe repair",                              // title
      { Plumbing: null },                         // serviceType
      "Pipe repair — dual-signature integration test",
      ["Pipe Masters LLC"],                        // contractorName: Opt(Text)
      BigInt(150_000),                            // amount (cents)
      BigInt(Date.now()) * BigInt(1_000_000),     // completedDate (ns)
      [],                                          // permitNumber
      [],                                          // warrantyMonths
      false,                                       // isDiy
      [],                                          // sourceQuoteId
    );
    const job = unwrap<{
      id: string; isDiy: boolean;
      homeownerSigned: boolean; contractorSigned: boolean; verified: boolean;
    }>(result as any, "createJob dual-sig");
    jobId = job.id;
    expect(job.isDiy).toBe(false);
    expect(job.homeownerSigned).toBe(false);
    expect(job.contractorSigned).toBe(false);
    expect(job.verified).toBe(false);
  });

  it("step 2 — WORKFLOW_USER creates an invite token", async () => {
    const result = await workflowJobActor.createInviteToken(jobId, addr("dual-sig"));
    inviteToken = unwrap<string>(result as any, "createInviteToken");
    expect(typeof inviteToken).toBe("string");
    expect(inviteToken.length).toBeGreaterThan(0);
  });

  it("step 3 — CONTRACTOR redeems invite token → contractorSigned: true, homeownerSigned still false", async () => {
    const result = await contractorJobActor.redeemInviteToken(inviteToken);
    const raw = unwrap<{ contractorSigned: boolean; homeownerSigned: boolean; verified: boolean }>(
      result as any, "contractor redeemInviteToken",
    );
    expect(raw.contractorSigned).toBe(true);
    expect(raw.homeownerSigned).toBe(false);
    expect(raw.verified).toBe(false);
  });

  it("step 4 — WORKFLOW_USER countersigns via verifyJob → both signatures true, job fully verified", async () => {
    const result = await workflowJobActor.verifyJob(jobId);
    const verified = unwrap<{
      homeownerSigned: boolean; contractorSigned: boolean; verified: boolean; status: string;
    }>(result as any, "verifyJob dual-sig");
    expect(verified.homeownerSigned).toBe(true);
    expect(verified.contractorSigned).toBe(true);
    expect(verified.verified).toBe(true);
  });

  it("step 5 — getCertificationData includes Plumbing as a verified key system", async () => {
    // getCertificationData returns a plain Record, not a Result
    const data: { verifiedJobCount: bigint; verifiedKeySystems: string[] } =
      await workflowJobActor.getCertificationData(propId);
    expect(Number(data.verifiedJobCount)).toBeGreaterThanOrEqual(1);
    expect(data.verifiedKeySystems).toContain("Plumbing");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 3 — Basic-tier property registration limit
// Tests that the property canister cross-calls payment to enforce tier limits.
// Basic is the lowest homeowner tier: 1 property. TIER_USER has a Basic subscription
// granted by scripts/test-integration.sh, so the second registration must fail.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!integrationReady)("Flow 3: Basic-tier property registration limit (property → payment cross-call)", () => {
  let tierPropertyActor: any;
  const registrationResults: Array<{ ok: boolean; propId?: string; errorKey?: string; errorMsg?: string }> = [];

  beforeAll(async () => {
    // lodek-...: Basic subscription granted by scripts/test-integration.sh (1-property limit)
    const tierAgent = await makeAgent(77);
    tierPropertyActor = Actor.createActor(propertyIdl as any, {
      agent:      tierAgent,
      canisterId: PROPERTY_CANISTER_ID,
    });
  });

  it("registers properties until the tier limit is hit — second registration must be rejected", async () => {
    // Basic tier = 1 property. Try 3: only the first should succeed.
    for (let i = 0; i < 3; i++) {
      const result = await tierPropertyActor.registerProperty({
        ...PROP_ARGS,
        address: addr(`tier-limit-${i}`),
      });
      if ("ok" in result) {
        registrationResults.push({ ok: true, propId: result.ok.id });
      } else {
        const key = Object.keys(result.err)[0];
        const val = (result.err as any)[key];
        registrationResults.push({
          ok: false,
          errorKey: key,
          errorMsg: typeof val === "string" ? val : key,
        });
      }
    }

    const successes = registrationResults.filter((r) => r.ok);
    const failures  = registrationResults.filter((r) => !r.ok);

    // Basic tier = 1 property: exactly one must succeed
    expect(successes.length).toBe(1);
    // The remaining two must fail
    expect(failures.length).toBe(2);
  });

  it("the rejection error communicates a tier/plan limit (key or message)", () => {
    const failures = registrationResults.filter((r) => !r.ok);
    for (const f of failures) {
      // The canister may use InvalidInput(text) or LimitReached — match on the combined signal
      const combined = `${f.errorKey} ${f.errorMsg ?? ""}`;
      expect(combined).toMatch(/limit|plan|tier/i);
    }
  });

  it("getMyProperties returns only the properties that succeeded", async () => {
    const props: any[] = await tierPropertyActor.getMyProperties();
    const successCount = registrationResults.filter((r) => r.ok).length;
    expect(props.length).toBe(successCount);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 4 — Quote open-request limit enforcement
// quote canister cross-calls payment to enforce open-request caps per tier.
// Basic tier = 3 open requests. QUOTA_USER has a Basic subscription granted by
// scripts/test-integration.sh, so the fourth request must fail.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!integrationReady)("Flow 4: Quote open-request limit enforcement (quote → payment cross-call)", () => {
  let quotePropActor: any;
  let quoteActor: any;
  let quotePropId: string;
  const requestResults: Array<{ ok: boolean; reqId?: string; errorKey?: string; errorMsg?: string }> = [];

  beforeAll(async () => {
    // fz27l-...: Basic subscription granted by scripts/test-integration.sh (3 open quotes limit)
    const quoteTierAgent = await makeAgent(88);

    quotePropActor = Actor.createActor(propertyIdl as any, {
      agent:      quoteTierAgent,
      canisterId: PROPERTY_CANISTER_ID,
    });
    quoteActor = Actor.createActor(quoteIdl as any, {
      agent:      quoteTierAgent,
      canisterId: QUOTE_CANISTER_ID,
    });

    // Register one property to use as the quote target (quote.isAuthorized checks property ownership)
    const propResult = await quotePropActor.registerProperty({
      ...PROP_ARGS,
      address: addr("quote-limit"),
    });
    quotePropId = unwrap<{ id: string }>(propResult as any, "quote-limit property registration").id;
  });

  it("submitting open quote requests hits Basic-tier limit of 3 (quote → payment cross-call)", async () => {
    // Basic tier caps at 3 open requests. Attempt 5; the 4th and 5th must fail.
    let consecutiveFailures = 0;
    for (let i = 0; i < 5 && consecutiveFailures < 2; i++) {
      const result = await quoteActor.createQuoteRequest(
        quotePropId,
        { HVAC: null },          // ServiceType variant
        `Open request ${i + 1}`, // description
        { Medium: null },        // UrgencyLevel variant
        [],                      // zipCode: Opt(Text) — none
        [],                      // minTrustScore: Opt(Nat) — none
        [],                      // minJobsCompleted: Opt(Nat) — none
        [],                      // minReviews: Opt(Nat) — none
        [],                      // maxBids: Opt(Nat) — none
      );
      if ("ok" in result) {
        requestResults.push({ ok: true, reqId: result.ok.id });
        consecutiveFailures = 0;
      } else {
        const key = Object.keys(result.err)[0];
        const val = (result.err as any)[key];
        requestResults.push({
          ok: false,
          errorKey: key,
          errorMsg: typeof val === "string" ? val : key,
        });
        consecutiveFailures++;
      }
    }

    const successes = requestResults.filter((r) => r.ok);
    const failures  = requestResults.filter((r) => !r.ok);

    // Basic tier = exactly 3 open requests
    expect(successes.length).toBe(3);
    expect(failures.length).toBeGreaterThanOrEqual(1);
  });

  it("the rejection error communicates a tier/plan limit (key or message)", () => {
    const failures = requestResults.filter((r) => !r.ok);
    for (const f of failures) {
      const combined = `${f.errorKey} ${f.errorMsg ?? ""}`;
      expect(combined).toMatch(/limit|plan|tier/i);
    }
  });

  afterAll(async () => {
    // Cancel all created open requests so they don't pollute getOpenRequestsForMe
    // in quote.integration.test.ts (contractor with no serviceZips sees ALL open requests).
    for (const r of requestResults.filter((x) => x.ok && x.reqId)) {
      try { await quoteActor.cancelQuoteRequest(r.reqId!); } catch { /* best-effort */ }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 5 — Property verification state machine
// Unverified → PendingReview (homeowner submitVerification)
// PendingReview → Basic (admin verifyProperty — documented but not automated here)
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!integrationReady)("Flow 5: Property verification state machine", () => {
  let propId: string;
  let workflowPropertyActor5: any;

  beforeAll(async () => {
    const workflowAgent = await makeAgent(55);  // zcku7-... Premium
    workflowPropertyActor5 = Actor.createActor(propertyIdl as any, {
      agent: workflowAgent, canisterId: PROPERTY_CANISTER_ID,
    });

    const propResult = await workflowPropertyActor5.registerProperty({
      ...PROP_ARGS,
      tier:    { Premium: null },
      address: addr("verify-flow"),
    });
    propId = unwrap<{ id: string }>(propResult as any, "verify-flow property").id;
  });

  it("new property starts at Unverified", async () => {
    // Re-fetch to get the canonical verificationLevel variant
    const result = await workflowPropertyActor5.getProperty(propId);
    const prop = unwrap<{ verificationLevel: object }>(result as any, "getProperty");
    expect("Unverified" in prop.verificationLevel).toBe(true);
  });

  it("submitVerification transitions state to PendingReview", async () => {
    // submitVerification(propertyId, method, docHash, notes: Opt(Text))
    const result = await workflowPropertyActor5.submitVerification(
      propId,
      "UtilityBill",
      "a".repeat(64),  // SHA-256 hex placeholder
      [],              // notes: Opt(Text)
    );
    const updated = unwrap<{ verificationLevel: object }>(result as any, "submitVerification");
    expect("PendingReview" in updated.verificationLevel).toBe(true);
  });

  it("re-submitting while PendingReview is idempotent (stays PendingReview)", async () => {
    const result = await workflowPropertyActor5.submitVerification(
      propId,
      "TitleDeed",
      "b".repeat(64),
      [],
    );
    const updated = unwrap<{ verificationLevel: object }>(result as any, "submitVerification 2");
    expect("PendingReview" in updated.verificationLevel).toBe(true);
  });

  /**
   * Admin promotion (PendingReview → Basic) requires the deployer identity
   * and is intentionally not automated in the integration test suite.
   *
   * Manual verification:
   *   dfx canister call property verifyProperty \
   *     "(\"<property-id>\", variant { Basic }, opt \"manual review\")"
   *
   * Then confirm the property returns verificationLevel: "Basic".
   * See docs/MANUAL_TESTS.md for the full runbook.
   */
  it.todo("admin promotes PendingReview → Basic (requires dfx deployer identity — see docs/MANUAL_TESTS.md)");
});
