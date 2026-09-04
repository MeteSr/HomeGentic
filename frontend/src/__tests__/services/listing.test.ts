import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── Stateful mock actor for listing canister (v2 — Bid to List) ──────────────
//
// Mirrors the Candid interface in frontend/src/declarations/listing/index.ts.
// A single fixed caller ("local") plays both homeowner and agent, mirroring
// the dev-identity pattern used elsewhere in this repo's mocks. To exercise
// masking (isMine === false) a couple of test-only escape hatches are exposed
// on the mock actor itself (__setProposalAgent / __markFeePaid) — these are
// not part of the real canister interface, just mock plumbing.

const WINDOW_DAYS_MS: Record<string, number> = { Three: 3, Seven: 7, Fourteen: 14 };
const LETTERS = ["A", "B", "C", "D", "E"];

let _reqSeq  = 0;
let _propSeq = 0;
const _bidRequests   = new Map<string, any>();
const _proposals     = new Map<string, any>();
const _listingPhotos = new Map<string, string[]>();

const MAX_MOCK_PHOTOS = 15;

function resetListingMock() {
  _reqSeq  = 0;
  _propSeq = 0;
  _bidRequests.clear();
  _proposals.clear();
  _listingPhotos.clear();
}

function ok<T>(value: T) { return { ok: value }; }
function err(e: any) { return { err: e }; }

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
  // ── Bid requests ────────────────────────────────────────────────────────
  createBidRequest: vi.fn(async (
    propertyId: string, address: string, city: string, county: string, zipCode: string,
    homeownerEmail: string, beds: bigint[], baths: bigint[], sqft: bigint[],
    targetListDate: bigint, desiredSalePrice: bigint[], notes: string, windowDays: any,
  ) => {
    _reqSeq++;
    const id = `BID_${_reqSeq}`;
    const windowKey = Object.keys(windowDays)[0];
    const days = WINDOW_DAYS_MS[windowKey] ?? 7;
    const createdAt = BigInt(Date.now()) * 1_000_000n;
    const raw = {
      id, propertyId, homeowner: { toText: () => "local" },
      address, city, county, zipCode, homeownerEmail,
      beds, baths, sqft, targetListDate, desiredSalePrice, notes, windowDays,
      bidDeadline: createdAt + BigInt(days) * 86_400_000n * 1_000_000n,
      status: { Open: null },
      feePaid: false,
      createdAt,
    };
    _bidRequests.set(id, raw);
    return ok(raw);
  }),

  getMyBidRequests: vi.fn(async () => [..._bidRequests.values()]),

  getBidRequest: vi.fn(async (id: string) => {
    const req = _bidRequests.get(id);
    return req ? ok(req) : err({ NotFound: null });
  }),

  cancelBidRequest: vi.fn(async (id: string) => {
    const req = _bidRequests.get(id);
    if (!req) return err({ NotFound: null });
    if (Object.keys(req.status)[0] === "Cancelled") return err({ AlreadyCancelled: null });
    req.status = { Cancelled: null };
    return ok(null);
  }),

  getOpenBidRequests: vi.fn(async () =>
    [..._bidRequests.values()]
      .filter((r) => Object.keys(r.status)[0] === "Open")
      .map((r) => ({
        id: r.id, city: r.city, county: r.county, zipCode: r.zipCode,
        beds: r.beds, baths: r.baths, sqft: r.sqft,
        targetListDate: r.targetListDate, desiredSalePrice: r.desiredSalePrice,
        notes: r.notes, windowDays: r.windowDays, bidDeadline: r.bidDeadline,
        status: r.status, proposalCount: BigInt(proposalsFor(r.id).length),
        openSlots: BigInt(Math.max(0, 5 - proposalsFor(r.id).length)),
        createdAt: r.createdAt,
      }))
  ),

  // ── Photo review gate (not exercised in these tests, kept for shape parity) ─
  flagPhotoForReview: vi.fn(async () => ok(null)),
  reviewPhoto:        vi.fn(async () => ok(null)),
  getPhotoReviewState: vi.fn(async () => []),

  // ── Proposals ────────────────────────────────────────────────────────────
  submitProposal: vi.fn(async (
    requestId: string, commissionBps: bigint, suggestedListCents: bigint,
    cmaSummary: string, marketingPlan: string, marketingCommitments: string[],
    estimatedDaysOnMarket: bigint, includedServices: string[], validUntil: bigint,
    coverLetter: string,
  ) => {
    const req = _bidRequests.get(requestId);
    if (!req) return err({ NotFound: null });
    if (Object.keys(req.status)[0] !== "Open") return err({ InvalidInput: "Request not open" });
    if (marketingCommitments.length === 0) return err({ InvalidInput: "At least one marketing commitment required" });

    _propSeq++;
    const id = `PROP_${_propSeq}`;
    const letter = LETTERS[proposalsFor(requestId).length] ?? "?";
    const raw = {
      id, requestId,
      agentId: { toText: () => "local" },
      agentName: "Mock Agent", agentEmail: "agent@example.com", agentBrokerage: "Mock Realty",
      letter, commissionBps, suggestedListCents, cmaSummary, marketingPlan, marketingCommitments,
      estimatedDaysOnMarket, includedServices, validUntil, coverLetter,
      status: { Pending: null },
      derived: {
        estNetToSellerCents: suggestedListCents - (suggestedListCents * commissionBps) / 10_000n,
        pctVsCompsBps: 0n, overCompFlag: false, thinCompsFlag: false,
      },
      agentRecord: { closedInZip: 10n, avgDom: 25n, saleToListRatioBps: 9800n, withdrawnUnsold: 0n, commitmentsUnmet: 0n },
      createdAt: BigInt(Date.now()) * 1_000_000n,
    };
    _proposals.set(id, raw);
    return ok(raw);
  }),

  withdrawProposal: vi.fn(async (proposalId: string) => {
    const p = _proposals.get(proposalId);
    if (!p) return err({ NotFound: null });
    p.status = { Withdrawn: null };
    return ok(null);
  }),

  /** Sealed until 3 bids or deadline (invariant 02); masked until feePaid or isMine (invariant 04). */
  getProposalsForRequest: vi.fn(async (requestId: string) => {
    const req = _bidRequests.get(requestId);
    if (!req) return [];
    if (isSealed(req)) return [];
    return proposalsFor(requestId).map((p) => {
      const isMine = p.agentId.toText() === "local";
      const revealed = isMine || req.feePaid;
      return {
        id: p.id, requestId: p.requestId, letter: p.letter,
        commissionBps: p.commissionBps, suggestedListCents: p.suggestedListCents,
        cmaSummary: p.cmaSummary, marketingPlan: p.marketingPlan,
        marketingCommitments: p.marketingCommitments,
        estimatedDaysOnMarket: p.estimatedDaysOnMarket, status: p.status,
        derived: p.derived, agentRecord: p.agentRecord,
        isMine,
        agentName:      revealed ? [p.agentName]      : [],
        agentEmail:     revealed ? [p.agentEmail]     : [],
        agentBrokerage: revealed ? [p.agentBrokerage] : [],
        createdAt: p.createdAt,
      };
    });
  }),

  getBidProgress: vi.fn(async (requestId: string) => {
    const req = _bidRequests.get(requestId);
    if (!req) return err({ NotFound: null });
    return ok({ count: BigInt(proposalsFor(requestId).length), sealed: isSealed(req) });
  }),

  getMyProposals: vi.fn(async () => [..._proposals.values()]),

  acceptProposal: vi.fn(async (proposalId: string) => {
    const proposal = _proposals.get(proposalId);
    if (!proposal) return err({ NotFound: null });
    proposal.status = { Accepted: null };
    // v2: does NOT award the request or reveal identity — that's gated behind
    // markListingFeePaid, driven only by the payment webhook.
    return ok(`FEE_${proposalId}`);
  }),

  // ── Test-only escape hatches (not part of the real canister interface) ────
  __setProposalAgent: (proposalId: string, agentIdText: string) => {
    const p = _proposals.get(proposalId);
    if (p) p.agentId = { toText: () => agentIdText };
  },
  __markFeePaid: (requestId: string) => {
    const req = _bidRequests.get(requestId);
    if (req) req.feePaid = true;
  },

  // ── Listing photos (unchanged FSBO feature) ────────────────────────────────
  addListingPhoto: vi.fn(async (propertyId: string, photoId: string) => {
    const photos = _listingPhotos.get(propertyId) ?? [];
    if (photos.length >= MAX_MOCK_PHOTOS)
      return err({ InvalidInput: "Listing photo limit (15) reached" });
    if (photos.includes(photoId))
      return err({ InvalidInput: `Photo ${photoId} already added` });
    photos.push(photoId);
    _listingPhotos.set(propertyId, photos);
    return ok(null);
  }),

  getListingPhotos: vi.fn(async (propertyId: string) =>
    _listingPhotos.get(propertyId) ?? []
  ),

  removeListingPhoto: vi.fn(async (propertyId: string, photoId: string) => {
    const photos = _listingPhotos.get(propertyId) ?? [];
    const idx = photos.indexOf(photoId);
    if (idx === -1) return err({ NotFound: null });
    photos.splice(idx, 1);
    return ok(null);
  }),

  reorderListingPhotos: vi.fn(async (propertyId: string, photoIds: string[]) => {
    _listingPhotos.set(propertyId, [...photoIds]);
    return ok(null);
  }),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => mockListingActor) },
}));

// Ensure Date.now() increments on every call so IDs and timestamps are always distinct.
let _now = 3_000_000_000_000;
vi.spyOn(Date, "now").mockImplementation(() => ++_now);

import { listingService } from "@/services/listing";

// ─── createBidRequest ─────────────────────────────────────────────────────────

describe("listingService.createBidRequest", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("round-trips the new field shape", async () => {
    const targetListDate = Date.now() + 30 * 86_400_000;
    const req = await listingService.createBidRequest({
      propertyId: "prop-1", address: "123 Main St", city: "Tampa", county: "Hillsborough",
      zipCode: "33602", homeownerEmail: "owner@example.com",
      beds: 3, baths: 2, sqft: 1500,
      targetListDate, desiredSalePrice: 55_000_000,
      notes: "Prefer agents with condo experience", windowDays: "Seven",
    });
    expect(req.propertyId).toBe("prop-1");
    expect(req.address).toBe("123 Main St");
    expect(req.city).toBe("Tampa");
    expect(req.county).toBe("Hillsborough");
    expect(req.zipCode).toBe("33602");
    expect(req.homeownerEmail).toBe("owner@example.com");
    expect(req.beds).toBe(3);
    expect(req.baths).toBe(2);
    expect(req.sqft).toBe(1500);
    expect(req.targetListDate).toBe(targetListDate);
    expect(req.desiredSalePrice).toBe(55_000_000);
    expect(req.notes).toBe("Prefer agents with condo experience");
    expect(req.windowDays).toBe("Seven");
    expect(req.status).toBe("Open");
    expect(req.feePaid).toBe(false);
    expect(req.homeowner).toBe("local");
  });

  it("computes bidDeadline from windowDays server-side (no raw bidDeadline input)", async () => {
    const req3  = await listingService.createBidRequest(baseInput({ windowDays: "Three" }));
    const req14 = await listingService.createBidRequest(baseInput({ windowDays: "Fourteen" }));
    expect(req14.bidDeadline - req14.createdAt).toBeGreaterThan(req3.bidDeadline - req3.createdAt);
  });

  it("accepts null/omitted optional numeric fields", async () => {
    const req = await listingService.createBidRequest(baseInput({ beds: null, baths: null, sqft: null, desiredSalePrice: null }));
    expect(req.beds).toBeNull();
    expect(req.baths).toBeNull();
    expect(req.sqft).toBeNull();
    expect(req.desiredSalePrice).toBeNull();
  });

  it("assigns a non-empty, distinct id per call", async () => {
    const a = await listingService.createBidRequest(baseInput());
    const b = await listingService.createBidRequest(baseInput());
    expect(a.id).not.toBe(b.id);
    expect(a.id.length).toBeGreaterThan(0);
  });
});

function baseInput(overrides: Partial<Parameters<typeof listingService.createBidRequest>[0]> = {}) {
  return {
    propertyId: "prop-1", address: "123 Main St", city: "Tampa", county: "Hillsborough",
    zipCode: "33602", homeownerEmail: "owner@example.com",
    targetListDate: Date.now() + 30 * 86_400_000, desiredSalePrice: null,
    notes: "", windowDays: "Seven" as const,
    ...overrides,
  };
}

// ─── getMyBidRequests / getBidRequest / cancelBidRequest ───────────────────────

describe("listingService.getMyBidRequests / getBidRequest / cancelBidRequest", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("getMyBidRequests returns all created requests", async () => {
    await listingService.createBidRequest(baseInput({ propertyId: "p1" }));
    await listingService.createBidRequest(baseInput({ propertyId: "p2" }));
    expect(await listingService.getMyBidRequests()).toHaveLength(2);
  });

  it("getBidRequest finds a request by id, returns null for unknown", async () => {
    const created = await listingService.createBidRequest(baseInput({ propertyId: "prop-99" }));
    const found = await listingService.getBidRequest(created.id);
    expect(found?.propertyId).toBe("prop-99");
    expect(await listingService.getBidRequest("does-not-exist")).toBeNull();
  });

  it("cancelBidRequest moves status to Cancelled and rejects a double cancel", async () => {
    const req = await listingService.createBidRequest(baseInput());
    await listingService.cancelBidRequest(req.id);
    expect((await listingService.getBidRequest(req.id))!.status).toBe("Cancelled");
    await expect(listingService.cancelBidRequest(req.id)).rejects.toThrow();
  });
});

// ─── getOpenBidRequests — returns summaries ────────────────────────────────────

describe("listingService.getOpenBidRequests", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("returns BidRequestSummary objects (masked — no address/email) for Open requests only", async () => {
    const open = await listingService.createBidRequest(baseInput({ propertyId: "p1", city: "Tampa" }));
    const toCancel = await listingService.createBidRequest(baseInput({ propertyId: "p2" }));
    await listingService.cancelBidRequest(toCancel.id);

    const results = await listingService.getOpenBidRequests();
    expect(results).toHaveLength(1);
    const summary = results[0];
    expect(summary.id).toBe(open.id);
    expect(summary.city).toBe("Tampa");
    expect(summary).not.toHaveProperty("address");
    expect(summary).not.toHaveProperty("homeownerEmail");
    expect(typeof summary.proposalCount).toBe("number");
    expect(typeof summary.openSlots).toBe("number");
  });

  it("proposalCount / openSlots reflect submitted proposals", async () => {
    const req = await listingService.createBidRequest(baseInput());
    await listingService.submitProposal(req.id, proposalInput());
    const [summary] = await listingService.getOpenBidRequests();
    expect(summary.proposalCount).toBe(1);
    expect(summary.openSlots).toBe(4);
  });

  it("returns empty array when no Open requests exist", async () => {
    expect(await listingService.getOpenBidRequests()).toHaveLength(0);
  });
});

function proposalInput(overrides: Partial<Parameters<typeof listingService.submitProposal>[1]> = {}) {
  return {
    commissionBps: 250, suggestedListCents: 52_000_000,
    cmaSummary: "Comps suggest $520k-$540k", marketingPlan: "MLS + social + open house",
    marketingCommitments: ["Professional photography", "Open house within 14 days"],
    estimatedDaysOnMarket: 21, includedServices: ["staging", "professional photos"],
    validUntil: Date.now() + 14 * 86_400_000, coverLetter: "I specialize in this zip code",
    ...overrides,
  };
}

// ─── submitProposal ─────────────────────────────────────────────────────────────

describe("listingService.submitProposal", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("returns a ListingProposal carrying marketingCommitments and the renamed suggestedListCents field", async () => {
    const req = await listingService.createBidRequest(baseInput());
    const proposal = await listingService.submitProposal(req.id, proposalInput());
    expect(proposal.requestId).toBe(req.id);
    expect(proposal.commissionBps).toBe(250);
    expect(proposal.suggestedListCents).toBe(52_000_000);
    expect(proposal.marketingCommitments).toEqual(["Professional photography", "Open house within 14 days"]);
    expect(proposal.status).toBe("Pending");
    expect(proposal.agentId).toBe("local");
    expect(typeof proposal.letter).toBe("string");
    expect(proposal.derived).toBeDefined();
    expect(proposal.agentRecord).toBeDefined();
  });

  it("rejects a proposal with no marketingCommitments", async () => {
    const req = await listingService.createBidRequest(baseInput());
    await expect(
      listingService.submitProposal(req.id, proposalInput({ marketingCommitments: [] }))
    ).rejects.toThrow();
  });

  it("throws when submitting to a non-existent or cancelled request", async () => {
    await expect(
      listingService.submitProposal("ghost-request-id", proposalInput())
    ).rejects.toThrow();

    const req = await listingService.createBidRequest(baseInput());
    await listingService.cancelBidRequest(req.id);
    await expect(listingService.submitProposal(req.id, proposalInput())).rejects.toThrow();
  });

  it("assigns sequential letters as proposals come in", async () => {
    const req = await listingService.createBidRequest(baseInput());
    const a = await listingService.submitProposal(req.id, proposalInput());
    const b = await listingService.submitProposal(req.id, proposalInput());
    expect(a.letter).toBe("A");
    expect(b.letter).toBe("B");
  });
});

// ─── getProposalsForRequest — sealing + masking ────────────────────────────────

describe("listingService.getProposalsForRequest — sealed until 3 bids or deadline", () => {
  beforeEach(() => {
    resetListingMock();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    listingService.reset();
  });

  afterEach(() => { vi.useRealTimers(); });

  it("stays sealed with fewer than 3 bids and the window still open", async () => {
    const req = await listingService.createBidRequest(baseInput({ windowDays: "Fourteen" }));
    await listingService.submitProposal(req.id, proposalInput());
    await listingService.submitProposal(req.id, proposalInput());
    expect(await listingService.getProposalsForRequest(req.id)).toHaveLength(0);
    expect((await listingService.getBidProgress(req.id)).sealed).toBe(true);
  });

  it("unseals as soon as a 3rd bid lands, even before the deadline", async () => {
    const req = await listingService.createBidRequest(baseInput({ windowDays: "Fourteen" }));
    await listingService.submitProposal(req.id, proposalInput());
    await listingService.submitProposal(req.id, proposalInput());
    await listingService.submitProposal(req.id, proposalInput());
    const progress = await listingService.getBidProgress(req.id);
    expect(progress.sealed).toBe(false);
    expect(progress.count).toBe(3);
    expect(await listingService.getProposalsForRequest(req.id)).toHaveLength(3);
  });

  it("unseals once the deadline passes even with fewer than 3 bids", async () => {
    const req = await listingService.createBidRequest(baseInput({ windowDays: "Three" }));
    await listingService.submitProposal(req.id, proposalInput());
    vi.setSystemTime(new Date("2024-01-10T12:00:00Z"));
    expect(await listingService.getProposalsForRequest(req.id)).toHaveLength(1);
  });

  it("masks agent identity for a bid that isn't the caller's own and the request hasn't had its fee paid", async () => {
    const req = await listingService.createBidRequest(baseInput({ windowDays: "Three" }));
    const a = await listingService.submitProposal(req.id, proposalInput());
    const b = await listingService.submitProposal(req.id, proposalInput());
    await listingService.submitProposal(req.id, proposalInput());
    mockListingActor.__setProposalAgent(b.id, "some-other-agent");

    const masked = await listingService.getProposalsForRequest(req.id);
    const bMasked = masked.find((p) => p.id === b.id)!;
    expect(bMasked.isMine).toBe(false);
    expect(bMasked.agentName).toBeNull();
    expect(bMasked.agentEmail).toBeNull();
    expect(bMasked.agentBrokerage).toBeNull();
    // letter is still visible — that's the point of the sealed-bid board
    expect(typeof bMasked.letter).toBe("string");

    const aRevealed = masked.find((p) => p.id === a.id)!;
    expect(aRevealed.isMine).toBe(true);
    expect(aRevealed.agentName).toBe("Mock Agent");
  });

  it("reveals a masked bid once the request's fee is marked paid", async () => {
    const req = await listingService.createBidRequest(baseInput({ windowDays: "Three" }));
    const a = await listingService.submitProposal(req.id, proposalInput());
    await listingService.submitProposal(req.id, proposalInput());
    await listingService.submitProposal(req.id, proposalInput());

    mockListingActor.__setProposalAgent(a.id, "some-other-agent");

    let masked = await listingService.getProposalsForRequest(req.id);
    expect(masked.find((p) => p.id === a.id)!.agentName).toBeNull();

    mockListingActor.__markFeePaid(req.id);
    masked = await listingService.getProposalsForRequest(req.id);
    const revealed = masked.find((p) => p.id === a.id)!;
    expect(revealed.isMine).toBe(false);
    expect(revealed.agentName).toBe("Mock Agent");
    expect(revealed.agentEmail).toBe("agent@example.com");
    expect(revealed.agentBrokerage).toBe("Mock Realty");
  });

  it("returns empty array for an unknown requestId", async () => {
    expect(await listingService.getProposalsForRequest("unknown-id")).toHaveLength(0);
  });
});

// ─── getMyProposals ───────────────────────────────────────────────────────────

describe("listingService.getMyProposals", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("returns all proposals submitted in this session, full (unmasked) view", async () => {
    const req = await listingService.createBidRequest(baseInput());
    await listingService.submitProposal(req.id, proposalInput());
    await listingService.submitProposal(req.id, proposalInput());
    const mine = await listingService.getMyProposals();
    expect(mine).toHaveLength(2);
    expect(mine[0].agentName).toBe("Mock Agent");
  });
});

// ─── acceptProposal ───────────────────────────────────────────────────────────

describe("listingService.acceptProposal", () => {
  beforeEach(() => {
    resetListingMock();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    listingService.reset();
  });

  afterEach(() => { vi.useRealTimers(); });

  it("returns a string feeId (not void)", async () => {
    const req = await listingService.createBidRequest(baseInput());
    const proposal = await listingService.submitProposal(req.id, proposalInput());
    const feeId = await listingService.acceptProposal(proposal.id);
    expect(typeof feeId).toBe("string");
    expect(feeId.length).toBeGreaterThan(0);
  });

  it("marks the proposal Accepted without awarding the request or revealing identity", async () => {
    const req = await listingService.createBidRequest(baseInput());
    const proposal = await listingService.submitProposal(req.id, proposalInput());
    await listingService.acceptProposal(proposal.id);

    const mine = await listingService.getMyProposals();
    expect(mine.find((p) => p.id === proposal.id)!.status).toBe("Accepted");

    // Awarding + unmasking happens only via markListingFeePaid (webhook-only,
    // not exposed on listingService at all) — the request itself is untouched.
    const stillOpen = await listingService.getBidRequest(req.id);
    expect(stillOpen!.status).toBe("Open");
    expect(stillOpen!.feePaid).toBe(false);
  });

  it("throws when accepting a non-existent proposal", async () => {
    await expect(listingService.acceptProposal("ghost-id")).rejects.toThrow();
  });
});

// ─── Listing photos (issue #114 — unchanged) ───────────────────────────────────

describe("listing photo management", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("addListingPhoto appends a photo ID to the listing", async () => {
    await listingService.addListingPhoto("prop-1", "PHOTO_1");
    expect(await listingService.getListingPhotos("prop-1")).toContain("PHOTO_1");
  });

  it("addListingPhoto preserves insertion order", async () => {
    await listingService.addListingPhoto("prop-ord", "A");
    await listingService.addListingPhoto("prop-ord", "B");
    await listingService.addListingPhoto("prop-ord", "C");
    expect(await listingService.getListingPhotos("prop-ord")).toEqual(["A", "B", "C"]);
  });

  it("getListingPhotos returns [] for an unknown property", async () => {
    expect(await listingService.getListingPhotos("nonexistent")).toEqual([]);
  });

  it("addListingPhoto enforces the 15-photo cap", async () => {
    for (let i = 0; i < 15; i++) {
      await listingService.addListingPhoto("prop-cap", `PHOTO_${i}`);
    }
    await expect(
      listingService.addListingPhoto("prop-cap", "PHOTO_15")
    ).rejects.toThrow("Listing photo limit (15) reached");
  });

  it("addListingPhoto rejects duplicate photo IDs", async () => {
    await listingService.addListingPhoto("prop-dup", "PHOTO_1");
    await expect(
      listingService.addListingPhoto("prop-dup", "PHOTO_1")
    ).rejects.toThrow("already added");
  });

  it("removeListingPhoto removes a photo ID leaving the rest intact", async () => {
    await listingService.addListingPhoto("prop-rm", "A");
    await listingService.addListingPhoto("prop-rm", "B");
    await listingService.addListingPhoto("prop-rm", "C");
    await listingService.removeListingPhoto("prop-rm", "B");
    const ids = await listingService.getListingPhotos("prop-rm");
    expect(ids).not.toContain("B");
    expect(ids).toContain("A");
    expect(ids).toContain("C");
  });

  it("reorderListingPhotos changes the sequence", async () => {
    await listingService.addListingPhoto("prop-reorder", "A");
    await listingService.addListingPhoto("prop-reorder", "B");
    await listingService.addListingPhoto("prop-reorder", "C");
    await listingService.reorderListingPhotos("prop-reorder", ["C", "A", "B"]);
    expect(await listingService.getListingPhotos("prop-reorder")).toEqual(["C", "A", "B"]);
  });

  it("reset() clears all photo associations", async () => {
    await listingService.addListingPhoto("prop-rst", "X");
    resetListingMock();
    listingService.reset();
    expect(await listingService.getListingPhotos("prop-rst")).toEqual([]);
  });
});
