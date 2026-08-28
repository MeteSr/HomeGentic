/**
 * Integration workflow tests — multi-canister end-to-end flows.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * All flows are skipped when canister IDs are absent from the environment
 * (no dfx running), so this file is always safe to include in the test suite.
 *
 * ── Identities ────────────────────────────────────────────────────────────────
 * WF_ONBOARD   seed[0]=201  — Full homeowner onboarding (Premium granted by test scripts)
 * WF_HO        seed[0]=202  — Quote homeowner (Basic)
 * WF_CONTRACTOR seed[0]=203 — Quote contractor (ContractorFree)
 * WF_QUOTA     seed[0]=204  — Quota enforcement homeowner (Basic)
 *
 * These seeds intentionally avoid the existing identity pool (55, 77, 88, 99)
 * defined in cross-canister-flows.integration.test.ts.
 *
 * ── Flows covered ─────────────────────────────────────────────────────────────
 * A. Full homeowner onboarding chain:
 *    property.registerProperty → photo upload (mock bytes) → report.generateReport → report.getReport
 *
 * B. Quote request → bid → accept:
 *    quote.createQuoteRequest (as homeowner) → quote.submitQuote (as contractor) → quote.acceptQuote (as homeowner)
 *
 * C. Subscription downgrade tier-quota enforcement:
 *    payment.getMySubscription → quote.createQuoteRequest × 4 (4th should hit quota)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor, HttpAgent }                  from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity }                from "@icp-sdk/core/identity";
import { idlFactory as propertyIdl }         from "@/services/property";
import { idlFactory as photoIdl }            from "@/services/photo";
import { idlFactory as reportIdl }           from "@/services/report";
import { idlFactory as quoteIdl }            from "@/services/quote";
import { idlFactory as paymentIdl }          from "@/services/payment";

// ─── Canister IDs ─────────────────────────────────────────────────────────────

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const PHOTO_CANISTER_ID    = (process.env as any).PHOTO_CANISTER_ID    || "";
const REPORT_CANISTER_ID   = (process.env as any).REPORT_CANISTER_ID   || "";
const QUOTE_CANISTER_ID    = (process.env as any).QUOTE_CANISTER_ID    || "";
const PAYMENT_CANISTER_ID  = (process.env as any).PAYMENT_CANISTER_ID  || "";

const deployed = !!(
  PROPERTY_CANISTER_ID &&
  PHOTO_CANISTER_ID    &&
  REPORT_CANISTER_ID   &&
  QUOTE_CANISTER_ID    &&
  PAYMENT_CANISTER_ID
);

// Only run when explicitly enabled by the integration test harness.
// `npm run test:unit` must never trigger these — even when canisters are deployed —
// because test identities 201-204 require specific tiers granted by test-integration.sh.
const integrationReady = deployed && !!(process.env as any).INTEGRATION_READY;

// ─── Replica config ───────────────────────────────────────────────────────────

const REPLICA_HOST = "http://localhost:4943";

/** Rewrite v3/v4 API paths to v2 for dfx pocket-ic compatibility. */
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

/** Unwrap a Candid Result<ok, err> — throw on err. */
function unwrap<T>(result: { ok: T } | { err: any }, context = ""): T {
  if ("err" in result) {
    const key = Object.keys(result.err)[0];
    const val = (result.err as any)[key];
    throw new Error(`${context ? context + ": " : ""}${typeof val === "string" ? val : key}`);
  }
  return result.ok;
}

/** Check if a result is an error (without throwing). */
function isErr(result: { ok: any } | { err: any }): boolean {
  return "err" in result;
}

// ─── Unique run prefix to avoid collisions across test runs ───────────────────

const RUN_ID = Date.now();
function addr(label: string) { return `${RUN_ID} ${label} Way, Austin TX 78701`; }

// ─── Common register-property args ────────────────────────────────────────────

const BASE_PROP_ARGS = {
  city:         "Austin",
  state:        "TX",
  zipCode:      "78701",
  propertyType: { SingleFamily: null },
  yearBuilt:    BigInt(1998),
  squareFeet:   BigInt(2100),
};

// ─────────────────────────────────────────────────────────────────────────────
// Flow A — Full homeowner onboarding chain
//
// WF_ONBOARD (seed=201, Premium) registers a property → uploads a photo →
// generates a report → fetches the report and verifies address is present.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!integrationReady)("WF.A — Full homeowner onboarding chain", () => {
  let propId: string;
  let shareToken: string;
  let onboardPropertyActor: any;
  let onboardPhotoActor: any;
  let onboardReportActor: any;

  beforeAll(async () => {
    const agent = await makeAgent(201);  // WF_ONBOARD — Premium granted by test-integration.sh

    onboardPropertyActor = Actor.createActor(propertyIdl as any, {
      agent, canisterId: PROPERTY_CANISTER_ID,
    });
    onboardPhotoActor = Actor.createActor(photoIdl as any, {
      agent, canisterId: PHOTO_CANISTER_ID,
    });
    onboardReportActor = Actor.createActor(reportIdl as any, {
      agent, canisterId: REPORT_CANISTER_ID,
    });
  });

  it("step A.1 — registers a property and returns a numeric ID", async () => {
    const result = await onboardPropertyActor.registerProperty({
      ...BASE_PROP_ARGS,
      tier:    { Premium: null },
      address: addr("onboarding"),
    });
    const prop = unwrap<{ id: string; address: string }>(result as any, "WF.A registerProperty");
    propId = prop.id;
    expect(typeof propId).toBe("string");
    expect(propId.length).toBeGreaterThan(0);
    expect(prop.address).toContain("onboarding");
  });

  it("step A.2 — uploads a mock photo for the property", async () => {
    // Minimal 1×1 pixel GIF as Uint8Array for the photo canister upload
    const mockBytes = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
      0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
      0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
      0x01, 0x00, 0x3b,
    ]);

    // photo canister uploadPhoto: (jobId, propertyId, phase, description, hash, bytes)
    // SHA-256 hash is a 64-char hex string; use a unique placeholder for tests.
    const testHash = `a${"0".repeat(62)}1`;  // 64-char placeholder, unique per run
    const result = await onboardPhotoActor.uploadPhoto(
      `baseline_${propId}`,           // jobId — baseline key convention
      propId,                          // propertyId
      { PostConstruction: null },      // phase Variant
      "HVAC unit — integration test",  // description
      testHash,                        // hash (64-char SHA-256 hex placeholder)
      Array.from(mockBytes),           // bytes as Nat8[]
    );
    const photo = unwrap<{ id: string }>(result as any, "WF.A photo upload");
    expect(typeof photo.id).toBe("string");
    expect(photo.id.length).toBeGreaterThan(0);
  });

  it("step A.3 — generates a report snapshot for the property", async () => {
    const propertyInput = {
      address:           addr("onboarding"),
      city:              "Austin",
      state:             "TX",
      zipCode:           "78701",
      propertyType:      "SingleFamily",
      yearBuilt:         BigInt(1998),
      squareFeet:        BigInt(2100),
      verificationLevel: "Basic",
    };
    const result = await onboardReportActor.generateReport(
      propId,              // propertyId : Text
      propertyInput,       // property   : PropertyInput
      [],                  // jobs       : [JobInput]
      [],                  // recurringServices : [RecurringServiceInput]
      [],                  // expiryDays : ?Nat  (empty = no expiry)
      { Public: null },    // visibility
      [],                  // rooms      : ?[RoomInput]
      [],                  // hideAmounts : ?Bool
      [],                  // hideContractors : ?Bool
      [],                  // hidePermits : ?Bool
      [],                  // hideDescriptions : ?Bool
    );
    const link = unwrap<{ token: string }>(result as any, "WF.A generateReport");
    shareToken = link.token;
    expect(typeof shareToken).toBe("string");
    expect(shareToken.length).toBeGreaterThan(0);
  });

  it("step A.4 — getReport returns snapshot with correct property address", async () => {
    const result = await onboardReportActor.getReport(shareToken);
    const { link, snapshot } = unwrap<{ link: any; snapshot: { address: string } }>(
      result as any, "WF.A getReport"
    );
    expect(link.token).toBe(shareToken);
    // Snapshot address should contain the label used during registration
    expect(snapshot.address).toContain("onboarding");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow B — Quote request → bid → accept
//
// WF_HO (seed=202, Basic) registers a property → creates an open quote request.
// WF_CONTRACTOR (seed=203, ContractorFree) submits a bid.
// WF_HO accepts the bid → final status should be "Accepted".
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!integrationReady)("WF.B — Quote request → bid → accept", () => {
  let realPropId: string;
  let requestId: string;
  let quoteId: string;
  let hoQuoteActor: any;
  let contractorQuoteActor: any;
  let hoPropertyActor: any;

  beforeAll(async () => {
    const hoAgent         = await makeAgent(202);  // WF_HO — Basic
    const contractorAgent = await makeAgent(203);  // WF_CONTRACTOR — ContractorFree

    hoPropertyActor   = Actor.createActor(propertyIdl as any, { agent: hoAgent, canisterId: PROPERTY_CANISTER_ID });
    hoQuoteActor      = Actor.createActor(quoteIdl as any,    { agent: hoAgent, canisterId: QUOTE_CANISTER_ID });
    contractorQuoteActor = Actor.createActor(quoteIdl as any, { agent: contractorAgent, canisterId: QUOTE_CANISTER_ID });

    // Register a property for the homeowner to quote against
    const propResult = await hoPropertyActor.registerProperty({
      ...BASE_PROP_ARGS,
      tier:    { Basic: null },
      address: addr("quote-ho"),
    });
    const prop = unwrap<{ id: string }>(propResult as any, "WF.B registerProperty");
    realPropId = prop.id;
  });

  it("step B.1 — homeowner creates an open quote request", async () => {
    const result = await hoQuoteActor.createQuoteRequest(
      realPropId,
      { HVAC: null },                           // serviceType Variant
      { medium: null },                          // urgency Variant
      "Annual HVAC tune-up — WF.B integration test",
    );
    const req = unwrap<{ id: string; status: Record<string, null> }>(
      result as any, "WF.B createQuoteRequest"
    );
    requestId = req.id;
    expect(typeof requestId).toBe("string");
    expect("open" in req.status || "Open" in req.status).toBe(true);
  });

  it("step B.2 — contractor submits a bid on the open request", async () => {
    const validUntilNs = BigInt(Date.now() + 7 * 24 * 3600 * 1000) * BigInt(1_000_000);
    const result = await contractorQuoteActor.submitQuote(
      requestId,
      BigInt(35_000),   // amount in cents
      BigInt(14),       // timeline in days
      validUntilNs,     // validUntil (nanoseconds)
    );
    const quote = unwrap<{ id: string; status: Record<string, null> }>(
      result as any, "WF.B submitQuote"
    );
    quoteId = quote.id;
    expect(typeof quoteId).toBe("string");
    expect("pending" in quote.status || "Pending" in quote.status).toBe(true);
  });

  it("step B.3 — homeowner accepts the bid; quote and request are both Accepted", async () => {
    const result = await hoQuoteActor.acceptQuote(quoteId);
    const accepted = unwrap<{ status: Record<string, null> }>(
      result as any, "WF.B acceptQuote"
    );
    expect("accepted" in accepted.status || "Accepted" in accepted.status).toBe(true);

    // Verify the request is also closed/accepted
    const reqsResult = await hoQuoteActor.getMyQuoteRequests();
    const reqs: Array<{ id: string; status: Record<string, null> }> =
      "ok" in reqsResult ? reqsResult.ok : reqsResult;
    const theRequest = reqs.find((r) => r.id === requestId);
    expect(theRequest).toBeTruthy();
    // Accepted request status may be "accepted" or "closed" depending on canister version
    const status = theRequest!.status;
    const isClosedOrAccepted =
      "accepted" in status || "Accepted" in status ||
      "closed"   in status || "Closed"   in status;
    expect(isClosedOrAccepted).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow C — Subscription downgrade tier-quota enforcement
//
// WF_QUOTA (seed=204, Basic) has a 3-open-request limit (Basic tier).
// Submitting 3 requests succeeds; the 4th should return an error containing
// "limit", "quota", or a tier-related message.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!integrationReady)("WF.C — Subscription tier-quota enforcement", () => {
  let quotaPropId: string;
  let quotaQuoteActor: any;
  let quotaPaymentActor: any;
  let quotaPropertyActor: any;
  const createdRequestIds: string[] = [];

  beforeAll(async () => {
    const agent = await makeAgent(204);  // WF_QUOTA — Basic (3-request cap)

    quotaPropertyActor = Actor.createActor(propertyIdl as any, { agent, canisterId: PROPERTY_CANISTER_ID });
    quotaQuoteActor    = Actor.createActor(quoteIdl as any,    { agent, canisterId: QUOTE_CANISTER_ID });
    quotaPaymentActor  = Actor.createActor(paymentIdl as any,  { agent, canisterId: PAYMENT_CANISTER_ID });

    // Register a property to anchor the quota test
    const propResult = await quotaPropertyActor.registerProperty({
      ...BASE_PROP_ARGS,
      tier:    { Basic: null },
      address: addr("quota-test"),
    });
    const prop = unwrap<{ id: string }>(propResult as any, "WF.C registerProperty");
    quotaPropId = prop.id;
  });

  it("step C.1 — getMySubscription confirms Basic tier for WF_QUOTA identity", async () => {
    const result = await quotaPaymentActor.getMySubscription();
    // getMySubscription returns the subscription record directly (not a Result)
    const sub: { tier: Record<string, null> } = result;
    expect("Basic" in sub.tier || "basic" in sub.tier).toBe(true);
  });

  it("step C.2 — first 3 open requests succeed (within Basic limit)", async () => {
    for (let i = 1; i <= 3; i++) {
      const result = await quotaQuoteActor.createQuoteRequest(
        quotaPropId,
        { Plumbing: null },
        { low: null },
        `Quota test request ${i} of 3 — WF.C (RUN ${RUN_ID})`,
      );
      const req = unwrap<{ id: string }>(result as any, `WF.C request #${i}`);
      createdRequestIds.push(req.id);
    }
    expect(createdRequestIds).toHaveLength(3);
  });

  it("step C.3 — 4th open request returns a quota/limit error", async () => {
    const result = await quotaQuoteActor.createQuoteRequest(
      quotaPropId,
      { Plumbing: null },
      { low: null },
      `Quota test request 4 — should fail — WF.C (RUN ${RUN_ID})`,
    );

    // The 4th request must be rejected with a quota-related error
    expect(isErr(result as any)).toBe(true);
    if (isErr(result as any)) {
      const errResult = result as { err: any };
      const errKey   = Object.keys(errResult.err)[0] ?? "";
      const errVal   = (errResult.err as any)[errKey] ?? "";
      const errStr   = `${errKey} ${errVal}`.toLowerCase();
      const isQuotaError =
        errStr.includes("limit")  ||
        errStr.includes("quota")  ||
        errStr.includes("tier")   ||
        errStr.includes("max")    ||
        errStr.includes("exceed") ||
        errStr.includes("unauthorized");
      expect(isQuotaError).toBe(true);
    }
  });
});
