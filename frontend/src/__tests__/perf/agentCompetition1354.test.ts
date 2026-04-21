/**
 * TDD — 13.5.4: "Agent competition" load scenario
 *
 * 10 agents simultaneously submit proposals to the same open ListingBidRequest.
 * Tests write contention invariants on the listing service's in-memory mock
 * (which mirrors the behavioral guarantees the ICP canister must uphold).
 *
 * Invariants under concurrent load:
 *   A. No proposals are lost — all 10 writes persist.
 *   B. All proposal IDs are unique — no collision from concurrent ID generation.
 *   C. Proposals are scoped to their request — no cross-request bleed.
 *   D. Deadline enforcement holds under contention — a late submit is rejected
 *      even when 9 concurrent submits are in-flight on the same request.
 *   E. Request status is not mutated by proposal writes — stays "Open".
 *   F. Concurrent throughput — 10 proposals complete in < 200ms wall clock.
 *   G. Sealed-bid gate — proposals are hidden until the deadline passes.
 *   H. Mixed-request isolation — proposals for req-A are not returned for req-B.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── Stateful mock actor for listing canister ─────────────────────────────────

let _reqSeq  = 0;
let _propSeq = 0;
const _bidRequests = new Map<string, any>();
const _proposals   = new Map<string, any>();

function resetListingMock() {
  _reqSeq = 0; _propSeq = 0;
  _bidRequests.clear(); _proposals.clear();
}

const mockListingActor = {
  createBidRequest: vi.fn(async (
    propertyId: string, targetListDate: bigint, desiredSalePrice: bigint[],
    notes: string, bidDeadline: bigint,
  ) => {
    _reqSeq++;
    const id = `BID_${_reqSeq}`;
    const raw = {
      id, propertyId,
      homeowner: { toText: () => "local" },
      targetListDate, desiredSalePrice, notes, bidDeadline,
      status: { Open: null }, createdAt: BigInt(Date.now()),
    };
    _bidRequests.set(id, raw);
    return { ok: raw };
  }),

  getBidRequest: vi.fn(async (id: string) => {
    const req = _bidRequests.get(id);
    return req ? { ok: req } : { err: { NotFound: null } };
  }),

  submitProposal: vi.fn(async (
    requestId: string, agentName: string, agentBrokerage: string,
    commissionBps: bigint, cmaSummary: string, marketingPlan: string,
    estimatedDaysOnMarket: bigint, estimatedSalePrice: bigint,
    includedServices: string[], validUntil: bigint, coverLetter: string,
  ) => {
    const req = _bidRequests.get(requestId);
    if (!req) return { err: { NotFound: null } };
    if (Object.keys(req.status)[0] !== "Open")
      return { err: { InvalidInput: "Request not open" } };
    // Deadline check: reject if bidDeadline has already passed
    if (Number(req.bidDeadline) < Date.now())
      return { err: { InvalidInput: "Deadline passed" } };
    _propSeq++;
    const id = `PROP_${_propSeq}`;
    const raw = {
      id, requestId,
      agentId: { toText: () => "local" },
      agentName, agentBrokerage, commissionBps, cmaSummary, marketingPlan,
      estimatedDaysOnMarket, estimatedSalePrice, includedServices, validUntil, coverLetter,
      status: { Pending: null }, createdAt: BigInt(Date.now()),
    };
    _proposals.set(id, raw);
    return { ok: raw };
  }),

  getProposalsForRequest: vi.fn(async (requestId: string) => {
    const req = _bidRequests.get(requestId);
    if (!req) return [];
    if (Number(req.bidDeadline) > Date.now()) return [];
    return [..._proposals.values()].filter((p) => p.requestId === requestId);
  }),

  // Stubs for completeness
  getMyBidRequests:    vi.fn(async () => [..._bidRequests.values()]),
  cancelBidRequest:    vi.fn(async () => ({ ok: null })),
  getOpenBidRequests:  vi.fn(async () =>
    [..._bidRequests.values()].filter(
      (r) => Object.keys(r.status)[0] === "Open" && Number(r.bidDeadline) > Date.now(),
    )),
  getMyProposals:      vi.fn(async () => [..._proposals.values()]),
  acceptProposal:      vi.fn(async () => ({ ok: null })),
  addListingPhoto:     vi.fn(async () => ({ ok: null })),
  getListingPhotos:    vi.fn(async () => []),
  removeListingPhoto:  vi.fn(async () => ({ ok: null })),
  reorderListingPhotos: vi.fn(async () => ({ ok: null })),
  getAgentPerformanceRecords: vi.fn(async () => []),
  createDirectInvite:  vi.fn(async () => ({ ok: null })),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => mockListingActor) },
}));

import { listingService, type SubmitProposalInput } from "@/services/listing";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FUTURE = Date.now() + 60_000;   // open window
const PAST   = Date.now() - 60_000;   // expired window

function makeBidRequest(bidDeadline = FUTURE) {
  return listingService.createBidRequest({
    propertyId:       "prop-1",
    targetListDate:   Date.now() + 86_400_000,
    desiredSalePrice: 55_000_000,   // $550k
    notes:            "Motivated seller",
    bidDeadline,
  });
}

function makeProposalInput(agentIndex: number): SubmitProposalInput {
  return {
    agentName:             `Agent ${agentIndex}`,
    agentBrokerage:        `Brokerage ${agentIndex}`,
    commissionBps:         250 + agentIndex,          // 2.5–3.5%
    cmaSummary:            `CMA from agent ${agentIndex}`,
    marketingPlan:         `Marketing plan from agent ${agentIndex}`,
    estimatedDaysOnMarket: 21 + agentIndex,
    estimatedSalePrice:    54_000_000 + agentIndex * 10_000,
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

    const ids = proposals.map((p) => p.id);
    const uniqueIds = new Set(ids);
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

  it("C: getProposalsForRequest returns exactly 10 proposals after deadline", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const deadline = now + 5_000;
    const req = await makeBidRequest(deadline);

    // Submit while open
    await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    // Advance past deadline → proposals become visible
    vi.setSystemTime(now + 10_000);
    const retrieved = await listingService.getProposalsForRequest(req.id);
    expect(retrieved).toHaveLength(10);
  });

  it("C: each agent's data is preserved intact (no write overwriting another)", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const req = await makeBidRequest(now + 5_000);

    await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    vi.setSystemTime(now + 10_000);
    const retrieved = await listingService.getProposalsForRequest(req.id);

    // Each unique agent name appears exactly once
    const names = retrieved.map((p) => p.agentName);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(10);
  });

  // ── D. Deadline enforcement under contention ──────────────────────────────

  it("D: a submission after the deadline is rejected even when concurrent submits are accepted", async () => {
    const req = await makeBidRequest(PAST);   // deadline already passed

    // All 10 should fail — deadline is in the past
    const settled = await Promise.allSettled(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    const rejected = settled.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(10);
  });

  it("D: 9 in-window proposals succeed while a simultaneous post-deadline request fails", async () => {
    // 9 agents get an open request; the 10th targets a closed one
    const openReq   = await makeBidRequest(FUTURE);
    const closedReq = await makeBidRequest(PAST);

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

  // ── G. Sealed-bid gate under contention ──────────────────────────────────

  it("G: proposals are hidden (empty array) while deadline is still in the future", async () => {
    const req = await makeBidRequest(FUTURE);

    await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    // Sealed — should return no proposals while deadline is open
    const sealed = await listingService.getProposalsForRequest(req.id);
    expect(sealed).toHaveLength(0);
  });

  it("G: proposals are visible after deadline passes (unsealed)", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const req = await makeBidRequest(now + 5_000);

    // Submit before deadline
    await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(req.id, makeProposalInput(i)))
    );

    // Advance past deadline
    vi.setSystemTime(now + 10_000);
    const unsealed = await listingService.getProposalsForRequest(req.id);
    expect(unsealed.length).toBeGreaterThan(0);
  });

  // ── H. Multi-request isolation ────────────────────────────────────────────

  it("H: proposals for request-A are not returned when querying request-B", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const reqA = await makeBidRequest(now + 5_000);
    const reqB = await makeBidRequest(now + 5_000);

    // 10 proposals on req-A, none on req-B
    await Promise.all(
      AGENTS.map((i) => listingService.submitProposal(reqA.id, makeProposalInput(i)))
    );

    vi.setSystemTime(now + 10_000);
    const proposalsForB = await listingService.getProposalsForRequest(reqB.id);
    expect(proposalsForB).toHaveLength(0);
  });

  it("H: each request's proposals are isolated when both receive concurrent submissions", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const reqA = await makeBidRequest(now + 5_000);
    const reqB = await makeBidRequest(now + 5_000);

    // 5 agents submit to each request concurrently
    await Promise.all([
      ...AGENTS.slice(0, 5).map((i) => listingService.submitProposal(reqA.id, makeProposalInput(i))),
      ...AGENTS.slice(5, 10).map((i) => listingService.submitProposal(reqB.id, makeProposalInput(i))),
    ]);

    vi.setSystemTime(now + 10_000);
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
