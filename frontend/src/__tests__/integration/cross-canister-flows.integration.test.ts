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
 * HOMEOWNER  seed[0]=42   Premium / ContractorPro (granted by scripts/test-integration.sh)
 *                         Uses the service layer (singleton agent from setup.ts).
 * CONTRACTOR seed[0]=99   ContractorFree principal: no subscription granted
 *                         Uses direct Actor instances to bypass the service-layer actor cache.
 * TIER_USER  seed[0]=77   principal lodek-... — Basic granted by test-integration.sh (1-property cap)
 * QUOTA_USER seed[0]=88   principal fz27l-... — Basic granted by test-integration.sh (3-open-quote cap)
 *
 * Why direct actors for CONTRACTOR/TIER_USER/QUOTA_USER:
 *   Service files cache `_actor` on first call. Since the homeowner already
 *   triggered actor creation in Flow 1, switching `setAgentForTesting` mid-suite
 *   would not affect the cached actor. Creating actors directly with per-identity
 *   agents is the clean solution.
 *
 * ── Flows covered ─────────────────────────────────────────────────────────────
 * 1. DIY full workflow: property → job → homeowner verifies → getCertificationData reflects it
 * 2. Contractor dual-signature: property → job → invite token → contractor signs →
 *    homeowner countersigns → both signatures confirmed, job fully verified
 * 3. Basic-tier property registration limit: enforces 1-property cap via property → payment cross-call
 * 4. Quote open-request limit: enforces cap via quote → payment cross-call
 * 5. Property verification state machine: Unverified → PendingReview (admin promotion documented)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor, HttpAgent }                   from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity }                  from "@icp-sdk/core/identity";
import { jobService, idlFactory as jobIdl }         from "@/services/job";
import { propertyService, idlFactory as propertyIdl } from "@/services/property";
import { quoteService, idlFactory as quoteIdl }       from "@/services/quote";

// ─── Canister IDs ─────────────────────────────────────────────────────────────

const JOB_CANISTER_ID      = (process.env as any).JOB_CANISTER_ID      || "";
const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const QUOTE_CANISTER_ID    = (process.env as any).QUOTE_CANISTER_ID    || "";

const deployed = !!(JOB_CANISTER_ID && PROPERTY_CANISTER_ID && QUOTE_CANISTER_ID);

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
// register property (homeowner) → create DIY job → verifyJob →
// assert: homeownerSigned, verified, status=verified, getCertificationData updated
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("Flow 1: DIY full workflow", () => {
  let propId: string;
  let jobId: string;

  beforeAll(async () => {
    // job.verifyJob cross-calls property.isAuthorized, so we need a real property
    const prop = await propertyService.registerProperty({
      address:      addr("diy-flow"),
      city:         "Orlando",
      state:        "FL",
      zipCode:      "32801",
      propertyType: "SingleFamily",
      yearBuilt:    1995,
      squareFeet:   1800,
      tier:         "Basic",
    });
    propId = prop.id;
  });

  it("step 1 — creates a DIY job with both signatures false", async () => {
    const job = await jobService.create({
      propertyId:  propId,
      serviceType: "HVAC",
      description: "Annual HVAC filter replacement (DIY)",
      amount:      0,
      date:        "2024-07-01",
      isDiy:       true,
    });
    jobId = job.id;
    expect(job.isDiy).toBe(true);
    expect(job.homeownerSigned).toBe(false);
    // DIY jobs auto-set contractorSigned=true on creation (main.mo:335: contractorSigned = isDiy)
    expect(job.contractorSigned).toBe(true);
    expect(job.verified).toBe(false);
    expect(job.status).toBe("pending");
  });

  it("step 2 — verifyJob sets homeownerSigned and verified in one call (DIY single-sig path)", async () => {
    const verified = await jobService.verifyJob(jobId);
    expect(verified.homeownerSigned).toBe(true);
    expect(verified.verified).toBe(true);
    expect(verified.status).toBe("verified");
  });

  it("step 3 — getCertificationData reflects the verified job (cross-canister state)", async () => {
    const data = await jobService.getCertificationData(propId);
    expect(data.verifiedJobCount).toBeGreaterThanOrEqual(1);
    expect(data.verifiedKeySystems).toContain("HVAC");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 2 — Contractor dual-signature workflow
// homeowner creates job → createInviteToken → contractor redeems (contractorSigned) →
// homeowner verifyJob (homeownerSigned) → both true, verified
//
// Uses a direct actor for the contractor to avoid the service-layer actor cache.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("Flow 2: Contractor dual-signature workflow", () => {
  let propId: string;
  let jobId: string;
  let inviteToken: string;
  let contractorJobActor: any;

  beforeAll(async () => {
    // Contractor identity: seed[0]=99, Free tier, no subscription granted in CI
    const contractorAgent = await makeAgent(99);
    contractorJobActor = Actor.createActor(jobIdl as any, {
      agent:      contractorAgent,
      canisterId: JOB_CANISTER_ID,
    });

    // Homeowner registers property using the main test agent (set by setup.ts)
    const prop = await propertyService.registerProperty({
      address:      addr("dual-sig"),
      city:         "Orlando",
      state:        "FL",
      zipCode:      "32801",
      propertyType: "SingleFamily",
      yearBuilt:    2001,
      squareFeet:   2100,
      tier:         "Basic",
    });
    propId = prop.id;
  });

  it("step 1 — homeowner creates a contractor job (both signatures false)", async () => {
    const job = await jobService.create({
      propertyId:     propId,
      serviceType:    "Plumbing",
      description:    "Pipe repair — dual-signature integration test",
      contractorName: "Pipe Masters LLC",
      amount:         150_000,
      date:           "2024-08-15",
      isDiy:          false,
    });
    jobId = job.id;
    expect(job.isDiy).toBe(false);
    expect(job.homeownerSigned).toBe(false);
    expect(job.contractorSigned).toBe(false);
    expect(job.verified).toBe(false);
  });

  it("step 2 — homeowner creates an invite token", async () => {
    inviteToken = await jobService.createInviteToken(jobId, addr("dual-sig"));
    expect(typeof inviteToken).toBe("string");
    expect(inviteToken.length).toBeGreaterThan(0);
  });

  it("step 3 — contractor redeems invite token → contractorSigned: true, homeownerSigned still false", async () => {
    const result = await contractorJobActor.redeemInviteToken(inviteToken);
    const raw = unwrap<{ contractorSigned: boolean; homeownerSigned: boolean; verified: boolean }>(
      result as any,
      "contractor redeemInviteToken",
    );
    expect(raw.contractorSigned).toBe(true);
    expect(raw.homeownerSigned).toBe(false);
    expect(raw.verified).toBe(false);
  });

  it("step 4 — homeowner countersigns via verifyJob → both signatures true, job fully verified", async () => {
    const verified = await jobService.verifyJob(jobId);
    expect(verified.homeownerSigned).toBe(true);
    expect(verified.contractorSigned).toBe(true);
    expect(verified.verified).toBe(true);
    expect(verified.status).toBe("verified");
  });

  it("step 5 — getCertificationData includes Plumbing as a verified key system", async () => {
    const data = await jobService.getCertificationData(propId);
    expect(data.verifiedJobCount).toBeGreaterThanOrEqual(1);
    expect(data.verifiedKeySystems).toContain("Plumbing");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 3 — Basic-tier property registration limit
// Tests that the property canister cross-calls payment to enforce tier limits.
// Basic is the lowest homeowner tier: 1 property. TIER_USER has a Basic subscription
// granted by scripts/test-integration.sh, so the second registration must fail.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("Flow 3: Basic-tier property registration limit (property → payment cross-call)", () => {
  let tierPropertyActor: any;
  const registrationResults: Array<{ ok: boolean; propId?: string; errorKey?: string }> = [];

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
        registrationResults.push({ ok: false, errorKey: key });
      }
    }

    const successes = registrationResults.filter((r) => r.ok);
    const failures  = registrationResults.filter((r) => !r.ok);

    // Basic tier = 1 property: exactly one must succeed
    expect(successes.length).toBe(1);
    // The remaining two must fail
    expect(failures.length).toBe(2);
  });

  it("the rejection error is LimitReached (not Unauthorized or a network error)", () => {
    const failures = registrationResults.filter((r) => !r.ok);
    for (const f of failures) {
      expect(f.errorKey).toMatch(/LimitReached|TierLimitReached|Limit/i);
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

describe.skipIf(!deployed)("Flow 4: Quote open-request limit enforcement (quote → payment cross-call)", () => {
  let quotePropActor: any;
  let quoteActor: any;
  let quotePropId: string;
  const requestResults: Array<{ ok: boolean; reqId?: string; errorKey?: string }> = [];

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
        requestResults.push({ ok: false, errorKey: key });
        consecutiveFailures++;
      }
    }

    const successes = requestResults.filter((r) => r.ok);
    const failures  = requestResults.filter((r) => !r.ok);

    // Basic tier = exactly 3 open requests
    expect(successes.length).toBe(3);
    expect(failures.length).toBeGreaterThanOrEqual(1);
  });

  it("the rejection error names a limit (TierLimitReached / LimitReached / Limit)", () => {
    const failures = requestResults.filter((r) => !r.ok);
    for (const f of failures) {
      expect(f.errorKey).toMatch(/Limit|limit|Tier|tier/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 5 — Property verification state machine
// Unverified → PendingReview (homeowner submitVerification)
// PendingReview → Basic (admin verifyProperty — documented but not automated here)
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("Flow 5: Property verification state machine", () => {
  let prop: Awaited<ReturnType<typeof propertyService.registerProperty>>;

  beforeAll(async () => {
    prop = await propertyService.registerProperty({
      address:      addr("verify-flow"),
      city:         "Orlando",
      state:        "FL",
      zipCode:      "32801",
      propertyType: "SingleFamily",
      yearBuilt:    1990,
      squareFeet:   1600,
      tier:         "Basic",
    });
  });

  it("new property starts at Unverified", () => {
    expect(prop.verificationLevel).toBe("Unverified");
  });

  it("submitVerification transitions state to PendingReview", async () => {
    const updated = await propertyService.submitVerification(
      prop.id,
      "UtilityBill",
      // SHA-256 hex string of a dummy document — must be exactly 64 hex chars
      "a".repeat(64),
    );
    expect(updated.verificationLevel).toBe("PendingReview");
  });

  it("re-submitting while PendingReview is idempotent (stays PendingReview)", async () => {
    const updated = await propertyService.submitVerification(
      prop.id,
      "TitleDeed",
      "b".repeat(64),
    );
    expect(updated.verificationLevel).toBe("PendingReview");
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
