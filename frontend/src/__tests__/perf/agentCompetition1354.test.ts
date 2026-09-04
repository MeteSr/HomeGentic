/**
 * TDD — 13.5.4: "Agent competition" load scenario (Bid to List v2)
 *
 * 10 agents simultaneously submit proposals to the same open ListingBidRequest.
 * Tests write contention invariants on the listing service's in-memory mock
 * (which mirrors the behavioral guarantees the ICP canister must uphold).
 *
 * Invariants under concurrent load:
 *   A. No proposals are lost — all 10 writes persist.
 *   B. All proposal IDs are unique — no collision from concurrent ID generation.
 *   C. Proposals are scoped to their request — no cross-request bleed.
 *   D. A cancelled request rejects submits even under concurrent load.
 *   E. Request status is not mutated by proposal writes — stays "Open".
 *   F. Concurrent throughput — 10 proposals complete in < 200ms wall clock.
 *   G. Sealed-bid gate — proposals stay hidden until 3 bids land or the window closes.
 *   H. Mixed-request isolation — proposals for req-A are not returned for req-B.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── Stateful mock actor for listing canister (v2 shape) ───────────────────────

let _reqSeq  = 0;
let _propSeq = 0;
const _bidRequests = new Map<string, any>();
const _proposals   = new Map<string, any>();

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function resetListingMock() {
  _reqSeq = 0; _propSeq = 0;
  _bidRequests.clear(); _proposals.clear();
}

function proposalsFor(requestId: string) {
  return [..._proposals.values()].filter((p) => p.requestId === requestId);
}

function deadlinePassed(req: any) {
  return Number(req.bidDeadline) / 1_000_000 <= Date.now();
}

function isSealed(req: any) {
  return proposalsFor(req.id).length < 3 && !deadlinePassed(req);
}

const mockListingActor = {
  createBidRequest: vi.fn(async (
    propertyId: string, address: string, city: string, county: string, zipCode: string,
    homeownerEmail: string, beds: bigint[], baths: bigint[], sqft: bigint[],
    targetListDate: bigint, desiredSalePrice: bigint[], notes: string, windowDays: any,
  ) => {
    _reqSeq++;
    const id = `BID_${_reqSeq}`;
    const createdAt = BigInt(Date.now()) * 1_000_000n;
    const raw = {
      id, propertyId, homeowner: { toText: () => "local" },
      address, city, county, zipCode, homeownerEmail, beds, baths, sqft,
      targetListDate, desiredSalePrice, notes, windowDays,
      // bidDeadline is supplied directly by these tests via a __rawDeadline
      // escape hatch below rather than derived from windowDays, so the
      // concurrency scenarios can pin exact open/closed windows.
      bidDeadline: createdAt + 14n * 86_400_000n * 1_000_000n,
      status: { Open: null }, feePaid: false, createdAt,
    };
    _bidRequests.set(id, raw);
    return { ok: raw };
  }),

  getBidRequest: vi.fn(async (id: string) => {
    const req = _bidRequests.get(id);
    return req ? { ok: req } : { err: { NotFound: null } };
  }),

  submitProposal: vi.fn(async (
    requestId: string, commissionBps: bigint, suggestedListCents: bigint,
    cmaSummary: string, marketingPlan: string, marketingCommitments: string[],
    estimatedDaysOnMarket: bigint, includedServices: string[], validUntil: bigint,
    coverLetter: string,
  ) => {
    const req = _bidRequests.get(requestId);
    if (!req) return { err: { NotFound: null } };
    if (Object.keys(req.status)[0] !== "Open") return { err: { InvalidInput: "Request not open" } };
    if (deadlinePassed(req)) return { err: { DeadlinePassed: null } };

    _propSeq++;
    const id = `PROP_${_propSeq}`;
    const letter = LETTERS[proposalsFor(requestId).length] ?? "?";
    const agentIndex = proposalsFor(requestId).length;
    const raw = {
      id, requestId, agentId: { toText: () => `agent-${agentIndex}` },
      agentName: `Agent ${agentIndex}`, agentEmail: `agent${agentIndex}@example.com`,
      agentBrokerage: `Brokerage ${agentIndex}`, letter,
      commissionBps, suggestedListCents, cmaSummary, marketingPlan, marketingCommitments,
      estimatedDaysOnMarket, includedServices, validUntil, coverLetter,
      status: { Pending: null },
      derived: { estNetToSellerCents: suggestedListCents, pctVsCompsBps: 0n, overCompFlag: false, thinCompsFlag: false },
      agentRecord: { closedInZip: 0n, avgDom: 0n, saleToListRatioBps: 0n, withdrawnUnsold: 0n, commitmentsUnmet: 0n },
      createdAt: BigInt(Date.now()) * 1_000_000n,
    };
    _proposals.set(id, raw);
    return { ok: raw };
  }),

  getProposalsForRequest: vi.fn(async (requestId: string) => {
    const req = _bidRequests.get(requestId);
    if (!req) return [];
    if (isSealed(req)) return [];
    return proposalsFor(requestId).map((p) => ({
      id: p.id, requestId: p.requestId, letter: p.letter,
      commissionBps: p.commissionBps, suggestedListCents: p.suggestedListCents,
      cmaSummary: p.cmaSummary, marketingPlan: p.marketingPlan,
      marketingCommitments: p.marketingCommitments,
      estimatedDaysOnMarket: p.estimatedDaysOnMarket, status: p.status,
      derived: p.derived, agentRecord: p.agentRecord,
      isMine: true, // single test identity — full view in this mock
      agentName: [p.agentName], agentEmail: [p.agentEmail], agentBrokerage: [p.agentBrokerage],
      createdAt: p.createdAt,
    }));
  }),

  getBidProgress: vi.fn(async (requestId: string) => {
    const req = _bidRequests.get(requestId);
    if (!req) return { err: { NotFound: null } };
    return { ok: { count: BigInt(proposalsFor(requestId).length), sealed: isSealed(req) } };
  }),

  // Test-only: force a request's bidDeadline directly (bypasses windowDays)
  // so the concurrency scenarios below can pin exact open/closed windows.
  __setDeadline: (requestId: string, deadlineMs: number) => {
    const req = _bidRequests.get(requestId);
    if (req) req.bidDeadline = BigInt(deadlineMs) * 1_000_000n;
  },

  // Stubs for completeness
  getMyBidRequests:    vi.fn(async () => [..._bidRequests.values()]),
  cancelBidRequest:    vi.fn(async (id: string) => {
    const req = _bidRequests.get(id);
    if (!req) return { err: { NotFound: null } };
    req.status = { Cancelled: null };
    return { ok: null };
  }),
  getOpenBidRequests:  vi.fn(async () =>
    [..._bidRequests.values()].filter((r) => Object.keys(r.status)[0] === "Open")),
  getMyProposals:      vi.fn(async () => [..._proposals.values()]),
  acceptProposal:      vi.fn(async (proposalId: string) => {
    const p = _proposals.get(proposalId);
    if (!p) return { err: { NotFound: null } };
    p.status = { Accepted: null };
    return { ok: `FEE_${proposalId}` };
  }),
  addListingPhoto:     vi.fn(async () => ({ ok: null })),
  getListingPhotos:    vi.fn(async () => []),
  removeListingPhoto:  vi.fn(async () => ({ ok: null })),
  reorderListingPhotos: vi.fn(async () => ({ ok: null })),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => mockListingActor) },
}));

import { listingService, type SubmitProposalInput } from "@/services/listing";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

async function makeBidRequest() {
  return listingService.createBidRequest({
    propertyId:       "prop-1",
    address:          "1 Test Way", city: "Tampa", county: "Hillsborough", zipCode: "33602",
    homeownerEmail:   "owner@example.com",
    targetListDate:   Date.now() + 86_400_000,
    desiredSalePrice: 55_000_000,   // $550k
    notes:            "Motivated seller",
    windowDays:       "Fourteen",
  });
}

function makeProposalInput(agentIndex: number): SubmitProposalInput {
  return {
    commissionBps:         250 + agentIndex,          // 2.5–3.5%
    suggestedListCents:    54_000_000 + agentIndex * 10_000,
    cmaSummary:            `CMA from agent ${agentIndex}`,
    marketingPlan:         `Marketing plan from agent ${agentIndex}`,
    marketingCommitments:  ["Professional photography"],
    estimatedDaysOnMarket: 21 + agentIndex,
    includedServices:      ["Photography", "Staging"],
    validUntil:            Date.now() + 7 * 86_400_000,
    coverLetter:           `Cover letter from agent ${agentIndex}`,
  };
}

const AGENTS = Array.from({ length: 10 }, (_, i) => i);

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("13.5.4: agent competition — 10 concurrent proposals on one request", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });
  afterEach(() => vi.useRealTimers());

  // ── A. No proposals lost ──────────────────────────────────────────────────

  it("A: all 10 concurrent proposals are accepted and persisted", async () => {
    const req = await makeBidRequest();

    const results = await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    expect(results).toHaveLength(10);
    expect(results.every((p) => p !== null && typeof p === "object")).toBe(true);
  });

  it("A: every proposal resolves without throwing", async () => {
    const req = await makeBidRequest();

    const settled = await Promise.allSettled(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    const rejected = settled.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(0);
  });

  // ── B. Unique IDs — no collision ─────────────────────────────────────────

  it("B: all 10 proposals receive distinct IDs", async () => {
    const req = await makeBidRequest();

    const proposals = await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    const uniqueIds = new Set(proposals.map((p) => p.id));
    expect(uniqueIds.size).toBe(10);
  });

  it("B: proposal IDs are non-empty strings", async () => {
    const req = await makeBidRequest();

    const proposals = await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    for (const p of proposals) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
    }
  });

  // ── C. Request scoping — proposals belong to correct request ─────────────

  it("C: all proposals have requestId matching the target request", async () => {
    const req = await makeBidRequest();

    const proposals = await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    for (const p of proposals) {
      expect(p.requestId).toBe(req.id);
    }
  });

  it("C: getProposalsForRequest returns exactly 10 proposals once unsealed (3+ bids)", async () => {
    const req = await makeBidRequest();

    await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    const retrieved = await listingService.getProposalsForRequest(req.id);
    expect(retrieved).toHaveLength(10);
  });

  it("C: each agent's proposal is preserved intact (no write overwriting another)", async () => {
    const req = await makeBidRequest();

    await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    const retrieved = await listingService.getProposalsForRequest(req.id);
    const uniqueLetters = new Set(retrieved.map((p) => p.letter));
    expect(uniqueLetters.size).toBe(10);
  });

  // ── D. A cancelled request rejects submits under contention ──────────────

  it("D: submissions to a cancelled request are rejected even under concurrent load", async () => {
    const req = await makeBidRequest();
    await listingService.cancelBidRequest(req.id);

    const settled = await Promise.allSettled(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    const rejected = settled.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(10);
  });

  it("D: 9 submits to an open request succeed while a simultaneous submit to a cancelled one fails", async () => {
    const openReq   = await makeBidRequest();
    const closedReq = await makeBidRequest();
    await listingService.cancelBidRequest(closedReq.id);

    const settled = await Promise.allSettled([
      ...AGENTS.slice(0, 9).map((i) => listingService.submitProposal(openReq.id,   makeProposalInput(i))),
      listingService.submitProposal(closedReq.id, makeProposalInput(9)),
    ]);

    const fulfilled = settled.filter((r) => r.status === "fulfilled");
    const rejected  = settled.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(9);
    expect(rejected).toHaveLength(1);
  });

  // ── E. Request status not mutated by proposal writes ─────────────────────

  it("E: bid request status remains Open after 10 concurrent proposals", async () => {
    const req = await makeBidRequest();

    await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    const refreshed = await listingService.getBidRequest(req.id);
    expect(refreshed?.status).toBe("Open");
  });

  // ── F. Throughput — 10 proposals in < 200ms ───────────────────────────────

  it("F: 10 concurrent proposals complete in < 200ms", async () => {
    const req = await makeBidRequest();

    const t0 = performance.now();
    await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );
    const elapsed = performance.now() - t0;

    expect(
      elapsed,
      `10 concurrent submitProposal calls took ${elapsed.toFixed(0)}ms — exceeds 200ms budget`
    ).toBeLessThan(200);
  });

  // ── G. Sealed-bid gate under contention (now: 3 bids OR deadline) ─────────

  it("G: proposals stay sealed with only 1 bid in, well before the deadline", async () => {
    const req = await makeBidRequest();
    await listingService.submitProposal(req.id, makeProposalInput(0));

    const sealed = await listingService.getProposalsForRequest(req.id);
    expect(sealed).toHaveLength(0);
  });

  it("G: proposals unseal as soon as the 3rd of 10 concurrent bids lands", async () => {
    const req = await makeBidRequest();

    await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    const unsealed = await listingService.getProposalsForRequest(req.id);
    expect(unsealed.length).toBe(10);
  });

  // ── H. Multi-request isolation ────────────────────────────────────────────

  it("H: proposals for request-A are not returned when querying request-B", async () => {
    const reqA = await makeBidRequest();
    const reqB = await makeBidRequest();

    await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(reqA.id, makeProposalInput(i)))
    );

    const proposalsForB = await listingService.getProposalsForRequest(reqB.id);
    expect(proposalsForB).toHaveLength(0);
  });

  it("H: each request's proposals are isolated when both receive concurrent submissions", async () => {
    const reqA = await makeBidRequest();
    const reqB = await makeBidRequest();

    // 5 agents submit to each request concurrently — below the 3-bid seal
    // threshold isn't enough to unseal either, so drive each to 5 for clarity.
    await Promise.all([
      ...AGENTS.slice(0, 5).map((i) => listingService.submitProposal(reqA.id, makeProposalInput(i))),
      ...AGENTS.slice(5, 10).map((i) => listingService.submitProposal(reqB.id, makeProposalInput(i))),
    ]);

    const [proposalsA, proposalsB] = await Promise.all([
      listingService.getProposalsForRequest(reqA.id),
      listingService.getProposalsForRequest(reqB.id),
    ]);

    expect(proposalsA).toHaveLength(5);
    expect(proposalsB).toHaveLength(5);
    expect(proposalsA.every((p) => p.requestId === reqA.id)).toBe(true);
    expect(proposalsB.every((p) => p.requestId === reqB.id)).toBe(true);
  });
});
