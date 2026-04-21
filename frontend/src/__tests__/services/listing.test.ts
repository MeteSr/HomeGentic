import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── Stateful mock actor for listing canister ─────────────────────────────────

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
      status: { Open: null },
      createdAt: BigInt(Date.now()),
    };
    _bidRequests.set(id, raw);
    return { ok: raw };
  }),

  getMyBidRequests: vi.fn(async () => [..._bidRequests.values()]),

  getBidRequest: vi.fn(async (id: string) => {
    const req = _bidRequests.get(id);
    return req ? { ok: req } : { err: { NotFound: null } };
  }),

  cancelBidRequest: vi.fn(async (id: string) => {
    const req = _bidRequests.get(id);
    if (!req) return { err: { NotFound: null } };
    if (Object.keys(req.status)[0] === "Cancelled") return { err: { AlreadyCancelled: null } };
    req.status = { Cancelled: null };
    return { ok: null };
  }),

  getOpenBidRequests: vi.fn(async () =>
    [..._bidRequests.values()].filter(
      (r) => Object.keys(r.status)[0] === "Open" && Number(r.bidDeadline) > Date.now(),
    )
  ),

  submitProposal: vi.fn(async (
    requestId: string, agentName: string, agentBrokerage: string,
    commissionBps: bigint, cmaSummary: string, marketingPlan: string,
    estimatedDaysOnMarket: bigint, estimatedSalePrice: bigint,
    includedServices: string[], validUntil: bigint, coverLetter: string,
  ) => {
    const req = _bidRequests.get(requestId);
    if (!req) return { err: { NotFound: null } };
    if (Object.keys(req.status)[0] !== "Open") return { err: { InvalidInput: "Request not open" } };
    _propSeq++;
    const id = `PROP_${_propSeq}`;
    const raw = {
      id, requestId,
      agentId: { toText: () => "local" },
      agentName, agentBrokerage, commissionBps, cmaSummary, marketingPlan,
      estimatedDaysOnMarket, estimatedSalePrice, includedServices, validUntil, coverLetter,
      status: { Pending: null },
      createdAt: BigInt(Date.now()),
    };
    _proposals.set(id, raw);
    return { ok: raw };
  }),

  getProposalsForRequest: vi.fn(async (requestId: string) => {
    const req = _bidRequests.get(requestId);
    if (!req) return [];
    // Sealed-bid: proposals hidden until deadline passes
    if (Number(req.bidDeadline) > Date.now()) return [];
    return [..._proposals.values()].filter((p) => p.requestId === requestId);
  }),

  getMyProposals: vi.fn(async () => [..._proposals.values()]),

  acceptProposal: vi.fn(async (proposalId: string) => {
    const proposal = _proposals.get(proposalId);
    if (!proposal) return { err: { NotFound: null } };
    proposal.status = { Accepted: null };
    const req = _bidRequests.get(proposal.requestId);
    if (req) req.status = { Awarded: null };
    for (const p of _proposals.values()) {
      if (p.requestId === proposal.requestId && p.id !== proposalId) {
        p.status = { Rejected: null };
      }
    }
    return { ok: null };
  }),

  addListingPhoto: vi.fn(async (propertyId: string, photoId: string) => {
    const photos = _listingPhotos.get(propertyId) ?? [];
    if (photos.length >= MAX_MOCK_PHOTOS)
      return { err: { InvalidInput: "Listing photo limit (15) reached" } };
    if (photos.includes(photoId))
      return { err: { InvalidInput: `Photo ${photoId} already added` } };
    photos.push(photoId);
    _listingPhotos.set(propertyId, photos);
    return { ok: null };
  }),

  getListingPhotos: vi.fn(async (propertyId: string) =>
    _listingPhotos.get(propertyId) ?? []
  ),

  removeListingPhoto: vi.fn(async (propertyId: string, photoId: string) => {
    const photos = _listingPhotos.get(propertyId) ?? [];
    const idx = photos.indexOf(photoId);
    if (idx === -1) return { err: { NotFound: null } };
    photos.splice(idx, 1);
    return { ok: null };
  }),

  reorderListingPhotos: vi.fn(async (propertyId: string, photoIds: string[]) => {
    _listingPhotos.set(propertyId, [...photoIds]);
    return { ok: null };
  }),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => mockListingActor) },
}));

// Ensure Date.now() increments on every call so IDs and timestamps are always distinct.
let _now = 3_000_000_000_000;
vi.spyOn(Date, "now").mockImplementation(() => ++_now);

import {
  listingService,
  computeNetProceeds,
  formatCommission,
  isDeadlinePassed,
} from "@/services/listing";

// ─── computeNetProceeds (pure) ────────────────────────────────────────────────

describe("computeNetProceeds", () => {
  it("deducts commission and closing costs from sale price", () => {
    const net = computeNetProceeds(50_000_000, 250, 200);
    expect(net).toBe(47_750_000);
  });

  it("returns the full sale price when commission and closing costs are 0", () => {
    expect(computeNetProceeds(40_000_000, 0, 0)).toBe(40_000_000);
  });

  it("handles high commission (e.g. 600 bps = 6%)", () => {
    const net = computeNetProceeds(30_000_000, 600, 0);
    expect(net).toBe(28_200_000);
  });

  it("returns a number (not NaN)", () => {
    expect(computeNetProceeds(20_000_000, 250, 200)).not.toBeNaN();
  });

  it("two proposals on same price: lower commission yields higher net", () => {
    const low  = computeNetProceeds(50_000_000, 200, 200);
    const high = computeNetProceeds(50_000_000, 300, 200);
    expect(low).toBeGreaterThan(high);
  });
});

// ─── formatCommission (pure) ──────────────────────────────────────────────────

describe("formatCommission", () => {
  it("formats 250 bps as '2.50%'", () => { expect(formatCommission(250)).toBe("2.50%"); });
  it("formats 300 bps as '3.00%'", () => { expect(formatCommission(300)).toBe("3.00%"); });
  it("formats 275 bps as '2.75%'", () => { expect(formatCommission(275)).toBe("2.75%"); });
  it("formats 0 bps as '0.00%'",   () => { expect(formatCommission(0)).toBe("0.00%"); });
  it("formats 600 bps as '6.00%'", () => { expect(formatCommission(600)).toBe("6.00%"); });
});

// ─── isDeadlinePassed (pure) ──────────────────────────────────────────────────

describe("isDeadlinePassed", () => {
  it("returns true when deadline is in the past",    () => { expect(isDeadlinePassed(Date.now() - 1000)).toBe(true); });
  it("returns false when deadline is in the future", () => { expect(isDeadlinePassed(Date.now() + 60_000)).toBe(false); });
  it("returns true for deadline of exactly 0",       () => { expect(isDeadlinePassed(0)).toBe(true); });
});

// ─── createBidRequest ─────────────────────────────────────────────────────────

describe("listingService.createBidRequest", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("returns a ListingBidRequest with the supplied fields", async () => {
    const deadline = Date.now() + 7 * 86_400_000;
    const req = await listingService.createBidRequest({
      propertyId: "prop-1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: 55_000_000, notes: "Prefer agents with condo experience",
      bidDeadline: deadline,
    });
    expect(req.propertyId).toBe("prop-1");
    expect(req.desiredSalePrice).toBe(55_000_000);
    expect(req.notes).toBe("Prefer agents with condo experience");
    expect(req.bidDeadline).toBe(deadline);
  });

  it("assigns status 'Open'", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "prop-1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(req.status).toBe("Open");
  });

  it("assigns homeowner 'local' in mock mode", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "prop-2", targetListDate: Date.now() + 14 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(req.homeowner).toBe("local");
  });

  it("assigns a non-empty string id", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "prop-1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(typeof req.id).toBe("string");
    expect(req.id.length).toBeGreaterThan(0);
  });

  it("two calls produce distinct ids", async () => {
    const a = await listingService.createBidRequest({
      propertyId: "prop-1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const b = await listingService.createBidRequest({
      propertyId: "prop-2", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(a.id).not.toBe(b.id);
  });

  it("accepts null desiredSalePrice", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "prop-1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(req.desiredSalePrice).toBeNull();
  });

  it("assigns createdAt close to now", async () => {
    const before = Date.now();
    const req = await listingService.createBidRequest({
      propertyId: "prop-1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(req.createdAt).toBeGreaterThanOrEqual(before);
    expect(req.createdAt).toBeLessThanOrEqual(Date.now());
  });
});

// ─── getMyBidRequests ─────────────────────────────────────────────────────────

describe("listingService.getMyBidRequests", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("starts empty in a fresh module instance", async () => {
    expect(await listingService.getMyBidRequests()).toHaveLength(0);
  });

  it("returns all created requests", async () => {
    await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    await listingService.createBidRequest({
      propertyId: "p2", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(await listingService.getMyBidRequests()).toHaveLength(2);
  });

  it("returns a copy — mutating the array does not affect internal state", async () => {
    await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const first = await listingService.getMyBidRequests();
    first.pop();
    expect(await listingService.getMyBidRequests()).toHaveLength(1);
  });

  it("all returned requests have status 'Open' initially", async () => {
    await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const reqs = await listingService.getMyBidRequests();
    expect(reqs.every(r => r.status === "Open")).toBe(true);
  });
});

// ─── getBidRequest ────────────────────────────────────────────────────────────

describe("listingService.getBidRequest", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("finds a request by id", async () => {
    const created = await listingService.createBidRequest({
      propertyId: "prop-99", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: 42_000_000, notes: "ocean view unit",
      bidDeadline: Date.now() + 86_400_000,
    });
    const found = await listingService.getBidRequest(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
    expect(found!.propertyId).toBe("prop-99");
    expect(found!.desiredSalePrice).toBe(42_000_000);
  });

  it("returns null for an unknown id", async () => {
    expect(await listingService.getBidRequest("does-not-exist")).toBeNull();
  });

  it("returns null on fresh mock with no requests", async () => {
    expect(await listingService.getBidRequest("BID_1")).toBeNull();
  });
});

// ─── cancelBidRequest ─────────────────────────────────────────────────────────

describe("listingService.cancelBidRequest", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("changes status from Open to Cancelled", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    await listingService.cancelBidRequest(req.id);
    const updated = await listingService.getBidRequest(req.id);
    expect(updated!.status).toBe("Cancelled");
  });

  it("cancelled request is still returned by getMyBidRequests", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    await listingService.cancelBidRequest(req.id);
    const all = await listingService.getMyBidRequests();
    expect(all.some(r => r.id === req.id && r.status === "Cancelled")).toBe(true);
  });

  it("throws when cancelling a non-existent request", async () => {
    await expect(listingService.cancelBidRequest("ghost-id")).rejects.toThrow();
  });

  it("cancelling an already-Cancelled request throws", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    await listingService.cancelBidRequest(req.id);
    await expect(listingService.cancelBidRequest(req.id)).rejects.toThrow();
  });
});

// ─── getOpenBidRequests ───────────────────────────────────────────────────────

describe("listingService.getOpenBidRequests", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("returns only Open requests (not Cancelled or Awarded)", async () => {
    const open = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const toCancel = await listingService.createBidRequest({
      propertyId: "p2", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    await listingService.cancelBidRequest(toCancel.id);

    const results = await listingService.getOpenBidRequests();
    expect(results.every(r => r.status === "Open")).toBe(true);
    expect(results.some(r => r.id === open.id)).toBe(true);
    expect(results.some(r => r.id === toCancel.id)).toBe(false);
  });

  it("returns empty array when no Open requests exist", async () => {
    expect(await listingService.getOpenBidRequests()).toHaveLength(0);
  });

  it("excludes requests whose bidDeadline has passed", async () => {
    // Use a timestamp definitely in the past (not relative to mocked Date.now)
    await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "",
      bidDeadline: 1_000, // epoch + 1s — definitely expired
    });
    expect(await listingService.getOpenBidRequests()).toHaveLength(0);
  });
});

// ─── submitProposal ───────────────────────────────────────────────────────────

describe("listingService.submitProposal", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("returns a ListingProposal with the supplied fields", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const proposal = await listingService.submitProposal(req.id, {
      agentName: "Jane Smith", agentBrokerage: "Premier Realty",
      commissionBps: 250, cmaSummary: "Comps suggest $520k–$540k",
      marketingPlan: "MLS + social + open house", estimatedDaysOnMarket: 21,
      estimatedSalePrice: 52_000_000, includedServices: ["staging", "professional photos"],
      validUntil: Date.now() + 14 * 86_400_000, coverLetter: "I specialize in this zip code",
    });
    expect(proposal.requestId).toBe(req.id);
    expect(proposal.agentName).toBe("Jane Smith");
    expect(proposal.agentBrokerage).toBe("Premier Realty");
    expect(proposal.commissionBps).toBe(250);
    expect(proposal.estimatedSalePrice).toBe(52_000_000);
    expect(proposal.includedServices).toEqual(["staging", "professional photos"]);
  });

  it("assigns status 'Pending'", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const p = await listingService.submitProposal(req.id, {
      agentName: "Bob", agentBrokerage: "Acme", commissionBps: 300,
      cmaSummary: "Good", marketingPlan: "MLS", estimatedDaysOnMarket: 30,
      estimatedSalePrice: 40_000_000, includedServices: [],
      validUntil: Date.now() + 86_400_000, coverLetter: "",
    });
    expect(p.status).toBe("Pending");
  });

  it("assigns agentId 'local' in mock mode", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const p = await listingService.submitProposal(req.id, {
      agentName: "Bob", agentBrokerage: "Acme", commissionBps: 300,
      cmaSummary: "Good", marketingPlan: "MLS", estimatedDaysOnMarket: 30,
      estimatedSalePrice: 40_000_000, includedServices: [],
      validUntil: Date.now() + 86_400_000, coverLetter: "",
    });
    expect(p.agentId).toBe("local");
  });

  it("assigns a non-empty string id", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const p = await listingService.submitProposal(req.id, {
      agentName: "Bob", agentBrokerage: "Acme", commissionBps: 300,
      cmaSummary: "Good", marketingPlan: "MLS", estimatedDaysOnMarket: 30,
      estimatedSalePrice: 40_000_000, includedServices: [],
      validUntil: Date.now() + 86_400_000, coverLetter: "",
    });
    expect(typeof p.id).toBe("string");
    expect(p.id.length).toBeGreaterThan(0);
  });

  it("two proposals have distinct ids", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const base = {
      agentName: "Bob", agentBrokerage: "Acme", commissionBps: 300,
      cmaSummary: "Good", marketingPlan: "MLS", estimatedDaysOnMarket: 30,
      estimatedSalePrice: 40_000_000, includedServices: [],
      validUntil: Date.now() + 86_400_000, coverLetter: "",
    };
    const a = await listingService.submitProposal(req.id, base);
    const b = await listingService.submitProposal(req.id, { ...base, agentName: "Alice" });
    expect(a.id).not.toBe(b.id);
  });

  it("throws when submitting to a non-existent request", async () => {
    await expect(
      listingService.submitProposal("ghost-request-id", {
        agentName: "Bob", agentBrokerage: "Acme", commissionBps: 300,
        cmaSummary: "Good", marketingPlan: "MLS", estimatedDaysOnMarket: 30,
        estimatedSalePrice: 40_000_000, includedServices: [],
        validUntil: Date.now() + 86_400_000, coverLetter: "",
      })
    ).rejects.toThrow();
  });

  it("throws when submitting to a Cancelled request", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    await listingService.cancelBidRequest(req.id);
    await expect(
      listingService.submitProposal(req.id, {
        agentName: "Bob", agentBrokerage: "Acme", commissionBps: 300,
        cmaSummary: "Good", marketingPlan: "MLS", estimatedDaysOnMarket: 30,
        estimatedSalePrice: 40_000_000, includedServices: [],
        validUntil: Date.now() + 86_400_000, coverLetter: "",
      })
    ).rejects.toThrow();
  });
});

// ─── getProposalsForRequest — sealed-bid logic ────────────────────────────────

describe("listingService.getProposalsForRequest — sealed until deadline", () => {
  beforeEach(() => {
    resetListingMock();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    listingService.reset();
  });

  afterEach(() => { vi.useRealTimers(); });

  it("returns proposals after the deadline has passed", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 5_000,
    });
    await listingService.submitProposal(req.id, {
      agentName: "Jane", agentBrokerage: "Realty", commissionBps: 250,
      cmaSummary: "comps", marketingPlan: "MLS", estimatedDaysOnMarket: 21,
      estimatedSalePrice: 50_000_000, includedServices: [],
      validUntil: Date.now() + 86_400_000, coverLetter: "",
    });
    vi.setSystemTime(new Date("2024-01-02T12:00:00Z"));
    expect(await listingService.getProposalsForRequest(req.id)).toHaveLength(1);
  });

  it("returns empty array before the deadline (sealed)", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 99_999_999,
    });
    await listingService.submitProposal(req.id, {
      agentName: "Jane", agentBrokerage: "Realty", commissionBps: 250,
      cmaSummary: "comps", marketingPlan: "MLS", estimatedDaysOnMarket: 21,
      estimatedSalePrice: 50_000_000, includedServices: [],
      validUntil: Date.now() + 86_400_000, coverLetter: "",
    });
    expect(await listingService.getProposalsForRequest(req.id)).toHaveLength(0);
  });

  it("multiple proposals all returned after deadline", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 5_000,
    });
    const base = {
      agentBrokerage: "Realty", commissionBps: 250, cmaSummary: "comps",
      marketingPlan: "MLS", estimatedDaysOnMarket: 21, estimatedSalePrice: 50_000_000,
      includedServices: [], validUntil: Date.now() + 86_400_000, coverLetter: "",
    };
    await listingService.submitProposal(req.id, { ...base, agentName: "Jane" });
    await listingService.submitProposal(req.id, { ...base, agentName: "Bob" });
    await listingService.submitProposal(req.id, { ...base, agentName: "Alice" });
    vi.setSystemTime(new Date("2024-01-02T12:00:00Z"));
    expect(await listingService.getProposalsForRequest(req.id)).toHaveLength(3);
  });

  it("returns empty array for an unknown requestId", async () => {
    expect(await listingService.getProposalsForRequest("unknown-id")).toHaveLength(0);
  });
});

// ─── getMyProposals ───────────────────────────────────────────────────────────

describe("listingService.getMyProposals", () => {
  beforeEach(() => { resetListingMock(); listingService.reset(); });

  it("starts empty on fresh mock", async () => {
    expect(await listingService.getMyProposals()).toHaveLength(0);
  });

  it("returns all proposals submitted in this session", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const base = {
      agentBrokerage: "Realty", commissionBps: 250, cmaSummary: "comps",
      marketingPlan: "MLS", estimatedDaysOnMarket: 21, estimatedSalePrice: 50_000_000,
      includedServices: [], validUntil: Date.now() + 86_400_000, coverLetter: "",
    };
    await listingService.submitProposal(req.id, { ...base, agentName: "Jane" });
    await listingService.submitProposal(req.id, { ...base, agentName: "Bob" });
    expect(await listingService.getMyProposals()).toHaveLength(2);
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

  it("changes proposal status from Pending to Accepted", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 5_000,
    });
    const proposal = await listingService.submitProposal(req.id, {
      agentName: "Jane", agentBrokerage: "Realty", commissionBps: 250,
      cmaSummary: "comps", marketingPlan: "MLS", estimatedDaysOnMarket: 21,
      estimatedSalePrice: 50_000_000, includedServices: [],
      validUntil: Date.now() + 86_400_000, coverLetter: "",
    });
    await listingService.acceptProposal(proposal.id);
    const all = await listingService.getMyProposals();
    expect(all.find(p => p.id === proposal.id)!.status).toBe("Accepted");
  });

  it("marks the parent BidRequest as Awarded", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 5_000,
    });
    const proposal = await listingService.submitProposal(req.id, {
      agentName: "Jane", agentBrokerage: "Realty", commissionBps: 250,
      cmaSummary: "comps", marketingPlan: "MLS", estimatedDaysOnMarket: 21,
      estimatedSalePrice: 50_000_000, includedServices: [],
      validUntil: Date.now() + 86_400_000, coverLetter: "",
    });
    await listingService.acceptProposal(proposal.id);
    const updatedReq = await listingService.getBidRequest(req.id);
    expect(updatedReq!.status).toBe("Awarded");
  });

  it("all other proposals on the same request become Rejected", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 5_000,
    });
    const base = {
      agentBrokerage: "Realty", commissionBps: 250, cmaSummary: "comps",
      marketingPlan: "MLS", estimatedDaysOnMarket: 21, estimatedSalePrice: 50_000_000,
      includedServices: [], validUntil: Date.now() + 86_400_000, coverLetter: "",
    };
    const winner = await listingService.submitProposal(req.id, { ...base, agentName: "Jane" });
    const loser1 = await listingService.submitProposal(req.id, { ...base, agentName: "Bob" });
    const loser2 = await listingService.submitProposal(req.id, { ...base, agentName: "Alice" });

    await listingService.acceptProposal(winner.id);

    const all = await listingService.getMyProposals();
    const find = (id: string) => all.find(p => p.id === id)!;
    expect(find(winner.id).status).toBe("Accepted");
    expect(find(loser1.id).status).toBe("Rejected");
    expect(find(loser2.id).status).toBe("Rejected");
  });

  it("throws when accepting a non-existent proposal", async () => {
    await expect(listingService.acceptProposal("ghost-id")).rejects.toThrow();
  });

  it("awarded request no longer appears in getOpenBidRequests", async () => {
    const req = await listingService.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 99_999_999,
    });
    const proposal = await listingService.submitProposal(req.id, {
      agentName: "Jane", agentBrokerage: "Realty", commissionBps: 250,
      cmaSummary: "comps", marketingPlan: "MLS", estimatedDaysOnMarket: 21,
      estimatedSalePrice: 50_000_000, includedServices: [],
      validUntil: Date.now() + 86_400_000, coverLetter: "",
    });
    await listingService.acceptProposal(proposal.id);
    const open = await listingService.getOpenBidRequests();
    expect(open.some(r => r.id === req.id)).toBe(false);
  });
});

// ─── Listing photos (issue #114) ──────────────────────────────────────────────

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
