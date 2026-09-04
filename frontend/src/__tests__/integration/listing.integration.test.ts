/**
 * Integration tests — listingService against the real ICP listing canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - Candid IDL: targetListDate/validUntil (Int bigint), desiredSalePrice/beds/baths/sqft
 *     (Opt Nat), commissionBps/estimatedDaysOnMarket/suggestedListCents (Nat/bigint)
 *   - BidRequestStatus Variant: Open → Cancelled (cancelBidRequest)
 *   - windowDays Variant round-trips and the canister derives bidDeadline from it
 *   - ProposalStatus Variant: Pending → Accepted (acceptProposal)
 *   - Sealed-bid gate: getProposalsForRequest / getBidProgress stay sealed until
 *     3 bids land or the window closes
 *   - Homeowner scoping: getMyBidRequests returns only the caller's requests
 *   - acceptProposal returns a feeId string and does NOT itself award the
 *     request or unmask identities — that's markListingFeePaid, webhook-only
 *   - submitProposal requires a verified agent (invariant 05) and enforces
 *     one proposal per agent per request — exercised with distinct identities
 */

import { describe, it, expect, beforeAll } from "vitest";
import { HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { listingService } from "@/services/listing";
import type { ListingBidRequest, ListingProposal } from "@/services/listing";
import { agentService } from "@/services/agent";
import { setAgentForTesting } from "@/services/actor";
import { TEST_PRINCIPAL, testIdentity } from "./setup";

const CANISTER_ID = process.env.LISTING_CANISTER_ID || "";
const AGENT_CANISTER_ID = process.env.AGENT_CANISTER_ID || "";
const deployed = !!CANISTER_ID && !!AGENT_CANISTER_ID;

// ─── Co-bidder identities ──────────────────────────────────────────────────
// submitProposal enforces one proposal per agent per request (invariant:
// "up to five agents" implies five distinct bidders), so simulating three
// sealed bids on the same listing needs three distinct verified-agent
// principals, not three calls from the homeowner's own identity.
// Seeds 151-153 are unused elsewhere in the integration suite (cross-canister-
// flows.integration.test.ts uses 42, 55, 77, 88, 99).

const REPLICA_HOST = "http://localhost:4943";
const v2Fetch: typeof globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input
    : input instanceof URL ? input.toString()
    : (input as Request).url;
  return globalThis.fetch(url.replace(/\/api\/v[34]\//, "/api/v2/"), init);
};

/** Rebinds listingService/agentService to a freshly-created agent for `seed`. */
async function switchToSeed(seed: number): Promise<string> {
  const buf = new Uint8Array(32);
  buf[0] = seed;
  const identity = Ed25519KeyIdentity.generate(buf);
  const agent = await HttpAgent.create({
    identity, host: REPLICA_HOST, shouldFetchRootKey: true, fetch: v2Fetch,
  });
  setAgentForTesting(agent);
  listingService.reset();
  agentService.reset();
  return identity.getPrincipal().toText();
}

/** Restores the default session identity (TEST_PRINCIPAL, admin on `agent`). */
async function switchToTestPrincipal(): Promise<void> {
  const agent = await HttpAgent.create({
    identity: testIdentity,
    host: REPLICA_HOST,
    shouldFetchRootKey: true,
    fetch: v2Fetch,
  });
  setAgentForTesting(agent);
  listingService.reset();
  agentService.reset();
}

const COBIDDER_SEEDS = [151, 152, 153];
/** Populated by beforeAll: three distinct, verified agent principals. */
let coBidderPrincipals: string[] = [];

/** Registers (idempotent) + admin-verifies one seed as an agent. Returns its principal. */
async function setUpCoBidder(seed: number, label: string): Promise<string> {
  const principal = await switchToSeed(seed);
  try {
    await agentService.register({
      name: `Co-Bidder ${label}`, brokerage: "Integration Test Realty",
      licenseNumber: `SL-INTEG-${label}`, licenseState: "FL", county: "Hillsborough",
      serviceCities: ["tampa"], bio: "", phone: "", email: `agent-${label.toLowerCase()}@example.com`,
    });
  } catch {
    // Already registered from a prior run against a non-clean replica — fine,
    // registration is a one-time setup step, not part of what this suite asserts.
  }
  await switchToTestPrincipal(); // admin, per ci.yml's `agent addAdmin $INTEG_PRINCIPAL`
  await agentService.verifyAgent(principal);
  return principal;
}

const RUN_ID = Date.now();
function pid(label: string) { return `integ-listing-${label}-${RUN_ID}`; }

// Future timestamps (ms)
const TARGET_LIST = Date.now() + 30 * 24 * 60 * 60 * 1000;   // 30 days from now

const BASE_REQUEST = {
  propertyId:       pid("base"),
  address:          "100 Integration Way",
  city:             "Tampa",
  county:           "Hillsborough",
  zipCode:          "33602",
  homeownerEmail:   "integration-owner@example.com",
  targetListDate:   TARGET_LIST,
  desiredSalePrice: 450_000_00, // $450,000 in cents
  notes:            "Integration test listing bid request",
  windowDays:       "Fourteen" as const,
};

const BASE_PROPOSAL = {
  commissionBps:         275,   // 2.75%
  suggestedListCents:    450_000_00,
  cmaSummary:            "3 comparable sales in the last 90 days support pricing at $450k.",
  marketingPlan:         "MLS listing, professional photos, 2 open houses.",
  marketingCommitments:  ["Professional photography", "Two open houses in the first 30 days"],
  estimatedDaysOnMarket: 21,
  includedServices:      ["Professional Photography", "MLS Listing"],
  validUntil:            Date.now() + 14 * 24 * 60 * 60 * 1000, // 14 days
  coverLetter:           "I have 10+ years experience in this market.",
};

/**
 * Submit 3 proposals so the sealed-bid gate opens (invariant 02: 3 bids OR
 * deadline) — one per pre-registered co-bidder, since submitProposal caps
 * one proposal per agent per request. Restores the TEST_PRINCIPAL identity
 * (homeowner) before returning so callers can immediately act as the seller.
 */
async function submitThreeProposals(requestId: string) {
  const proposals: ListingProposal[] = [];
  for (let i = 0; i < coBidderPrincipals.length; i++) {
    await switchToSeed(COBIDDER_SEEDS[i]);
    proposals.push(await listingService.submitProposal(requestId, {
      ...BASE_PROPOSAL,
      coverLetter: `${BASE_PROPOSAL.coverLetter} (agent ${i})`,
    }));
  }
  await switchToTestPrincipal();
  return proposals;
}

// Module-level setup: register + admin-verify TEST_PRINCIPAL itself as an
// agent (several describe blocks below submit a single proposal directly as
// TEST_PRINCIPAL), plus the three distinct co-bidder identities that
// submitThreeProposals uses.
beforeAll(async () => {
  if (!deployed) return;
  try {
    await agentService.register({
      name: "Test Principal Agent", brokerage: "Integration Test Realty",
      licenseNumber: "SL-INTEG-SELF", licenseState: "FL", county: "Hillsborough",
      serviceCities: ["tampa"], bio: "", phone: "", email: "integ-self-agent@example.com",
    });
  } catch {
    // Already registered from a prior run against a non-clean replica — fine.
  }
  await agentService.verifyAgent(TEST_PRINCIPAL); // TEST_PRINCIPAL is its own admin here
  coBidderPrincipals = [];
  for (let i = 0; i < COBIDDER_SEEDS.length; i++) {
    coBidderPrincipals.push(await setUpCoBidder(COBIDDER_SEEDS[i], String.fromCharCode(65 + i)));
  }
});

// ─── createBidRequest — Candid serialization ──────────────────────────────────

describe.skipIf(!deployed)("createBidRequest — Candid serialization", () => {
  it("returns a request with a non-empty id", async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("id") });
    expect(req.id).toBeTruthy();
    expect(typeof req.id).toBe("string");
  });

  it("propertyId is preserved", async () => {
    const propId = pid("prop-id");
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: propId });
    expect(req.propertyId).toBe(propId);
  });

  it("homeowner principal matches the test identity", async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("principal") });
    expect(req.homeowner).toBe(TEST_PRINCIPAL);
  });

  it("status starts as 'Open' and feePaid starts false", async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("initial-status") });
    expect(req.status).toBe("Open");
    expect(req.feePaid).toBe(false);
  });

  it("windowDays is preserved and the canister derives a future bidDeadline from it", async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("window"), windowDays: "Three" });
    expect(req.windowDays).toBe("Three");
    expect(req.bidDeadline).toBeGreaterThan(Date.now());
  });

  it("desiredSalePrice (Opt Nat) is preserved when provided", async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("sale-price"), desiredSalePrice: 55_000_00 });
    expect(req.desiredSalePrice).toBe(55_000_00);
  });

  it("desiredSalePrice is null when not provided", async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("no-sale-price"), desiredSalePrice: null });
    expect(req.desiredSalePrice).toBeNull();
  });

  it("notes are preserved", async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("notes") });
    expect(req.notes).toBe("Integration test listing bid request");
  });
});

// ─── getMyBidRequests — caller scoping ───────────────────────────────────────

describe.skipIf(!deployed)("getMyBidRequests — caller scoping", () => {
  let seeded: ListingBidRequest;

  beforeAll(async () => {
    seeded = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("scope") });
  });

  it("getMyBidRequests returns the created request", async () => {
    const reqs = await listingService.getMyBidRequests();
    const found = reqs.find((r) => r.id === seeded.id);
    expect(found).toBeDefined();
  });

  it("all returned requests belong to the test principal", async () => {
    const reqs = await listingService.getMyBidRequests();
    expect(reqs.every((r) => r.homeowner === TEST_PRINCIPAL)).toBe(true);
  });
});

// ─── getBidRequest — fetch by id ──────────────────────────────────────────────

describe.skipIf(!deployed)("getBidRequest — fetch by id", () => {
  let created: ListingBidRequest;

  beforeAll(async () => {
    created = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("get-by-id") });
  });

  it("getBidRequest returns the request matching the id", async () => {
    const req = await listingService.getBidRequest(created.id);
    expect(req).not.toBeNull();
    expect(req!.id).toBe(created.id);
    expect(req!.propertyId).toBe(created.propertyId);
  });

  it("getBidRequest returns null for an unknown id", async () => {
    const req = await listingService.getBidRequest("DOES_NOT_EXIST_99999");
    expect(req).toBeNull();
  });
});

// ─── cancelBidRequest ─────────────────────────────────────────────────────────

describe.skipIf(!deployed)("cancelBidRequest — BidRequestStatus Open → Cancelled", () => {
  it("cancelBidRequest resolves without error", async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("cancel") });
    await expect(listingService.cancelBidRequest(req.id)).resolves.toBeUndefined();
  });

  it("cancelled request no longer appears as Open in getOpenBidRequests", async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("cancel-open") });
    await listingService.cancelBidRequest(req.id);
    const open = await listingService.getOpenBidRequests();
    const found = open.find((r) => r.id === req.id);
    expect(found).toBeUndefined();
  });
});

// ─── getOpenBidRequests — masked summary feed ─────────────────────────────────

describe.skipIf(!deployed)("getOpenBidRequests — masked BidRequestSummary feed", () => {
  it("returns summaries without address or homeownerEmail", async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("summary") });
    const open = await listingService.getOpenBidRequests();
    const found = open.find((r) => r.id === req.id);
    expect(found).toBeDefined();
    expect(found).not.toHaveProperty("address");
    expect(found).not.toHaveProperty("homeownerEmail");
    expect(typeof found!.proposalCount).toBe("number");
    expect(typeof found!.openSlots).toBe("number");
  });
});

// ─── submitProposal — BigInt field round-trips ────────────────────────────────

describe.skipIf(!deployed)("submitProposal — Candid serialization", () => {
  // One proposal per agent per request is enforced server-side, so each test
  // below submits to its own fresh request rather than sharing one.
  async function freshRequest(label: string): Promise<ListingBidRequest> {
    return listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid(`submit-prop-${label}`) });
  }

  it("returns a proposal with a non-empty id and letter", async () => {
    const request = await freshRequest("id-letter");
    const prop = await listingService.submitProposal(request.id, BASE_PROPOSAL);
    expect(prop.id).toBeTruthy();
    expect(typeof prop.letter).toBe("string");
    expect(prop.letter.length).toBe(1);
  });

  it("commissionBps (Nat) survives BigInt round-trip", async () => {
    const request = await freshRequest("commission");
    const prop = await listingService.submitProposal(request.id, { ...BASE_PROPOSAL, commissionBps: 300 });
    expect(prop.commissionBps).toBe(300);
  });

  it("suggestedListCents (Nat) survives BigInt round-trip", async () => {
    const request = await freshRequest("suggested-list");
    const prop = await listingService.submitProposal(request.id, { ...BASE_PROPOSAL, suggestedListCents: 472_500_00 });
    expect(prop.suggestedListCents).toBe(472_500_00);
  });

  it("estimatedDaysOnMarket (Nat) survives BigInt round-trip", async () => {
    const request = await freshRequest("dom");
    const prop = await listingService.submitProposal(request.id, { ...BASE_PROPOSAL, estimatedDaysOnMarket: 28 });
    expect(prop.estimatedDaysOnMarket).toBe(28);
  });

  it("marketingCommitments Vec(Text) is preserved and required non-empty", async () => {
    const request = await freshRequest("commitments");
    const commitments = ["Professional photography", "Virtual tour", "Two open houses"];
    const prop = await listingService.submitProposal(request.id, { ...BASE_PROPOSAL, marketingCommitments: commitments });
    expect(prop.marketingCommitments).toEqual(expect.arrayContaining(commitments));

    const request2 = await freshRequest("commitments-empty");
    await expect(
      listingService.submitProposal(request2.id, { ...BASE_PROPOSAL, marketingCommitments: [] })
    ).rejects.toThrow();
  });

  it("includedServices Vec(Text) is preserved", async () => {
    const request = await freshRequest("services");
    const services = ["Professional Photography", "MLS Listing", "Virtual Tour"];
    const prop = await listingService.submitProposal(request.id, { ...BASE_PROPOSAL, includedServices: services });
    expect(prop.includedServices).toEqual(expect.arrayContaining(services));
  });

  it("proposal starts with status 'Pending', carries derived signals and an agent record", async () => {
    const request = await freshRequest("status");
    const prop = await listingService.submitProposal(request.id, BASE_PROPOSAL);
    expect(prop.status).toBe("Pending");
    expect(prop.derived).toBeDefined();
    expect(prop.agentRecord).toBeDefined();
  });

  it("agentId matches the test identity principal", async () => {
    const request = await freshRequest("agent-id");
    const prop = await listingService.submitProposal(request.id, BASE_PROPOSAL);
    expect(prop.agentId).toBe(TEST_PRINCIPAL);
  });
});

// ─── Sealed-bid gate: 3 bids OR deadline ──────────────────────────────────────

describe.skipIf(!deployed)("sealed-bid gate — getBidProgress / getProposalsForRequest", () => {
  it("stays sealed with fewer than 3 bids in and the window still open", async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("sealed") });
    await listingService.submitProposal(req.id, BASE_PROPOSAL);

    const progress = await listingService.getBidProgress(req.id);
    expect(progress.sealed).toBe(true);
    expect(progress.count).toBe(1);
    expect(await listingService.getProposalsForRequest(req.id)).toHaveLength(0);
  });

  it("unseals once the 3rd bid lands", async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("unseal") });
    await submitThreeProposals(req.id);

    const progress = await listingService.getBidProgress(req.id);
    expect(progress.sealed).toBe(false);
    expect(progress.count).toBe(3);
    const props = await listingService.getProposalsForRequest(req.id);
    expect(props).toHaveLength(3);
    expect(props.every((p) => p.requestId === req.id)).toBe(true);
  });
});

// ─── acceptProposal — selection without award/unmask ──────────────────────────

describe.skipIf(!deployed)("acceptProposal — selects a winner without awarding or unmasking", () => {
  let request: ListingBidRequest;
  let winner: ListingProposal;

  beforeAll(async () => {
    request = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("award") });
    [winner] = await submitThreeProposals(request.id);
  });

  it("acceptProposal resolves to a non-empty feeId string", async () => {
    const feeId = await listingService.acceptProposal(winner.id);
    expect(typeof feeId).toBe("string");
    expect(feeId.length).toBeGreaterThan(0);
  });

  it("the bid request is NOT awarded or unmasked by acceptProposal alone — that's markListingFeePaid, webhook-only", async () => {
    const req = await listingService.getBidRequest(request.id);
    expect(req!.status).toBe("Open");
    expect(req!.feePaid).toBe(false);
  });
});

// ─── getMyProposals ───────────────────────────────────────────────────────────

describe.skipIf(!deployed)("getMyProposals — agent view", () => {
  let submitted: ListingProposal;

  beforeAll(async () => {
    const req = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("my-props") });
    submitted = await listingService.submitProposal(req.id, BASE_PROPOSAL);
  });

  it("getMyProposals returns the submitted proposal", async () => {
    const mine = await listingService.getMyProposals();
    const found = mine.find((p) => p.id === submitted.id);
    expect(found).toBeDefined();
  });

  it("all returned proposals belong to the test principal", async () => {
    const mine = await listingService.getMyProposals();
    expect(mine.every((p) => p.agentId === TEST_PRINCIPAL)).toBe(true);
  });
});
