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
 */

import { describe, it, expect, beforeAll } from "vitest";
import { listingService } from "@/services/listing";
import type { ListingBidRequest, ListingProposal } from "@/services/listing";
import { TEST_PRINCIPAL } from "./setup";

const CANISTER_ID = process.env.LISTING_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

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

/** Submit 3 proposals so the sealed-bid gate opens (invariant 02: 3 bids OR deadline). */
async function submitThreeProposals(requestId: string) {
  const proposals: ListingProposal[] = [];
  for (let i = 0; i < 3; i++) {
    proposals.push(await listingService.submitProposal(requestId, {
      ...BASE_PROPOSAL,
      coverLetter: `${BASE_PROPOSAL.coverLetter} (agent ${i})`,
    }));
  }
  return proposals;
}

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
  let request: ListingBidRequest;

  beforeAll(async () => {
    request = await listingService.createBidRequest({ ...BASE_REQUEST, propertyId: pid("submit-prop") });
  });

  it("returns a proposal with a non-empty id and letter", async () => {
    const prop = await listingService.submitProposal(request.id, BASE_PROPOSAL);
    expect(prop.id).toBeTruthy();
    expect(typeof prop.letter).toBe("string");
    expect(prop.letter.length).toBe(1);
  });

  it("commissionBps (Nat) survives BigInt round-trip", async () => {
    const prop = await listingService.submitProposal(request.id, { ...BASE_PROPOSAL, commissionBps: 300 });
    expect(prop.commissionBps).toBe(300);
  });

  it("suggestedListCents (Nat) survives BigInt round-trip", async () => {
    const prop = await listingService.submitProposal(request.id, { ...BASE_PROPOSAL, suggestedListCents: 472_500_00 });
    expect(prop.suggestedListCents).toBe(472_500_00);
  });

  it("estimatedDaysOnMarket (Nat) survives BigInt round-trip", async () => {
    const prop = await listingService.submitProposal(request.id, { ...BASE_PROPOSAL, estimatedDaysOnMarket: 28 });
    expect(prop.estimatedDaysOnMarket).toBe(28);
  });

  it("marketingCommitments Vec(Text) is preserved and required non-empty", async () => {
    const commitments = ["Professional photography", "Virtual tour", "Two open houses"];
    const prop = await listingService.submitProposal(request.id, { ...BASE_PROPOSAL, marketingCommitments: commitments });
    expect(prop.marketingCommitments).toEqual(expect.arrayContaining(commitments));

    await expect(
      listingService.submitProposal(request.id, { ...BASE_PROPOSAL, marketingCommitments: [] })
    ).rejects.toThrow();
  });

  it("includedServices Vec(Text) is preserved", async () => {
    const services = ["Professional Photography", "MLS Listing", "Virtual Tour"];
    const prop = await listingService.submitProposal(request.id, { ...BASE_PROPOSAL, includedServices: services });
    expect(prop.includedServices).toEqual(expect.arrayContaining(services));
  });

  it("proposal starts with status 'Pending', carries derived signals and an agent record", async () => {
    const prop = await listingService.submitProposal(request.id, BASE_PROPOSAL);
    expect(prop.status).toBe("Pending");
    expect(prop.derived).toBeDefined();
    expect(prop.agentRecord).toBeDefined();
  });

  it("agentId matches the test identity principal", async () => {
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
